import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DONE_OR_BLOCKED,
  FEEDBACK_ANSWER,
  PULL_REQUEST_DRAFT,
  REVIEW_REPORT,
  type ReviewReport,
  finishPullRequest,
  reviewMarkdown,
} from "./answers.mts"
import { readAnswer } from "./run-with-extraction.mts"

const tagged = (tag: string, value: unknown) =>
  `<${tag}>${JSON.stringify(value)}</${tag}>`

describe("an agent's done or blocked answer", () => {
  const read = (value: unknown) =>
    readAnswer(tagged(DONE_OR_BLOCKED.tag, value), DONE_OR_BLOCKED)

  it("reads done", async () => {
    const answer = await read({ status: "done" })

    assert.deepEqual(answer, { ok: true, value: { status: "done" } })
  })

  it("reads blocked with its reason trimmed", async () => {
    const answer = await read({
      status: "blocked",
      reason: "  ADR 0010 forbids it.\n",
    })

    assert.deepEqual(answer, {
      ok: true,
      value: { status: "blocked", reason: "ADR 0010 forbids it." },
    })
  })

  it("doesn't take blocked without a reason", async () => {
    const missing = await read({ status: "blocked" })
    const blank = await read({ status: "blocked", reason: " " })

    assert.equal(missing.ok, false)
    assert.equal(blank.ok, false)
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
  const report: ReviewReport = {
    criteria: [
      {
        criterion: "A turn stores both messages",
        status: "met",
        test: "test_a_turn_stores_both_messages",
      },
      {
        criterion: "Checked by hand in the Compose stack",
        status: "not-verifiable",
        test: null,
      },
      { criterion: "The operator sees the case", status: "missing" },
    ],
    changes: ["Renamed `user` to `shopper` in the route, per the glossary."],
    notes: [],
  }
  const read = (value: unknown) =>
    readAnswer(tagged(REVIEW_REPORT.tag, value), REVIEW_REPORT)

  it("reads each criterion's status, with or without its test", async () => {
    const answer = await read(report)

    assert.deepEqual(answer, { ok: true, value: report })
  })

  it("takes only the three statuses it knows", async () => {
    const answer = await read({
      ...report,
      criteria: [{ criterion: "X", status: "partly" }],
    })

    assert.equal(answer.ok, false)
  })

  it("renders as Markdown for the PR writer", () => {
    const markdown = reviewMarkdown(report)

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
  const read = (value: unknown) =>
    readAnswer(tagged(PULL_REQUEST_DRAFT.tag, value), PULL_REQUEST_DRAFT)

  it("reads a title and a body", async () => {
    const answer = await read({ title: "feat(agent): x", body: "B" })

    assert.equal(answer.ok, true)
  })

  it("doesn't take a blank title or a missing body", async () => {
    const blankTitle = await read({ title: "", body: "B" })
    const noBody = await read({ title: "feat(agent): x" })

    assert.equal(blankTitle.ok, false)
    assert.equal(noBody.ok, false)
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

  it("takes the title's first line", () => {
    const pr = finishPullRequest(42, {
      title: "  feat(agent): x\nmore",
      body: "B",
    })

    assert.equal(pr.title, "feat(agent): x")
  })

  it("flags a title that isn't a conventional commit", () => {
    const pr = finishPullRequest(42, {
      title: "Hand a case to the operator",
      body: "B",
    })

    assert.equal(pr.titleIsConventional, false)
  })
})

describe("the review addresser's answer", () => {
  const read = (value: unknown) =>
    readAnswer(tagged(FEEDBACK_ANSWER.tag, value), FEEDBACK_ANSWER)

  it("reads its thread replies and top-level comments, trimmed", async () => {
    const answer = await read({
      threadReplies: [{ commentId: "PRRC_1", body: " Renamed it.\n" }],
      topLevelComments: [{ body: "Declined the cache: out of scope." }],
    })

    assert.deepEqual(answer, {
      ok: true,
      value: {
        threadReplies: [{ commentId: "PRRC_1", body: "Renamed it." }],
        topLevelComments: [{ body: "Declined the cache: out of scope." }],
      },
    })
  })

  it("reads a list it left out as empty", async () => {
    const answer = await read({ threadReplies: [] })

    assert.deepEqual(answer, {
      ok: true,
      value: { threadReplies: [], topLevelComments: [] },
    })
  })

  it("doesn't take a blank reply", async () => {
    const answer = await read({
      threadReplies: [{ commentId: "PRRC_1", body: " " }],
    })

    assert.equal(answer.ok, false)
  })
})
