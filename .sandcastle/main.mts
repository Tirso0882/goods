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
// Where things are:
//   shared/config.mts    every knob: limits, labels, branches, models
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

import { parseArgs } from "node:util"
import { MAX_SLOTS, startServices, stopServices } from "./environment.mts"
import {
  BASE_BRANCH,
  DEFAULT_PARALLEL,
  HUMAN_LABEL,
  MAX_WAVES,
  READY_LABEL,
} from "./shared/config.mts"
import { loadTickets } from "./shared/github.mts"
import { git } from "./shared/host.mts"
import { type Outcome, runTicket } from "./ticket.mts"
import { plan } from "./workflows/plan/plan.mts"
import { preflight } from "./workflows/preflight/preflight.mts"

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

await preflight(stop.signal)

startServices()
try {
  for (let wave = 1; wave <= MAX_WAVES && !stop.signal.aborted; wave++) {
    console.log(`\n=== Wave ${wave}/${MAX_WAVES} ===\n`)
    git("fetch", "--quiet", "origin", BASE_BRANCH)

    const candidates = loadTickets(done, onlyIssues)
    if (candidates.length === 0) {
      console.log("No open, unblocked tickets. Exiting.")
      break
    }

    // One ticket, or tickets you named, need no planner.
    const tickets =
      candidates.length <= 1 || onlyIssues.size > 0
        ? candidates
        : await plan(candidates, stop.signal)
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
              : await runTicket(ticket, slot, stop)
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
