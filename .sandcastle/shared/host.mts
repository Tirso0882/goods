// What the host runs itself: git and gh, outside any sandbox.

import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { BASE_REF } from "./config.mts"

// Sandcastle anchors worktrees, logs and `.sandcastle/.env` to the working
// directory, so run from the repo root wherever the script was started.
process.chdir(join(import.meta.dirname, "../.."))

export const host = (command: string, args: string[], input?: string) =>
  execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim()

export const git = (...args: string[]) => host("git", args)
export const gh = (...args: string[]) => host("gh", args)
export const ghJson = <T,>(...args: string[]) => JSON.parse(gh(...args)) as T

const { nameWithOwner, owner } = ghJson<{
  nameWithOwner: string
  owner: { login: string }
}>("repo", "view", "--json", "nameWithOwner,owner")
export const REPO = nameWithOwner
export const OWNER = owner.login

export const isAheadOfBase = (branch: string) => {
  try {
    return Number(git("rev-list", "--count", `${BASE_REF}..${branch}`)) > 0
  } catch {
    return false // the branch doesn't exist yet
  }
}

/** Remove the worktree a crashed run left on `branch`. Its commits stay. */
export const discardWorktree = (branch: string) => {
  const entries = git("worktree", "list", "--porcelain").split("\n\n")
  for (const entry of entries) {
    const path = /^worktree (.+)$/m.exec(entry)?.[1]
    if (path && entry.includes(`branch refs/heads/${branch}\n`)) {
      console.warn(`  Removing a stale worktree for ${branch} at ${path}.`)
      git("worktree", "remove", "--force", path)
    }
  }
  git("worktree", "prune")
}

export const deleteBranch = (branch: string) => {
  discardWorktree(branch)
  try {
    git("branch", "-D", branch)
  } catch {
    // It doesn't exist.
  }
}

/** The host couldn't push or reach GitHub: not the ticket's fault either. */
export class HostError extends Error {}

export const onHost = <T,>(what: string, run: () => T) => {
  try {
    return run()
  } catch (error) {
    throw new HostError(`${what} failed: ${String(error).split("\n")[0]}`, {
      cause: error,
    })
  }
}

// The branch belongs to the factory. The lease still refuses to overwrite a
// commit someone else pushed to it.
export const push = (branch: string) =>
  onHost(`Pushing ${branch}`, () =>
    git("push", "--force-with-lease", "origin", `${branch}:${branch}`)
  )
