// The implementer builds the ticket on its branch, or fixes a CI failure.
// `untilCiPasses` is the CI fix loop for any branch the host has pushed.

import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import {
  DONE_OR_BLOCKED,
  DONE_OR_BLOCKED_PROMPT,
} from "../../shared/answers.mts"
import { waitForChecks } from "../../shared/ci.mts"
import {
  CI_FIX_ITERATIONS,
  IMPLEMENTER,
  MAX_CI_FIXES,
} from "../../shared/config.mts"
import { TicketFailure } from "../../shared/failures.mts"
import { git, push } from "../../shared/host.mts"
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

/**
 * Wait for CI on the branch's pushed head. On a failure the implementer gets
 * the log, up to MAX_CI_FIXES times, and the host pushes each fix.
 */
export const untilCiPasses = async (
  box: Sandbox,
  ticket: Ticket,
  signal: AbortSignal
) => {
  for (let fixes = 0; ; fixes++) {
    const sha = git("rev-parse", ticket.branch)
    const ci = await waitForChecks(sha, signal)
    if (ci.passed) return
    if (fixes === MAX_CI_FIXES) {
      throw new TicketFailure(
        `CI still fails after ${MAX_CI_FIXES} fix attempts.`
      )
    }
    console.log(
      `  #${ticket.number}: CI failed. Fix attempt ${fixes + 1}/${MAX_CI_FIXES}.`
    )
    await implement(box, ticket, ci.log, CI_FIX_ITERATIONS, signal)
    if (git("rev-parse", ticket.branch) === sha) {
      throw new TicketFailure(
        "CI failed, and the implementer committed no fix."
      )
    }
    push(ticket.branch)
  }
}
