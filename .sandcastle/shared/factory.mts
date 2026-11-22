// The factory's settings: a project's `.factory/factory.config.mts` declares
// what differs from the defaults, and `resolveFactory` turns that config plus
// facts about the host into what a run uses. Pure: no files, commands or
// environment here, so the tests fake the host as plain data
// (factory.test.mts).

import { dirname, join, relative, resolve } from "node:path"
import type { SetupStep } from "./setup.mts"

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

/** A shell command that must exit 0 inside a sandbox. */
export type Check = {
  name: string
  command: string
  /** `factory check --quick` skips it. */
  slow?: boolean
}

/** A host path the sandbox can see. It appears at its own path unless
 *  `sandboxPath` says otherwise. */
export type Mount = {
  hostPath: string
  sandboxPath?: string
  readonly?: boolean
}

/** A mount with both paths settled. */
export type ResolvedMount = {
  hostPath: string
  sandboxPath: string
  readonly?: boolean
}

/** Variables a sandbox gets, by name. */
export type Env = Record<string, string>

/** What a toolchain adds to every sandbox. */
export type Contribution = {
  mounts: readonly ResolvedMount[]
  env: Env
  setup: readonly SetupStep[]
  probes: readonly Check[]
}

/** A preset for one toolchain, such as `pnpm()` or `uv()`. */
export type Toolchain = {
  name: string
  contribute: (host: Host) => Contribution
}

/** What a project may set. Every field is optional. */
export type FactoryConfig = {
  names?: Partial<Names>
  models?: Partial<Record<Role, Partial<ModelChoice>>>
  limits?: Partial<Limits>
  timeouts?: Partial<Timeouts>
  retries?: Partial<Retries>
  /** Quality gates: the agents run them before they commit, and so does
   *  `factory check`. */
  checks?: readonly Check[]
  /** Environment health, such as dependencies installed or services
   *  answering. Only `factory check` runs them. */
  probes?: readonly Check[]
  /** Toolchain presets. Each brings its cache mounts and variables, a
   *  locked install and probes. */
  toolchains?: readonly Toolchain[]
  /** Host paths to mount beyond what the toolchains mount. */
  mounts?: readonly Mount[]
  /** Variables for the sandbox in `slot`: 0 for a run with no parallel peer,
   *  1 to the parallel limit for the others. */
  env?: (slot: number) => Env
  /** Setup steps beyond the toolchains' installs. They run after them. */
  setup?: readonly SetupStep[]
  /** A compose file in `.factory/` with the services the sandboxes use. The
   *  factory starts it before a run, waits until it's ready, and removes it
   *  with its data afterwards. */
  services?: string
  /** How many parallel slots the project can keep apart, such as one per
   *  Redis database. `limits.parallel` is capped at it. No cap when unset. */
  maxSlots?: number
}

/** Facts about the machine and checkout the factory runs on. */
export type Host = {
  /** The repo's root directory on the host. */
  repoRoot: string
  /** The user's real home directory. */
  home: string
  /** The host's environment variables. */
  env: Readonly<Record<string, string | undefined>>
  /** Whether a path exists. */
  exists: (path: string) => boolean
  /** What a command prints, trimmed. It throws if the command fails. */
  output: (command: readonly string[]) => string
}

/** What every sandbox gets. */
export type ResolvedSandbox = {
  mounts: readonly ResolvedMount[]
  /** The variables of the sandbox in `slot`. */
  env: (slot: number) => Env
  /** In order: the toolchains' steps, then the project's. */
  setup: readonly SetupStep[]
}

export type ResolvedNames = Names & { baseRef: string }

/** Everything a run uses, defaults applied. */
export type ResolvedFactory = {
  names: ResolvedNames
  models: Record<Role, ModelChoice>
  limits: Limits
  timeouts: Timeouts
  retries: Retries
  checks: readonly Check[]
  probes: readonly Check[]
  sandbox: ResolvedSandbox
  /** The compose file to start before a run, if the project has services. */
  services?: { composeFile: string }
  /** The highest slot a sandbox may take, if the project limits it. */
  maxSlots?: number
  /** Where each agent's log goes. */
  logDir: string
}

