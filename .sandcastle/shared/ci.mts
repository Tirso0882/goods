// Waiting for CI on a commit, and reading what failed.

import { setTimeout as sleep } from "node:timers/promises"
import { CI_POLL_MS, CI_TIMEOUT_MS } from "./config.mts"
import { TicketFailure } from "./failures.mts"
import { REPO, gh, ghJson, onHost } from "./host.mts"

type CheckRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
}

const FAILED = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "startup_failure",
])

/** CI on a commit, once every check finished. */
export type CiResult = { passed: true } | { passed: false; log: string }

const MAX_LOG_CHARS_PER_CHECK = 12_000
const MAX_LOG_CHARS = 40_000

/** The failed steps' output for each failed check, newest lines kept. */
const failureLog = (failed: CheckRun[]) => {
  const sections = failed.map((check) => {
    let log: string
    try {
      // For GitHub Actions a check run's id is its job's id.
      log = gh(
        "run",
        "view",
        "--repo",
        REPO,
        "--job",
        String(check.id),
        "--log-failed"
      )
        // "<job>\t<step>\t<timestamp> <line>" → "<step> | <line>"
        .replace(/^[^\t\n]*\t([^\t\n]*)\t\S+ /gm, "$1 | ")
        .slice(-MAX_LOG_CHARS_PER_CHECK)
    } catch (error) {
      log = `(couldn't fetch the log: ${String(error).split("\n")[0]})`
    }
    return `## ${check.name}: ${check.conclusion}\n\n${check.html_url}\n\n${log}`
  })
  return sections.join("\n\n").slice(-MAX_LOG_CHARS)
}

/**
 * Wait for every check on `sha` to finish.
 *
 * Asks for the commit's check runs rather than `gh pr checks`: right after a
 * push the pull request can still show the previous commit's results.
 */
export const waitForChecks = async (
  sha: string,
  signal: AbortSignal
): Promise<CiResult> => {
  const deadline = Date.now() + CI_TIMEOUT_MS
  let finishedCount = -1
  for (;;) {
    await sleep(CI_POLL_MS, undefined, { signal })
    if (Date.now() > deadline) {
      throw new TicketFailure(
        `CI didn't finish within ${CI_TIMEOUT_MS / 60_000} minutes.`
      )
    }
    let runs: CheckRun[]
    try {
      runs = checkRuns(sha)
    } catch (error) {
      console.warn(
        `  Couldn't read the checks: ${String(error).split("\n")[0]}`
      )
      continue
    }
    if (runs.length === 0 || runs.some((r) => r.status !== "completed")) {
      finishedCount = -1
      continue
    }
    // Everything is done. Look once more, so a workflow that registers late
    // isn't missed.
    if (runs.length !== finishedCount) {
      finishedCount = runs.length
      continue
    }
    return verdict(runs)
  }
}

const checkRuns = (sha: string) =>
  ghJson<{ check_runs: CheckRun[] }>(
    "api",
    `repos/${REPO}/commits/${sha}/check-runs?per_page=100`
  ).check_runs

/** Every run has finished: whether they passed, and the log if not. */
const verdict = (runs: CheckRun[]): CiResult => {
  const failed = runs.filter((r) => FAILED.has(r.conclusion ?? ""))
  return failed.length === 0
    ? { passed: true }
    : { passed: false, log: failureLog(failed) }
}

/**
 * CI on `sha`, a commit pushed a while ago: a pull request's head. Waits for
 * checks still running. A commit with no checks counts as passing.
 */
export const checksOn = async (
  sha: string,
  signal: AbortSignal
): Promise<CiResult> => {
  const runs = onHost("Reading the checks", () => checkRuns(sha))
  if (runs.length === 0) return { passed: true }
  if (runs.some((r) => r.status !== "completed")) {
    return waitForChecks(sha, signal)
  }
  return verdict(runs)
}
