// The factory: plan → implement → review → pull request → CI, in waves.
//
//   Update     Each wave starts by merging origin/main into every open factory
//              pull request that conflicts with it. The host merges, and an
//              agent resolves the conflicts if there are any. A pull request
//              that is only behind merges cleanly and is left alone.
//   Address    Each factory pull request you labelled `ready-for-agent` goes
//              back to an agent with your unresolved review comments. It fixes
//              or answers them in the pull request's sandbox; the host pushes,
//              posts its replies, removes the label and waits for CI.
//   Plan       The host lists the open `ready-for-agent` issues you wrote and
//              drops any with an open blocker or an open factory pull request.
//              A planner picks the ones that can be built side by side.
//   Implement  Each issue gets a bwrap sandbox on `factory/issue-<n>`,
//              branched from origin/main. The implementer builds it and the
//              reviewer checks it against the coding standards and the issue.
//   Publish    A writer drafts the pull request body with the /pr skill. The
//              host pushes the branch and opens the pull request.
//   CI         The host waits for the checks on the pushed commit. On a failure
//              the implementer gets the failing log, up to `limits.maxCiFixes`
//              times.
//
// Nothing merges by itself: you merge the pull requests, and a later run picks
// up what they unblock. A ticket the factory can't finish is relabelled
// `ready-for-human` with a comment, so no run retries it.
//
// Worktrees branch from origin/main and the host pushes from refs, so the
// checkout you start it from can be on any branch, with uncommitted work.
//
// Where things are:
//   .factory/factory.config.mts   goods' settings: limits, labels, models
//   shared/factory.mts   the settings' defaults, resolved for a run
//   shared/              host commands, tickets, CI, retries
//   workflows/<name>/    one agent each, its code next to its prompt
//   ticket.mts           one ticket from sandbox to CI result
//   environment.mts      what a sandbox can see and reach
//   **/*.test.mts        `pnpm test`; `pnpm typecheck` covers it all too
//
// Usage:
//   pnpm factory:check --quick               # first
//   pnpm factory                             # the backlog
//   pnpm factory --issue 160 --parallel 1
//   pnpm factory --update-pr 187             # only merge main into it
//   pnpm factory --address-pr 187            # only address your review of it

import { parseArgs } from "node:util"
import { MAX_SLOTS, startServices, stopServices } from "./environment.mts"
import { loadFactory } from "./shared/load-factory.mts"
import {
  conflictingPullRequests,
  loadTickets,
  openFactoryPullRequests,
} from "./shared/github.mts"
import { git } from "./shared/host.mts"
import type { FactoryPullRequest } from "./shared/pull-requests.mts"
import { type Outcome, runTicket } from "./ticket.mts"
import {
  type AddressOutcome,
  addressPullRequest,
} from "./workflows/address-review/address-review.mts"
import { plan } from "./workflows/plan/plan.mts"
import { preflight } from "./workflows/preflight/preflight.mts"
import {
  type UpdateOutcome,
  updatePullRequest,
} from "./workflows/update-branch/update-branch.mts"

const factory = loadFactory()
const { names, limits } = factory
const { baseBranch, baseRef, readyLabel, humanLabel } = names

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const { values: cli } = parseArgs({
  options: {
    issue: { type: "string", multiple: true },
    parallel: { type: "string" },
    "update-pr": { type: "string" },
    "address-pr": { type: "string" },
  },
})

const onlyIssues = new Set((cli.issue ?? []).map(Number))
const parallel = Number(cli.parallel ?? limits.parallel)

if (!Number.isInteger(parallel) || parallel < 1 || parallel > MAX_SLOTS) {
  throw new Error(
    cli.parallel === undefined
      ? `limits.parallel in .factory/factory.config.mts must be at most ${MAX_SLOTS}, got ${parallel}.`
      : `--parallel must be 1 to ${MAX_SLOTS}, got ${cli.parallel}.`
  )
}
if ([...onlyIssues].some((n) => !Number.isInteger(n) || n < 1)) {
  throw new Error(`--issue takes issue numbers, got ${cli.issue?.join(", ")}.`)
}

const pullRequestOption = (name: "update-pr" | "address-pr") => {
  const value = cli[name]
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`--${name} takes a pull request number, got ${value}.`)
  }
  return number
}

const onlyUpdate = pullRequestOption("update-pr")
const onlyAddress = pullRequestOption("address-pr")
if (onlyUpdate !== undefined && onlyAddress !== undefined) {
  throw new Error("--update-pr and --address-pr run on their own: pick one.")
}
if (
  (onlyUpdate !== undefined || onlyAddress !== undefined) &&
  onlyIssues.size > 0
) {
  throw new Error(
    "--update-pr and --address-pr run on their own: drop --issue."
  )
}

// ---------------------------------------------------------------------------
// Stopping and the concurrency cap
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
// Main loop
// ---------------------------------------------------------------------------

const withSlot = createSlotPool(parallel)
const done = new Set<number>()
const outcomes = new Map<number, Outcome>()
const updates = new Map<number, UpdateOutcome>()
const reviewOutcomes = new Map<number, AddressOutcome>()

