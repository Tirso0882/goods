// One chat turn as the browser and the chat route see it: what the browser
// may send, and what the shopper is told when no reply comes.
//
// Its test runs with `node --test` and is left out of tsc, whose Node types
// predate node:test. No imports, so `node --test` runs it without Next.

export const MAX_MESSAGE_LENGTH = 4000

export type TurnRequest = {
  message: string
  // The shopper sends again a message whose reply they never saw. The agent
  // answers it without storing it a second time.
  retry: boolean
  // The Turnstile token, needed only on a support case's first message.
  turnstileToken?: string
}

/** The browser's request body as a turn, or null if it has no usable message. */
export function readTurnRequest(body: unknown): TurnRequest | null {
  if (!body || typeof body !== "object") return null
  const message = "message" in body ? body.message : undefined
  const retry = "retry" in body ? body.retry : undefined
  const token = "turnstile_token" in body ? body.turnstile_token : undefined
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return null
  }
  return {
    message,
    retry: retry === true,
    turnstileToken: typeof token === "string" && token ? token : undefined,
  }
}

export type ShownTurnError = {
  text: string
  // The turn's correlation ID, for the shopper to quote if they write in.
  reference?: string
  canRetry: boolean
  // The shopper must pass the Turnstile check before the retry.
  needsCheck?: true
}

const APOLOGY =
  "Sorry, something went wrong and your message wasn't answered. You can try again, or ask to talk to a person and they will reply by email."

/**
 * What the shopper is told when a turn brings no reply. `error` is the chat
 * route's code (`chat_unavailable`, `invalid_message`, `still_answering`,
 * `turnstile_required`, `turnstile_failed` or `rate_limited`), or undefined
 * when the route couldn't be reached at all.
 *
 * A refused message was never stored, so it stays on screen for a retry.
 */
export function describeTurnError(
  error: string | undefined,
  reference: string | undefined
): ShownTurnError {
  if (error === "still_answering") {
    return {
      text: "The assistant is still answering your last message. Please wait for its reply.",
      canRetry: false,
    }
  }
  if (error === "invalid_message") {
    return {
      text: `That message couldn't be sent. Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`,
      canRetry: false,
    }
  }
  if (error === "turnstile_required" || error === "turnstile_failed") {
    return {
      text: "We couldn't confirm that this message was sent by a person. Complete the check below, then try again.",
      canRetry: true,
      needsCheck: true,
    }
  }
  if (error === "rate_limited") {
    return {
      text: "Too many messages have come from your connection in a short time. Please wait a few minutes, then try again.",
      canRetry: true,
    }
  }
  return { text: APOLOGY, reference, canRetry: true }
}
