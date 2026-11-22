import assert from "node:assert/strict"
import { describe, it } from "node:test"
import * as sandcastle from "@ai-hero/sandcastle"
import type { SandboxRunOptions } from "@ai-hero/sandcastle"
import { z } from "zod"
import { resolveFactory } from "./factory.mts"
import { fakeHost } from "./fake-host.mts"
import { TicketFailure } from "./failures.mts"
import { readAnswer, runWithExtraction } from "./run-with-extraction.mts"

const output = sandcastle.Output.object({
  tag: "answer",
  schema: z.object({ status: z.enum(["done", "blocked"]) }),
})

describe("readAnswer", () => {
  it("reads the last tag, after the example the agent quoted", async () => {
    const stdout =
      'Like <answer>{"status": "blocked"}</answer>, so:\n<answer>{"status": "done"}</answer>'

    const answer = await readAnswer(stdout, output)

    assert.deepEqual(answer, { ok: true, value: { status: "done" } })
  })

  it("reads JSON the agent fenced as a code block", async () => {
    const stdout = '<answer>\n```json\n{"status": "done"}\n```\n</answer>'

    const answer = await readAnswer(stdout, output)

    assert.deepEqual(answer, { ok: true, value: { status: "done" } })
  })

  it("says when there's no tag", async () => {
    const answer = await readAnswer("All done.", output)

    assert.match(!answer.ok ? answer.problem : "", /No <answer> tag/)
  })

  it("says when the tag isn't JSON", async () => {
    const answer = await readAnswer("<answer>done</answer>", output)

    assert.match(!answer.ok ? answer.problem : "", /Not JSON/)
  })

  it("says which field doesn't match, and what the agent sent", async () => {
    const answer = await readAnswer(
      '<answer>{"status": "finished"}</answer>',
      output
    )

    assert.match(!answer.ok ? answer.problem : "", /- status: /)
    assert.equal(!answer.ok && answer.raw, '{"status": "finished"}')
  })
})

/** A sandbox whose agent says each of `replies` in turn, in sessions s0, s1… */
const fakeBox = (replies: readonly string[]) => {
  const runs: SandboxRunOptions[] = []
  const box = {
    run: async (options: SandboxRunOptions) => {
      const stdout = replies[runs.length] ?? ""
      const sessionId = `s${runs.length}`
      runs.push(options)
      return { iterations: [{ sessionId }], stdout, commits: [] }
    },
  }
  return { box, runs }
}

const extract = (box: ReturnType<typeof fakeBox>["box"]) =>
  runWithExtraction(box, {
    role: "the implementer",
    name: "implementer #1",
    agent: sandcastle.claudeCode("claude-haiku-5-5"),
    prompt: "Build it.",
    maxIterations: 3,
    output,
    extractionPrompt: "Answer in an <answer> tag.",
    retries: resolveFactory({}, fakeHost()).retries,
  })

describe("runWithExtraction", () => {
  it("asks for the answer in the work's session, and returns both", async () => {
    const { box, runs } = fakeBox([
      "Built it.",
      '<answer>{"status": "done"}</answer>',
    ])

    const result = await extract(box)

    assert.equal(result.stdout, "Built it.")
    assert.deepEqual(result.output, { status: "done" })
    assert.equal(runs[0]?.maxIterations, 3)
    assert.equal(runs[1]?.resumeSession, "s0")
    assert.equal(runs[1]?.prompt, "Answer in an <answer> tag.")
    assert.equal(runs[1]?.maxIterations, undefined)
  })

  it("asks again in the bad answer's session, saying what was wrong", async () => {
    const { box, runs } = fakeBox([
      "Built it.",
      "Done!",
      '<answer>{"status": "done"}</answer>',
    ])

    const result = await extract(box)

    assert.deepEqual(result.output, { status: "done" })
    assert.equal(runs[2]?.resumeSession, "s1")
    assert.match(runs[2]?.prompt ?? "", /No <answer> tag/)
  })

  it("hands the ticket to a person after three answers it can't read", async () => {
    const { box, runs } = fakeBox(["Built it.", "Done!", "Done!", "Done!"])

    await assert.rejects(
      extract(box),
      new TicketFailure("The factory couldn't read the implementer's answer.")
    )
    assert.equal(runs.length, 4)
  })
})
