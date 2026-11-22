import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SandboxSetupError, runSetupSteps } from "./setup.mts"

type Exec = { exitCode: number; stdout?: string; stderr?: string }

/** A sandbox whose `exec` answers by the command it wraps, and logs calls. */
const fakeBox = (answers: Record<string, Exec> = {}) => {
  const calls: string[] = []
  return {
    calls,
    exec: async (command: string) => {
      calls.push(command)
      const step = Object.keys(answers).find((k) => command.includes(k))
      const answer = step === undefined ? { exitCode: 0 } : answers[step]!
      return { stdout: "", stderr: "", ...answer }
    },
  }
}

describe("runSetupSteps", () => {
  it("runs each step under timeout, quoted for sh", async () => {
    const box = fakeBox()
    await runSetupSteps(box, [
      { command: "pnpm install", timeoutSeconds: 600 },
      { command: "ln -sfn '/a b' \"$HOME/x\"" },
    ])
    assert.deepEqual(box.calls, [
      "timeout --kill-after=30 600 sh -c 'pnpm install'",
      `timeout --kill-after=30 120 sh -c 'ln -sfn '\\''/a b'\\'' "$HOME/x"'`,
    ])
  })

  it("throws naming every failed step, after running all of them", async () => {
    const box = fakeBox({
      "uv sync": { exitCode: 2, stderr: "lockfile needs updating" },
      "pnpm install": { exitCode: 1, stdout: "ERR_PNPM_OUTDATED_LOCKFILE" },
    })
    await assert.rejects(
      runSetupSteps(box, [
        { command: "pnpm install" },
        { command: "uv sync" },
        { command: "chmod 700 $HOME" },
      ]),
      (error: unknown) => {
        assert.ok(error instanceof SandboxSetupError)
        const [first, ...rest] = error.message.split("\n")
        assert.equal(
          first,
          "Sandbox setup failed: `pnpm install` exited 1; `uv sync` exited 2."
        )
        assert.deepEqual(rest, [
          "--- pnpm install",
          "ERR_PNPM_OUTDATED_LOCKFILE",
          "--- uv sync",
          "lockfile needs updating",
        ])
        return true
      }
    )
    assert.equal(box.calls.length, 3)
  })

  it("says a step timed out when timeout ended it", async () => {
    for (const exitCode of [124, 137]) {
      await assert.rejects(
        runSetupSteps(fakeBox({ sleep: { exitCode } }), [
          { command: "sleep 9", timeoutSeconds: 5 },
        ]),
        /Sandbox setup failed: `sleep 9` timed out after 5s\./
      )
    }
  })

  it("keeps only the last lines of a long output", async () => {
    const stdout = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n")
    await assert.rejects(
      runSetupSteps(fakeBox({ big: { exitCode: 1, stdout } }), [
        { command: "big" },
      ]),
      (error: Error) => {
        const lines = error.message.split("\n").slice(2)
        assert.equal(lines.length, 30)
        assert.equal(lines.at(-1), "line 99")
        return true
      }
    )
  })
})
