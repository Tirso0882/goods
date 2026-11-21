// The reviewer checks the branch against the issue and the coding standards,
// and fixes what it finds.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Sandbox } from "@ai-hero/sandcastle"
import { REVIEWER } from "../../shared/config.mts"
import { withRetry } from "../../shared/failures.mts"
import { type Ticket, ticketArgs } from "../../shared/github.mts"

const MAX_REVIEW_CHARS = 8000

const CODING_STANDARDS = readFileSync(
  join(import.meta.dirname, "../../CODING_STANDARDS.md"),
  "utf8"
)

/** The reviewer's report, for the PR writer. */
export const review = async (
  box: Sandbox,
  ticket: Ticket,
  signal: AbortSignal
) => {
  const label = `#${ticket.number}`
  const result = await withRetry(`${label} reviewer`, signal, () =>
    box.run({
      name: `reviewer ${label}`,
      agent: REVIEWER(),
      promptFile: join(import.meta.dirname, "prompt.md"),
      promptArgs: { ...ticketArgs(ticket), CODING_STANDARDS },
      maxIterations: 1,
      idleTimeoutSeconds: 1800,
      signal,
    })
  )
  // Its report comes last in its output.
  return result.stdout.slice(-MAX_REVIEW_CHARS) || "No report."
}
