// Telling the ticket's failures from the model API's, and retrying the API's.

import { setTimeout as sleep } from "node:timers/promises"
import { MAX_AGENT_ATTEMPTS, RETRY_DELAY_MS } from "./config.mts"

/** A ticket the factory can't finish, for a reason a person should read. */
export class TicketFailure extends Error {}

/**
 * Trouble with the model API or the network, not with the ticket. Only the
 * start of the error is read: further down is agent output, and a ticket about
 * rate limits talks about 429s.
 */
export const isApiTrouble = (error: unknown) =>
  /overloaded|rate.?limit|usage limit|hit your limit|\b429\b|\b5(00|02|03|29)\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
    String(error).slice(0, 500)
  )

/**
 * The agent can't log in. Every other ticket would fail the same way, so the
 * run stops, and no ticket is handed off for it.
 */
export const isAuthFailure = (error: unknown) =>
  /Failed to authenticate|\b401\b|invalid x-api-key|OAuth (access )?token/i.test(
    String(error).slice(0, 500)
  )

export const withRetry = async <T,>(
  label: string,
  signal: AbortSignal,
  run: () => Promise<T>
) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= MAX_AGENT_ATTEMPTS || !isApiTrouble(error)) throw error
      console.warn(
        `  ${label} hit API trouble. Retrying in ${RETRY_DELAY_MS / 1000}s (${attempt}/${MAX_AGENT_ATTEMPTS}).`
      )
      await sleep(RETRY_DELAY_MS, undefined, { signal })
    }
  }
}
