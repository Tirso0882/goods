// Running setup steps in a fresh sandbox. Pure apart from the sandbox it's
// given, so the tests can hand it a fake one (setup.test.mts).

import type { Sandbox } from "@ai-hero/sandcastle"

export type SetupStep = { command: string; timeoutSeconds?: number }

const DEFAULT_SETUP_TIMEOUT_SECONDS = 120
const MAX_SETUP_OUTPUT_LINES = 30

/** A setup step failed: the sandbox isn't fit for an agent. */
export class SandboxSetupError extends Error {}

/** `text` as one word for `sh`. */
export const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

/**
 * Run the setup steps in the sandbox, side by side, and throw if any fails.
 *
 * Sandcastle 0.14's `createSandbox()` ignores an `onSandboxReady` hook's exit
 * code and its `timeoutMs`, so a failed install would hand the agent a broken
 * worktree. The steps run here instead, each under coreutils' `timeout`
 * because `exec()` takes no deadline. Once a release has the fix (its
 * changeset is reject-failed-ready-hooks), they can go back to being hooks.
 */
export const runSetupSteps = async (
  box: Pick<Sandbox, "exec">,
  steps: readonly SetupStep[]
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
