import {
  AgentError,
  ChatMessage,
  openCase,
  readMessages,
  sendMessage,
} from "@lib/chat/agent-client"
import {
  CASE_COOKIE,
  MIN_COOKIE_SECRET_LENGTH,
  readCaseCookie,
  signCaseCookie,
} from "@lib/chat/case-cookie"
import { randomUUID } from "crypto"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

// The chat's only public door. The browser sends just the new message; the
// case ID lives in a signed httpOnly cookie and the history in the agent's
// database (ADR 0020).

export const dynamic = "force-dynamic"

const MAX_MESSAGE_LENGTH = 4000

type ShownMessage = Pick<ChatMessage, "id" | "role" | "content">

const shown = ({ id, role, content }: ChatMessage): ShownMessage => ({
  id,
  role,
  content,
})

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
    return json({ messages: messages.map(shown) })
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
  const correlationId = randomUUID()
  const secret = cookieSecret()
  if (!secret) {
    return json(
      { error: "chat_unavailable", correlation_id: correlationId },
      503,
      correlationId
    )
  }

  const body: unknown = await request.json().catch(() => null)
  const message =
    body && typeof body === "object" && "message" in body ? body.message : null
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return json(
      { error: "invalid_message", correlation_id: correlationId },
      400,
      correlationId
    )
  }

  try {
    const caseId = await currentCase(secret)
    let turn
    if (caseId) {
      try {
        turn = await sendMessage(caseId, message, correlationId)
      } catch (error) {
        if (!(error instanceof AgentError && error.status === 404)) throw error
      }
    }
    if (!turn) {
      turn = await openCase(message, correlationId)
      await rememberCase(turn.case_id, secret)
    }
    return json(
      { reply: shown(turn.reply), correlation_id: correlationId },
      200,
      correlationId
    )
  } catch (error) {
    if (error instanceof AgentError && error.status === 409) {
      return json(
        { error: "still_answering", correlation_id: correlationId },
        409,
        correlationId
      )
    }
    console.error(`chat turn ${correlationId} failed:`, error)
    return json(
      { error: "chat_unavailable", correlation_id: correlationId },
      502,
      correlationId
    )
  }
}
