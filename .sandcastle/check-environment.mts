// Proves the sandbox environment works, without running an agent: it opens
// one sandbox on a throwaway branch, installs it the way an implementer's is,
// then runs the config's probes and checks (.factory/factory.config.mts) and
// the factory's security checks, which always run (shared/factory.mts).
//
// Run it after changing `.factory/factory.config.mts`, the lockfiles or the
// toolchain, and before leaving the factory alone:
//   pnpm factory:check          # everything
//   pnpm factory:check --quick  # skip what's marked slow

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
import { checkPlan } from "./shared/factory.mts"
import { loadFactory } from "./shared/load-factory.mts"

// Run from the repo root, as the factory does (shared/host.mts): Sandcastle
// reads `.sandcastle/.env` from the working directory, and without it the
// sandbox here wouldn't get the variables an agent's does.
process.chdir(join(import.meta.dirname, ".."))

const factory = loadFactory()
const BRANCH = factory.names.environmentCheckBranch
const plan = checkPlan(factory, { quick: process.argv.includes("--quick") })

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
const checkEnvLeaks = async (
  box: Pick<sandcastle.Sandbox, "exec">,
  name: string
) => {
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

let failed = 0

try {
  startServices(factory)

  {
    await using box = await sandcastle.createSandbox({
      branch: BRANCH,
      sandbox: sandbox(factory, 1),
    })
    await setUpSandbox(factory, box)
    console.log(`\nSandbox ready at ${box.worktreePath}\n`)

    for (const check of plan) {
      if (check.kind === "env-leaks") {
        if (!(await checkEnvLeaks(box, check.name))) failed++
        continue
      }
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
  stopServices(factory)
}

console.log(
  failed === 0 ? "\nThe environment works." : `\n${failed} check(s) failed.`
)
process.exitCode = failed === 0 ? 0 : 1
