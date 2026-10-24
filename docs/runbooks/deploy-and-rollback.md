# Deploy and rollback

How a commit on `main` reaches the test store on Railway, and how to put back an earlier release. The service settings themselves are in the [Railway runbook](railway.md).

## What a release is

One commit SHA. CI's `publish` job pushes `ghcr.io/tirso0882/goods-backend:<sha>` and `ghcr.io/tirso0882/goods-storefront:<sha>`, and a release points all three services at that SHA:

| Order | Service | Image |
| --- | --- | --- |
| 1 | `medusa-server` | `goods-backend:<sha>`. Its pre-deploy command runs `medusa db:migrate`. |
| 2 | `medusa-worker` | `goods-backend:<sha>` |
| 3 | `storefront` | `goods-storefront:<sha>` |

The server goes first so the schema is migrated before the worker and storefront run new code against it. If the server's deployment doesn't reach `SUCCESS` (a failed migration, a failed health check, a crash), the script stops: the server keeps serving its old deployment, as Railway only switches traffic after the new one is healthy, and the worker and storefront are never touched.

## How it runs

`scripts/railway-deploy.sh <sha>` does the work, through Railway's public GraphQL API (`https://backboard.railway.com/graphql/v2`). The Railway CLI can't set an image tag. For each service in order it:

1. Checks first that both images exist on GHCR, so a mistyped SHA changes nothing.
2. Sets the image with `serviceInstanceUpdate(input: {source: {image: ...}})`, and on the server also the pre-deploy command (below), then reads the service back to confirm both changed. If Railway staged the change instead of applying it, deploying would ship the old settings, so the script stops.
3. Deploys with `serviceInstanceDeployV2` and polls `deployment(id) { status }` every 10 seconds until `SUCCESS`. `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED` or 20 minutes without an end stops the release.

The server's pre-deploy command is set from `MIGRATE` in the script on every release, so it's reviewed in git and an edit in the dashboard lasts only until the next deploy. It runs `medusa db:migrate --execute-safe-links --execute-safe-search`. Besides migrations, `db:migrate` syncs module link tables and the search index to what the image defines. When the database has a link table the image doesn't define, which is what a rollback past a release that added a link finds (ours, or one from a Medusa upgrade), Medusa without these flags asks in a prompt which tables to delete. Pre-deploy has no terminal, so the rollback would fail or hang until the 600-second timeout. With them it creates what's new and never deletes or changes anything unprompted. A link table left behind is unused and harmless; drop it on purpose later if the link is really gone.

`.github/workflows/deploy.yml` runs the script. The `deploy` job at the end of `ci.yml` calls it with the pushed SHA once both `publish` jobs succeed, so every merge to `main` deploys. The same workflow runs by hand for a rollback. Its concurrency group lets one release run at a time and never cancels one halfway, which could leave the server and worker on different releases.

## Railway token

| Setting | Value | Why |
| --- | --- | --- |
| Type | Project token, environment `production` (project Settings → Tokens) | The narrowest token Railway has: it reaches one environment of one project. An account token reaches every project and workspace of the account, a workspace token every project in the workspace. Project tokens use the `Project-Access-Token` header, not `Authorization: Bearer`. |
| Name | `github-actions-deploy` | Says who holds it, so it can be found and revoked. |
| Where | GitHub environment `production`, secret `RAILWAY_TOKEN` (repo Settings → Environments) | An environment secret only reaches jobs that name the environment, and the environment only accepts `main`. A repository secret would reach any workflow job, including one added in a pull request branch. |
| Deployment branches | `main` only (environment → Deployment branches and tags → Selected branches) | A workflow run from another branch can't read the token. |

The token can still do anything in `production`: read and change variables, delete services. Railway has no narrower scope. Rotate it by creating a new token, updating the secret, then deleting the old token in Railway.

### Set it up

