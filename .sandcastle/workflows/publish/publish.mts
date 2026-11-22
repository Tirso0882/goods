// The PR writer drafts the pull request. The host pushes the branch and opens
// it.

import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import {
  PULL_REQUEST_DRAFT,
  PULL_REQUEST_PROMPT,
  finishPullRequest,
} from "../../shared/answers.mts"
import { agentFor } from "../../shared/agents.mts"
import { type ResolvedFactory, logFile } from "../../shared/factory.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
import { type Ticket, ticketArgs } from "../../shared/tickets.mts"
import { REPO, host, onHost, push } from "../../shared/host.mts"

/** Write, push and open the pull request; its URL. */
export const publish = async (
  factory: ResolvedFactory,
  box: Sandbox,
  ticket: Ticket,
  review: string,
  signal: AbortSignal
) => {
  const label = `#${ticket.number}`
  const name = `PR writer ${label}`
  const { output: draft } = await runWithExtraction(box, {
    role: "the PR writer",
    name,
    agent: agentFor(factory, "prWriter"),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: { ...ticketArgs(factory.names, ticket), REVIEW: review },
    maxIterations: 1,
    idleTimeoutSeconds: 1800,
    logging: logFile(factory.logDir, ticket.branch, name),
    retries: factory.retries,
    signal,
    output: PULL_REQUEST_DRAFT,
    extractionPrompt: PULL_REQUEST_PROMPT,
  })
  const { title, body, titleIsConventional } = finishPullRequest(
    ticket.number,
    draft
  )
  if (!titleIsConventional) {
    console.warn(
      `  ${label}: the PR title isn't a conventional commit: ${title}`
    )
  }

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
        factory.names.baseBranch,
        "--head",
        ticket.branch,
        "--title",
        title,
        "--label",
        factory.names.prLabel,
        "--body-file",
        "-",
      ],
      body
    )
  )
  console.log(`  ${label}: opened ${pullRequest}`)
  return pullRequest
}
