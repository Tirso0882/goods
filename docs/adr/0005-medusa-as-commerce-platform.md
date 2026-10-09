# Medusa is the commerce platform, and the agent only uses its APIs

On 25 September 2026 we chose Medusa as the commerce core, and the scaffold in #4 installed Medusa 2.21.2 with the Next.js starter. The support agent needs a clean API for orders, returns, refunds, and customers, events it can react to, and a stack one person can run and debug. Medusa is API-first, written in TypeScript on one Postgres database, and built to be customized through modules, workflows, and API routes. Its core is MIT-licensed. The full comparison is in `docs/research/ecommerce-ai-features.md`.

Alternatives considered:

- **Saleor** (Python, Django, GraphQL): the strongest alternative, and it would keep the whole stack in Python. Its own README warns it can feel complex for a single developer with a small business.
- **WooCommerce** (PHP on WordPress): the fastest way to a selling store, but weak for learning production engineering, and plugins add security and upgrade risk.
- **Magento Open Source** (PHP): full APIs, but far too large for one person.
- **nopCommerce** (.NET): solid, but a new language, and its REST API is a separate plugin.
- **OpenCart and Zen Cart** (PHP monoliths): not built API-first, so a poor base for agent tools.
- **Shopify** (hosted SaaS): good APIs, but closed source and hosted elsewhere, so there is nothing to self-host, debug, or extend at the server level.

## The agent only uses Medusa APIs

The agent reads and changes store data only through Medusa's Store and Admin APIs, or custom Medusa API routes backed by workflows. It never connects to Medusa's database tables. The agent's own data lives in a separate schema that Medusa does not touch.

## Consequences

- Every agent tool is a thin wrapper around a Medusa endpoint, so Medusa's validation, permissions, and workflow rollbacks apply to every agent action.
- When an endpoint is missing, we add a Medusa API route and workflow instead of writing SQL from the agent.
- Medusa upgrades can change table layouts without breaking the agent, as long as the APIs hold.
- The store side is TypeScript while the agent is Python, so the project uses two languages.
- Enterprise Edition features need a commercial agreement. We use only the MIT core.
