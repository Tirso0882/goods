# One agent loop, with write policy enforced in code

On 29 October 2026, in the Step 1 design (#101), we chose a single agent loop that picks tools for the whole conversation, rather than a router in front of fixed workflows, or several agents. The model decides *which* tool to call. The tool, and the Medusa support route behind it, decide whether the call is *allowed*: identity, order state, withdrawal window, non-returnable items, idempotency and the kill switch are all checked in code, never left to the prompt.

The six journeys in `docs/design.md` are short and share most of their steps (verify, read the order, maybe write). One loop handles a shopper who asks about two orders and then a policy in the same conversation, which a router would have to split up. Putting every rule in code means a prompt injection or a model mistake can at worst choose a write that is then refused, not perform one.

## Considered options

- **Router plus fixed workflows per journey:** predictable, but brittle when a conversation mixes journeys, and each new journey needs its own workflow. The safety it adds is already provided by the rules in code.
- **Several agents (for example a returns agent and an orders agent):** more model calls and hand-offs between agents for no measured gain. Roadmap rule 2 keeps one agent through Step 12. Step 13 tests multi-agent against this baseline (ADR 0004).
- **Policy in the prompt:** rejected. A prompt is a request to the model, not a guarantee.

## Consequences

- Every write tool has a policy table and deterministic tests before the model sees its schema (Step 6).
- Evals check the tool calls and the final Medusa state, not just the wording of the reply.
- The loop runs on LangChain's `create_agent` from Step 2 (ADR 0012), so Step 8 adds durable approval to it instead of rebuilding it in LangGraph. What the tools allow doesn't change.
