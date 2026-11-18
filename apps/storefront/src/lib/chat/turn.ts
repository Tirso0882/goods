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
}

/** The browser's request body as a turn, or null if it has no usable message. */
export function readTurnRequest(body: unknown): TurnRequest | null {
  if (!body || typeof body !== "object") return null
  const message = "message" in body ? body.message : undefined
  const retry = "retry" in body ? body.retry : undefined
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return null
  }
  return { message, retry: retry === true }
}

export type ShownTurnError = {
  text: string
  // The turn's correlation ID, for the shopper to quote if they write in.
  reference?: string
  canRetry: boolean
}

const APOLOGY =
  "Sorry, something went wrong and your message wasn't answered. You can try again, or ask to talk to a person and they will reply by email."

/**
 * What the shopper is told when a turn brings no reply. `error` is the chat
 * route's code (`chat_unavailable`, `invalid_message` or `still_answering`),
 * or undefined when the route couldn't be reached at all.
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
  return { text: APOLOGY, reference, canRetry: true }
}
