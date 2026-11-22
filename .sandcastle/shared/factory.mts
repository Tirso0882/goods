// The factory's settings: a project's `.factory/factory.config.mts` declares
// what differs from the defaults, and `resolveFactory` turns that config plus
// facts about the host into what a run uses. Pure: no files, commands or
// environment here, so the tests fake the host as plain data
// (factory.test.mts).

import { dirname, join, relative, resolve } from "node:path"
import { type SetupStep, shellQuote } from "./setup.mts"

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

export const WORKFLOWS = [
  "plan",
  "implement",
  "review",
  "addressReview",
  "updateBranch",
  "publish",
] as const

/** A step of the run with its own prompt. */
export type Workflow = (typeof WORKFLOWS)[number]

const isWorkflow = (name: string): name is Workflow =>
  WORKFLOWS.some((workflow) => workflow === name)

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

/** What a toolchain or a listed skill adds to every sandbox. */
export type Contribution = {
  mounts: readonly ResolvedMount[]
  env: Env
  setup: readonly SetupStep[]
  probes: readonly Check[]
  /** The lockfiles it installs from. */
  lockfiles?: readonly Lockfile[]
}

/** A lockfile a toolchain installs from, and how to remake it. */
export type Lockfile = {
  /** Its path from the repo's root. */
  path: string
  /** The file it locks, which a merge resolves first. */
  manifest: string
  /** Rewrites it from the manifest. */
  regenerate: string
  /** Installs from it, refusing to change it. */
  install: string
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
  /** Skills from `~/.claude/skills`, by name, that the agents may use. Each
   *  is mounted read-only and linked into the sandbox's home. The PR writer
   *  uses `pr` when it's listed, and the factory's own template when not. */
  skills?: readonly string[]
  /** The project's coding standards, a file in `.factory/`. The reviewer
   *  holds each branch to it. */
  standards?: string
  /** Guidance appended to a workflow's prompt. The factory's prompt stays:
   *  no project can replace it. */
  instructions?: Partial<Record<Workflow, string>>
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
  /** Where a path really is, symlinks followed. */
  realPath: (path: string) => string
  /** What a command prints, trimmed. It throws if the command fails. */
  output: (command: readonly [string, ...string[]]) => string
  /** A text file's contents. It throws if the file can't be read. */
  read: (path: string) => string
}

/** What every sandbox gets. */
export type ResolvedSandbox = {
  mounts: readonly ResolvedMount[]
  /** The variables of the sandbox in `slot`. */
  env: (slot: number) => Env
  /** In order: the toolchains' steps, the skill links, then the project's. */
  setup: readonly SetupStep[]
}

export type ResolvedNames = Names & { baseRef: string }

/** The project's text in each workflow's prompt, by placeholder. */
export type ResolvedPrompts = {
  plan: { INSTRUCTIONS: string }
  implement: { INSTRUCTIONS: string; CHECKS: string }
  review: {
    INSTRUCTIONS: string
    CHECKS: string
    CODING_STANDARDS: string
    LOCKFILES: string
    LOCKFILE_EXCLUDES: string
  }
  addressReview: { INSTRUCTIONS: string; CHECKS: string }
  updateBranch: { INSTRUCTIONS: string; CHECKS: string; LOCKFILES: string }
  publish: { INSTRUCTIONS: string; PULL_REQUEST_GUIDE: string }
}

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
  /** The project's text for each workflow's prompt, as its prompt args. */
  prompts: ResolvedPrompts
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

const PNPM_LOCKFILE: Lockfile = {
  path: "pnpm-lock.yaml",
  manifest: "package.json",
  regenerate: "pnpm install --prefer-offline",
  install: "pnpm install --frozen-lockfile --prefer-offline",
}

