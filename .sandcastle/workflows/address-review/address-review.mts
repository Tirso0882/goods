// The review addresser acts on your review of a factory pull request you sent
// back by labelling it `ready-for-agent`. The host gathers your unresolved
// feedback and CI's failure on the branch's head, the agent fixes and answers
// it in the pull request's sandbox, and the host pushes, posts the replies,
// removes the label and waits for CI.

import { join } from "node:path"
import * as sandcastle from "@ai-hero/sandcastle"
import type { Sandbox } from "@ai-hero/sandcastle"
import { sandbox, setUpSandbox } from "../../environment.mts"
import { FEEDBACK_ANSWER, FEEDBACK_PROMPT } from "../../shared/answers.mts"
import { checksOn } from "../../shared/ci.mts"
import { agentFor } from "../../shared/agents.mts"
import {
  type ResolvedFactory,
  limitText,
  logFile,
} from "../../shared/factory.mts"
import {
  TicketFailure,
  isApiTrouble,
  isAuthFailure,
} from "../../shared/failures.mts"
import {
  commentOnPullRequest,
  readFeedback,
  removeReadyLabel,
  replyToReviewComment,
  ticketForBranch,
} from "../../shared/github.mts"
import {
  HostError,
  fetchBranch,
  git,
  isAncestor,
  onHost,
  push,
} from "../../shared/host.mts"
import type { FactoryPullRequest } from "../../shared/pull-requests.mts"
import {
  type Feedback,
  addressFailedComment,
  filterReplies,
  afterAddressing,
  nothingActionableComment,
  whatToAddress,
  withoutLogQuotes,
} from "../../shared/review-feedback.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
import { SandboxSetupError } from "../../shared/setup.mts"
import type { Ticket } from "../../shared/tickets.mts"
import { untilCiPasses } from "../implement/implement.mts"

/** The issue the branch builds, if you wrote it: what the review is about. */
const readIssue = (factory: ResolvedFactory, branch: string) => {
  const ticket = ticketForBranch(factory.names, branch)
  if (ticket === undefined) {
    throw new TicketFailure(
      "Its branch names no issue the maintainer wrote, so the agent has no spec to weigh the review against."
    )
  }
  return ticket
}

const runAddresser = async (
  factory: ResolvedFactory,
  box: Sandbox,
  pr: FactoryPullRequest,
  ticket: Ticket,
  feedback: Feedback,
  ciFailure: string,
  signal: AbortSignal
) => {
  const name = `review addresser PR #${pr.number}`
  const { output } = await runWithExtraction(box, {
    role: "the review addresser",
    name,
    agent: agentFor(factory, "reviewAddresser"),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      PR_NUMBER: String(pr.number),
      PR_TITLE: pr.title,
      BRANCH: pr.headRefName,
      BASE_REF: factory.names.baseRef,
      ISSUE_NUMBER: String(ticket.number),
      ISSUE: ticket.text,
      FEEDBACK: JSON.stringify(feedback, null, 2),
      CI_FAILURE: ciFailure,
      ...factory.prompts.addressReview,
    },
    maxIterations: factory.limits.addressIterations,
    idleTimeoutSeconds: 1800,
    logging: logFile(factory.logDir, pr.headRefName, name),
    retries: factory.retries,
    signal,
    output: FEEDBACK_ANSWER,
    extractionPrompt: FEEDBACK_PROMPT,
  })
  return output
}

/** What the factory did about the review. */
type Addressed = { commits: number; replies: number; comments: number }

