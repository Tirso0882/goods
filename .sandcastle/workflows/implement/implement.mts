// The implementer builds the ticket on its branch, or fixes a CI failure.

import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import { IMPLEMENTER } from "../../shared/config.mts"
import {
  TicketFailure,
  blockedNote,
  withRetry,
} from "../../shared/failures.mts"
import { type Ticket, ticketArgs } from "../../shared/tickets.mts"

export const NO_CI_FAILURE = "None: this is the first attempt."

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
  const blocked = blockedNote(result.stdout)
  if (blocked) throw new TicketFailure(`The implementer stopped: ${blocked}`)
}
