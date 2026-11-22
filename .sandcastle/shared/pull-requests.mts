// Keeping the factory's pull requests mergeable. Pure: no git or gh here, so
// the tests can load it (pull-requests.test.mts).

import type { ResolvedNames } from "./factory.mts"

/** An open pull request the factory opened, on its own branch in this repo. */
export type FactoryPullRequest = {
  number: number
  title: string
  body: string
  headRefName: string
}

/** What `GET /repos/{repo}/pulls/{n}` says about merging pull request `n`. */
export type GhMergeability = {
  number: number
  mergeable: boolean | null
  mergeable_state: string
}

/**
 * Which pull requests conflict with the base, and which GitHub hasn't checked
 * yet. It computes `mergeable` lazily: the first read after the base moves
 * starts the check and answers `null`, so those need a second read. A pull
 * request that is only behind merges cleanly and is in neither list.
 */
export const partitionByMergeability = (answers: readonly GhMergeability[]) => {
  const conflicting: number[] = []
  const unknown: number[] = []
  for (const a of answers) {
    if (a.mergeable === null) unknown.push(a.number)
    else if (a.mergeable_state === "dirty") conflicting.push(a.number)
  }
  return { conflicting, unknown }
}

/**
 * The comment on a pull request the factory couldn't update. It is public, so
 * `reason` is one the host wrote or the agent's own explanation, never raw
 * output.
 */
export const updateFailedComment = (
  names: ResolvedNames,
  reason: string,
  conflicts: readonly string[]
) =>
  [
    `The Sandcastle factory couldn't bring this pull request up to date with \`${names.baseBranch}\`. The branch is unchanged.`,
    `**Why:** ${reason}`,
    ...(conflicts.length > 0
      ? [
          `**Conflicted files:**\n\n${conflicts.map((f) => `- \`${f}\``).join("\n")}`,
        ]
      : []),
    `Merge \`${names.baseBranch}\` into the branch by hand, or wait: the next factory run tries again.`,
  ].join("\n\n")
