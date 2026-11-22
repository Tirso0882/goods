// Your review of a factory pull request, as the agent that addresses it reads
// it. Pure: no git or gh here, so the tests can load it
// (review-feedback.test.mts).
//
// The repo is public: anyone can comment on a pull request. So the agent
// reads only what you wrote, the same rule as `ticketText` in tickets.mts.

import type { CiResult } from "./ci.mts"
import { READY_LABEL } from "./config.mts"

// The factory posts with your token, so GitHub says you wrote its comments
// too. This hidden mark tells them apart.
const FACTORY_MARK = "<!-- sandcastle-factory -->"

/** A comment or reply the factory posts, signed and marked as its own. */
export const fromFactory = (body: string) =>
  `${body.trim()}\n\n<sub>Sent by the Sandcastle factory.</sub>\n${FACTORY_MARK}`

// Comments posted before the mark existed all start this way.
const isFromFactory = (body: string) =>
  body.includes(FACTORY_MARK) || body.startsWith("The Sandcastle factory ")

type GhActor = { login: string } | null

/** A review thread, from the `reviewThreads` GraphQL query. */
export type GhReviewThread = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  comments: {
    nodes: {
      /** The GraphQL node id. */
      id: string
      /** The REST id, which the replies endpoint takes. */
      databaseId: number
      path: string | null
      line: number | null
      originalLine: number | null
      body: string
      author: GhActor
    }[]
  }
}

/** A conversation comment, from `gh pr view --json comments`. */
export type GhPullRequestComment = {
  author: GhActor
  body: string
  createdAt: string
}

/** A review, from `GET /repos/{repo}/pulls/{n}/reviews`. */
export type GhReview = {
  user: GhActor
  state: string
  body: string
  submitted_at: string | null
}

/** What the agent reads: your unresolved threads, comments and reviews. */
export type Feedback = {
  threads: {
    threadId: string
    path: string | null
    line: number | null
    outdated: boolean
    comments: { commentId: string; body: string }[]
  }[]
  comments: { body: string; createdAt: string }[]
  reviews: { state: string; body: string; submittedAt: string | null }[]
}

/**
 * Your feedback on a pull request, and the REST id of each thread comment the
 * agent may reply to, by its node id.
 */
export const ownerFeedback = (
  owner: string,
  gh: {
    threads: readonly GhReviewThread[]
    comments: readonly GhPullRequestComment[]
    reviews: readonly GhReview[]
  }
) => {
  const fromOwner = (actor: GhActor, body: string) =>
    actor?.login === owner && !isFromFactory(body)
  const replyTo = new Map<string, number>()
  const threads: Feedback["threads"] = []
  for (const thread of gh.threads) {
    if (thread.isResolved) continue
    const mine = thread.comments.nodes.filter((c) =>
      fromOwner(c.author, c.body)
    )
    if (mine.length === 0) continue
    for (const c of mine) replyTo.set(c.id, c.databaseId)
    threads.push({
      threadId: thread.id,
      path: mine[0]?.path ?? null,
      line: mine[0]?.line ?? mine[0]?.originalLine ?? null,
      outdated: thread.isOutdated,
      comments: mine.map((c) => ({ commentId: c.id, body: c.body })),
    })
  }
  const feedback: Feedback = {
    threads,
    comments: gh.comments
      .filter((c) => fromOwner(c.author, c.body))
      .map(({ body, createdAt }) => ({ body, createdAt })),
    reviews: gh.reviews
      .filter((r) => r.body.trim() !== "" && fromOwner(r.user, r.body))
      .map(({ state, body, submitted_at }) => ({
        state,
        body,
        submittedAt: submitted_at,
      })),
  }
  return { feedback, replyTo }
}

/** A reply the agent wrote to one of your thread comments, by its node id. */
export type ThreadReply = { commentId: string; body: string }

/**
 * The agent's replies the host can post: only those to a comment it fetched,
 * each with the REST id the replies endpoint takes.
 */
export const filterReplies = (
  replies: readonly ThreadReply[],
  replyTo: ReadonlyMap<string, number>
) =>
  replies.flatMap(({ commentId, body }) => {
    const databaseId = replyTo.get(commentId)
    if (databaseId === undefined) {
      console.warn(
        `  Dropping a reply to ${commentId}: not one of the comments fetched.`
      )
      return []
    }
    return [{ databaseId, body }]
  })

/** The comment when the agent changed nothing and had nothing to say. */
export const nothingActionableComment = () =>
  [
    "The Sandcastle factory read your unresolved review comments and found nothing to change or answer. The branch is unchanged.",
    `To send it back, leave a review comment, then add \`${READY_LABEL}\` again.`,
  ].join("\n\n")

/**
 * The comment when the factory couldn't finish. It is public, so `reason` is
 * one the host wrote or the agent's own explanation, never raw output.
 */
export const addressFailedComment = (reason: string) =>
  [
    "The Sandcastle factory couldn't finish addressing your review on this pull request.",
    `**Why:** ${reason}`,
    `Commits and replies it already pushed stay. Look at the branch as it is, then add \`${READY_LABEL}\` again to send it back.`,
  ].join("\n\n")

const NO_CI_FAILURE =
  "None: CI passes on the branch's head, or it has no checks."

/**
 * Whether the agent has anything to address: your feedback, or CI that fails
 * on the head it starts from. `ciFailure` is what the prompt's CI FAILURE
 * section says. It goes to the agent only, never into a comment.
 */
export const whatToAddress = (
  feedback: Feedback,
  ci: CiResult
): "nothing actionable" | { ciFailure: string } => {
  if (!ci.passed) return { ciFailure: ci.log }
  const empty =
    feedback.threads.length === 0 &&
    feedback.comments.length === 0 &&
    feedback.reviews.length === 0
  return empty ? "nothing actionable" : { ciFailure: NO_CI_FAILURE }
}

/**
 * What the host does once the agent stops, from CI on the head it started
 * from, its new commits and how many replies and comments it wrote. On red
 * CI with no commit, what it said is still posted, then the run fails.
 */
export const afterAddressing = (
  ci: CiResult,
  agent: { commits: number; said: number }
): "nothing to do" | "publish" | "no fix for CI" => {
  if (!ci.passed && agent.commits === 0) return "no fix for CI"
  if (agent.commits === 0 && agent.said === 0) return "nothing to do"
  return "publish"
}

// Shorter lines are words a reply may well share with the log.
const MIN_QUOTE_CHARS = 20

/**
 * What the agent wrote, without anything that quotes a line of the CI `log`:
 * it is posted publicly, and the log never is. The check names and job links
 * the host put in the log may stay.
 */
export const withoutLogQuotes = <T extends { body: string }>(
  said: readonly T[],
  log: string
): T[] => {
  const quotable = log
    .split("\n")
    .filter((line) => !line.startsWith("## ") && !line.startsWith("http"))
    // "<step> | <line>": a quote would be of the line.
    .map((line) => {
      const step = line.indexOf(" | ")
      return (step === -1 ? line : line.slice(step + 3)).trim()
    })
    .filter((line) => line.length >= MIN_QUOTE_CHARS)
  return said.filter(({ body }) => {
    const quotes = quotable.some((line) => body.includes(line))
    if (quotes) console.warn("  Dropping a reply that quotes the CI log.")
    return !quotes
  })
}
