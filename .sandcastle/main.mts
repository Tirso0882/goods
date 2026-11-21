// The factory: plan → implement → review → pull request → CI, in waves.
//
//   Plan       The host lists the open `ready-for-agent` issues you wrote and
//              drops any with an open blocker or an open factory pull request.
//              A planner picks the ones that can be built side by side.
//   Implement  Each issue gets a bwrap sandbox on `sandcastle/issue-<n>`,
//              branched from origin/main. The implementer builds it and the
//              reviewer checks it against the coding standards and the issue.
//   Publish    A writer drafts the pull request body with the /pr skill. The
//              host pushes the branch and opens the pull request.
//   CI         The host waits for the checks on the pushed commit. On a failure
//              the implementer gets the failing log, up to MAX_CI_FIXES times.
//
// Nothing merges by itself: you merge the pull requests, and a later run picks
// up what they unblock. A ticket the factory can't finish is relabelled
// `ready-for-human` with a comment, so no run retries it.
//
// Worktrees branch from origin/main and the host pushes from refs, so the
// checkout you start it from can be on any branch, with uncommitted work.
//
// Usage:
//   pnpm exec tsx .sandcastle/check-environment.mts --quick   # first
//   pnpm exec tsx .sandcastle/main.mts                        # the backlog
//   pnpm exec tsx .sandcastle/main.mts --issue 160 --parallel 1

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import * as sandcastle from "@ai-hero/sandcastle"
import { z } from "zod"
import {
  MAX_SLOTS,
  installHooks,
  sandbox,
  startServices,
  stopServices,
} from "./environment.mts"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_WAVES = 10

// Parallel agents share one Claude subscription's rate limits. Each ticket
// holds a slot from its sandbox to its last CI result.
const DEFAULT_PARALLEL = 3

// Wall clock for one ticket, CI waits included. When it runs out, the agent in
// flight is killed and the ticket goes to a person.
const TICKET_TIMEOUT_MS = 3 * 60 * 60_000

// Each implementer iteration is a fresh session that picks up from the
// branch's commits. Ten is plenty for a ticket sized for one agent.
const IMPLEMENT_ITERATIONS = 10
const CI_FIX_ITERATIONS = 5
const MAX_CI_FIXES = 2

const CI_POLL_MS = 60_000
const CI_TIMEOUT_MS = 45 * 60_000

const MAX_AGENT_ATTEMPTS = 3
const RETRY_DELAY_MS = 60_000

const BASE_BRANCH = "main"
const BASE_REF = `origin/${BASE_BRANCH}`
const READY_LABEL = "ready-for-agent"
const HUMAN_LABEL = "ready-for-human"
const PR_LABEL = "Sandcastle"
const BRANCH_PREFIX = "sandcastle/issue-"
const PLANNER_BRANCH = "sandcastle/planner"

const PLANNER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "high" })
const IMPLEMENTER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "medium" })
const REVIEWER = () =>
  sandcastle.claudeCode("claude-opus-5-5", { effort: "high" })
const PR_WRITER = () =>
  sandcastle.claudeCode("claude-sonnet-5-5", { effort: "medium" })

const here = dirname(fileURLToPath(import.meta.url))
const prompt = (name: string) => join(here, name)

// Sandcastle anchors worktrees, logs and `.sandcastle/.env` to the working
// directory, so run from the repo root wherever the script was started.
process.chdir(dirname(here))

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const { values: cli } = parseArgs({
  options: {
    issue: { type: "string", multiple: true },
    parallel: { type: "string" },
  },
})

const onlyIssues = new Set((cli.issue ?? []).map(Number))
const parallel = Number(cli.parallel ?? DEFAULT_PARALLEL)

if (!Number.isInteger(parallel) || parallel < 1 || parallel > MAX_SLOTS) {
  throw new Error(`--parallel must be 1 to ${MAX_SLOTS}, got ${cli.parallel}.`)
}
if ([...onlyIssues].some((n) => !Number.isInteger(n) || n < 1)) {
  throw new Error(`--issue takes issue numbers, got ${cli.issue?.join(", ")}.`)
}

// ---------------------------------------------------------------------------
// Host commands
// ---------------------------------------------------------------------------

const host = (command: string, args: string[], input?: string) =>
  execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim()

