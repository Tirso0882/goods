// Phase 1: the planner picks the tickets that can be built side by side now.

import { join } from "node:path"
import * as sandcastle from "@ai-hero/sandcastle"
import { z } from "zod"
import { sandbox } from "../../environment.mts"
import { BASE_REF, PLANNER, PLANNER_BRANCH } from "../../shared/config.mts"
import { withRetry } from "../../shared/failures.mts"
import { type Ticket, openFactoryPullRequests } from "../../shared/github.mts"
import { deleteBranch } from "../../shared/host.mts"

const planSchema = z.object({
  issues: z.array(z.object({ number: z.number().int() })),
})

/** The tickets that can be built side by side now. */
export const plan = async (tickets: Ticket[], signal: AbortSignal) => {
  const inFlight = openFactoryPullRequests()
  // The planner only reads, but it still gets its own worktree on origin/main
  // so it never sees your checkout.
  deleteBranch(PLANNER_BRANCH)
  try {
    const result = await withRetry("planner", signal, () =>
      sandcastle.run({
        name: "planner",
        agent: PLANNER(),
        sandbox: sandbox(0),
        branchStrategy: {
          type: "branch",
          branch: PLANNER_BRANCH,
          baseBranch: BASE_REF,
        },
        promptFile: join(import.meta.dirname, "prompt.md"),
        promptArgs: {
          ISSUES: tickets.map((t) => t.text).join("\n\n---\n\n"),
          IN_FLIGHT:
            inFlight.length === 0
              ? "None."
              : inFlight
                  .map((pr) => `- ${pr.headRefName}: ${pr.title}`)
                  .join("\n"),
        },
        maxIterations: 1, // structured output requires a single iteration
        idleTimeoutSeconds: 1800,
        signal,
        output: sandcastle.Output.object({
          tag: "plan",
          schema: planSchema,
          maxRetries: 2,
        }),
      })
    )
    const chosen = new Set(result.output.issues.map((i) => i.number))
    return tickets.filter((t) => chosen.has(t.number))
  } finally {
    deleteBranch(PLANNER_BRANCH)
  }
}
