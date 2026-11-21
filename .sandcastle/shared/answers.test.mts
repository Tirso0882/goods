import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  PULL_REQUEST_DRAFT,
  REVIEW_REPORT,
  STOP_ANSWER,
  finishPullRequest,
  reviewMarkdown,
} from "./answers.mts"
import { readAnswer } from "./run-with-extraction.mts"

const tagged = (tag: string, value: unknown) =>
  `<${tag}>${JSON.stringify(value)}</${tag}>`

describe("an agent's done or blocked answer", () => {
  const read = (value: unknown) =>
    readAnswer(tagged(STOP_ANSWER.tag, value), STOP_ANSWER)

  it("reads done, and blocked with its reason trimmed", async () => {
    assert.deepEqual(await read({ status: "done" }), {
      ok: true,
      value: { status: "done" },
    })
    assert.deepEqual(
      await read({ status: "blocked", reason: "  ADR 0010 forbids it.\n" }),
      { ok: true, value: { status: "blocked", reason: "ADR 0010 forbids it." } }
    )
  })

  it("doesn't take blocked without a reason", async () => {
    assert.equal((await read({ status: "blocked" })).ok, false)
    assert.equal((await read({ status: "blocked", reason: " " })).ok, false)
  })

  it("cuts a long reason, since it's posted on the issue", async () => {
    const answer = await read({ status: "blocked", reason: "x".repeat(5000) })

    assert.equal(
      answer.ok && answer.value.status === "blocked" && answer.value.reason,
      "x".repeat(1500)
    )
  })
})

describe("the reviewer's report", () => {
  const report = {
    criteria: [
      {
        criterion: "A turn stores both messages",
        status: "met",
        test: "test_a_turn_stores_both_messages",
      },
      {
        criterion: "Checked by hand in the Compose stack",
        status: "not-verifiable",
      },
      { criterion: "The operator sees the case", status: "missing" },
    ],
    changes: ["Renamed `user` to `shopper` in the route, per the glossary."],
    notes: [],
  }

  it("reads each criterion's status, and only the three it knows", async () => {
    const read = await readAnswer(
      tagged(REVIEW_REPORT.tag, report),
      REVIEW_REPORT
    )
    const unknown = await readAnswer(
      tagged(REVIEW_REPORT.tag, {
        ...report,
        criteria: [{ criterion: "X", status: "partly" }],
      }),
      REVIEW_REPORT
    )

    assert.deepEqual(read, { ok: true, value: report })
    assert.equal(unknown.ok, false)
  })

  it("renders as Markdown for the PR writer", () => {
    const markdown = reviewMarkdown({
      criteria: [
        {
          criterion: "A turn stores both messages",
          status: "met",
          test: "test_a_turn_stores_both_messages",
        },
        {
          criterion: "Checked by hand in the Compose stack",
          status: "not-verifiable",
        },
        { criterion: "The operator sees the case", status: "missing" },
      ],
      changes: ["Renamed `user` to `shopper` in the route, per the glossary."],
      notes: [],
    })

    assert.equal(
      markdown,
      `### Acceptance criteria

- **Met:** A turn stores both messages (test: \`test_a_turn_stores_both_messages\`)
- **Not verifiable in the sandbox:** Checked by hand in the Compose stack
- **Missing:** The operator sees the case

### What the reviewer changed

- Renamed \`user\` to \`shopper\` in the route, per the glossary.

### For a person to look at

- None.`
    )
  })
})

describe("the PR writer's draft", () => {
  const FOOTER =
    "---\n\nBuilt by the Sandcastle factory. It merges nothing: review it as you would any pull request."

  it("needs a title and a body", async () => {
    const read = (value: unknown) =>
      readAnswer(tagged(PULL_REQUEST_DRAFT.tag, value), PULL_REQUEST_DRAFT)

    assert.equal((await read({ title: "feat(agent): x", body: "B" })).ok, true)
    assert.equal((await read({ title: "", body: "B" })).ok, false)
    assert.equal((await read({ title: "feat(agent): x" })).ok, false)
  })

  it("closes the issue and adds the factory's footer", () => {
    const pr = finishPullRequest(42, {
      title: "feat(agent): hand a case to the operator",
      body: "## Summary\n\nIt hands off.\n",
    })

    assert.deepEqual(pr, {
      title: "feat(agent): hand a case to the operator",
      body: `## Summary\n\nIt hands off.\n\nCloses #42\n\n${FOOTER}`,
      titleIsConventional: true,
    })
  })

  it("keeps the writer's own closing line, whatever its keyword", () => {
    const pr = finishPullRequest(42, {
      title: "fix(backend): x",
      body: "It fixes it.\n\nfixes #42",
    })

    assert.equal(pr.body, `It fixes it.\n\nfixes #42\n\n${FOOTER}`)
  })

  it("doesn't count a closing line for another issue", () => {
    const pr = finishPullRequest(42, {
      title: "fix(backend): x",
      body: "Closes #421",
    })

    assert.equal(pr.body, `Closes #421\n\nCloses #42\n\n${FOOTER}`)
  })

  it("takes the title's first line, and flags one that isn't a conventional commit", () => {
    const pr = finishPullRequest(42, {
      title: "  Hand a case to the operator\nmore",
      body: "B",
    })

    assert.equal(pr.title, "Hand a case to the operator")
    assert.equal(pr.titleIsConventional, false)
  })
})
