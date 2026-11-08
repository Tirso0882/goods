# The agent reaches commerce through a port, so the core is reusable

On 7 November 2026 we decided that the agent talks to the store through a **commerce port**: a contract, written in OpenAPI, for the operations the agent needs, with Medusa as its first adapter. This extends ADR 0010: the Medusa support routes become the Medusa implementation of the port, with the same identity and ownership checks. The goal is a support agent that a consulting client on another platform can reuse, without rewriting the core or its evals.

The agent core stays Python. The port carries the language boundary: the core and evals never import TypeScript or know Medusa's types.

## Built in roadmap order

- **Step 2:** the agent service is a FastAPI shell that imports a separate `agent-core` package. The port contract for the first two operations (verify a shopper, get one order) is written before their tools.
- **Step 3:** the `evals` package depends only on the port, never on Medusa.
- **Step 6:** the support routes, the approvals module and the Support page move into a Medusa v2 plugin under `adapters/medusa`. The policy YAML holds the first policy table. A contract suite runs the five Step 6 fault tests against any adapter.
- **Step 8:** the approvals module is generic: type, payload, policy version, decision actor, expiry (ADR 0014). Refunds are the first type.
- **Store track:** a brand pack starts with the second locale (#112), and a `markets.yaml` replaces the seed's market list from #110.
- **Catalog project:** its skills and back-office workflows live in their own packages.
- **After the core roadmap:** a second adapter, Shopify, with WooCommerce as a sidecar.

## Considered options

- **Medusa only (ADR 0010 as written):** less to build now, but every tool and eval would know Medusa, and a second platform would mean a second agent.
- **Rewrite the core in TypeScript, next to Medusa:** one language, but it gives up the Python eval and agent ecosystem, and still ties the core to one platform.

## Consequences

- Each new agent capability adds a port operation first, then the Medusa adapter's route, then the tool.
- The contract suite, not only the agent's evals, is what proves an adapter safe.
- `apps/agent` and the plugin are versioned separately once the plugin exists.
