// Phase 1: the planner picks the tickets that can be built side by side now.

import { join } from "node:path"
import * as sandcastle from "@ai-hero/sandcastle"
import { z } from "zod"
import { sandbox } from "../../environment.mts"
import { agentFor } from "../../shared/agents.mts"
import { type ResolvedFactory, logFile } from "../../shared/factory.mts"
import { withRetry } from "../../shared/failures.mts"
import { openFactoryPullRequests } from "../../shared/github.mts"
import type { Ticket } from "../../shared/tickets.mts"
import { deleteBranch } from "../../shared/host.mts"

const planSchema = z.object({
  issues: z.array(z.object({ number: z.number().int() })),
})

/** The tickets that can be built side by side now. */
export const plan = async (
  factory: ResolvedFactory,
  tickets: Ticket[],
  signal: AbortSignal
) => {
  const { names } = factory
  const inFlight = openFactoryPullRequests(names)
  // The planner only reads, but it still gets its own worktree on origin/main
  // so it never sees your checkout.
  deleteBranch(names.plannerBranch)
  try {
    const result = await withRetry("planner", factory.retries, signal, () =>
      sandcastle.run({
        name: "planner",
        agent: agentFor(factory, "planner"),
        sandbox: sandbox(factory, 0),
        branchStrategy: {
          type: "branch",
          branch: names.plannerBranch,
          baseBranch: names.baseRef,
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
        logging: logFile(factory.logDir, names.plannerBranch, "planner"),
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
    deleteBranch(names.plannerBranch)
  }
}
