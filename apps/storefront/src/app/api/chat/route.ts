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
import {
  CLIENT_IP_HEADER,
  clientIp,
  readTrustedProxies,
} from "@lib/chat/client-ip"
import { ChatGuard, type ChatRefusal, readChatLimits } from "@lib/chat/guard"
import { RedisRateLimiter } from "@lib/chat/rate-limit"
import { readTurnRequest } from "@lib/chat/turn"
import { verifyTurnstileToken } from "@lib/chat/turnstile"
import { randomUUID } from "crypto"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

// The chat's only public door. The browser sends just the new message; the
// case ID lives in a signed httpOnly cookie and the history in the agent's
// database (ADR 0020).
//
// Before any call to the agent, every message is counted against its IP's
// limit, and a message that would open a support case needs a Turnstile token
// that passes and a place in the IP's limit on new cases (guard.ts). The IP
// comes from X-Forwarded-For, read from the right as client-ip.ts explains,
// so a client can't pick its own.

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

// Built on first use and kept: one Redis connection per server.
let guard: { chatGuard: ChatGuard; trustedProxies: number } | null = null

function chatGuard() {
  if (guard) return guard
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY ?? ""
    guard = {
      chatGuard: new ChatGuard({
        limiter: new RedisRateLimiter(
          process.env.REDIS_URL || "redis://localhost:6379",
          "goods:chat:rate:"
        ),
        limits: readChatLimits(process.env),
        verifyTurnstile: (token, remoteIp) =>
          verifyTurnstileToken(token, { secret, remoteIp }),
      }),
      trustedProxies: readTrustedProxies(process.env.CHAT_TRUSTED_PROXIES),
    }
    return guard
  } catch (error) {
    console.error("chat protection misconfigured:", error)
    return null
  }
}

// The public site key the widget renders the check with.
const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY ?? ""

const REFUSAL_STATUS: Record<ChatRefusal, number> = {
  rate_limited: 429,
  turnstile_required: 403,
  turnstile_failed: 403,
  chat_unavailable: 503,
}

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

  // Without a case, the next message opens one and needs the check.
  const noCase = { messages: [], turnstile_site_key: turnstileSiteKey() }
  const caseId = await currentCase(secret)
  if (!caseId) return json(noCase)

  try {
    const { messages } = await readMessages(caseId)
    return json({ messages: messages.map(toShownMessage) })
  } catch (error) {
    if (error instanceof AgentError && error.status === 404) {
      // The agent no longer knows the case: start fresh next time.
      await forgetCase()
      return json(noCase)
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
  const refuse = (refusal: ChatRefusal) =>
    refusal === "turnstile_required" || refusal === "turnstile_failed"
      ? json(
          {
            error: refusal,
            correlation_id: correlationId,
            turnstile_site_key: turnstileSiteKey(),
          },
          REFUSAL_STATUS[refusal],
          correlationId
        )
      : turnError(refusal, REFUSAL_STATUS[refusal])
  const secret = cookieSecret()
  const protection = chatGuard()
  if (!secret || !protection) {
    return turnError("chat_unavailable", 503)
  }

  const ip = clientIp(
    request.headers.get(CLIENT_IP_HEADER),
    protection.trustedProxies
  )
  const overLimit = await protection.chatGuard.admitMessage(ip)
  if (overLimit) return refuse(overLimit)

  const turnRequest = readTurnRequest(await request.json().catch(() => null))
  if (!turnRequest) {
    return turnError("invalid_message", 400)
  }
  const { message, retry, turnstileToken } = turnRequest

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
      // The case's first message: checked once, here, for the whole case.
      const refused = await protection.chatGuard.admitNewCase(
        ip,
        turnstileToken
      )
      if (refused) return refuse(refused)
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
