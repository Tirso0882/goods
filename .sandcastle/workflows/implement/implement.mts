// The implementer builds the ticket on its branch, or fixes a CI failure.
// `untilCiPasses` is the CI fix loop for any branch the host has pushed.

import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import {
  DONE_OR_BLOCKED,
  DONE_OR_BLOCKED_PROMPT,
} from "../../shared/answers.mts"
import { waitForChecks } from "../../shared/ci.mts"
import { agentFor } from "../../shared/agents.mts"
import { type ResolvedFactory, logFile } from "../../shared/factory.mts"
import { TicketFailure } from "../../shared/failures.mts"
import { git, push } from "../../shared/host.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
import { type Ticket, ticketArgs } from "../../shared/tickets.mts"

export const NO_CI_FAILURE = "None: this is the first attempt."

export const implement = async (
  factory: ResolvedFactory,
  box: Sandbox,
  ticket: Ticket,
  ciFailure: string,
  maxIterations: number,
  signal: AbortSignal
) => {
  const label = `#${ticket.number}`
  const name = `implementer ${label}`
  const { output } = await runWithExtraction(box, {
    role: "the implementer",
    name,
    agent: agentFor(factory, "implementer"),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      ...ticketArgs(factory.names, ticket),
      CI_FAILURE: ciFailure,
      ...factory.prompts.implement,
    },
    maxIterations,
    idleTimeoutSeconds: 1800,
    logging: logFile(factory.logDir, ticket.branch, name),
    retries: factory.retries,
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
 * the log, up to `limits.maxCiFixes` times, and the host pushes each fix.
 */
export const untilCiPasses = async (
  factory: ResolvedFactory,
  box: Sandbox,
  ticket: Ticket,
  signal: AbortSignal
) => {
  const { maxCiFixes, ciFixIterations } = factory.limits
  for (let fixes = 0; ; fixes++) {
    const sha = git("rev-parse", ticket.branch)
    const ci = await waitForChecks(factory.timeouts, sha, signal)
    if (ci.passed) return
    if (fixes === maxCiFixes) {
      throw new TicketFailure(
        `CI still fails after ${maxCiFixes} fix attempts.`
      )
    }
    console.log(
      `  #${ticket.number}: CI failed. Fix attempt ${fixes + 1}/${maxCiFixes}.`
    )
    await implement(factory, box, ticket, ci.log, ciFixIterations, signal)
    if (git("rev-parse", ticket.branch) === sha) {
      throw new TicketFailure(
        "CI failed, and the implementer committed no fix."
      )
    }
    push(ticket.branch)
  }
}
