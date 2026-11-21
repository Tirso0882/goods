// The sandbox environment: what an agent's bwrap sandbox can see and reach.
//
// bwrap gives each sandbox a private, empty home directory. That hides the
// package caches, so they are mounted back in, and it means nothing from the
// repo's `.env` is ever there: the sandbox gets only the variables below and
// the tokens in `.sandcastle/.env`. Never copy `.env` into a worktree.
//
// Check it without spending tokens:
//   pnpm exec tsx .sandcastle/check-environment.mts

import { execFileSync } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Sandbox } from "@ai-hero/sandcastle"
import { bwrap } from "@ai-hero/sandcastle/sandboxes/bwrap"

const hostOutput = (command: string, ...args: string[]) =>
  execFileSync(command, args, { encoding: "utf8" }).trim()

// ---------------------------------------------------------------------------
// Package caches
// ---------------------------------------------------------------------------

// `pnpm store path` ends in the store's version (…/store/v10); pnpm wants the
// directory above it.
const pnpmStore = dirname(hostOutput("pnpm", "store", "path"))
const uvCache = hostOutput("uv", "cache", "dir")
const uvPythons = hostOutput("uv", "python", "dir")

// pnpm is a corepack shim here. Without its cache, every sandbox would
// download pnpm again before it could install anything.
const corepackHome =
  process.env["COREPACK_HOME"] ?? join(homedir(), ".cache/node/corepack")

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

// The PR writer drafts the pull request body with your `/pr` skill. It lives
// in your home directory, which the sandbox can't see, so its real directory
// is mounted read-only and a hook links it into the sandbox's own
// `~/.claude/skills`, where Claude Code looks for skills.
const prSkillLink = join(homedir(), ".claude/skills/pr")
if (!existsSync(join(prSkillLink, "SKILL.md"))) {
  throw new Error(`The /pr skill is missing: no ${prSkillLink}/SKILL.md.`)
}
const prSkill = realpathSync(prSkillLink)

// Each path appears at its own host path. The caches are writable because an
// agent that adds a dependency has to fetch it; pnpm and uv both lock their
// cache, so parallel sandboxes can share one.
const mounts = [
  { hostPath: pnpmStore, sandboxPath: pnpmStore },
  { hostPath: uvCache, sandboxPath: uvCache },
  { hostPath: uvPythons, sandboxPath: uvPythons },
  ...(existsSync(corepackHome)
    ? [{ hostPath: corepackHome, sandboxPath: corepackHome, readonly: true }]
    : []),
  { hostPath: prSkill, sandboxPath: prSkill, readonly: true },
]

// The tools look for their caches under the home directory, which is not the
// real one inside the sandbox, so each is told where its cache is mounted.
const cacheEnv = {
  npm_config_store_dir: pnpmStore,
  UV_CACHE_DIR: uvCache,
  UV_PYTHON_INSTALL_DIR: uvPythons,
  ...(existsSync(corepackHome) ? { COREPACK_HOME: corepackHome } : {}),
}

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

// The ports `.sandcastle/compose.yaml` publishes on localhost.
const POSTGRES_PORT = "55432"
const REDIS_PORT = "56379"

const composeFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "compose.yaml"
)

const compose = (...args: string[]) =>
  execFileSync("docker", ["compose", "-f", composeFile, ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  })

/** Start the throwaway Postgres and Redis and wait until both answer. */
export const startServices = () => compose("up", "--detach", "--wait")

/** Stop them. Their data lives in memory, so nothing is left behind. */
export const stopServices = () => compose("down", "--volumes")