// ---------------------------------------------------------------------------
// Toolchain presets
// ---------------------------------------------------------------------------

const atOwnPath = (hostPath: string, readonly?: true): ResolvedMount =>
  readonly
    ? { hostPath, sandboxPath: hostPath, readonly }
    : { hostPath, sandboxPath: hostPath }

// Both installs copy from the mounted caches (a hard link can't cross a
// mount), so nothing an agent edits in its worktree reaches them. The
// lockfiles are the contract: an install that would change one fails.
const INSTALL_TIMEOUT_SECONDS = 600

/**
 * pnpm, run through corepack. The store is mounted writable, because an agent
 * that adds a dependency has to fetch it, and pnpm locks it, so parallel
 * sandboxes can share it. Corepack's cache is mounted read-only: without it,
 * every sandbox would download pnpm again before it could install anything.
 */
export const pnpm = (): Toolchain => ({
  name: "pnpm",
  contribute: (host) => {
    // `pnpm store path` ends in the store's version (…/store/v10); pnpm
    // wants the directory above it.
    const store = dirname(host.output(["pnpm", "store", "path"]))
    const corepack =
      host.env["COREPACK_HOME"] ?? join(host.home, ".cache/node/corepack")
    const hasCorepack = host.exists(corepack)
    return {
      mounts: [
        atOwnPath(store),
        ...(hasCorepack ? [atOwnPath(corepack, true)] : []),
      ],
      env: {
        npm_config_store_dir: store,
        ...(hasCorepack ? { COREPACK_HOME: corepack } : {}),
      },
      setup: [
        {
          command: "pnpm install --frozen-lockfile --prefer-offline",
          timeoutSeconds: INSTALL_TIMEOUT_SECONDS,
        },
      ],
      probes: [
        {
          name: "pnpm runs from the mounted corepack cache",
          command: "pnpm --version",
        },
        {
          name: "pnpm uses the mounted store",
          command:
            'test "$(dirname "$(pnpm store path)")" = "$npm_config_store_dir"',
        },
      ],
    }
  },
})

/**
 * uv. Its cache and the Pythons it installs are mounted writable, for the
 * same reason as pnpm's store; uv locks its cache too.
 */
export const uv = (): Toolchain => ({
  name: "uv",
  contribute: (host) => {
    const cache = host.output(["uv", "cache", "dir"])
    const pythons = host.output(["uv", "python", "dir"])
    return {
      mounts: [atOwnPath(cache), atOwnPath(pythons)],
      env: { UV_CACHE_DIR: cache, UV_PYTHON_INSTALL_DIR: pythons },
      setup: [
        {
          command: "uv sync --locked",
          timeoutSeconds: INSTALL_TIMEOUT_SECONDS,
        },
      ],
      probes: [
        {
          name: "uv uses the mounted cache",
          command: 'test "$(uv cache dir)" = "$UV_CACHE_DIR"',
        },
      ],
    }
  },
})

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

const validateChecks = (section: string, list: readonly Check[]) => {
  list.forEach((check, i) => {
    if (!check.name?.trim() || !check.command?.trim()) {
      throw new Error(`${section}[${i}] needs a name and a command.`)
    }
  })
  return [...list]
}

