// The reviewer checks the branch against the issue and the coding standards,
// and fixes what it finds.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import {
  REVIEW_PROMPT,
  REVIEW_REPORT,
  reviewMarkdown,
} from "../../shared/answers.mts"
import { agentFor } from "../../shared/agents.mts"
import { type ResolvedFactory, logFile } from "../../shared/factory.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
import { type Ticket, ticketArgs } from "../../shared/tickets.mts"

const CODING_STANDARDS = readFileSync(
  join(import.meta.dirname, "../../CODING_STANDARDS.md"),
  "utf8"
)

/** The reviewer's report as Markdown, for the PR writer. */
export const review = async (
  factory: ResolvedFactory,
  box: Sandbox,
  ticket: Ticket,
  signal: AbortSignal
) => {
  const label = `#${ticket.number}`
  const name = `reviewer ${label}`
  const { output } = await runWithExtraction(box, {
    role: "the reviewer",
    name,
    agent: agentFor(factory, "reviewer"),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: { ...ticketArgs(factory.names, ticket), CODING_STANDARDS },
    maxIterations: 1,
    idleTimeoutSeconds: 1800,
    logging: logFile(factory.logDir, ticket.branch, name),
    retries: factory.retries,
    signal,
    output: REVIEW_REPORT,
    extractionPrompt: REVIEW_PROMPT,
  })
  return reviewMarkdown(output)
}
