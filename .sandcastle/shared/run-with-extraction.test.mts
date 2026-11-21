import assert from "node:assert/strict"
import { describe, it } from "node:test"
import * as sandcastle from "@ai-hero/sandcastle"
import { z } from "zod"
import { readAnswer } from "./run-with-extraction.mts"

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

  it("says why it can't read an answer, for the agent's next try", async () => {
    const missing = await readAnswer("All done.", output)
    const notJson = await readAnswer("<answer>done</answer>", output)
    const wrongShape = await readAnswer(
      '<answer>{"status": "finished"}</answer>',
      output
    )

    assert.equal(missing.ok, false)
    assert.match(!missing.ok ? missing.problem : "", /No <answer> tag/)
    assert.match(!notJson.ok ? notJson.problem : "", /Not JSON/)
    assert.match(!wrongShape.ok ? wrongShape.problem : "", /- status: /)
    assert.equal(!wrongShape.ok && wrongShape.raw, '{"status": "finished"}')
  })
})
