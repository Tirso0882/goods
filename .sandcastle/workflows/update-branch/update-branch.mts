// The branch updater brings a factory pull request that conflicts with main
// up to date. The host merges first; the agent runs only on the conflicts,
// and the host checks its merge before pushing it.

import { join } from "node:path"
import * as sandcastle from "@ai-hero/sandcastle"
import type { Sandbox } from "@ai-hero/sandcastle"
import { sandbox, setUpSandbox } from "../../environment.mts"
import { agentFor } from "../../shared/agents.mts"
import {
  type ResolvedFactory,
  type ResolvedNames,
  limitText,
  checksPrompt,
  logFile,
} from "../../shared/factory.mts"
import {
  DONE_OR_BLOCKED,
  DONE_OR_BLOCKED_PROMPT,
} from "../../shared/answers.mts"
import {
  TicketFailure,
  isApiTrouble,
  isAuthFailure,
} from "../../shared/failures.mts"
import { commentOnPullRequest, ticketForBranch } from "../../shared/github.mts"
import {
  HostError,
  fetchBranch,
  git,
  isAncestor,
  push,
} from "../../shared/host.mts"
import {
  type FactoryPullRequest,
  updateFailedComment,
} from "../../shared/pull-requests.mts"
import { runWithExtraction } from "../../shared/run-with-extraction.mts"
import { SandboxSetupError } from "../../shared/setup.mts"

/** A pull request the factory can't update, for a reason a person should read. */
class UpdateFailure extends Error {}

const conflictedFiles = (worktree: string) =>
  git("-C", worktree, "diff", "--name-only", "--diff-filter=U")
    .split("\n")
    .filter(Boolean)

/** Merge the base into the worktree's branch; the files that conflict. */
const mergeBaseRef = (baseRef: string, worktree: string) => {
  try {
    git("-C", worktree, "merge", baseRef, "--no-edit")
    return []
  } catch (error) {
    const conflicts = conflictedFiles(worktree)
    if (conflicts.length > 0) return conflicts
    throw new HostError(
      `Merging ${baseRef} failed without a conflict: ${String(error).split("\n")[0]}`,
      { cause: error }
    )
  }
}

/** Whether any of `files` still has a conflict marker in the commit. */
const hasConflictMarkers = (worktree: string, files: readonly string[]) => {
  try {
    git(
      "-C",
      worktree,
      "grep",
      "--quiet",
      "-E",
      "^(<{7}|>{7})( |$)",
      "HEAD",
      "--",
      ...files
    )
    return true
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 1
    ) {
      return false
    }
    throw error
  }
}

const resolveConflicts = async (
  factory: ResolvedFactory,
  box: Sandbox,
  pr: FactoryPullRequest,
  issue: { number: number; text: string },
  conflicts: readonly string[],
  signal: AbortSignal
) => {
  const label = `PR #${pr.number}`
  const name = `branch updater ${label}`
  const { output } = await runWithExtraction(box, {
    role: "the branch updater",
    name,
    agent: agentFor(factory, "branchUpdater"),
    promptFile: join(import.meta.dirname, "prompt.md"),
    promptArgs: {
      PR_NUMBER: String(pr.number),
      PR_TITLE: pr.title,
      PR_BODY: pr.body,
      BRANCH: pr.headRefName,
      BASE_REF: factory.names.baseRef,
      CONFLICTS: conflicts.map((f) => `- ${f}`).join("\n"),
      ISSUE_NUMBER: String(issue.number),
      ISSUE: issue.text,
      CHECKS: checksPrompt(factory),
    },
    maxIterations: 1,
    idleTimeoutSeconds: 1800,
    logging: logFile(factory.logDir, pr.headRefName, name),
    retries: factory.retries,
    signal,
    output: DONE_OR_BLOCKED,
    extractionPrompt: DONE_OR_BLOCKED_PROMPT,
  })
  if (output.status === "blocked") {
    throw new UpdateFailure(`The agent stopped: ${output.reason}`)
  }
}

/** The issue the branch builds, if you wrote it: the agent's spec. */
const readIssue = (names: ResolvedNames, branch: string) => {
  const ticket = ticketForBranch(names, branch)
  if (ticket === undefined) {
    throw new UpdateFailure(
      "Its branch names no issue the maintainer wrote, so the agent has no spec to resolve the conflicts against."
    )
  }
  return ticket
}

