# Week 2: 5 to 10 October 2026

## Steps and objectives

Setup 1, Days 2 to 5: make the store work locally ([#2](https://github.com/Tirso0882/goods/issues/2)). Day 1 slipped into this week and finished on 6 October.

Objectives:

- Trace a request from the storefront through the Store API to the database.
- Explain how Stripe webhooks change payment state, and why duplicate delivery must be harmless.

Outcome: a synthetic customer can complete a Stripe test purchase and the order shows in Medusa Admin.

## Pull requests

| Issue | Pull request |
| --- | --- |
| Day 1 gate | [#1](https://github.com/Tirso0882/goods/pull/1) branch protection, secret scanning, gitleaks ignore list |
| [#4](https://github.com/Tirso0882/goods/issues/4) Scaffold Medusa | [#21](https://github.com/Tirso0882/goods/pull/21), [#22](https://github.com/Tirso0882/goods/pull/22) Redis-backed services |
| [#5](https://github.com/Tirso0882/goods/issues/5) Understand before changing | [#23](https://github.com/Tirso0882/goods/pull/23) product page trace, component diagram, ADR 0005 |
| [#6](https://github.com/Tirso0882/goods/issues/6) Jewelry catalog seed | [#24](https://github.com/Tirso0882/goods/pull/24), [#26](https://github.com/Tirso0882/goods/pull/26), [#25](https://github.com/Tirso0882/goods/pull/25) |
| [#7](https://github.com/Tirso0882/goods/issues/7) Customers and orders | [#28](https://github.com/Tirso0882/goods/pull/28) |
| [#8](https://github.com/Tirso0882/goods/issues/8) Stripe happy path | [#29](https://github.com/Tirso0882/goods/pull/29) |
| [#9](https://github.com/Tirso0882/goods/issues/9) Stripe failure paths | [#30](https://github.com/Tirso0882/goods/pull/30) |
| [#10](https://github.com/Tirso0882/goods/issues/10) Runbook and gate | this commit |

## Commands and results

Gate checks, run on 10 October 2026 against `main` at `ed48706`:

| Command | Result |
| --- | --- |
| `gitleaks git --redact -v .` (gitleaks 8.30.1) | 38 commits scanned, no leaks found |
| `git log --all -- '*.env' '*.env.local'` | No commits: no env file has ever been committed |
| `rg -i 'psql\|update .* set\|insert into' README.md docs scripts apps/backend/src` | Only read queries in `scripts/reset-local-data.sh` (open connections, publishable key). No manual writes. |
| `pnpm test` | 2 suites, 9 tests passed in 47 s. Migrates and seeds a throwaway database twice and asserts product, variant, customer and per-state order counts, and that the second run changes nothing. |

Purchase evidence from earlier this week:

- Stripe test card `4242 4242 4242 4242` checked out in the browser, the order showed Captured and Not fulfilled in Admin, and a second checkout worked after a full restart of the stack ([#8](https://github.com/Tirso0882/goods/issues/8)).
- Decline, 3D Secure, invalid signature, duplicate delivery, delayed delivery and refund all pass. Details in [docs/verification/stripe-failure-paths.md](../verification/stripe-failure-paths.md).

Eval report: none yet. The agent and its eval suite start in Step 1.

## Setup 1 gate

| Gate condition | Result |
| --- | --- |
| Checkout does not depend on an undocumented manual database edit | Pass. All data comes from migrations and the seed through Medusa workflows. |
| The seed is repeatable | Pass. `pnpm test` seeds twice with no change; `pnpm reset` rebuilds the same dataset. |
| No secret in git history | Pass. gitleaks clean, env files never committed. |

Deliverables: scaffold (README), lockfile and `.env.example` files, seed, purchase evidence, [local-store runbook](../runbooks/local-store.md), this report.

## Failures found and regression tests

- The starter seed recreated its clothing products on every run. Fixed in [#26](https://github.com/Tirso0882/goods/pull/26) by not creating them at all instead of deleting them afterwards. The seed-twice test covers it.
- Product search went stale when a shared option or option value changed. Fixed in [#25](https://github.com/Tirso0882/goods/pull/25).
- Re-seeding an old local database failed after the order fixtures changed (an order already delivered could not be canceled). The fix is `pnpm reset`; it's in the runbook's troubleshooting table.
- The backend failed to boot when `pnpm dev` started before Redis. Documented in the runbook's Start order.

## Decisions

- Medusa is the commerce platform, and the agent only uses Medusa APIs ([ADR 0005](../adr/0005-medusa-as-commerce-platform.md)).
- pnpm monorepo from `create-medusa-app`, one root lockfile.
- Redis for Medusa's event bus, workflow engine, locking and cache, so local behaves like a deployment.
- The seed creates orders through Medusa's checkout and admin workflows, so every order has a real Activity history for the agent to read later.
- Stripe with `capture: true`: payments are captured at checkout, so a successful order is Captured, not Authorized.
- The seed never deletes products, so products added in Admin survive a re-seed.

## Remaining risks

- No CI yet. `pnpm test` and gitleaks only run locally. Setup 2 adds CI.
- The Stripe hook route returns 200 for badly signed events and drops them silently in a subscriber. Nothing alerts on dropped events.
- `stripe listen` drops events while stopped. Locally that needs a manual `stripe events resend`; a deployed webhook endpoint will need Stripe's own retries.
- Seed timings use the real clock, so order dates differ between runs. Counts and states are stable, dates are not.

## Learning gate

Without notes, draw the path of a checkout from browser to Stripe webhook to order state, and explain what happens on a duplicate webhook.

Result: pass, self-reported on 10 October 2026. The checkout path and duplicate webhook behavior were worked through while building and testing [#8](https://github.com/Tirso0882/goods/issues/8) and [#9](https://github.com/Tirso0882/goods/issues/9). No written drawing was recorded.

## Explain-back

Not written. Concepts covered this week: publishable key and sales channel, region and currency, the Store API product request ([docs/architecture/product-page-request.md](../architecture/product-page-request.md)), workflows in the seed, the cart completion workflow, payment sessions and payment collections, the Stripe webhook route and `payment.webhook_received` subscriber, and idempotent webhook handling ([docs/verification/stripe-failure-paths.md](../verification/stripe-failure-paths.md)).

## Hours

Not recorded.

## Next smallest task

Setup 2: run the local stack from a clean machine with Docker Compose.
