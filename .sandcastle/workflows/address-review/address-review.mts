// The review addresser acts on your review of a factory pull request you sent
// back by labelling it `ready-for-agent`. The host gathers your unresolved
// feedback, the agent fixes and answers it in the pull request's sandbox, and
// the host pushes, posts the replies, removes the label and waits for CI.

import { join } from "node:path"
import * as sandcastle from "@ai-hero/sandcastle"
import type { Sandbox } from "@ai-hero/sandcastle"
import { sandbox, setUpSandbox } from "../../environment.mts"
import { FEEDBACK_ANSWER, FEEDBACK_PROMPT } from "../../shared/answers.mts"
import {
  ADDRESS_ITERATIONS,
  ADDRESS_TIMEOUT_MS,
  BASE_REF,
  REVIEW_ADDRESSER,
} from "../../shared/config.mts"
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
  nothingActionableComment,
} from "../../shared/review-feedback.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
import { SandboxSetupError } from "../../shared/setup.mts"
import type { Ticket } from "../../shared/tickets.mts"
import { untilCiPasses } from "../implement/implement.mts"

/** The issue the branch builds, if you wrote it: what the review is about. */
const readIssue = (branch: string) => {
  const ticket = ticketForBranch(branch)
  if (ticket === undefined) {
    throw new TicketFailure(
      "Its branch names no issue the maintainer wrote, so the agent has no spec to weigh the review against."
    )
  }
  return ticket
}

const isEmpty = (feedback: Feedback) =>
  feedback.threads.length === 0 &&
  feedback.comments.length === 0 &&
  feedback.reviews.length === 0

const runAddresser = async (
  box: Sandbox,
  pr: FactoryPullRequest,
  ticket: Ticket,
  feedback: Feedback,
  signal: AbortSignal
) => {
  const { output } = await runWithExtraction(box, {
    role: "the review addresser",
    name: `review addresser PR #${pr.number}`,
    agent: REVIEW_ADDRESSER(),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      PR_NUMBER: String(pr.number),
      PR_TITLE: pr.title,
      BRANCH: pr.headRefName,
      BASE_REF,
      ISSUE_NUMBER: String(ticket.number),
      ISSUE: ticket.text,
      FEEDBACK: JSON.stringify(feedback, null, 2),
    },
    maxIterations: ADDRESS_ITERATIONS,
    idleTimeoutSeconds: 1800,
    signal,
    output: FEEDBACK_ANSWER,
    extractionPrompt: FEEDBACK_PROMPT,
  })
  return output
}

/** What the factory did about the review. */
type Addressed = { commits: number; replies: number; comments: number }

const addressReview = async (
  pr: FactoryPullRequest,
  slot: number,
  signal: AbortSignal,
  progress: { labelRemoved: boolean }
): Promise<Addressed | "nothing to do"> => {
  const branch = pr.headRefName
  const ticket = readIssue(branch)
  const { feedback, replyTo } = onHost("Reading the review", () =>
    readFeedback(pr.number)
  )
  if (isEmpty(feedback)) return "nothing to do"

  fetchBranch(branch)
  await using box = await sandcastle.createSandbox({
    branch,
    baseBranch: BASE_REF,
    sandbox: sandbox(slot),
  })
  await setUpSandbox(box)
  const worktree = box.worktreePath
  const before = git("-C", worktree, "rev-parse", "HEAD")

  const answer = await runAddresser(box, pr, ticket, feedback, signal)

  const head = git("-C", worktree, "rev-parse", "HEAD")
  if (!isAncestor(before, head)) {
    // Leave the branch as GitHub has it, so the next run can fetch it.
    git("-C", worktree, "reset", "--hard", before)
    throw new TicketFailure(
      "The agent rewrote the branch's history instead of adding commits."
    )
  }
  const commits = Number(git("rev-list", "--count", `${before}..${head}`))
  const replies = filterReplies(answer.threadReplies, replyTo)
  const comments = answer.topLevelComments
  if (commits === 0 && replies.length === 0 && comments.length === 0) {
    return "nothing to do"
  }

  if (commits > 0) push(branch)
  onHost("Posting the replies", () => {
    for (const r of replies) {
      replyToReviewComment(pr.number, r.databaseId, r.body)
    }
    for (const c of comments) commentOnPullRequest(pr.number, c.body)
  })
  onHost("Removing the label", () => removeReadyLabel(pr.number))
  progress.labelRemoved = true

  if (commits > 0) await untilCiPasses(box, ticket, signal)
  return { commits, replies: replies.length, comments: comments.length }
}

/** Why, for the comment: only reasons written here. */
const publicReason = (error: unknown, deadline: AbortSignal) => {
  if (error instanceof TicketFailure) return error.message
  if (deadline.aborted) {
    return `It ran past its ${ADDRESS_TIMEOUT_MS / 3_600_000}-hour limit.`
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
  pr: FactoryPullRequest,
  slot: number,
  stop: AbortController
): Promise<AddressOutcome> => {
  const deadline = AbortSignal.timeout(ADDRESS_TIMEOUT_MS)
  const signal = AbortSignal.any([stop.signal, deadline])
  const progress = { labelRemoved: false }
  try {
    const result = await addressReview(pr, slot, signal, progress)
    if (result !== "nothing to do") return { status: "addressed", ...result }
    onHost("Saying there was nothing to do", () => {
      commentOnPullRequest(pr.number, nothingActionableComment())
      removeReadyLabel(pr.number)
    })
    return { status: "nothing to do" }
  } catch (error) {
    console.error(`  ✗ PR #${pr.number} (${pr.headRefName}):`, error)
    if (isAuthFailure(error)) {
      stop.abort(new Error("The agent can't authenticate."))
    }
    // Not the pull request's fault: it keeps its label for the next run, and
    // the output stays in this log, never on the pull request.
    if (
      stop.signal.aborted ||
      error instanceof HostError ||
      error instanceof SandboxSetupError ||
      isApiTrouble(error)
    ) {
      return { status: "interrupted", reason: String(error).split("\n")[0]! }
    }
    const reason = publicReason(error, deadline)
    try {
      commentOnPullRequest(pr.number, addressFailedComment(reason))
      if (!progress.labelRemoved) removeReadyLabel(pr.number)
    } catch (commentError) {
      console.error(`  Couldn't comment on PR #${pr.number}:`, commentError)
    }
    return { status: "failed", reason }
  }
}
