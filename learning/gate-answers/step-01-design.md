# Step 1 learning gate: a return request, step by step

**Gate:** without notes, walk through one return request journey: every state transition, tool call and check, and where a crash at each point would leave the case.

**Mode:** answer. Written by the agent on 31 October 2026 from `docs/design.md`, read by the learner the same day. Not explained back.

## Scenario

Anna is logged in to the storefront. Her order #1042 (one silver ring) was delivered 5 days ago. She writes in the chat: "I want to return the ring from order 1042."

## The normal path

| # | What happens | Case state | Checked by | Recorded |
| --- | --- | --- | --- | --- |
| 1 | First message arrives | (new) to `open` | nobody | `support_cases` row; `messages` (shopper) |
| 2 | A worker takes the case lock and the message | `open` to `agent_working` | nobody | nothing new |
| 3 | `verify_customer` with her forwarded session token | `agent_working` | Medusa support route: is the token valid? | `verifications`: session, read and write, scope is her customer, 30 minutes |
| 4 | `get_order` for #1042 | `agent_working` | Route: is #1042 inside the grant's scope? | `tool_executions`: succeeded |
| 5 | The model picks `request_return(1042, ring x1)` | `agent_working` | The model only chooses | nothing new |
| 6 | The tool's code runs | `agent_working` | Agent code: kill switch on, write grant covers #1042, arguments valid | `tool_executions`: pending, key `{case}:return:1042:{ring x1}` |
| 7 | The route re-reads the order and creates the return | `agent_working` | Route: delivered, within 14 days, not non-returnable, not already in an open return | Medusa: one return request |
| 8 | The result is saved | `agent_working` | nobody | `tool_executions`: succeeded, with Medusa's return ID |
| 9 | Reply: confirmed, return address, shipping at her cost | `agent_working` to `open` | nobody | `messages` (agent) |
| 10 | She confirms, or 24 hours pass with nothing pending | `open` to `resolved` | nobody | `close_reason` |

The model chooses; code permits. The model checks nothing that matters.

## A crash at each point

| Crash between | Left behind | Recovery | Return requests |
| --- | --- | --- | --- |
| 1 and 2 | Message stored, case `open` | The next worker picks it up | 0, then 1 |
| 2 and 6 (reads) | `agent_working`, lock held | The lock expires and the turn reruns from stored messages; repeating reads is harmless | 0, then 1 |
| 6 and 7 (key reserved, Medusa not called) | Execution `pending`, then `unknown` | Reconcile: no return in Medusa, so `failed` and the key is released; the rerun creates it | 0, then 1 |
| 7 and 8 (Medusa created it, the agent didn't record it) | Execution `pending`, then `unknown` | Reconcile: the return exists, so `succeeded` with its ID; the rerun gets the stored result | 1 |
| 8 and 9 (recorded, no reply) | `succeeded`, no reply | The rerun calls the tool again, the key exists, the stored result comes back, the reply goes out | 1 |
| After 9 | Reply sent, state not saved | The rerun may send the reply twice: annoying, not a duplicate return | 1 |
| A new case tomorrow, same request | A new key | The route sees the items already in an open return and refuses; she's told it exists | 1 |

The operation key is the first guard. The route's re-check of the order is the second, and it's what makes a late first call harmless.

## What this answer found

Writing it showed a gap: reconciling an `unknown` write that never landed left the key taken, so Anna would get the stored failure forever in the same case. Fixed in #104 by releasing the key.

## The three objectives in one line each

- **Single agent versus workflow:** one agent with tools suits short journeys that mix in one conversation; a fixed workflow wins when the path never varies. Here the rules live in code either way (ADR 0008).
- **Authentication versus authorization:** authentication proves who Anna is (her session); authorization decides what that proof lets her touch (her orders, read and write, for 30 minutes).
- **Idempotency before the first write:** the key, the pending record and reconciliation shape the tables and the tool sequence. Adding them after the first write tool means rebuilding both.
