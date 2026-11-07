# Approvals are decided by the operator or by a versioned policy

On 7 November 2026 we replaced "every refund is an operator click" (ADR 0011) with an **approval policy**: a versioned set of rules, kept in the repo, that can decide an approval the way the operator would. Every approval still names who decided it: the operator, or the policy at a given version. The agent still never holds a route that can move money. ADR 0011 stands for that, and for how the refund runs once an approval is decided.

An operator click on every refund doesn't scale past a handful of orders a day, and a shopper with a missing earring waits for the operator's next free hour. A policy that only decides what the operator would decide the same way every time removes that wait, without giving the model any new power.

## How it works

- Each approval records `decision_actor` (`operator` or `policy`), `policy_version`, and the ceiling the policy applied.
- The policy runs in Medusa, in the same code path as the operator's approve click: claim once, re-read the order and payment, run the refund with the approval ID. The agent only proposes, as before.
- **The ceiling launches at 0 PLN.** Until eval evidence says otherwise, the policy decides nothing and every refund is the operator's click, exactly as under ADR 0011. The ceiling rises only in a new policy version, merged with the eval report that justifies it.
- **Always the operator:** a refund above 200 PLN, or one that would push the day's policy-decided refund total above its daily cap. Both go to the operator as P1 handoffs (`docs/design.md`, Handoff priorities). The 200 PLN line and the daily cap are raised step by step as reliability is proven, each in a new policy version.
- **Return inspection is an approval type, always the operator's.** The operator inspects returned items and approves a refund or an exchange in the system, so the decision is recorded like any other, not done by hand outside it.
- **Expiry:** the operator is reminded after 24 hours. At 48 hours, an approval within the policy's expiry default is decided by the policy; anything else expires, moves no money, and the case is handed off. The expiry default also launches at 0.

## Considered options

- **Keep every refund an operator click (ADR 0011 as written):** safest, and still what happens while the ceiling is 0. As a permanent rule it makes the operator the bottleneck of every claim.
- **Let the agent execute refunds under a small limit:** rejected again, as in ADR 0011. The agent would hold a refund-capable route, and a bug in the agent would become a money bug.

## Consequences

- The stop condition "a refund without recorded human approval" becomes "a refund without a recorded approval by the operator, or by a merged policy version within its ceiling".
- The approvals module is generic from Step 8: type, payload, policy version, decision actor, expiry. Refunds are the first type, return inspection the second (ADR 0019).
- Policy changes are code changes: reviewed PRs, versioned, never an admin text box, like the FAQ.
- Evals need cases that sit exactly on the ceiling, the 200 PLN line and the daily cap.