const UV_LOCKFILE: Lockfile = {
  path: "uv.lock",
  manifest: "pyproject.toml",
  regenerate: "uv lock",
  install: "uv sync --locked",
}

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
          command: PNPM_LOCKFILE.install,
          timeoutSeconds: INSTALL_TIMEOUT_SECONDS,
        },
      ],
      lockfiles: [PNPM_LOCKFILE],
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
          command: UV_LOCKFILE.install,
          timeoutSeconds: INSTALL_TIMEOUT_SECONDS,
        },
      ],
      lockfiles: [UV_LOCKFILE],
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

/** Whether `path` is `inner` or a directory above it. */
const contains = (path: string, inner: string) => {
  const rel = relative(resolve(path), resolve(inner))
  return rel === "" || !rel.startsWith("..")
}

// What `factory check` proves the sandbox can't see (see SECURITY_STEPS).
const CREDENTIALS = [".ssh", ".config/gh", ".claude"]

// The sandbox's private home is the factory's: a project's mounts can't
// show it the real home or the credentials in it.
const projectMount = (mount: Mount, home: string): ResolvedMount => {
  if (contains(mount.hostPath, home)) {
    throw new Error(
      `mounts: ${mount.hostPath} would show the sandbox your home directory.`
    )
  }
  for (const credential of CREDENTIALS.map((c) => join(home, c))) {
    if (
      contains(mount.hostPath, credential) ||
      contains(credential, mount.hostPath)
    ) {
      throw new Error(
        `mounts: ${mount.hostPath} would show the sandbox your credentials.`
      )
    }
  }
  return { ...mount, sandboxPath: mount.sandboxPath ?? mount.hostPath }
}

