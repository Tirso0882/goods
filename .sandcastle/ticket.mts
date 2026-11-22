// Phases 2 to 4 for one ticket: implement, review, publish, CI. It ends with a
// pull request whose CI passes, or with the ticket handed to a person.

import * as sandcastle from "@ai-hero/sandcastle"
import { sandbox, setUpSandbox } from "./environment.mts"
import { type ResolvedFactory, limitText } from "./shared/factory.mts"
import { SandboxSetupError } from "./shared/setup.mts"
import {
  TicketFailure,
  isApiTrouble,
  isAuthFailure,
} from "./shared/failures.mts"
import { handToHuman } from "./shared/github.mts"
import type { Ticket } from "./shared/tickets.mts"
import { HostError, discardWorktree, isAheadOfBase } from "./shared/host.mts"
import {
  NO_CI_FAILURE,
  implement,
  untilCiPasses,
} from "./workflows/implement/implement.mts"
import { publish } from "./workflows/publish/publish.mts"
import { review } from "./workflows/review/review.mts"

const buildTicket = async (
  factory: ResolvedFactory,
  ticket: Ticket,
  slot: number,
  signal: AbortSignal,
  progress: { pullRequest?: string }
): Promise<string> => {
  discardWorktree(ticket.branch)
  await using box = await sandcastle.createSandbox({
    branch: ticket.branch,
    baseBranch: factory.names.baseRef,
    sandbox: sandbox(factory, slot),
  })
  await setUpSandbox(factory, box)

  await implement(
    factory,
    box,
    ticket,
    NO_CI_FAILURE,
    factory.limits.implementIterations,
    signal
  )
  if (!isAheadOfBase(factory.names.baseRef, ticket.branch)) {
    throw new TicketFailure("The implementer finished without a commit.")
  }

  const report = await review(factory, box, ticket, signal)
  const pullRequest = await publish(factory, box, ticket, report, signal)
  progress.pullRequest = pullRequest

  await untilCiPasses(factory, box, ticket, signal)
  return pullRequest
}

export type Outcome =
  | { status: "ready"; pullRequest: string }
  | { status: "handed-off"; reason: string }
  | { status: "interrupted"; reason: string }

/**
 * Build one ticket in sandbox `slot`. `stop` is the whole run's: an agent that
 * can't log in stops it.
 */
export const runTicket = async (
  factory: ResolvedFactory,
  ticket: Ticket,
  slot: number,
  stop: AbortController
): Promise<Outcome> => {
  const deadline = AbortSignal.timeout(factory.timeouts.ticketMs)
  const signal = AbortSignal.any([stop.signal, deadline])
  const progress: { pullRequest?: string } = {}
  try {
    const pullRequest = await buildTicket(
      factory,
      ticket,
      slot,
      signal,
      progress
    )
    return { status: "ready", pullRequest }
  } catch (error) {
    console.error(`  ✗ #${ticket.number} (${ticket.branch}):`, error)
    if (isAuthFailure(error)) {
      stop.abort(new Error("The agent can't authenticate."))
    }
    // Not the ticket's fault: leave it labelled for the next run. A failed
    // setup counts too: its output stays in this log, never on the issue.
    if (
      stop.signal.aborted ||
      error instanceof HostError ||
      error instanceof SandboxSetupError ||
      isApiTrouble(error)
    ) {
      return { status: "interrupted", reason: String(error).split("\n")[0]! }
    }
    // The comment is public, so it carries only the reasons written here and
    // the implementer's own blocked reason, never raw error output.
    const reason =
      error instanceof TicketFailure
        ? error.message
        : deadline.aborted
          ? `It ran past its ${limitText(factory.timeouts.ticketMs)} limit.`
          : "The factory hit an unexpected error. Its log on the factory host has the details."
    try {
      handToHuman(factory.names, ticket, reason, progress.pullRequest)
    } catch (labelError) {
      console.error(`  Couldn't relabel #${ticket.number}:`, labelError)
    }
    return { status: "handed-off", reason }
  }
}