1. In Railway, open the project → Settings → Tokens, create a token named `github-actions-deploy` for the `production` environment and copy it. It's shown once.
2. Check that it works, with no deploy:

   ```sh
   read -rs RAILWAY_TOKEN && export RAILWAY_TOKEN
   curl -sS https://backboard.railway.com/graphql/v2 \
     -H "Project-Access-Token: $RAILWAY_TOKEN" -H 'Content-Type: application/json' \
     -d '{"query":"{ projectToken { projectId environmentId } }"}'
   ```

   The `projectId` must be the one in the [Railway runbook](railway.md#project).
3. Store it, from the repo, without it reaching your shell history: `gh secret set RAILWAY_TOKEN --env production`, then paste the token. `unset RAILWAY_TOKEN` afterwards.

The `production` environment is created in repo Settings → Environments → New environment, with Deployment branches set to `main` as in the table.

## Deploy

Merge a pull request into `main`. In the CI run, `deploy / deploy` follows the two `publish` jobs; its log has one group per service with the deployment ID and status changes, and ends with `All services run <sha>`.

Check afterwards that the store runs that commit:

- Railway dashboard: each of the three services shows `...:<sha>` as its image and its latest deployment as Active.
- The checks in the [Railway runbook](railway.md): server `/ready` and `/app`, storefront `/api/health` and a page, and for a release that touches checkout, a test purchase.

To redeploy the same SHA, re-run the `deploy` job of that CI run.

## Rollback

Deploy the previous good SHA through the same workflow:

1. Find the SHA: the last green CI run on `main` before the bad one (Actions → CI → branch `main`), or `git log --first-parent main`. It must be the full 40-character SHA.
2. Actions → Deploy → Run workflow, branch `main`, paste the SHA. Or `gh workflow run deploy.yml --ref main -f sha=<sha>`.
3. Run the same checks as for a deploy.

The images stay on GHCR, so any SHA that passed `publish` can come back, unlike Railway's own Rollback button, which can only restore images Railway still keeps: 24 hours on the Trial, 72 on Hobby, 120 on Pro. That button is fine for a fast undo of the last deploy of one service, but the next CI deploy overwrites it, and it doesn't keep the three services on one SHA.

The next merge to `main` deploys again, so fix or revert the bad commit on `main` before merging anything else.

### What a rollback does not undo

- **Migrations.** The rollback deploys old code; it doesn't reverse the schema. The server's pre-deploy runs `medusa db:migrate` from the old image, which only applies migrations that old image knows and finds none pending. Old code then runs against the new schema. That works when the migration only added things (tables, nullable columns, columns with a default), and breaks when it renamed, dropped or tightened something the old code uses. The rules below keep every release on the side that works.
- **Link tables.** A link the new release added keeps its table; `--execute-safe-links` leaves it, and the old code ignores it.
- **Data.** Orders, customers and anything the new release wrote stay. Data the new code wrote in a new shape (a new status value, new metadata keys) stays in that shape, and old code has to cope with it.
- **Queued events and running workflows.** Events the new code queued in Redis and workflows it started (checkout and payment run as workflows, stored in Postgres and Redis) stay. If the old worker doesn't know an event, a workflow or one of its steps, those fail or stall.
- **Variables and settings.** Only the image and the server's pre-deploy command change. A variable added or changed for the bad release is still there; change it back by hand.
- **Side effects outside Railway.** Stripe charges and refunds, emails, R2 uploads. Stripe retries webhooks, so none are lost, but the old code receives them.

## Release rules that keep rollback safe

A rollback is only as safe as the release it undoes. These rules make "deploy the previous SHA" always work, without reading the release first.

1. **Expand, then contract.** A release only adds to the schema: new tables, nullable columns, columns with a default, new indexes. Code that stops using a column, table or link ships first; removing, renaming or tightening it (a type change, `NOT NULL`, a new unique or check constraint) ships in a later release, once the release before it no longer reads it. A rename is three releases: add the new column and write both, backfill and read the new one, drop the old one. This is required for every deploy, not only rollbacks: between the server's deployment and the worker's, the old worker runs on the new schema.
2. **The same for anything stored that old code reads.** Workflow, step and event names, and the shape of their payloads, are only added. A workflow or subscriber is removed one release after nothing starts or emits it, so the release before still knows everything in flight.
3. **CI checks every migration.** `pnpm check:migrations` (in the `lint` job) reads the `up()` of every migration `db:migrate` runs: ours in `apps/backend/src`, and the installed `@medusajs/*` packages', so a Medusa upgrade (Dependabot's `medusa` group) is checked too. A migration that drops a table or column, renames, changes a column type, sets `NOT NULL` or adds a required column without a default fails the check until it's listed in `apps/backend/migrations-reviewed.txt`. The list starts with the 52 such migrations in Medusa 2.21.2, which production ran before this check. The check doesn't see constraints, data changes or code, so rules 1 and 2 still need a reviewer.
4. **Variables are only added.** A release that needs a variable changed adds a new one and reads it, so the previous release still finds the old one. Remove the old one a release later.
5. **Drill the rollback.** After every Medusa upgrade and every release that carries a migration, roll back to the previous SHA and forward again, with the checks under Deploy. A rollback that's never run isn't a rollback path.

### Releasing a migration that breaks rollback

When `pnpm check:migrations` fails, ours or Medusa's:

1. Read each listed migration. For ours, split it per rule 1 instead if you can, and the check passes.
2. If it has to ship (a contract step, or a Medusa upgrade), check that the release before it doesn't use what it removes or tightens. For Medusa, read the release notes for the version and the migration's `up()`.
3. Run `node scripts/check-migrations.mjs --accept` and commit `migrations-reviewed.txt` in the same pull request, saying in its description which migrations and why they're safe to release.
4. Before merging, take a database backup (#19). Rolling back past this release then means restoring that backup as well as deploying the older SHA, and losing what was written after it; fixing forward is usually better.
5. Ship it alone, not with other changes, so a problem in anything else can still roll back to the release just before it.

## Results

24 October 2026, project `goods-throwaway`, environment `production`:

| What | Run | Result |
| --- | --- | --- |
| First merge (#63) | [CI 40105656548](https://github.com/Tirso0882/goods/actions/runs/40105656548) | `deploy` failed before reaching Railway: `RAILWAY_TOKEN` was empty, because a called workflow only gets an environment secret the caller passes. Fixed in #64. The store kept running `88dce76`. |
| Deploy on merge (#64), `35da4c30` | [CI 40106728751](https://github.com/Tirso0882/goods/actions/runs/40106728751) | Server, worker, storefront each `INITIALIZING` → `DEPLOYING` → `SUCCESS`, about 2 minutes in all. The project token was allowed to set the image and pre-deploy command, and Railway applied them without staging. `/ready`, `/app`, `/api/health`, `/pl` all 200. |
| Rollback to `88dce76` | [Deploy 40109100496](https://github.com/Tirso0882/goods/actions/runs/40109100496) | All three `SUCCESS` on `88dce76`. Pre-deploy ended with `Migration scripts completed`. Endpoints 200, a test purchase with `4242 4242 4242 4242` completed and showed in Admin → Orders. |
| Roll forward to `35da4c30` | [Deploy 40109563089](https://github.com/Tirso0882/goods/actions/runs/40109563089) | All three `SUCCESS`, endpoints 200. |

No app code changed between `88dce76` and `35da4c30`, so the drill proved the path (API calls, order, waiting, the token, the unprompted migrate) but not old code on a newer schema. Repeat it per rule 5 when a release changes the schema.