// The variables CI's `test` and `agent` jobs set (.github/workflows/ci.yml),
// pointed at the throwaway services.
const testEnv = (redisDatabase: number) => ({
  DB_HOST: "localhost",
  DB_PORT: POSTGRES_PORT,
  DB_USERNAME: "postgres",
  DB_PASSWORD: "postgres",
  REDIS_URL: `redis://localhost:${REDIS_PORT}/${redisDatabase}`,
  AGENT_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/postgres`,
  // next.config.js refuses to load without it. Not a real key.
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_ci_placeholder",
  NEXT_TELEMETRY_DISABLED: "1",
  TURBO_TELEMETRY_DISABLED: "1",
  MEDUSA_DISABLE_TELEMETRY: "true",
})

// ---------------------------------------------------------------------------
// The sandbox
// ---------------------------------------------------------------------------

// Redis has databases 0 to 15. Database 0 is for a run with no parallel peer
// (the planner, the merger); each parallel slot gets its own.
export const MAX_SLOTS = 15

/**
 * A bwrap sandbox with the caches mounted and the test services reachable.
 *
 * `slot` separates sandboxes that run at the same time. The store's Redis
 * modules use fixed queue names, so two test runs in one Redis database would
 * take each other's jobs. Postgres needs no slot: the backend's test runner
 * creates a database with a random name for every suite.
 */
export const sandbox = (slot = 0) => {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOTS) {
    throw new Error(`Sandbox slot must be 0 to ${MAX_SLOTS}, got ${slot}.`)
  }
  return bwrap({ mounts, env: { ...cacheEnv, ...testEnv(slot) } })
}

// ---------------------------------------------------------------------------
// Setting up a sandbox
// ---------------------------------------------------------------------------

type SetupStep = { command: string; timeoutSeconds?: number }

const DEFAULT_SETUP_TIMEOUT_SECONDS = 120
const MAX_SETUP_OUTPUT_LINES = 30

// A worktree starts without node_modules or a virtualenv. Both installs copy
// from the mounted caches (a hard link can't cross a mount), so each worktree
// gets about 1.5 GB of its own and nothing an agent edits there reaches the
// caches. The lockfiles are the contract: an install that would change one
// fails here.
export const SETUP_STEPS: SetupStep[] = [
  {
    command: "pnpm install --frozen-lockfile --prefer-offline",
    timeoutSeconds: 600,
  },
  { command: "uv sync --locked", timeoutSeconds: 600 },
  // SWC, which compiles the backend's tests, unpacks its native binary
  // into ~/.cache and refuses a home that anyone but the owner can write.
  // The sandbox's home starts group-writable. Turbo strips most variables
  // from a task, so pointing SWC at another cache would not reach it.
  { command: 'chmod 700 "$HOME"' },
  {
    command: `mkdir -p "$HOME/.claude/skills" && ln -sfn '${prSkill}' "$HOME/.claude/skills/pr"`,
  },
]

/** A setup step failed: the sandbox isn't fit for an agent. */
export class SandboxSetupError extends Error {}

const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

/**
 * Run the setup steps in the sandbox, side by side, and throw if any fails.
 *
 * Sandcastle 0.14's `createSandbox()` ignores an `onSandboxReady` hook's exit
 * code and its `timeoutMs`, so a failed install would hand the agent a broken
 * worktree. The steps run here instead, each under coreutils' `timeout`
 * because `exec()` takes no deadline. Once a release has the fix (its
 * changeset is reject-failed-ready-hooks), they can go back to being hooks.
 */
export const setUpSandbox = async (
  box: Sandbox,
  steps: readonly SetupStep[] = SETUP_STEPS
) => {
  const results = await Promise.all(
    steps.map(async (step) => {
      const seconds = step.timeoutSeconds ?? DEFAULT_SETUP_TIMEOUT_SECONDS
      const result = await box.exec(
        `timeout --kill-after=30 ${seconds} sh -c ${shellQuote(step.command)}`
      )
      return { step, seconds, result }
    })
  )
  const failed = results.filter((r) => r.result.exitCode !== 0)
  if (failed.length === 0) return
  const summary = failed
    .map(({ step, seconds, result }) =>
      // 124 is timeout's own exit code; 137 is its SIGKILL after the grace.
      result.exitCode === 124 || result.exitCode === 137
        ? `\`${step.command}\` timed out after ${seconds}s`
        : `\`${step.command}\` exited ${result.exitCode}`
    )
    .join("; ")
  const output = failed
    .map(({ step, result }) => {
      const tail = `${result.stdout}\n${result.stderr}`
        .trim()
        .split("\n")
        .slice(-MAX_SETUP_OUTPUT_LINES)
        .join("\n")
      return `--- ${step.command}\n${tail}`
    })
    .join("\n")
  throw new SandboxSetupError(`Sandbox setup failed: ${summary}.\n${output}`)
}