const addressReview = async (
  factory: ResolvedFactory,
  pr: FactoryPullRequest,
  slot: number,
  signal: AbortSignal,
  progress: { labelRemoved: boolean }
): Promise<Addressed | "nothing to do"> => {
  const branch = pr.headRefName
  const ticket = readIssue(factory, branch)
  const { feedback, replyTo } = onHost("Reading the review", () =>
    readFeedback(pr.number)
  )
  fetchBranch(branch)
  // So the agent sees CI's answer for the commit it starts from.
  const ci = await checksOn(factory.timeouts, git("rev-parse", branch), signal)
  const todo = whatToAddress(feedback, ci)
  if (todo === "nothing actionable") return "nothing to do"

  await using box = await sandcastle.createSandbox({
    branch,
    baseBranch: factory.names.baseRef,
    sandbox: sandbox(factory, slot),
  })
  await setUpSandbox(factory, box)
  const worktree = box.worktreePath
  const before = git("-C", worktree, "rev-parse", "HEAD")

  const answer = await runAddresser(
    factory,
    box,
    pr,
    ticket,
    feedback,
    todo.ciFailure,
    signal
  )

  const head = git("-C", worktree, "rev-parse", "HEAD")
  if (!isAncestor(before, head)) {
    // Leave the branch as GitHub has it, so the next run can fetch it.
    git("-C", worktree, "reset", "--hard", before)
    throw new TicketFailure(
      "The agent rewrote the branch's history instead of adding commits."
    )
  }
  const commits = Number(git("rev-list", "--count", `${before}..${head}`))
  const log = ci.passed ? "" : ci.log
  const replies = withoutLogQuotes(
    filterReplies(answer.threadReplies, replyTo),
    log
  )
  const comments = withoutLogQuotes(answer.topLevelComments, log)
  const next = afterAddressing(ci, {
    commits,
    said: replies.length + comments.length,
  })
  if (next === "nothing to do") return "nothing to do"

  if (commits > 0) push(branch)
  onHost("Posting the replies", () => {
    for (const r of replies) {
      replyToReviewComment(pr.number, r.databaseId, r.body)
    }
    for (const c of comments) commentOnPullRequest(pr.number, c.body)
  })
  onHost("Removing the label", () => removeReadyLabel(factory.names, pr.number))
  progress.labelRemoved = true

  if (next === "no fix for CI") {
    throw new TicketFailure(
      "CI fails on the branch, and the agent committed no fix."
    )
  }
  if (commits > 0) await untilCiPasses(factory, box, ticket, signal)
  return { commits, replies: replies.length, comments: comments.length }
}

/** Why, for the comment: only reasons written here. */
const publicReason = (
  factory: ResolvedFactory,
  error: unknown,
  deadline: AbortSignal
) => {
  if (error instanceof TicketFailure) return error.message
  if (deadline.aborted) {
    return `It ran past its ${limitText(factory.timeouts.addressMs)} limit.`
  }
  return "The factory hit an unexpected error. Its log on the factory host has the details."
}

export type AddressOutcome =
  | ({ status: "addressed" } & Addressed)
  | { status: "nothing to do" }
  | { status: "failed"; reason: string }
  | { status: "interrupted"; reason: string }

/**
 * Address your review of pull request `pr` in sandbox `slot`. `stop` is the
 * whole run's: an agent that can't log in stops it. The label comes off when
 * it's done or failed; an interrupted one keeps it for the next run.
 */
export const addressPullRequest = async (
  factory: ResolvedFactory,
  pr: FactoryPullRequest,
  slot: number,
  stop: AbortController
): Promise<AddressOutcome> => {
  const deadline = AbortSignal.timeout(factory.timeouts.addressMs)
  const signal = AbortSignal.any([stop.signal, deadline])
  const progress = { labelRemoved: false }
  try {
    const result = await addressReview(factory, pr, slot, signal, progress)
    if (result !== "nothing to do") return { status: "addressed", ...result }
    // The label first: a comment that fails is better than one posted twice.
    onHost("Saying there was nothing to do", () => {
      removeReadyLabel(factory.names, pr.number)
      commentOnPullRequest(pr.number, nothingActionableComment(factory.names))
    })
    return { status: "nothing to do" }
  } catch (error) {
    console.error(`  ✗ PR #${pr.number} (${pr.headRefName}):`, error)
    if (isAuthFailure(error)) {
      stop.abort(new Error("The agent can't authenticate."))
    }
    // Not the pull request's fault: it keeps its label for the next run, and
    // the output stays in this log, never on the pull request. Once the label
    // is off no run picks it up again, so the pull request hears of it.
    const interrupted =
      stop.signal.aborted ||
      error instanceof HostError ||
      error instanceof SandboxSetupError ||
      isApiTrouble(error)
    if (interrupted && !progress.labelRemoved) {
      return { status: "interrupted", reason: String(error).split("\n")[0]! }
    }
    const reason = interrupted
      ? "The factory stopped before CI finished on its commits."
      : publicReason(factory, error, deadline)
    try {
      commentOnPullRequest(
        pr.number,
        addressFailedComment(factory.names, reason)
      )
      if (!progress.labelRemoved) removeReadyLabel(factory.names, pr.number)
    } catch (commentError) {
      console.error(`  Couldn't comment on PR #${pr.number}:`, commentError)
    }
    return { status: "failed", reason }
  }
}
