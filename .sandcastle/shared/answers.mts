// What each agent answers the host, as structured output (see
// `run-with-extraction.mts`), and what the host makes of it.

import * as sandcastle from "@ai-hero/sandcastle"
import { z } from "zod"

const MAX_REASON_CHARS = 1500

/**
 * Whether the implementer or the branch updater finished, or stopped. The
 * reason is posted publicly, so it's cut to a comment's length.
 */
export const DONE_OR_BLOCKED = sandcastle.Output.object({
  tag: "answer",
  schema: z.discriminatedUnion("status", [
    z.object({ status: z.literal("done") }),
    z.object({
      status: z.literal("blocked"),
      reason: z
        .string()
        .trim()
        .min(1)
        .transform((reason) => reason.slice(0, MAX_REASON_CHARS)),
    }),
  ]),
})

export const DONE_OR_BLOCKED_PROMPT = `Answer the host with JSON in an <answer> tag, and nothing else.

If you built everything the task asks and committed it:

<answer>{"status": "done"}</answer>

If you stopped as BLOCKED says, with your one-paragraph explanation for the maintainer:

<answer>{"status": "blocked", "reason": "The issue asks for X, but ADR 0010 says Y."}</answer>`

const reviewReport = z.object({
  criteria: z.array(
    z.object({
      criterion: z.string().min(1),
      status: z.enum(["met", "not-verifiable", "missing"]),
      /** The test that proves a met criterion. */
      // Models often send null for "no test".
      test: z.string().min(1).nullish(),
    })
  ),
  /** What the reviewer changed, and why. */
  changes: z.array(z.string()),
  /** What a person should look at. */
  notes: z.array(z.string()),
})

export type ReviewReport = z.infer<typeof reviewReport>

/** The reviewer's report: each acceptance criterion, its fixes, its notes. */
export const REVIEW_REPORT = sandcastle.Output.object({
  tag: "review",
  schema: reviewReport,
})

const CRITERION_STATUS: Record<
  ReviewReport["criteria"][number]["status"],
  string
> = {
  met: "Met",
  "not-verifiable": "Not verifiable in the sandbox",
  missing: "Missing",
}

export const REVIEW_PROMPT = `Answer the host with your report as JSON in a <review> tag, and nothing else. The PR writer writes the pull request from it.

- \`criteria\`: every acceptance criterion of the issue, as the issue words it, with its \`status\`: "met", "not-verifiable" (it needs Docker, a browser, a model or a service the project doesn't start for the sandbox) or "missing". For a met criterion, \`test\` names the test that proves it.
- \`changes\`: what you changed on the branch, and why, one line each.
- \`notes\`: anything a person should look at, one line each.

<review>{"criteria": [{"criterion": "An order stores its total", "status": "met", "test": "test_an_order_stores_its_total"}, {"criterion": "Checked by hand in the running app", "status": "not-verifiable"}], "changes": ["Renamed data to invoice in the route, per the glossary."], "notes": []}</review>`

const bullets = (lines: readonly string[]) =>
  lines.length === 0 ? "- None." : lines.map((line) => `- ${line}`).join("\n")

/** The reviewer's report as Markdown, for the PR writer. */
export const reviewMarkdown = (report: ReviewReport) =>
  [
    "### Acceptance criteria",
    bullets(
      report.criteria.map(
        ({ criterion, status, test }) =>
          `**${CRITERION_STATUS[status]}:** ${criterion}${test ? ` (test: \`${test}\`)` : ""}`
      )
    ),
    "### What the reviewer changed",
    bullets(report.changes),
    "### For a person to look at",
    bullets(report.notes),
  ].join("\n\n")

const pullRequestDraft = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
})

export type PullRequestDraft = z.infer<typeof pullRequestDraft>

/** The PR writer's pull request. The host fixes it up before opening it. */
export const PULL_REQUEST_DRAFT = sandcastle.Output.object({
  tag: "pull-request",
  schema: pullRequestDraft,
})

export const PULL_REQUEST_PROMPT = `Answer the host with the pull request as JSON in a <pull-request> tag, and nothing else: its \`title\` and its Markdown \`body\`, as THE TITLE and THE BODY say.

<pull-request>{"title": "feat(agent): hand a support case to the operator", "body": "## Summary\\n\\n..."}</pull-request>`

const CONVENTIONAL_TITLE =
  /^(feat|fix|docs|test|refactor|perf|build|ci|chore|style)(\([\w./-]+\))?!?: \S/

const FOOTER =
  "---\n\nBuilt by the Sandcastle factory. It merges nothing: review it as you would any pull request."

/**
 * The pull request the host opens for issue `issue`: the writer's title on one
 * line, and its body with a closing line for the issue and the factory's
 * footer. A title that isn't a conventional commit is the host's to warn of:
 * release tooling may read it.
 */
export const finishPullRequest = (issue: number, draft: PullRequestDraft) => {
  const title = draft.title.trim().split("\n")[0] ?? ""
  let body = draft.body.trim()
  if (!new RegExp(`\\b(Closes|Fixes|Resolves) #${issue}\\b`, "i").test(body)) {
    body += `\n\nCloses #${issue}`
  }
  return {
    title,
    body: `${body}\n\n${FOOTER}`,
    titleIsConventional: CONVENTIONAL_TITLE.test(title),
  }
}

const commentBody = z.string().trim().min(1)

/**
 * What the review addresser posts: its replies to your thread comments, by
 * their node ids, and comments on the pull request. The host posts them.
 */
export const FEEDBACK_ANSWER = sandcastle.Output.object({
  tag: "answer",
  schema: z.object({
    threadReplies: z
      .array(z.object({ commentId: z.string().min(1), body: commentBody }))
      .default([]),
    topLevelComments: z.array(z.object({ body: commentBody })).default([]),
  }),
})

export const FEEDBACK_PROMPT = `Answer the host with JSON in an <answer> tag, and nothing else. The host posts it on the pull request, as the factory.

- \`threadReplies\`: your reply to a review comment, by the \`commentId\` it has in the feedback.
- \`topLevelComments\`: comments on the pull request itself, for feedback that isn't in a thread.

Use empty lists when you have nothing to say.

<answer>{"threadReplies": [{"commentId": "PRRC_kwDOexample", "body": "Renamed to \`invoice\` in 1a2b3c4."}], "topLevelComments": [{"body": "Kept the retry: ADR 0004 says every call to the payment service retries once."}]}</answer>`