/** Its merge goes out only if it's a finished merge of the base. */
const checkMerge = (
  baseRef: string,
  worktree: string,
  before: string,
  conflicts: readonly string[]
) => {
  const head = git("-C", worktree, "rev-parse", "HEAD")
  if (head === before) {
    throw new UpdateFailure("The agent finished without committing the merge.")
  }
  if (conflictedFiles(worktree).length > 0) {
    throw new UpdateFailure("The agent left files unresolved.")
  }
  if (!isAncestor(baseRef, head)) {
    throw new UpdateFailure(`The agent's commit doesn't merge \`${baseRef}\`.`)
  }
  if (hasConflictMarkers(worktree, conflicts)) {
    throw new UpdateFailure("The agent's commit still has conflict markers.")
  }
}

/** How the base got into the branch. */
type HowMerged = "clean" | "resolved" | "already up to date"

const updateBranch = async (
  factory: ResolvedFactory,
  pr: FactoryPullRequest,
  slot: number,
  signal: AbortSignal,
  progress: { conflicts: readonly string[] }
): Promise<HowMerged> => {
  const branch = pr.headRefName
  const { baseRef } = factory.names
  fetchBranch(branch)
  await using box = await sandcastle.createSandbox({
    branch,
    baseBranch: baseRef,
    sandbox: sandbox(slot),
  })
  const worktree = box.worktreePath
  const before = git("-C", worktree, "rev-parse", "HEAD")
  try {
    const conflicts = mergeBaseRef(baseRef, worktree)
    if (conflicts.length === 0) {
      if (git("-C", worktree, "rev-parse", "HEAD") === before) {
        return "already up to date"
      }
      push(branch)
      return "clean"
    }
    progress.conflicts = conflicts

    const issue = readIssue(factory.names, branch)

    // The installs can't read a lockfile with conflict markers in it, so the
    // sandbox is set up on the branch as it was, then the merge runs again.
    git("-C", worktree, "merge", "--abort")
    await setUpSandbox(box)
    const again = mergeBaseRef(baseRef, worktree)
    if (again.length === 0) {
      throw new HostError("The merge conflicted, then didn't after the setup.")
    }
    progress.conflicts = again
    await resolveConflicts(factory, box, pr, issue, again, signal)
    checkMerge(baseRef, worktree, before, again)
    push(branch)
    return "resolved"
  } catch (error) {
    // Leave the branch as GitHub has it.
    try {
      git("-C", worktree, "reset", "--hard", before)
    } catch (resetError) {
      console.error(`  Couldn't reset ${branch}:`, resetError)
    }
    throw error
  }
}

/** Why, for the comment: only reasons written here. */
const publicReason = (
  factory: ResolvedFactory,
  error: unknown,
  deadline: AbortSignal
) => {
  // A TicketFailure is the agent's answer the factory couldn't read.
  if (error instanceof UpdateFailure || error instanceof TicketFailure) {
    return error.message
  }
  if (deadline.aborted) {
    return `It ran past its ${limitText(factory.timeouts.updateMs)} limit.`
  }
  return "The factory hit an unexpected error. Its log on the factory host has the details."
}

export type UpdateOutcome =
  | { status: "updated"; merge: HowMerged }
  | { status: "failed"; reason: string }
  | { status: "interrupted"; reason: string }

/**
 * Merge the base into pull request `pr` in sandbox `slot`, with an agent only
 * if it conflicts. `stop` is the whole run's: an agent that can't log in
 * stops it. A pull request it can't update gets a comment saying why.
 */
export const updatePullRequest = async (
  factory: ResolvedFactory,
  pr: FactoryPullRequest,
  slot: number,
  stop: AbortController
): Promise<UpdateOutcome> => {
  const deadline = AbortSignal.timeout(factory.timeouts.updateMs)
  const signal = AbortSignal.any([stop.signal, deadline])
  const progress: { conflicts: readonly string[] } = { conflicts: [] }
  try {
    const merge = await updateBranch(factory, pr, slot, signal, progress)
    return { status: "updated", merge }
  } catch (error) {
    console.error(`  ✗ PR #${pr.number} (${pr.headRefName}):`, error)
    if (isAuthFailure(error)) {
      stop.abort(new Error("The agent can't authenticate."))
    }
    // Not the pull request's fault: the next run tries again, and its output
    // stays in this log, never on the pull request. A failure on the host,
    // such as local commits that never reached GitHub, is yours to look at.
    if (
      stop.signal.aborted ||
      error instanceof HostError ||
      error instanceof SandboxSetupError ||
      isApiTrouble(error)
    ) {
      return { status: "interrupted", reason: String(error).split("\n")[0]! }
    }
    const reason = publicReason(factory, error, deadline)
    try {
      commentOnPullRequest(
        pr.number,
        updateFailedComment(factory.names, reason, progress.conflicts)
      )
    } catch (commentError) {
      console.error(`  Couldn't comment on PR #${pr.number}:`, commentError)
    }
    return { status: "failed", reason }
  }
}
