# goods

A learning project: a customer support agent for a Medusa e-commerce store. The store is the vehicle, not the goal.

## Synthetic data and test payments only

This system uses synthetic data and test payments only.

- Every product, customer, order, address, and conversation is synthetic. Email addresses use reserved example domains such as `example.com`.
- Payments run through Stripe test mode with test cards. No live keys (`sk_live_...`) are ever configured.
- Never put real customer data or real credentials in this repository, its issues, or its fixtures.

## Where things are

- `docs/research/top-1-percent-ai-agent-engineer-roadmap.md`: the core roadmap.
- `docs/project-configuration.md`: machine, versions, and project decisions.
- `docs/adr/`: architecture decision records.
- `CONTEXT.md`: project vocabulary.
- `learning/`: lessons and learning records.

## Requirements

- Node 24 LTS (pinned in `.nvmrc`)
- Python 3.12 (pinned in `.python-version`) with `uv`
- Docker Desktop
- Git
