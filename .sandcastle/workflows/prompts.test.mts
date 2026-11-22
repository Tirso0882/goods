// Each workflow's prompt file and the project text the factory resolves for
// it must agree: a placeholder with no text fails the run, and text with no
// placeholder never reaches the agent.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { type Workflow, WORKFLOWS, resolveFactory } from "../shared/factory.mts"
import { fakeHost } from "../shared/fake-host.mts"

const FOLDERS: Record<Workflow, string> = {
  plan: "plan",
  implement: "implement",
  review: "review",
  addressReview: "address-review",
  updateBranch: "update-branch",
  publish: "publish",
}

const promptText = (workflow: Workflow) =>
  readFileSync(
    join(import.meta.dirname, FOLDERS[workflow], "prompt.md"),
    "utf8"
  )

describe("the prompt files", () => {
  const { prompts } = resolveFactory({}, fakeHost())

  for (const workflow of WORKFLOWS) {
    const text = promptText(workflow)

    it(`${workflow} uses every piece of project text resolved for it`, () => {
      const used = new Set(
        [...text.matchAll(/\{\{(\w+)\}\}/gu)].map((m) => m[1])
      )
      for (const key of Object.keys(prompts[workflow])) {
        assert.ok(used.has(key), `{{${key}}} is missing from its prompt`)
      }
    })

    it(`${workflow} ends with the project's instructions`, () => {
      assert.match(text, /\{\{INSTRUCTIONS\}\}\n$/u)
    })
  }
})
