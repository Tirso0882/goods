// A ticket and what the agents read of it. Pure: no git or gh here, so the
// tests can load it (tickets.test.mts).

import { BASE_REF, BRANCH_PREFIX } from "./config.mts"

export type Ticket = {
  number: number
  title: string
  branch: string
  /** What the agents read: the body, your comments and the parent's body. */
  text: string
}

export type GhIssue = {
  number: number
  title: string
  body: string
  author: { login: string }
  comments: { author: { login: string }; body: string }[]
}

export type GhParentIssue = {
  number: number
  title: string
  body: string | null
  user: { login: string }
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
export const ticketText = (
  issue: GhIssue,
  owner: string,
  parent: GhParentIssue | undefined
) => {
  const parts = [`# #${issue.number}: ${issue.title}`, issue.body]
  const comments = issue.comments.filter((c) => c.author.login === owner)
  if (comments.length > 0) {
    parts.push(
      "## Comments from the maintainer",
      ...comments.map((c) => c.body)
    )
  }
  if (parent && parent.user.login === owner && parent.body) {
    parts.push(
      `## Parent issue #${parent.number}: ${parent.title}`,
      parent.body
    )
  }
  return parts.join("\n\n")
}
