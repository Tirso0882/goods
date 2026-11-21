// The implementer builds the ticket on its branch, or fixes a CI failure.

import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import { IMPLEMENTER } from "../../shared/config.mts"
import { TicketFailure, withRetry } from "../../shared/failures.mts"
import { type Ticket, ticketArgs } from "../../shared/github.mts"

export const NO_CI_FAILURE = "None: this is the first attempt."
const MAX_BLOCKED_CHARS = 1500

export const implement = async (
  box: Sandbox,
  ticket: Ticket,
  ciFailure: string,
  maxIterations: number,
  signal: AbortSignal
) => {
  const label = `#${ticket.number}`
  const result = await withRetry(`${label} implementer`, signal, () =>
    box.run({
      name: `implementer ${label}`,
      agent: IMPLEMENTER(),
      promptFile: join(import.meta.dirname, "prompt.md"),
      promptArgs: { ...ticketArgs(ticket), CI_FAILURE: ciFailure },
      maxIterations,
      idleTimeoutSeconds: 1800,
      signal,
    })
  )
  // The agent may quote the prompt's example first, so take the last tag.
  const blocked = [
    ...result.stdout.matchAll(/<blocked>([\s\S]*?)<\/blocked>/g),
  ].at(-1)?.[1]
  if (blocked?.trim()) {
    throw new TicketFailure(
      `The implementer stopped: ${blocked.trim().slice(0, MAX_BLOCKED_CHARS)}`
    )
  }
}
