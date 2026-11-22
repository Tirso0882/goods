// One tiny call through a sandbox proves the token in `.sandcastle/.env`
// before any ticket depends on it.

import * as sandcastle from "@ai-hero/sandcastle"
import { sandbox } from "../../environment.mts"
import { agentFor } from "../../shared/agents.mts"
import { type ResolvedFactory, logFile } from "../../shared/factory.mts"
import { isAuthFailure } from "../../shared/failures.mts"
import { deleteBranch } from "../../shared/host.mts"

export const preflight = async (
  factory: ResolvedFactory,
  signal: AbortSignal
) => {
  const { names } = factory
  deleteBranch(names.preflightBranch)
  try {
    await sandcastle.run({
      name: "preflight",
      agent: agentFor(factory, "preflight"),
      sandbox: sandbox(0),
      branchStrategy: {
        type: "branch",
        branch: names.preflightBranch,
        baseBranch: names.baseRef,
      },
      prompt: "Reply with the single word OK and do nothing else.",
      maxIterations: 1,
      completionSignal: "OK",
      logging: logFile(factory.logDir, names.preflightBranch, "preflight"),
      signal,
    })
  } catch (error) {
    throw new Error(
      isAuthFailure(error)
        ? "The agent can't log in: renew CLAUDE_CODE_OAUTH_TOKEN in .sandcastle/.env with `claude setup-token`."
        : "The preflight agent run failed.",
      { cause: error }
    )
  } finally {
    deleteBranch(names.preflightBranch)
  }
}
