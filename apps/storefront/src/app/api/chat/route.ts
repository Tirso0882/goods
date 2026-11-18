import {
  AgentError,
  openCase,
  readMessages,
  sendMessage,
  toShownMessage,
} from "@lib/chat/agent-client"
import {
  CASE_COOKIE,
  MIN_COOKIE_SECRET_LENGTH,
  readCaseCookie,
  signCaseCookie,
} from "@lib/chat/case-cookie"
import { readTurnRequest } from "@lib/chat/turn"
import { randomUUID } from "crypto"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

// The chat's only public door. The browser sends just the new message; the
// case ID lives in a signed httpOnly cookie and the history in the agent's
// database (ADR 0020).

export const dynamic = "force-dynamic"

const cookieSecret = () => {
  const secret = process.env.CHAT_COOKIE_SECRET ?? ""
  return secret.length >= MIN_COOKIE_SECRET_LENGTH ? secret : null
}

const json = (body: unknown, status = 200, correlationId?: string) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(correlationId ? { "X-Correlation-ID": correlationId } : {}),
    },
  })

async function currentCase(secret: string) {
  return readCaseCookie((await cookies()).get(CASE_COOKIE)?.value, secret)
}

async function rememberCase(caseId: string, secret: string) {
  ;(await cookies()).set(CASE_COOKIE, signCaseCookie(caseId, secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/chat",
    maxAge: 60 * 60 * 24 * 7,
  })
}

async function forgetCase() {
  ;(await cookies()).delete({ name: CASE_COOKIE, path: "/api/chat" })
}

/** The current case's conversation, loaded from the agent. */
export async function GET() {
  const secret = cookieSecret()
  if (!secret) return json({ error: "chat_unavailable" }, 503)

  const caseId = await currentCase(secret)
  if (!caseId) return json({ messages: [] })

  try {
    const { messages } = await readMessages(caseId)
    return json({ messages: messages.map(toShownMessage) })
  } catch (error) {
    if (error instanceof AgentError && error.status === 404) {
      // The agent no longer knows the case: start fresh next time.
      await forgetCase()
      return json({ messages: [] })
    }
    console.error("chat history failed:", error)
    return json({ error: "chat_unavailable" }, 502)
  }
}

/** One turn: the shopper's new message in, the agent's reply out. */
export async function POST(request: NextRequest) {
  // Shown to the shopper with an error, so they can quote it if they write in.
  const correlationId = randomUUID()
  const turnError = (error: string, status: number) =>
    json({ error, correlation_id: correlationId }, status, correlationId)
  const secret = cookieSecret()
  if (!secret) {
    return turnError("chat_unavailable", 503)
  }

  const turnRequest = readTurnRequest(await request.json().catch(() => null))
  if (!turnRequest) {
    return turnError("invalid_message", 400)
  }
  const { message, retry } = turnRequest

  try {
    const caseId = await currentCase(secret)
    let turn
    if (caseId) {
      try {
        turn = await sendMessage(caseId, message, retry, correlationId)
      } catch (error) {
        if (!(error instanceof AgentError && error.status === 404)) throw error
      }
    }
    if (!turn) {
      try {
        turn = await openCase(message, correlationId)
      } catch (error) {
        // The case holds the failed message: a retry must answer it there,
        // not open another case with the message again.
        if (error instanceof AgentError && error.caseId) {
          await rememberCase(error.caseId, secret)
        }
        throw error
      }
      await rememberCase(turn.case_id, secret)
    }
    return json(
      { reply: toShownMessage(turn.reply), correlation_id: correlationId },
      200,
      correlationId
    )
  } catch (error) {
    if (error instanceof AgentError && error.status === 409) {
      return turnError("still_answering", 409)
    }
    console.error(`chat turn ${correlationId} failed:`, error)
    return turnError("chat_unavailable", 502)
  }
}
