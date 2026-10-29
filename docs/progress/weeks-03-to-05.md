# Weeks 3 to 5: 12 to 29 October 2026

## Steps and objectives

Setup 2: reproducible environments and deployment ([#3](https://github.com/Tirso0882/goods/issues/3)).

Objectives:

- Set up a Railway project so only the storefront and the server are public, and explain each security setting.
- Explain why Medusa needs separate server and worker instances in production.

Outcome: a clean machine runs the local stack with Docker Compose, and a GitHub release deploys the test store to Railway over HTTPS, smoke-tests it, and rolls back on failure. Backups and the restore drill moved to "Before taking real orders" on 28 October 2026 ([#19](https://github.com/Tirso0882/goods/issues/19)).

## Pull requests

| Issue | Pull request |
| --- | --- |
| [#11](https://github.com/Tirso0882/goods/issues/11) Production containers, [#12](https://github.com/Tirso0882/goods/issues/12) Local Compose, [#13](https://github.com/Tirso0882/goods/issues/13) Protected CI, [#14](https://github.com/Tirso0882/goods/issues/14) GHCR images | [#32](https://github.com/Tirso0882/goods/pull/32) |
| [#15](https://github.com/Tirso0882/goods/issues/15) Railway setup and throwaway project | [#57](https://github.com/Tirso0882/goods/pull/57) Railway and R2 chosen ([ADR 0006](../adr/0006-railway-hosts-the-test-store.md)) |
| [#16](https://github.com/Tirso0882/goods/issues/16) Test store over HTTPS | [#59](https://github.com/Tirso0882/goods/pull/59), system overview diagrams |
| [#60](https://github.com/Tirso0882/goods/issues/60) Non-production storefronts out of indexes | [#61](https://github.com/Tirso0882/goods/pull/61) |
| [#17](https://github.com/Tirso0882/goods/issues/17) Deploy trigger and tested rollback | [#63](https://github.com/Tirso0882/goods/pull/63), [#64](https://github.com/Tirso0882/goods/pull/64), [#65](https://github.com/Tirso0882/goods/pull/65) |
| [#18](https://github.com/Tirso0882/goods/issues/18) Real project from the runbook alone | [#74](https://github.com/Tirso0882/goods/pull/74), [#75](https://github.com/Tirso0882/goods/pull/75) |
| [#76](https://github.com/Tirso0882/goods/issues/76) Versioned releases, deploy on release | [#77](https://github.com/Tirso0882/goods/pull/77), [#79](https://github.com/Tirso0882/goods/pull/79), [#80](https://github.com/Tirso0882/goods/pull/80) |
| [#66](https://github.com/Tirso0882/goods/issues/66) Smoke test with automatic rollback | [#81](https://github.com/Tirso0882/goods/pull/81), [#82](https://github.com/Tirso0882/goods/pull/82), [#85](https://github.com/Tirso0882/goods/pull/85), [#87](https://github.com/Tirso0882/goods/pull/87) |
| [#20](https://github.com/Tirso0882/goods/issues/20) Setup 2 gate | this pull request |

## Commands and results

Gate checks, run on 29 October 2026 against `goods-production`, environment `production`, running release `v0.2.0` (`2afa6ec`):

| Command | Result |
| --- | --- |
| `railway status --json`, services with their image, status and domains | `medusa-server`, `medusa-worker`: `goods-backend:2afa6ec…`, `SUCCESS`. `storefront`: `goods-storefront:2afa6ec…`, `SUCCESS`. `Postgres` (`pgvector/pgvector:0.8.7-pg17-bookworm`) and `Redis` (`redis:8.10.2-alpine3.23`): `SUCCESS`. Public domains on `medusa-server` and `storefront` only. |
| Railway GraphQL `tcpProxies(serviceId, environmentId)` for every service | `[]` for all five: no TCP proxy anywhere. |
| `railway variables --service Postgres` and `--service Redis`, names matching `PUBLIC` or `PROXY` | None: `DATABASE_PUBLIC_URL` and `REDIS_PUBLIC_URL` are deleted. |
| `railway variables` on server and worker, `MEDUSA_WORKER_MODE` and `DISABLE_MEDUSA_ADMIN` | Server `server` / `false`, worker `worker` / `true`. |
| `curl $S/health`, `$S/ready`, `$F/api/health` | 200 `OK` each. |
| `gh api repos/Tirso0882/goods/branches/main/protection` | Required checks `format`, `lint`, `typecheck`, `test`, `build`, `backup`; enforced for admins. |

Evidence recorded earlier in Setup 2:

- Compose from empty volumes to a seeded store with a test checkout, data kept across container recreation, and reseeded after deleting volumes: [compose-stack runbook](../runbooks/compose-stack.md) (#12).
- Stripe test purchase over public HTTPS on `goods-production`, 26 October 2026: order confirmation, **Captured** in Admin, webhooks delivered ([Railway runbook](../runbooks/railway.md#check-a-test-purchase)).
- Rollback by SHA on `goods-throwaway` (#17) and `goods-production` (#18), by tag (#76), and the automatic rollback drill after a broken release (#66): [deploy and rollback results](../runbooks/deploy-and-rollback.md#results).
- Uptime alert tested on 26 October 2026: down and resolved emails within seconds of each change ([Railway runbook](../runbooks/railway.md#test-an-alert)).

Eval report: none yet. The agent and its eval suite start in Step 1.

## Setup 2 gate

| Gate condition | Result |
| --- | --- |
| Both server and worker are deployed | Pass. Both run `2afa6ec` in their own mode; Admin only on the server. |
| The production database is not publicly exposed | Pass. No TCP proxy, no public domain and no public URL variable on Postgres or Redis. |
| Rollback is tested | Pass. Four rollbacks through the release path, one of them automatic with different app code on each side. |

Deliverables: [Compose stack](../runbooks/compose-stack.md), protected CI, commit-SHA images in GHCR, HTTPS deployment rebuilt from the runbook as `goods-production`, the [Railway](../runbooks/railway.md) and [deploy and rollback](../runbooks/deploy-and-rollback.md) runbooks, this report.

## Failures found and fixes

- `deploy` first failed with an empty `RAILWAY_TOKEN`: a called workflow only gets an environment secret the caller passes. Fixed in #64.
- In #18 the storefront was still named `goods-storefront`, so the deploy script stopped at `No service named storefront`. A reference to a missing service resolves to nothing without an error, which had also left `STORE_CORS` empty. The runbook now fixes the service names.
- release-please wrote its manifest in a style prettier rejects, failing `format` on the first Release PR. #79 leaves the manifest out of prettier.
- The rollback drill's break was merged with a merge commit, so `v0.1.1` lists its fix twice. Squash-merge pull requests that should reach the changelog.
- Two backup test runs could share one second's folder. Fixed in #94.

## Decisions

- Railway in EU West hosts the test store, with Cloudflare R2 for files ([ADR 0006](../adr/0006-railway-hosts-the-test-store.md)).
- One backend image; `MEDUSA_WORKER_MODE` picks server or worker. Only the server migrates, as its pre-deploy command, so replicas never race.
- Storefront URLs and keys are read at runtime, not baked into the image, so one image runs in every environment.
- `/ready` checks Postgres and gates deploys and uptime; `/health` only proves the process serves HTTP.
- Deploys happen on a GitHub release (release-please), not on every merge. Each release is smoke-tested and rolled back to the previous tag when the smoke test fails.
- The deploy token is a project token for `production`, stored as a GitHub environment secret only `main` can read.
- Backups and the restore drill wait until before real orders, because the store holds only synthetic data ([#19](https://github.com/Tirso0882/goods/issues/19)).

## Remaining risks

- Old code on a newer schema has never been rolled back to: no release so far changed the schema. Drill it on the first release that does.
- The deploy token can do anything in `production`, including changing variables and deleting services. Railway has no narrower scope.
- Railway stores service logs, including client IPs, in US West for 90 days whatever the region.
- No staging environment: releases go straight to production ([#84](https://github.com/Tirso0882/goods/issues/84)).
- No backups yet ([#19](https://github.com/Tirso0882/goods/issues/19)).

## Learning gate

Without notes, list the Railway settings that keep the store safe and the reason for each.

Result: pass after one correction, on 29 October 2026.

| Setting | Answer | Verdict |
| --- | --- | --- |
| Private Postgres and Redis | Hidden from the public internet; only services inside Railway reach them, so attackers can't hit the databases directly. | Pass. Without it, the password alone would guard the data. |
| Public domains only where needed | First answer: only the storefront has one, and the worker needs none because the server calls the webhook. | Corrected. `medusa-server` also has a public domain, for three callers outside Railway: shoppers' browsers calling the Store API, the Admin in the browser, and Stripe posting webhooks. Stripe calls the server, not the other way round. The worker, Postgres and Redis have none. The storefront's own server reaches the backend over the private network through `MEDUSA_BACKEND_URL`. That part was right. |
| Secrets as variables | Keeps credentials out of the code and git history. | Pass. The repo is public, so a committed secret would be readable by anyone. |
| Scoped tokens | Least privilege: a leaked token reaches only one environment and its actions. | Pass. |
| Account 2FA | A stolen password alone can't sign in and change production. | Pass. Railway also asks for the code before destructive actions. |

## Explain-back

The learning gate answers above, in the learner's words, are the explain-back for the first objective. The second objective, why Medusa needs separate server and worker instances, was not explained back.

## Hours

Not recorded.

## Next smallest task

Step 1: create `docs/design.md` from the design checklist.
