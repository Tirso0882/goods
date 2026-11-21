// The PR writer drafts the pull request. The host pushes the branch and opens
// it.

import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import { BASE_BRANCH, PR_LABEL, PR_WRITER } from "../../shared/config.mts"
import { TicketFailure, withRetry } from "../../shared/failures.mts"
import { type Ticket, ticketArgs } from "../../shared/tickets.mts"
import { REPO, git, host, onHost, push } from "../../shared/host.mts"

const CONVENTIONAL_TITLE =
  /^(feat|fix|docs|test|refactor|perf|build|ci|chore|style)(\([\w./-]+\))?!?: \S/

/** Write, push and open the pull request; its URL. */
export const publish = async (
  box: Sandbox,
  ticket: Ticket,
  review: string,
  signal: AbortSignal
) => {
  const label = `#${ticket.number}`

  // The writer leaves the pull request in the worktree's own git directory:
  // the host can read it there, and git never commits it.
  const gitDir = git("-C", box.worktreePath, "rev-parse", "--absolute-git-dir")
  const prTitleFile = join(gitDir, "factory-pr-title.txt")
  const prBodyFile = join(gitDir, "factory-pr-body.md")

  rmSync(prTitleFile, { force: true })
  rmSync(prBodyFile, { force: true })
  await withRetry(`${label} PR writer`, signal, () =>
    box.run({
      name: `PR writer ${label}`,
      agent: PR_WRITER(),
      promptFile: join(import.meta.dirname, "prompt.md"),
      promptArgs: {
        ...ticketArgs(ticket),
        REVIEW: review,
        PR_TITLE_FILE: prTitleFile,
        PR_BODY_FILE: prBodyFile,
      },
      maxIterations: 1,
      idleTimeoutSeconds: 1800,
      signal,
    })
  )
  if (!existsSync(prTitleFile) || !existsSync(prBodyFile)) {
    throw new TicketFailure("The PR writer didn't write the pull request.")
  }
  const title = readFileSync(prTitleFile, "utf8").trim().split("\n")[0]!
  let body = readFileSync(prBodyFile, "utf8").trim()
  if (!CONVENTIONAL_TITLE.test(title)) {
    console.warn(
      `  ${label}: the PR title isn't a conventional commit: ${title}`
    )
  }
  if (
    !new RegExp(`\\b(Closes|Fixes|Resolves) #${ticket.number}\\b`, "i").test(
      body
    )
  ) {
    body += `\n\nCloses #${ticket.number}`
  }
  body +=
    "\n\n---\n\nBuilt by the Sandcastle factory. It merges nothing: review it as you would any pull request."

  push(ticket.branch)
  const pullRequest = onHost("Opening the pull request", () =>
    host(
      "gh",
      [
        "pr",
        "create",
        "--repo",
        REPO,
        "--base",
        BASE_BRANCH,
        "--head",
        ticket.branch,
        "--title",
        title,
        "--label",
        PR_LABEL,
        "--body-file",
        "-",
      ],
      body
    )
  )
  console.log(`  ${label}: opened ${pullRequest}`)
  return pullRequest
}