const checkSlot = (slot: number, maxSlots: number | undefined) => {
  if (
    Number.isInteger(slot) &&
    slot >= 0 &&
    (maxSlots === undefined || slot <= maxSlots)
  ) {
    return
  }
  throw new Error(
    maxSlots === undefined
      ? `Sandbox slot must be a whole number from 0, got ${slot}.`
      : `Sandbox slot must be 0 to ${maxSlots}, got ${slot}.`
  )
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** What a listed skill adds to every sandbox. Skills live in the real home,
 *  which the sandbox can't see, so the skill's real directory is mounted
 *  read-only and a setup step links it into the sandbox's own
 *  `~/.claude/skills`, where Claude Code looks for skills. */
const skillContribution = (name: string, host: Host): Contribution => {
  if (!/^[\w.-]+$/u.test(name) || name === "." || name === "..") {
    throw new Error(`skills: "${name}" isn't a skill's directory name.`)
  }
  const link = join(host.home, ".claude/skills", name)
  const file = join(link, "SKILL.md")
  if (!host.exists(file)) {
    throw new Error(`skills: the ${name} skill is missing: no ${file}.`)
  }
  const real = host.realPath(link)
  // A skill may live in ~/.claude/skills, but its real directory can't show
  // the sandbox the home or a credential, as a project's mount can't.
  const skillsDir = join(host.home, ".claude/skills")
  const inSkillsDir = contains(skillsDir, real) && resolve(real) !== skillsDir
  const exposes =
    contains(real, host.home) ||
    CREDENTIALS.map((c) => join(host.home, c)).some(
      (credential) => contains(real, credential) || contains(credential, real)
    )
  if (exposes && !inSkillsDir) {
    throw new Error(
      `skills: the ${name} skill is at ${real}, which would show the sandbox your home or credentials.`
    )
  }
  const linked = `$HOME/.claude/skills/${name}`
  return {
    mounts: [atOwnPath(real, true)],
    env: {},
    setup: [
      {
        command: `mkdir -p "$HOME/.claude/skills" && ln -sfn ${shellQuote(real)} "${linked}"`,
      },
    ],
    probes: [
      {
        name: `the ${name} skill is linked into the sandbox's home`,
        command: `test -f "${linked}/SKILL.md"`,
      },
    ],
  }
}

const PR_SKILL_GUIDE =
  "Use the `pr` skill: invoke it, and write the body with its template and guidance: **Summary**, **Evidence**, **Merge Danger**."

// For a project that doesn't list the `pr` skill.
const BUILT_IN_PR_GUIDE = `Write the body with this template:

\`\`\`markdown
## Summary

<the smallest view that makes the change clear: pseudocode, a call tree, a file tree, a diff sketch or a Mermaid diagram, next to a line or two of text>

## Evidence

- **Before:** <the failing test run or output>
  **After:** <the passing test run or output>

## Merge Danger

**Door:** <one-way or two-way>

<optional: why>

**Blast Radius:** <one word>

<optional: what the merge could break>
\`\`\`

- **Summary**: skip preambles, keep prose brief, and show only the calls, files and states the reader needs.
- **Evidence**: a test that fails before the change and passes after it is the best evidence; show it as pseudocode if that's clearer.
- **Merge Danger**: a two-way door is cheap to roll back; destructive or hard-to-reverse changes are one-way doors. The blast radius is what the change could affect: consumers, data, layout, other apps.`

/** What a toolchain or a listed skill adds, and where it came from. */
type Source = { name: string; contribution: Contribution }

/** The sandbox: the toolchains' and skills' contributions, then the
 *  project's own. */
const resolveSandbox = (
  config: FactoryConfig,
  host: Host,
  sources: readonly Source[]
): ResolvedSandbox => {
  // Which toolchain sets each variable. A project's `env` can't repoint
  // them, nor move the sandbox's private home.
  const owners = new Map([
    ["HOME", "the factory"],
    ...sources.flatMap(({ name, contribution }) =>
      Object.keys(contribution.env).map((key): [string, string] => [key, name])
    ),
  ])
  const toolchainEnv: Env = Object.assign(
    {},
    ...sources.map((t) => t.contribution.env)
  )
  return {
    mounts: [
      ...sources.flatMap((t) => t.contribution.mounts),
      ...(config.mounts ?? []).map((m) => projectMount(m, host.home)),
    ],
    env: (slot) => {
      checkSlot(slot, config.maxSlots)
      const projectEnv = config.env?.(slot) ?? {}
      for (const key of Object.keys(projectEnv)) {
        const owner = owners.get(key)
        if (owner) throw new Error(`env can't set ${key}: ${owner} sets it.`)
      }
      return { ...toolchainEnv, ...projectEnv }
    },
    setup: [
      ...sources.flatMap((t) => t.contribution.setup),
      ...(config.setup ?? []),
    ],
  }
}

const NO_STANDARDS =
  "The project has no coding standards file. Hold the diff to the conventions of the code around it, and to what `AGENTS.md` or `CLAUDE.md` says."

/** The project's standards file in `.factory/`, for the reviewer. */
const readStandards = (file: string | undefined, host: Host) => {
  if (file === undefined) return NO_STANDARDS
  const path = join(host.repoRoot, ".factory", file)
  try {
    return host.read(path)
  } catch (error) {
    throw new Error(`standards: can't read ${path}.`, { cause: error })
  }
}

/** A workflow's instructions as the end of its prompt, or nothing. */
const instructionsText = (text: string | undefined) =>
  text?.trim()
    ? [
        "# THIS PROJECT",
        "",
        "The project adds this guidance for this step. Where it conflicts with the rules above, the rules above win.",
        "",
        text.trim(),
      ].join("\n")
    : ""

const inlineCode = (text: string) => `\`${text}\``

/** How the reviewer reads the lockfiles it leaves out of the diff. */
const reviewLockfiles = (lockfiles: readonly Lockfile[], baseRef: string) =>
  lockfiles.length === 0
    ? ""
    : `The lockfiles are left out: check them with ${inlineCode(`git diff ${baseRef}...HEAD -- ${lockfiles.map((l) => l.path).join(" ")}`)} if a dependency changed.`

/** How the branch updater resolves a conflicting lockfile. */
const mergeLockfiles = (lockfiles: readonly Lockfile[], baseRef: string) =>
  lockfiles.length === 0
    ? ""
    : [
        `Don't merge a lockfile's hunks by hand. Resolve the file it locks first, take \`${baseRef}\`'s lockfile (\`git checkout --theirs <lockfile>\`), then regenerate it:`,
        "",
        ...lockfiles.map(
          (l) =>
            `- ${inlineCode(l.path)}: resolve ${inlineCode(l.manifest)}, then run ${inlineCode(l.regenerate)}`
        ),
        "",
        "The sandbox was installed from the branch before the merge. If a lockfile changed, install from it again before the checks:",
        "",
        ...lockfiles.map(
          (l) => `- ${inlineCode(l.path)}: ${inlineCode(l.install)}`
        ),
      ].join("\n")

const resolvePrompts = (
  config: FactoryConfig,
  host: Host,
  baseRef: string,
  lockfiles: readonly Lockfile[],
  checks: readonly Check[],
  pullRequestGuide: string
): ResolvedPrompts => {
  const instructions = config.instructions ?? {}
  for (const key of Object.keys(instructions)) {
    if (!isWorkflow(key)) {
      throw new Error(`instructions: the factory has no "${key}" workflow.`)
    }
  }
  const instructionsArg = (workflow: Workflow) => ({
    INSTRUCTIONS: instructionsText(instructions[workflow]),
  })
  const CHECKS = checksPrompt({ checks })
  return {
    plan: instructionsArg("plan"),
    implement: { ...instructionsArg("implement"), CHECKS },
    review: {
      ...instructionsArg("review"),
      CHECKS,
      CODING_STANDARDS: readStandards(config.standards, host),
      LOCKFILES: reviewLockfiles(lockfiles, baseRef),
      LOCKFILE_EXCLUDES: lockfiles.map((l) => `':!${l.path}'`).join(" "),
    },
    addressReview: { ...instructionsArg("addressReview"), CHECKS },
    updateBranch: {
      ...instructionsArg("updateBranch"),
      CHECKS,
      LOCKFILES: mergeLockfiles(lockfiles, baseRef),
    },
    publish: {
      ...instructionsArg("publish"),
      PULL_REQUEST_GUIDE: pullRequestGuide,
    },
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
  const { maxSlots } = config
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts }
  const retries = { ...DEFAULT_RETRIES, ...config.retries }
  checkWhole("limits", limits)
  checkPositive("timeouts", timeouts)
  checkWhole("retries", { agentAttempts: retries.agentAttempts })
  checkPositive("retries", { delayMs: retries.delayMs })
  if (maxSlots !== undefined && (!Number.isInteger(maxSlots) || maxSlots < 1)) {
    throw new Error(
      `maxSlots must be a positive whole number, got ${maxSlots}.`
    )
  }
  // The toolchains, then the skills.
  const sources: Source[] = [
    ...(config.toolchains ?? []).map((t) => ({
      name: `the ${t.name} toolchain`,
      contribution: t.contribute(host),
    })),
    ...[...new Set(config.skills)].map((name) => ({
      name: `the ${name} skill`,
      contribution: skillContribution(name, host),
    })),
  ]
  const baseRef = `origin/${names.baseBranch}`
  const checks = validateChecks("checks", config.checks ?? [])
  const pullRequestGuide = config.skills?.includes("pr")
    ? PR_SKILL_GUIDE
    : BUILT_IN_PR_GUIDE
  return {
    names: { ...names, baseRef },
    models,
    limits: { ...limits, parallel: capParallel({ maxSlots }, limits.parallel) },
    timeouts,
    retries,
    checks,
    probes: validateChecks("probes", [
      ...sources.flatMap((t) => t.contribution.probes),
      ...(config.probes ?? []),
    ]),
    sandbox: resolveSandbox(config, host, sources),
    ...(config.services === undefined
      ? {}
      : {
          services: {
            composeFile: join(host.repoRoot, ".factory", config.services),
          },
        }),
    ...(maxSlots === undefined ? {} : { maxSlots }),
    prompts: resolvePrompts(
      config,
      host,
      baseRef,
      sources.flatMap((s) => s.contribution.lockfiles ?? []),
      checks,
      pullRequestGuide
    ),
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