const git = (...args: string[]) => host("git", args)
const gh = (...args: string[]) => host("gh", args)
const ghJson = <T,>(...args: string[]) => JSON.parse(gh(...args)) as T

const { nameWithOwner: REPO, owner } = ghJson<{
  nameWithOwner: string
  owner: { login: string }
}>("repo", "view", "--json", "nameWithOwner,owner")
const OWNER = owner.login

const branchFor = (issue: number) => `${BRANCH_PREFIX}${issue}`

const isAheadOfBase = (branch: string) => {
  try {
    return Number(git("rev-list", "--count", `${BASE_REF}..${branch}`)) > 0
  } catch {
    return false // the branch doesn't exist yet
  }
}

/** Remove the worktree a crashed run left on `branch`. Its commits stay. */
const discardWorktree = (branch: string) => {
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

const deleteBranch = (branch: string) => {
  discardWorktree(branch)
  try {
    git("branch", "-D", branch)
  } catch {
    // It doesn't exist.
  }
}

// ---------------------------------------------------------------------------
// Stopping, retries and the concurrency cap
// ---------------------------------------------------------------------------

// Ctrl-C stops the agents in flight and still tears everything down. A second
// Ctrl-C exits at once.
const stop = new AbortController()
process.on("SIGINT", () => {
  if (stop.signal.aborted) process.exit(130)
  console.warn(
    "\nStopping: killing the agents in flight. Ctrl-C again to quit."
  )
  stop.abort(new Error("Stopped by Ctrl-C."))
})

/**
 * Trouble with the model API or the network, not with the ticket. Only the
 * start of the error is read: further down is agent output, and a ticket about
 * rate limits talks about 429s.
 */
const isApiTrouble = (error: unknown) =>
  /overloaded|rate.?limit|usage limit|hit your limit|\b429\b|\b5(00|02|03|29)\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
    String(error).slice(0, 500)
  )

/**
 * The agent can't log in. Every other ticket would fail the same way, so the
 * run stops, and no ticket is handed off for it.
 */
const isAuthFailure = (error: unknown) =>
  /Failed to authenticate|\b401\b|invalid x-api-key|OAuth (access )?token/i.test(
    String(error).slice(0, 500)
  )

/** The host couldn't push or reach GitHub: not the ticket's fault either. */
class HostError extends Error {}

const onHost = <T,>(what: string, run: () => T) => {
  try {
    return run()
  } catch (error) {
    throw new HostError(`${what} failed: ${String(error).split("\n")[0]}`, {
      cause: error,
    })
  }
}

const withRetry = async <T,>(
  label: string,
  signal: AbortSignal,
  run: () => Promise<T>
) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= MAX_AGENT_ATTEMPTS || !isApiTrouble(error)) throw error
      console.warn(
        `  ${label} hit API trouble. Retrying in ${RETRY_DELAY_MS / 1000}s (${attempt}/${MAX_AGENT_ATTEMPTS}).`
      )
      await sleep(RETRY_DELAY_MS, undefined, { signal })
    }
  }
}

