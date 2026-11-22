// The agent for each role, from the resolved settings.

import * as sandcastle from "@ai-hero/sandcastle"
import type { ResolvedFactory, Role } from "./factory.mts"

/** The agent that plays `role`, with the model and effort the settings give it. */
export const agentFor = (factory: ResolvedFactory, role: Role) => {
  const { model, effort } = factory.models[role]
  return sandcastle.claudeCode(model, { effort })
}
