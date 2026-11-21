// What each agent answers the host, as structured output (see
// `run-with-extraction.mts`), and what the host makes of it.

import * as sandcastle from "@ai-hero/sandcastle"
import { z } from "zod"

const MAX_REASON_CHARS = 1500

/**
 * Whether the implementer or the branch updater finished, or stopped. The
 * reason is posted publicly, so it's cut to a comment's length.
 */
export const STOP_ANSWER = sandcastle.Output.object({
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

export const STOP_PROMPT = `Answer the host with JSON in an <answer> tag, and nothing else.

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
      test: z.string().min(1).optional(),
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

- \`criteria\`: every acceptance criterion of the issue, as the issue words it, with its \`status\`: "met", "not-verifiable" (it needs Docker, the Compose stack, a browser or a model) or "missing". For a met criterion, \`test\` names the test that proves it.
- \`changes\`: what you changed on the branch, and why, one line each.
- \`notes\`: anything a person should look at, one line each.

<review>{"criteria": [{"criterion": "A turn stores both messages", "status": "met", "test": "test_a_turn_stores_both_messages"}, {"criterion": "Checked by hand in the Compose stack", "status": "not-verifiable"}], "changes": ["Renamed user to shopper in the route, per the glossary."], "notes": []}</review>`

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

/** The PR writer's pull request. The host fixes it up before opening it. */
export const PULL_REQUEST_DRAFT = sandcastle.Output.object({
  tag: "pull-request",
  schema: z.object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
  }),
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
 * release-please reads the squash commit.
 */
export const finishPullRequest = (
  issue: number,
  draft: { title: string; body: string }
) => {
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
