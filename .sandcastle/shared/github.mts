// The tickets: which issues the factory builds, what the agents read of them,
// and handing one to a person.

import { BASE_REF, BRANCH_PREFIX, HUMAN_LABEL, READY_LABEL } from "./config.mts"
import { OWNER, REPO, gh, ghJson, host } from "./host.mts"

export type Ticket = {
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

export const branchFor = (issue: number) => `${BRANCH_PREFIX}${issue}`

/** The prompt arguments every agent on a ticket gets. */
export const ticketArgs = (ticket: Ticket) => ({
  ISSUE_NUMBER: String(ticket.number),
  ISSUE_TITLE: ticket.title,
  ISSUE: ticket.text,
  BRANCH: ticket.branch,
  BASE_REF,
})

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

export const openFactoryPullRequests = () =>
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
