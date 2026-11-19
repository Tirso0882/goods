// What stands between the public chat route and the agent: the rate limit by
// IP and, on a support case's first message, Cloudflare Turnstile. The route
// asks before every call to the agent, so a refused message never reaches it
// or the model budget.
//
// Its test runs with `node --test` against REDIS_URL and is left out of tsc,
// whose Node types predate node:test. Type imports only, so `node --test`
// runs it without Next.

import type { RateLimiter } from "./rate-limit.ts"
import type { TurnstileOutcome } from "./turnstile.ts"

/** Why the route refuses a message. */
export type ChatRefusal =
  | "rate_limited"
  | "turnstile_required"
  | "turnstile_failed"
  | "chat_unavailable"

export type Limit = { limit: number; windowSeconds: number }
export type ChatLimits = { messages: Limit; newCases: Limit }

export const DEFAULT_CHAT_LIMITS: ChatLimits = {
  messages: { limit: 20, windowSeconds: 5 * 60 },
  newCases: { limit: 5, windowSeconds: 60 * 60 },
}

const positive = (
  name: string,
  value: string | undefined,
  fallback: number
) => {
  if (value === undefined || value.trim() === "") return fallback
  if (!/^\d+$/.test(value.trim()) || Number(value) < 1) {
    throw new Error(`${name} must be a whole number above 0, not "${value}"`)
  }
  return Number(value)
}

/** The limits from the environment, each defaulting to its starting value. */
export function readChatLimits(
  env: Record<string, string | undefined>
): ChatLimits {
  const { messages, newCases } = DEFAULT_CHAT_LIMITS
  return {
    messages: {
      limit: positive(
        "CHAT_MESSAGE_LIMIT",
        env.CHAT_MESSAGE_LIMIT,
        messages.limit
      ),
      windowSeconds: positive(
        "CHAT_MESSAGE_WINDOW_SECONDS",
        env.CHAT_MESSAGE_WINDOW_SECONDS,
        messages.windowSeconds
      ),
    },
    newCases: {
      limit: positive(
        "CHAT_NEW_CASE_LIMIT",
        env.CHAT_NEW_CASE_LIMIT,
        newCases.limit
      ),
      windowSeconds: positive(
        "CHAT_NEW_CASE_WINDOW_SECONDS",
        env.CHAT_NEW_CASE_WINDOW_SECONDS,
        newCases.windowSeconds
      ),
    },
  }
}

// Requests whose IP is unknown share one count, so they can't escape it.
const UNKNOWN_IP = "unknown"

export class ChatGuard {
  private readonly limiter: RateLimiter
  private readonly limits: ChatLimits
  private readonly verifyTurnstile: (
    token: string,
    ip: string | null
  ) => Promise<TurnstileOutcome>

  constructor(options: {
    limiter: RateLimiter
    limits: ChatLimits
    verifyTurnstile: (
      token: string,
      ip: string | null
    ) => Promise<TurnstileOutcome>
  }) {
    this.limiter = options.limiter
    this.limits = options.limits
    this.verifyTurnstile = options.verifyTurnstile
  }

  private async take(
    kind: string,
    ip: string | null,
    { limit, windowSeconds }: Limit
  ) {
    try {
      const taken = await this.limiter.take(
        `${kind}:${ip ?? UNKNOWN_IP}`,
        limit,
        windowSeconds * 1000
      )
      return taken ? null : "rate_limited"
    } catch (error) {
      console.error("chat rate limit unavailable:", error)
      return "chat_unavailable"
    }
  }

  /** Every message, before anything else: the IP's message limit. */
  admitMessage(ip: string | null): Promise<ChatRefusal | null> {
    return this.take("messages", ip, this.limits.messages)
  }

  /**
   * A message that would open a support case: a Turnstile token that passes,
   * then the IP's limit on new cases. A refused token uses up no case.
   */
  async admitNewCase(
    ip: string | null,
    token: string | undefined
  ): Promise<ChatRefusal | null> {
    if (!token) return "turnstile_required"
    const outcome = await this.verifyTurnstile(token, ip)
    if (outcome === "failed") return "turnstile_failed"
    if (outcome === "unavailable") return "chat_unavailable"
    return this.take("cases", ip, this.limits.newCases)
  }
}
