import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  partitionByMergeability,
  updateFailedComment,
} from "./pull-requests.mts"

const answer = (
  number: number,
  mergeable: boolean | null,
  mergeable_state: string
) => ({ number, mergeable, mergeable_state })

describe("partitionByMergeability", () => {
  it("picks the pull requests GitHub calls dirty, and leaves clean ones alone", () => {
    const sorted = partitionByMergeability([
      answer(1, false, "dirty"),
      answer(2, true, "clean"),
      answer(3, true, "behind"),
      answer(4, false, "dirty"),
    ])
    assert.deepEqual(sorted, { conflicting: [1, 4], unknown: [] })
  })

  it("sets aside the ones GitHub hasn't worked out yet, for a second read", () => {
    const sorted = partitionByMergeability([
      answer(1, null, "unknown"),
      answer(2, false, "dirty"),
      // While it recomputes, GitHub can still report the old state.
      answer(3, null, "dirty"),
    ])
    assert.deepEqual(sorted, { conflicting: [2], unknown: [1, 3] })
  })
})

describe("updateFailedComment", () => {
  it("says why, lists the conflicted files and how to go on", () => {
    assert.equal(
      updateFailedComment("The agent left files unresolved.", [
        "apps/backend/src/a.ts",
        "pnpm-lock.yaml",
      ]),
      [
        "The Sandcastle factory couldn't bring this pull request up to date with `main`. The branch is unchanged.",
        "**Why:** The agent left files unresolved.",
        "**Conflicted files:**\n\n- `apps/backend/src/a.ts`\n- `pnpm-lock.yaml`",
        "Merge `main` into the branch by hand, or wait: the next factory run tries again.",
      ].join("\n\n")
    )
  })

  it("leaves out the file list when the merge never ran", () => {
    assert.equal(
      updateFailedComment(
        "The issue it builds was written by someone else.",
        []
      ),
      [
        "The Sandcastle factory couldn't bring this pull request up to date with `main`. The branch is unchanged.",
        "**Why:** The issue it builds was written by someone else.",
        "Merge `main` into the branch by hand, or wait: the next factory run tries again.",
      ].join("\n\n")
    )
  })
})
