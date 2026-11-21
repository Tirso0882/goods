// Proves the sandbox environment works, without running an agent: it opens
// one sandbox on a throwaway branch and runs the installs and the test suites
// in it, the way an implementer would.
//
// Run it after changing `.sandcastle/environment.mts`, the lockfiles or the
// toolchain, and before leaving the factory alone:
//   pnpm factory:check          # everything
//   pnpm factory:check --quick  # skip the suites

import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as sandcastle from "@ai-hero/sandcastle"
import {
  sandbox,
  setUpSandbox,
  startServices,
  stopServices,
} from "./environment.mts"
import {
  ENV_DUMP_COMMAND,
  type EnvContext,
  classifyEnv,
  parseEnvDump,
  parseEnvFile,
  secretsIn,
} from "./shared/env-leaks.mts"

// Run from the repo root, as the factory does (shared/host.mts): Sandcastle
// reads `.sandcastle/.env` from the working directory, and without it the
// sandbox here wouldn't get the variables an agent's does.
process.chdir(join(import.meta.dirname, ".."))

const BRANCH = "sandcastle/environment-check"
const quick = process.argv.includes("--quick")

const envFile = (path: string) =>
  existsSync(path) ? parseEnvFile(readFileSync(path, "utf8")) : []

// Set on the host before the sandbox exists and declared nowhere, so it can
// only reach the sandbox if Sandcastle passes the host's environment through.
const CANARY_NAME = "FACTORY_CHECK_CANARY"
const canary = `canary-${randomBytes(12).toString("hex")}`
process.env[CANARY_NAME] = canary

// What the sandbox may get (`.sandcastle/.env`'s keys) and what it must
// not: the host's secret-looking variables and those in the repo's `.env`,
// which is read here on the host and never copied in.
const envContext: EnvContext = {
  declared: new Set(envFile(join(import.meta.dirname, ".env")).map(([k]) => k)),
  hostSecrets: new Map([
    ...secretsIn(process.env),
    ...secretsIn(
      Object.fromEntries(envFile(join(import.meta.dirname, "../.env")))
    ),
  ]),
  canary,
}

/**
 * Fail for every variable in the sandbox that shouldn't be there. It prints
 * names and reasons only: the values are the secrets.
 */
const checkEnvLeaks = async (box: Pick<sandcastle.Sandbox, "exec">) => {
  const name = "no host secret or canary reaches the sandbox"
  const result = await box.exec(ENV_DUMP_COMMAND)
  const env = result.exitCode === 0 ? parseEnvDump(result.stdout) : undefined
  if (!env) {
    console.log(
      `FAIL  ${name} (couldn't read the sandbox's environment, exit ${result.exitCode})`
    )
    return false
  }
  const leaks = classifyEnv(env, envContext)
  if (leaks.length === 0) {
    console.log(`ok    ${name}`)
    return true
  }
  console.log(`FAIL  ${name}`)
  for (const leak of leaks) console.log(`      ${leak.name}: ${leak.reason}`)
  return false
}

// Each check is a shell command that must exit 0 inside the sandbox.
const checks: { name: string; command: string; slow?: boolean }[] = [
  // .nvmrc pins the major version only.
  {
    name: "node matches .nvmrc",
    command: 'case "$(node -v)" in "v$(cat .nvmrc)".*) ;; *) exit 1 ;; esac',
  },
  {
    name: "pnpm runs from the mounted corepack cache",
    command: "pnpm --version",
  },
  {
    name: "pnpm uses the mounted store",
    command: 'test "$(dirname "$(pnpm store path)")" = "$npm_config_store_dir"',
  },
  {
    name: "node_modules is installed in every app",
    command:
      "test -d node_modules && test -d apps/backend/node_modules && test -d apps/storefront/node_modules",
  },
  {
    name: "the virtualenv runs the pinned Python",
    command:
      'test "$(uv run --locked python -c "import platform; print(platform.python_version())")" = "$(cat .python-version)"',
  },
  {
    name: "the home directory is private",
    command:
      // The sandbox has its own ~/.claude (the /pr skill link), so look for a
      // file only the host's has.
      'test ! -e "$HOME/.ssh" && test ! -e "$HOME/.claude/CLAUDE.md" && test ! -e "$HOME/.config/gh"',
  },
  { name: "the repo's .env is not in the worktree", command: "test ! -e .env" },
  {
    name: "the /pr skill is linked into the sandbox's home",
    command: 'test -f "$HOME/.claude/skills/pr/SKILL.md"',
  },
  {
    name: "Postgres answers",
    command: `uv run --locked python -c "import os, socket; socket.create_connection((os.environ['DB_HOST'], int(os.environ['DB_PORT'])), 5)"`,
  },
  {
    name: "Redis answers",
    command: `node -e "const u = new URL(process.env.REDIS_URL); require('net').connect(+u.port, u.hostname).once('connect', () => process.exit(0)).once('error', () => process.exit(1))"`,
  },
  { name: "pnpm typecheck", command: "pnpm typecheck", slow: true },
  {
    name: "pnpm test (backend against Postgres and Redis, storefront)",
    command: "pnpm test",
    slow: true,
  },
  { name: "uv run pytest", command: "uv run --locked pytest", slow: true },
]

let failed = 0

try {
  startServices()

  {
    await using box = await sandcastle.createSandbox({
      branch: BRANCH,
      sandbox: sandbox(1),
    })
    await setUpSandbox(box)
    console.log(`\nSandbox ready at ${box.worktreePath}\n`)

    if (!(await checkEnvLeaks(box))) failed++

    for (const check of checks) {
      if (quick && check.slow) continue
      const started = Date.now()
      const result = await box.exec(check.command)
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      if (result.exitCode === 0) {
        console.log(`ok    ${check.name} (${seconds}s)`)
      } else {
        failed++
        console.log(
          `FAIL  ${check.name} (${seconds}s, exit ${result.exitCode})`
        )
        const output = `${result.stdout}\n${result.stderr}`.trim()
        console.log(output.split("\n").slice(-40).join("\n"))
      }
    }
  }
} finally {
  // The branch only ever holds the commit it was created from.
  try {
    execFileSync("git", ["branch", "-D", BRANCH], { stdio: "ignore" })
  } catch {
    // It was never created.
  }
  stopServices()
}

console.log(
  failed === 0 ? "\nThe environment works." : `\n${failed} check(s) failed.`
)
process.exitCode = failed === 0 ? 0 : 1