const updatePullRequests = (pullRequests: readonly FactoryPullRequest[]) =>
  Promise.all(
    pullRequests.map((pr) =>
      withSlot(async (slot) => {
        console.log(
          `  PR #${pr.number}: merging ${baseRef} into ${pr.headRefName}`
        )
        updates.set(
          pr.number,
          stop.signal.aborted
            ? { status: "interrupted", reason: "The run stopped first." }
            : await updatePullRequest(factory, pr, slot, stop)
        )
      })
    )
  )

const addressPullRequests = (pullRequests: readonly FactoryPullRequest[]) =>
  Promise.all(
    pullRequests.map((pr) =>
      withSlot(async (slot) => {
        console.log(`  PR #${pr.number}: addressing your review`)
        reviewOutcomes.set(
          pr.number,
          stop.signal.aborted
            ? { status: "interrupted", reason: "The run stopped first." }
            : await addressPullRequest(factory, pr, slot, stop)
        )
      })
    )
  )

// One pull request you named, whatever GitHub says of it or its labels.
const onePullRequest = (number: number) => {
  git("fetch", "--quiet", "origin", baseBranch)
  const pr = openFactoryPullRequests(names).find((p) => p.number === number)
  if (pr === undefined) {
    console.warn(`PR #${number} isn't an open factory pull request.`)
  }
  return pr
}

await preflight(factory, stop.signal)

const runWaves = async () => {
  for (let wave = 1; wave <= limits.maxWaves && !stop.signal.aborted; wave++) {
    console.log(`\n=== Wave ${wave}/${limits.maxWaves} ===\n`)
    git("fetch", "--quiet", "origin", baseBranch)

    // A pull request this run couldn't update waits for the next run: it
    // has its comment, or the failure is in this log.
    const conflicting = (
      await conflictingPullRequests(factory, stop.signal)
    ).filter(
      (pr) => (updates.get(pr.number)?.status ?? "updated") === "updated"
    )
    if (conflicting.length > 0) {
      console.log(
        `${conflicting.length} pull request(s) conflict with ${baseBranch}:`
      )
      await updatePullRequests(conflicting)
    }
    if (stop.signal.aborted) break

    // A pull request is addressed once a run, and not while it conflicts.
    const sentBack = openFactoryPullRequests(names, readyLabel).filter(
      (pr) =>
        !reviewOutcomes.has(pr.number) &&
        (updates.get(pr.number)?.status ?? "updated") === "updated"
    )
    if (sentBack.length > 0) {
      console.log(`${sentBack.length} pull request(s) sent back for review:`)
      await addressPullRequests(sentBack)
    }
    if (stop.signal.aborted) break

    const candidates = loadTickets(names, done, onlyIssues)
    if (candidates.length === 0) {
      console.log("No open, unblocked tickets. Exiting.")
      break
    }

    // One ticket, or tickets you named, need no planner.
    const tickets =
      candidates.length <= 1 || onlyIssues.size > 0
        ? candidates
        : await plan(factory, candidates, stop.signal)
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
              : await runTicket(factory, ticket, slot, stop)
          )
        })
      )
    )

    // Tickets you named run once.
    if (onlyIssues.size > 0) break
  }
}

const runOne = async () => {
  if (onlyUpdate !== undefined) {
    const pr = onePullRequest(onlyUpdate)
    if (pr) await updatePullRequests([pr])
  } else if (onlyAddress !== undefined) {
    const pr = onePullRequest(onlyAddress)
    if (pr) await addressPullRequests([pr])
  } else {
    await runWaves()
  }
}

startServices()
try {
  await runOne()
} finally {
  stopServices()
}

console.log("\n=== Summary ===\n")
for (const [number, update] of updates) {
  switch (update.status) {
    case "updated":
      console.log(`  ↻ PR #${number}: ${baseBranch} merged in, ${update.merge}`)
      break
    case "failed":
      console.log(`  ✗ PR #${number}: not updated, commented: ${update.reason}`)
      break
    case "interrupted":
      console.log(`  … PR #${number}: not updated: ${update.reason}`)
      break
  }
}
for (const [number, address] of reviewOutcomes) {
  switch (address.status) {
    case "addressed":
      console.log(
        `  ✎ PR #${number}: review addressed: ${address.commits} commit(s), ${address.replies} reply(ies), ${address.comments} comment(s)`
      )
      break
    case "nothing to do":
      console.log(`  ✎ PR #${number}: nothing actionable, commented`)
      break
    case "failed":
      console.log(
        `  ✗ PR #${number}: review not addressed, commented: ${address.reason}`
      )
      break
    case "interrupted":
      console.log(
        `  … PR #${number}: interrupted, still ${readyLabel}: ${address.reason}`
      )
      break
  }
}
for (const [number, outcome] of outcomes) {
  switch (outcome.status) {
    case "ready":
      console.log(
        `  ✓ #${number}: CI passes, ready for review: ${outcome.pullRequest}`
      )
      break
    case "handed-off":
      console.log(`  → #${number}: relabelled ${humanLabel}: ${outcome.reason}`)
      break
    case "interrupted":
      console.log(
        `  … #${number}: interrupted, still ${readyLabel}: ${outcome.reason}`
      )
      break
  }
}
if (outcomes.size === 0 && updates.size === 0 && reviewOutcomes.size === 0)
  console.log("  Nothing ran.")
