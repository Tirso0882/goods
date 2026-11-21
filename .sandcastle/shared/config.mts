// The factory's knobs, in one place.

import * as sandcastle from "@ai-hero/sandcastle"

export const MAX_WAVES = 10

// Parallel agents share one Claude subscription's rate limits. Each ticket
// holds a slot from its sandbox to its last CI result.
export const DEFAULT_PARALLEL = 3

// Wall clock for one ticket, CI waits included. When it runs out, the agent in
// flight is killed and the ticket goes to a person.
export const TICKET_TIMEOUT_MS = 3 * 60 * 60_000

// Each implementer iteration is a fresh session that picks up from the
// branch's commits. Ten is plenty for a ticket sized for one agent.
export const IMPLEMENT_ITERATIONS = 10
export const CI_FIX_ITERATIONS = 5
export const MAX_CI_FIXES = 2

// Bringing one conflicting pull request up to date, the agent included.
export const UPDATE_TIMEOUT_MS = 60 * 60_000
// GitHub works out whether a pull request merges after the first read asks.
export const MERGEABILITY_RECHECK_MS = 15_000

export const CI_POLL_MS = 60_000
export const CI_TIMEOUT_MS = 45 * 60_000

export const MAX_AGENT_ATTEMPTS = 3
export const RETRY_DELAY_MS = 60_000

export const BASE_BRANCH = "main"
export const BASE_REF = `origin/${BASE_BRANCH}`
export const READY_LABEL = "ready-for-agent"
export const HUMAN_LABEL = "ready-for-human"
export const PR_LABEL = "Sandcastle"
export const BRANCH_PREFIX = "sandcastle/issue-"
export const PLANNER_BRANCH = "sandcastle/planner"
export const PREFLIGHT_BRANCH = "sandcastle/preflight"

export const PLANNER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "high" })
export const IMPLEMENTER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "medium" })
export const REVIEWER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "high" })
export const BRANCH_UPDATER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "high" })
export const PR_WRITER = () =>
  sandcastle.claudeCode("claude-sonnet-5-5", { effort: "medium" })
export const PREFLIGHT = () =>
  sandcastle.claudeCode("claude-haiku-5-5", { effort: "low" })
