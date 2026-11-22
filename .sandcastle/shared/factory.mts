// The factory's settings: a project's `.factory/factory.config.mts` declares
// what differs from the defaults, and `resolveFactory` turns that config plus
// facts about the host into what a run uses. Pure: no files, commands or
// environment here, so the tests fake the host as plain data
// (factory.test.mts).

import { join } from "node:path"

export type Effort = "low" | "medium" | "high" | "xhigh" | "max"

export type ModelChoice = { model: string; effort: Effort }

const ROLES = [
  "planner",
  "implementer",
  "reviewer",
  "reviewAddresser",
  "branchUpdater",
  "prWriter",
  "preflight",
] as const

/** An agent the factory runs, each with its own model and effort. */
export type Role = (typeof ROLES)[number]

export type Names = {
  baseBranch: string
  readyLabel: string
  humanLabel: string
  prLabel: string
  /** A ticket's branch is this plus its issue number. */
  branchPrefix: string
  plannerBranch: string
  preflightBranch: string
  environmentCheckBranch: string
}

export type Limits = {
  /** Parallel agents share one Claude subscription's rate limits. Each
   *  ticket holds a slot from its sandbox to its last CI result. */
  parallel: number
  /** Rounds of update, address, plan and build in one run. */
  maxWaves: number
  /** Each implementer iteration is a fresh session that picks up from the
   *  branch's commits. Ten is plenty for a ticket sized for one agent. */
  implementIterations: number
  /** Iterations the implementer gets for each CI fix. */
  ciFixIterations: number
  /** CI fixes a ticket gets before it goes to a person. */
  maxCiFixes: number
  /** Iterations the review addresser gets. */
  addressIterations: number
}

export type Timeouts = {
  /** Wall clock for one ticket, CI waits included. When it runs out, the
   *  agent in flight is killed and the ticket goes to a person. */
  ticketMs: number
  /** Bringing one conflicting pull request up to date, the agent included. */
  updateMs: number
  /** Addressing your review of one pull request, its CI fixes included. */
  addressMs: number
  /** Waiting for CI on one commit. */
  ciMs: number
  /** Between two reads of CI's checks. */
  ciPollMs: number
  /** GitHub works out whether a pull request merges after the first read
   *  asks. */
  mergeabilityRecheckMs: number
}

export type Retries = { agentAttempts: number; delayMs: number }

/** What a project may set. Every field is optional. */
export type FactoryConfig = {
  names?: Partial<Names>
  models?: Partial<Record<Role, Partial<ModelChoice>>>
  limits?: Partial<Limits>
  timeouts?: Partial<Timeouts>
  retries?: Partial<Retries>
}

/** Facts about the machine and checkout the factory runs on. */
export type Host = {
  /** The repo's root directory on the host. */
  repoRoot: string
}

export type ResolvedNames = Names & { baseRef: string }

/** Everything a run uses, defaults applied. */
export type ResolvedFactory = {
  names: ResolvedNames
  models: Record<Role, ModelChoice>
  limits: Limits
  timeouts: Timeouts
  retries: Retries
  /** Where each agent's log goes. */
  logDir: string
}

/** Types a project's config. It returns the config unchanged. */
export const defineFactory = (config: FactoryConfig) => config

const DEFAULT_NAMES: Names = {
  baseBranch: "main",
  readyLabel: "ready-for-agent",
  humanLabel: "ready-for-human",
  prLabel: "factory",
  branchPrefix: "factory/issue-",
  plannerBranch: "factory/planner",
  preflightBranch: "factory/preflight",
  environmentCheckBranch: "factory/environment-check",
}

const opus = (effort: Effort): ModelChoice => ({
  model: "claude-opus-5-5",
  effort,
})

const DEFAULT_MODELS: Record<Role, ModelChoice> = {
  planner: opus("high"),
  implementer: opus("medium"),
  reviewer: opus("high"),
  reviewAddresser: opus("high"),
  branchUpdater: opus("high"),
  prWriter: { model: "claude-sonnet-5-5", effort: "medium" },
  preflight: { model: "claude-haiku-5-5", effort: "low" },
}

const DEFAULT_LIMITS: Limits = {
  parallel: 3,
  maxWaves: 10,
  implementIterations: 10,
  ciFixIterations: 5,
  maxCiFixes: 2,
  addressIterations: 5,
}

const MINUTE = 60_000

const DEFAULT_TIMEOUTS: Timeouts = {
  ticketMs: 180 * MINUTE,
  updateMs: 60 * MINUTE,
  addressMs: 120 * MINUTE,
  ciMs: 45 * MINUTE,
  ciPollMs: MINUTE,
  mergeabilityRecheckMs: 15_000,
}

const DEFAULT_RETRIES: Retries = { agentAttempts: 3, delayMs: MINUTE }

const checkWhole = (section: string, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `${section}.${key} must be a positive whole number, got ${value}.`
      )
    }
  }
}

const checkPositive = (section: string, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `${section}.${key} must be a positive number, got ${value}.`
      )
    }
  }
}

/** The settings a run uses: `config`, defaults filled in, for `host`. */
export const resolveFactory = (
  config: FactoryConfig,
  host: Host
): ResolvedFactory => {
  const names = { ...DEFAULT_NAMES, ...config.names }
  const models = { ...DEFAULT_MODELS }
  for (const role of ROLES) {
    models[role] = { ...DEFAULT_MODELS[role], ...config.models?.[role] }
  }
  const limits = { ...DEFAULT_LIMITS, ...config.limits }
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts }
  const retries = { ...DEFAULT_RETRIES, ...config.retries }
  checkWhole("limits", limits)
  checkPositive("timeouts", timeouts)
  checkWhole("retries", { agentAttempts: retries.agentAttempts })
  checkPositive("retries", { delayMs: retries.delayMs })
  return {
    names: { ...names, baseRef: `origin/${names.baseBranch}` },
    models,
    limits,
    timeouts,
    retries,
    logDir: join(host.repoRoot, ".factory", "logs"),
  }
}

/** A time limit for a public comment: "3-hour", or "90-minute". */
export const limitText = (ms: number) =>
  ms % (60 * MINUTE) === 0
    ? `${ms / (60 * MINUTE)}-hour`
    : `${Math.round(ms / MINUTE)}-minute`

const forFilename = (text: string) =>
  text.toLowerCase().replaceAll(/[^a-z0-9_.-]/gu, "-")

/** The log of agent `name` on `branch`, in `logDir`. */
export const logFile = (logDir: string, branch: string, name: string) => ({
  type: "file" as const,
  path: join(logDir, `${forFilename(branch)}-${forFilename(name)}.log`),
})