// At most `size` tasks run at once, and each holds a numbered slot, 1 to
// `size`, while it runs. The slot picks the sandbox's Redis database, so
// parallel test runs never share one (see environment.mts).
const createSlotPool = (size: number) => {
  const free = Array.from({ length: size }, (_, i) => i + 1)
  const waiting: ((slot: number) => void)[] = []
  const acquire = () =>
    free.length > 0
      ? Promise.resolve(free.shift()!)
      : new Promise<number>((resolve) => waiting.push(resolve))
  const release = (slot: number) => {
    const next = waiting.shift()
    if (next) next(slot)
    else free.push(slot)
  }
  return async <T,>(task: (slot: number) => Promise<T>) => {
    const slot = await acquire()
    try {
      return await task(slot)
    } finally {
      release(slot)
    }
  }
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

type Ticket = {
  number: number
  title: string
  branch: string
  /** What the agents read: the body, your comments and the parent's body. */
  text: string
}

type GhIssue = {
  number: number
  title: string
  body: string
  author: { login: string }
  comments: { author: { login: string }; body: string }[]
}

// The repo is public: anyone can comment on an issue, and anyone can open one.
// Only you can apply the label, but an author can edit the body after you do,
// so the agents see only issues you wrote, and only your comments. Nothing an
// agent reads from GitHub comes from anyone else.
const ticketText = (issue: GhIssue) => {
  const parts = [`# #${issue.number}: ${issue.title}`, issue.body]
  const comments = issue.comments.filter((c) => c.author.login === OWNER)
  if (comments.length > 0) {
    parts.push(
      "## Comments from the maintainer",
      ...comments.map((c) => c.body)
    )
  }
  try {
    const parent = ghJson<{
      number: number
      title: string
      body: string | null
      user: { login: string }
    }>("api", `repos/${REPO}/issues/${issue.number}/parent`)
    if (parent.user.login === OWNER && parent.body) {
      parts.push(
        `## Parent issue #${parent.number}: ${parent.title}`,
        parent.body
      )
    }
  } catch {
    // It has no parent.
  }
  return parts.join("\n\n")
}

const openFactoryPullRequests = () =>
  ghJson<{ number: number; title: string; headRefName: string }[]>(
    "pr",
    "list",
    "--repo",
    REPO,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,headRefName"
  ).filter((pr) => pr.headRefName.startsWith(BRANCH_PREFIX))

/** The open, unblocked tickets you wrote that no pull request covers yet. */
const loadTickets = (done: ReadonlySet<number>) => {
  const inFlight = new Set(
    openFactoryPullRequests().map((pr) => pr.headRefName)
  )
  const issues = ghJson<GhIssue[]>(
    "issue",
    "list",
    "--repo",
    REPO,
    "--state",
    "open",
    "--label",
    READY_LABEL,
    "--limit",
    "100",
    "--json",
    "number,title,body,author,comments"
  )

  const tickets: Ticket[] = []
  for (const issue of issues) {
    const skip = (reason: string) => {
      if (onlyIssues.has(issue.number)) {
        console.warn(`  #${issue.number} skipped: ${reason}.`)
      }
    }
    if (onlyIssues.size > 0 && !onlyIssues.has(issue.number)) continue
    if (done.has(issue.number)) continue
    if (issue.author.login !== OWNER) {
      console.warn(`  #${issue.number} skipped: written by someone else.`)
      continue
    }
    if (inFlight.has(branchFor(issue.number))) {
      skip("its pull request is open")
      continue
    }
    const blockedBy = Number(
      gh(
        "api",
        `repos/${REPO}/issues/${issue.number}`,
        "--jq",
        ".issue_dependencies_summary.blocked_by // 0"
      )
    )
    if (blockedBy > 0) {
      skip(`${blockedBy} open blocker(s)`)
      continue
    }
    tickets.push({
      number: issue.number,
      title: issue.title,
      branch: branchFor(issue.number),
      text: ticketText(issue),
    })
  }
  for (const n of onlyIssues) {
    if (!issues.some((issue) => issue.number === n)) {
      console.warn(`  #${n} skipped: not an open ${READY_LABEL} issue.`)
    }
  }
  return tickets
}

/** Take the ticket off the factory and say why on the issue. */
const handToHuman = (ticket: Ticket, reason: string, pullRequest?: string) => {
  const where = pullRequest
    ? `**Pull request:** ${pullRequest}`
    : `**Branch:** \`${ticket.branch}\`, on the factory host only (never pushed).`
  gh(
    "issue",
    "edit",
    String(ticket.number),
    "--repo",
    REPO,
    "--remove-label",
    READY_LABEL,
    "--add-label",
    HUMAN_LABEL
  )
  host(
    "gh",
    [
      "issue",
      "comment",
      String(ticket.number),
      "--repo",
      REPO,
      "--body-file",
      "-",
    ],
    [
      "The Sandcastle factory stopped on this ticket and handed it to a person.",
      `**Why:** ${reason}`,
      where,
      `To give it back, close any open factory pull request and swap \`${HUMAN_LABEL}\` for \`${READY_LABEL}\`. The next run continues from the branch's commits.`,
    ].join("\n\n")
  )
}

// ---------------------------------------------------------------------------
// Phase 1: plan
// ---------------------------------------------------------------------------

const planSchema = z.object({
  issues: z.array(z.object({ number: z.number().int() })),
})

/** The tickets that can be built side by side now. */
const plan = async (tickets: Ticket[]) => {
  // One ticket, or tickets you named, need no planner.
  if (tickets.length <= 1 || onlyIssues.size > 0) return tickets

  const inFlight = openFactoryPullRequests()
  // The planner only reads, but it still gets its own worktree on origin/main
  // so it never sees your checkout.
  deleteBranch(PLANNER_BRANCH)
  try {
    const result = await withRetry("planner", stop.signal, () =>
      sandcastle.run({
        name: "planner",
        agent: PLANNER(),
        sandbox: sandbox(0),
        branchStrategy: {
          type: "branch",
          branch: PLANNER_BRANCH,
          baseBranch: BASE_REF,
        },
        promptFile: prompt("plan-prompt.md"),
        promptArgs: {
          ISSUES: tickets.map((t) => t.text).join("\n\n---\n\n"),
          IN_FLIGHT:
            inFlight.length === 0
              ? "None."
              : inFlight
                  .map((pr) => `- ${pr.headRefName}: ${pr.title}`)
                  .join("\n"),
        },
        maxIterations: 1, // structured output requires a single iteration
        idleTimeoutSeconds: 1800,
        signal: stop.signal,
        output: sandcastle.Output.object({
          tag: "plan",
          schema: planSchema,
          maxRetries: 2,
        }),
      })
    )
    const chosen = new Set(result.output.issues.map((i) => i.number))
    return tickets.filter((t) => chosen.has(t.number))
  } finally {
    deleteBranch(PLANNER_BRANCH)
  }
}

// ---------------------------------------------------------------------------
// CI
// ---------------------------------------------------------------------------

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
const waitForChecks = async (sha: string, signal: AbortSignal) => {
  const deadline = Date.now() + CI_TIMEOUT_MS
  let finishedCount = -1
  for (;;) {
    await sleep(CI_POLL_MS, undefined, { signal })
    if (Date.now() > deadline) {
      throw new TicketFailure(
        `CI didn't finish within ${CI_TIMEOUT_MS / 60_000} minutes of the push.`
      )
    }
    let runs: CheckRun[]
    try {
      runs = ghJson<{ check_runs: CheckRun[] }>(
        "api",
        `repos/${REPO}/commits/${sha}/check-runs?per_page=100`
      ).check_runs
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
    const failed = runs.filter((r) => FAILED.has(r.conclusion ?? ""))
    return failed.length === 0
      ? { passed: true as const }
      : { passed: false as const, log: failureLog(failed) }
  }
}

// ---------------------------------------------------------------------------
// Phases 2 to 4: implement, review, publish, CI
// ---------------------------------------------------------------------------

/** A ticket the factory can't finish, for a reason a person should read. */
class TicketFailure extends Error {}

const NO_CI_FAILURE = "None: this is the first attempt."
const MAX_BLOCKED_CHARS = 1500
const MAX_REVIEW_CHARS = 8000

const CODING_STANDARDS = readFileSync(prompt("CODING_STANDARDS.md"), "utf8")

const CONVENTIONAL_TITLE =
  /^(feat|fix|docs|test|refactor|perf|build|ci|chore|style)(\([\w./-]+\))?!?: \S/

// The branch belongs to the factory. The lease still refuses to overwrite a
// commit someone else pushed to it.
const push = (branch: string) =>
  onHost(`Pushing ${branch}`, () =>
    git("push", "--force-with-lease", "origin", `${branch}:${branch}`)
  )

const buildTicket = async (
  ticket: Ticket,
  slot: number,
  signal: AbortSignal,
  progress: { pullRequest?: string }
): Promise<string> => {
  const label = `#${ticket.number}`

  discardWorktree(ticket.branch)
  await using box = await sandcastle.createSandbox({
    branch: ticket.branch,
    baseBranch: BASE_REF,
    sandbox: sandbox(slot),
    hooks: installHooks,
  })

  // The writer leaves the pull request in the worktree's own git directory:
  // the host can read it there, and git never commits it.
  const gitDir = git("-C", box.worktreePath, "rev-parse", "--absolute-git-dir")
  const prTitleFile = join(gitDir, "factory-pr-title.txt")
  const prBodyFile = join(gitDir, "factory-pr-body.md")

  const args = {
    ISSUE_NUMBER: String(ticket.number),
    ISSUE_TITLE: ticket.title,
    ISSUE: ticket.text,
    BRANCH: ticket.branch,
    BASE_REF,
  }

  const implement = async (ciFailure: string, maxIterations: number) => {
    const result = await withRetry(`${label} implementer`, signal, () =>
      box.run({
        name: `implementer ${label}`,
        agent: IMPLEMENTER(),
        promptFile: prompt("implement-prompt.md"),
        promptArgs: { ...args, CI_FAILURE: ciFailure },
        maxIterations,
        idleTimeoutSeconds: 1800,
        signal,
      })
    )
    // The agent may quote the prompt's example first, so take the last tag.
    const blocked = [
      ...result.stdout.matchAll(/<blocked>([\s\S]*?)<\/blocked>/g),
    ].at(-1)?.[1]
    if (blocked?.trim()) {
      throw new TicketFailure(
        `The implementer stopped: ${blocked.trim().slice(0, MAX_BLOCKED_CHARS)}`
      )
    }
  }

  await implement(NO_CI_FAILURE, IMPLEMENT_ITERATIONS)
  if (!isAheadOfBase(ticket.branch)) {
    throw new TicketFailure("The implementer finished without a commit.")
  }

  const review = await withRetry(`${label} reviewer`, signal, () =>
    box.run({
      name: `reviewer ${label}`,
      agent: REVIEWER(),
      promptFile: prompt("review-prompt.md"),
      promptArgs: { ...args, CODING_STANDARDS },
      maxIterations: 1,
      idleTimeoutSeconds: 1800,
      signal,
    })
  )

  rmSync(prTitleFile, { force: true })
  rmSync(prBodyFile, { force: true })
  await withRetry(`${label} PR writer`, signal, () =>
    box.run({
      name: `PR writer ${label}`,
      agent: PR_WRITER(),
      promptFile: prompt("pr-prompt.md"),
      promptArgs: {
        ...args,
        // Its report comes last in its output.
        REVIEW: review.stdout.slice(-MAX_REVIEW_CHARS) || "No report.",
        PR_TITLE_FILE: prTitleFile,
        PR_BODY_FILE: prBodyFile,
      },
      maxIterations: 1,
      idleTimeoutSeconds: 1800,
      signal,
    })
  )
  if (!existsSync(prTitleFile) || !existsSync(prBodyFile)) {
    throw new TicketFailure("The PR writer didn't write the pull request.")
  }
  const title = readFileSync(prTitleFile, "utf8").trim().split("\n")[0]!
  let body = readFileSync(prBodyFile, "utf8").trim()
  if (!CONVENTIONAL_TITLE.test(title)) {
    console.warn(
      `  ${label}: the PR title isn't a conventional commit: ${title}`
    )
  }
  if (
    !new RegExp(`\\b(Closes|Fixes|Resolves) #${ticket.number}\\b`, "i").test(
      body
    )
  ) {
    body += `\n\nCloses #${ticket.number}`
  }
  body +=
    "\n\n---\n\nBuilt by the Sandcastle factory. It merges nothing: review it as you would any pull request."

  push(ticket.branch)
  const pullRequest = onHost("Opening the pull request", () =>
    host(
      "gh",
      [
        "pr",
        "create",
        "--repo",
        REPO,
        "--base",
        BASE_BRANCH,
        "--head",
        ticket.branch,
        "--title",
        title,
        "--label",
        PR_LABEL,
        "--body-file",
        "-",
      ],
      body
    )
  )
  progress.pullRequest = pullRequest
  console.log(`  ${label}: opened ${pullRequest}`)

  for (let fixes = 0; ; fixes++) {
    const sha = git("rev-parse", ticket.branch)
    const ci = await waitForChecks(sha, signal)
    if (ci.passed) return pullRequest
    if (fixes === MAX_CI_FIXES) {
      throw new TicketFailure(
        `CI still fails after ${MAX_CI_FIXES} fix attempts.`
      )
    }
    console.log(
      `  ${label}: CI failed. Fix attempt ${fixes + 1}/${MAX_CI_FIXES}.`
    )
    await implement(ci.log, CI_FIX_ITERATIONS)
    if (git("rev-parse", ticket.branch) === sha) {
      throw new TicketFailure(
        "CI failed, and the implementer committed no fix."
      )
    }
    push(ticket.branch)
  }
}

type Outcome =
  | { status: "ready"; pullRequest: string }
  | { status: "handed-off"; reason: string }
  | { status: "interrupted"; reason: string }

const runTicket = async (ticket: Ticket, slot: number): Promise<Outcome> => {
  const deadline = AbortSignal.timeout(TICKET_TIMEOUT_MS)
  const signal = AbortSignal.any([stop.signal, deadline])
  const progress: { pullRequest?: string } = {}
  try {
    const pullRequest = await buildTicket(ticket, slot, signal, progress)
    return { status: "ready", pullRequest }
  } catch (error) {
    console.error(`  ✗ #${ticket.number} (${ticket.branch}):`, error)
    if (isAuthFailure(error)) {
      stop.abort(new Error("The agent can't authenticate."))
    }
    // Not the ticket's fault: leave it labelled for the next run.
    if (
      stop.signal.aborted ||
      error instanceof HostError ||
      isApiTrouble(error)
    ) {
      return { status: "interrupted", reason: String(error).split("\n")[0]! }
    }
    // The comment is public, so it carries only the reasons written here and
    // the implementer's own <blocked> note, never raw error output.
    const reason =
      error instanceof TicketFailure
        ? error.message
        : deadline.aborted
          ? `It ran past its ${TICKET_TIMEOUT_MS / 3_600_000}-hour limit.`
          : "The factory hit an unexpected error. Its log on the factory host has the details."
    try {
      handToHuman(ticket, reason, progress.pullRequest)
    } catch (labelError) {
      console.error(`  Couldn't relabel #${ticket.number}:`, labelError)
    }
    return { status: "handed-off", reason }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const withSlot = createSlotPool(parallel)
const done = new Set<number>()
const outcomes = new Map<number, Outcome>()

// One tiny call through a sandbox proves the token in `.sandcastle/.env`
// before any ticket depends on it.
const PREFLIGHT_BRANCH = "sandcastle/preflight"
deleteBranch(PREFLIGHT_BRANCH)
try {
  await sandcastle.run({
    name: "preflight",
    agent: sandcastle.claudeCode("claude-haiku-5-5", { effort: "low" }),
    sandbox: sandbox(0),
    branchStrategy: {
      type: "branch",
      branch: PREFLIGHT_BRANCH,
      baseBranch: BASE_REF,
    },
    prompt: "Reply with the single word OK and do nothing else.",
    maxIterations: 1,
    completionSignal: "OK",
    signal: stop.signal,
  })
} catch (error) {
  throw new Error(
    isAuthFailure(error)
      ? "The agent can't log in: renew CLAUDE_CODE_OAUTH_TOKEN in .sandcastle/.env with `claude setup-token`."
      : "The preflight agent run failed.",
    { cause: error }
  )
} finally {
  deleteBranch(PREFLIGHT_BRANCH)
}

startServices()
try {
  for (let wave = 1; wave <= MAX_WAVES && !stop.signal.aborted; wave++) {
    console.log(`\n=== Wave ${wave}/${MAX_WAVES} ===\n`)
    git("fetch", "--quiet", "origin", BASE_BRANCH)

    const candidates = loadTickets(done)
    if (candidates.length === 0) {
      console.log("No open, unblocked tickets. Exiting.")
      break
    }

    const tickets = await plan(candidates)
    if (tickets.length === 0) {
      console.log("The planner chose no tickets. Exiting.")
      break
    }
    console.log(`${tickets.length} ticket(s), at most ${parallel} at once:`)
    for (const t of tickets)
      console.log(`  #${t.number}: ${t.title} → ${t.branch}`)

    await Promise.all(
      tickets.map((ticket) =>
        withSlot(async (slot) => {
          done.add(ticket.number)
          outcomes.set(
            ticket.number,
            stop.signal.aborted
              ? { status: "interrupted", reason: "The run stopped first." }
              : await runTicket(ticket, slot)
          )
        })
      )
    )

    // Tickets you named run once.
    if (onlyIssues.size > 0) break
  }
} finally {
  stopServices()
}

console.log("\n=== Summary ===\n")
for (const [number, outcome] of outcomes) {
  switch (outcome.status) {
    case "ready":
      console.log(
        `  ✓ #${number}: CI passes, ready for review: ${outcome.pullRequest}`
      )
      break
    case "handed-off":
      console.log(
        `  → #${number}: relabelled ${HUMAN_LABEL}: ${outcome.reason}`
      )
      break
    case "interrupted":
      console.log(
        `  … #${number}: interrupted, still ${READY_LABEL}: ${outcome.reason}`
      )
      break
  }
}
if (outcomes.size === 0) console.log("  Nothing ran.")
