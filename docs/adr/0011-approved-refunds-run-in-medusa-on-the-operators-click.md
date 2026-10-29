# An approved exception refund runs in Medusa, on the operator's click

On 29 October 2026, in the Step 1 design (#101), we decided where the approval boundary sits for money. The agent can only *propose* an exception refund, a refund not tied to a received return. The operator approves or rejects it on a Support page in the Medusa admin. On approval, that same admin route runs Medusa's refund workflow. The agent never holds a route that can move money.

Every refund needs approval, whatever the amount. The roadmap's earlier "refunds above a small limit" wording is dropped. Refunds that complete a return are not the agent's at all: the operator issues them in the Medusa admin after receiving the items.

## How it works

1. `propose_refund` stores a pending approval in the agent database, with amount, currency, reason, policy evidence and a 48-hour expiry.
2. The operator, logged in to the Medusa admin, approves or rejects. The admin route claims the approval once, recording the admin user and time, so a double click or a second operator gets "already decided".
3. On approval, the route re-reads the order and payment, checks the amount is still refundable and that no refund already carries this approval ID, then runs the refund with the approval ID recorded on it.
4. A Medusa job finds approvals that were claimed but never reported, and settles them by looking for a refund with that approval ID.
5. The agent resumes the case only to tell the shopper.

## Considered options

- **The agent executes the refund after approval,** through a refund route that checks for a valid approval. This is closer to the roadmap's first Step 8 wording, but the agent would hold a refund-capable route, and a bug in the approval check would become a money bug.
- **A small automatic limit:** rejected. It contradicts the stop condition that no refund runs without recorded human approval.

## Consequences

- "A refund without recorded approval" is impossible by construction: only an authenticated admin action can start one, and it records the approver first.
- Step 8 still uses a LangGraph interrupt: the case pauses at `awaiting_approval` and resumes on the outcome. Its "execute at most once" tests move to the Medusa approve route and its recovery job.
- The Medusa admin needs an admin route and page that read and update the agent's approvals through the agent's operator API.