const checkWhole = (section: string, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `${section ? `${section}.` : ""}${key} must be a positive whole number, got ${value}.`
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

/** Whether `path` is `inner` or a directory above it. */
const contains = (path: string, inner: string) => {
  const rel = relative(resolve(path), resolve(inner))
  return rel === "" || !rel.startsWith("..")
}

// The sandbox's private home and the env-leak checks are the factory's: a
// project's mounts and variables can't undo them.

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
  const { maxSlots } = config
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts }
  const retries = { ...DEFAULT_RETRIES, ...config.retries }
  checkWhole("limits", limits)
  checkPositive("timeouts", timeouts)
  checkWhole("retries", { agentAttempts: retries.agentAttempts })
  checkPositive("retries", { delayMs: retries.delayMs })
  const contributions = (config.toolchains ?? []).map((t) => t.contribute(host))
  const toolchainEnv: Env = Object.assign(
    {},
    ...contributions.map((c) => c.env)
  )
  if (maxSlots !== undefined) checkWhole("", { maxSlots })
  const sandbox: ResolvedSandbox = {
    mounts: [
      ...contributions.flatMap((c) => c.mounts),
      ...(config.mounts ?? []).map((m) => {
        if (contains(m.hostPath, host.home)) {
          throw new Error(
            `mounts: ${m.hostPath} would show the sandbox your home directory.`
          )
        }
        return { ...m, sandboxPath: m.sandboxPath ?? m.hostPath }
      }),
    ],
    env: (slot) => {
      if (
        !Number.isInteger(slot) ||
        slot < 0 ||
        (maxSlots !== undefined && slot > maxSlots)
      ) {
        throw new Error(
          maxSlots === undefined
            ? `Sandbox slot must be a whole number from 0, got ${slot}.`
            : `Sandbox slot must be 0 to ${maxSlots}, got ${slot}.`
        )
      }
      const projectEnv = config.env?.(slot) ?? {}
      if ("HOME" in projectEnv) {
        throw new Error("env can't set HOME: the sandbox's home is private.")
      }
      return { ...toolchainEnv, ...projectEnv }
    },
    setup: [...contributions.flatMap((c) => c.setup), ...(config.setup ?? [])],
  }
  return {
    names: { ...names, baseRef: `origin/${names.baseBranch}` },
    models,
    limits: { ...limits, parallel: capParallel({ maxSlots }, limits.parallel) },
    timeouts,
    retries,
    checks: validateChecks("checks", config.checks ?? []),
    probes: validateChecks("probes", [
      ...contributions.flatMap((c) => c.probes),
      ...(config.probes ?? []),
    ]),
    sandbox,
    ...(config.services === undefined
      ? {}
      : {
          services: {
            composeFile: join(host.repoRoot, ".factory", config.services),
          },
        }),
    ...(maxSlots === undefined ? {} : { maxSlots }),
    logDir: join(host.repoRoot, ".factory", "logs"),
  }
}

/** `parallel` slots, capped at the project's `maxSlots` if it has one. */
export const capParallel = (
  factory: Pick<ResolvedFactory, "maxSlots">,
  parallel: number
) =>
  factory.maxSlots === undefined
    ? parallel
    : Math.min(parallel, factory.maxSlots)

/** The configured checks as the agents' prompts list them. */
export const checksPrompt = (factory: Pick<ResolvedFactory, "checks">) =>
  [
    "```bash",
    ...factory.checks.map((c) => `${c.command}  # ${c.name}`),
    "```",
  ].join("\n")

/** One step of `factory check`: a shell command, or the scan of the
 *  sandbox's environment for host secrets and the canary. */
export type CheckStep =
  | { kind: "command"; name: string; command: string }
  | { kind: "env-leaks"; name: string }

// The factory's own guarantees. They aren't config: a project can't drop them.
const SECURITY_STEPS: readonly CheckStep[] = [
  {
    kind: "command",
    name: "the home directory is private",
    // The sandbox has its own ~/.claude (the skill links), so look for a file
    // only the host's has.
    command:
      'test ! -e "$HOME/.ssh" && test ! -e "$HOME/.claude/CLAUDE.md" && test ! -e "$HOME/.config/gh"',
  },
  {
    kind: "command",
    name: "the repo's .env is not in the worktree",
    command: "test ! -e .env",
  },
  { kind: "env-leaks", name: "no host secret or canary reaches the sandbox" },
]

/** What `factory check` runs, in order: the probes, the checks, then the
 *  security checks. `quick` skips the probes and checks marked slow. */
export const checkPlan = (
  factory: Pick<ResolvedFactory, "checks" | "probes">,
  { quick }: { quick: boolean }
): CheckStep[] => [
  ...[...factory.probes, ...factory.checks]
    .filter((check) => !(quick && check.slow))
    .map(({ name, command }) => ({ kind: "command" as const, name, command })),
  ...SECURITY_STEPS,
]

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
