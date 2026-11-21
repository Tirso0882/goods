// The implementer builds the ticket on its branch, or fixes a CI failure.

import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import {
  DONE_OR_BLOCKED,
  DONE_OR_BLOCKED_PROMPT,
} from "../../shared/answers.mts"
import { IMPLEMENTER } from "../../shared/config.mts"
import { TicketFailure } from "../../shared/failures.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
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
  const { output } = await runWithExtraction(box, {
    role: "the implementer",
    name: `implementer ${label}`,
    agent: IMPLEMENTER(),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: { ...ticketArgs(ticket), CI_FAILURE: ciFailure },
    maxIterations,
    idleTimeoutSeconds: 1800,
    signal,
    output: DONE_OR_BLOCKED,
    extractionPrompt: DONE_OR_BLOCKED_PROMPT,
  })
  if (output.status === "blocked") {
    throw new TicketFailure(`The implementer stopped: ${output.reason}`)
  }
}
