// Talking to GitHub about tickets: which issues the factory builds, and
// handing one to a person.

import { setTimeout as sleep } from "node:timers/promises"
import {
  BRANCH_PREFIX,
  HUMAN_LABEL,
  MERGEABILITY_RECHECK_MS,
  READY_LABEL,
} from "./config.mts"
import { OWNER, REPO, gh, ghJson, host } from "./host.mts"
import {
  type FactoryPullRequest,
  type GhMergeability,
  partitionByMergeability,
} from "./pull-requests.mts"
import {
  type GhIssue,
  type GhParentIssue,
  type Ticket,
  branchFor,
  ticketText,
} from "./tickets.mts"

const parentOf = (issue: number) => {
  try {
    return ghJson<GhParentIssue>("api", `repos/${REPO}/issues/${issue}/parent`)
  } catch {
    return undefined // It has no parent.
  }
}

/**
 * The open pull requests the factory opened. A fork can name its branch like
 * the factory's, so only your own, from this repo, count.
 */
export const openFactoryPullRequests = (): FactoryPullRequest[] =>
  ghJson<
    (FactoryPullRequest & {
      author: { login: string }
      isCrossRepository: boolean
    })[]
  >(
    "pr",
    "list",
    "--repo",
    REPO,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,body,headRefName,author,isCrossRepository"
  )
    .filter(
      (pr) =>
        pr.headRefName.startsWith(BRANCH_PREFIX) &&
        pr.author.login === OWNER &&
        !pr.isCrossRepository
    )
    .map(({ number, title, body, headRefName }) => ({
      number,
      title,
      body,
      headRefName,
    }))

const readMergeability = (numbers: readonly number[]) =>
  numbers.map((n) => ghJson<GhMergeability>("api", `repos/${REPO}/pulls/${n}`))

/** The factory's open pull requests that conflict with the base. */
export const conflictingPullRequests = async (signal: AbortSignal) => {
  const open = openFactoryPullRequests()
  let { conflicting, unknown } = partitionByMergeability(
    readMergeability(open.map((pr) => pr.number))
  )
  if (unknown.length > 0) {
    await sleep(MERGEABILITY_RECHECK_MS, undefined, { signal }).catch(
      () => undefined
    )
    if (signal.aborted) return []
    const second = partitionByMergeability(readMergeability(unknown))
    conflicting = [...conflicting, ...second.conflicting]
    for (const n of second.unknown) {
      console.warn(
        `  PR #${n} skipped: GitHub hasn't worked out whether it merges.`
      )
    }
  }
  return open.filter((pr) => conflicting.includes(pr.number))
}

/** What the agents read of issue `number`, or nothing if you didn't write it. */
export const readIssueText = (number: number) => {
  const issue = ghJson<GhIssue>(
    "issue",
    "view",
    String(number),
    "--repo",
    REPO,
    "--json",
    "number,title,body,author,comments"
  )
  return issue.author.login === OWNER
    ? ticketText(issue, OWNER, parentOf(number))
    : undefined
}

export const commentOnPullRequest = (number: number, body: string) =>
  host(
    "gh",
    ["pr", "comment", String(number), "--repo", REPO, "--body-file", "-"],
    body
  )

/**
 * The open, unblocked tickets you wrote that no pull request covers yet.
 * `onlyIssues`, when not empty, limits them to the issues you named.
 */
export const loadTickets = (
  done: ReadonlySet<number>,
  onlyIssues: ReadonlySet<number>
) => {
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
      text: ticketText(issue, OWNER, parentOf(issue.number)),
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
export const handToHuman = (
  ticket: Ticket,
  reason: string,
  pullRequest?: string
) => {
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
