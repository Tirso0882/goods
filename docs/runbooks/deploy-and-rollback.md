# Deploy and rollback

How a release of `main` reaches the store on Railway, and how to put back an earlier one. The service settings themselves are in the [Railway runbook](railway.md).

## What a release is

A version (`v0.1.0`), its changelog, and one commit SHA. Every push to `main` runs CI's `publish` job, which pushes `ghcr.io/tirso0882/goods-backend:<sha>` and `ghcr.io/tirso0882/goods-storefront:<sha>`, but only a release deploys. A release points all three services at its SHA:

| Order | Service | Image |
| --- | --- | --- |
| 1 | `medusa-server` | `goods-backend:<sha>`. Its pre-deploy command runs `medusa db:migrate`. |
| 2 | `medusa-worker` | `goods-backend:<sha>` |
| 3 | `storefront` | `goods-storefront:<sha>` |

The server goes first so the schema is migrated before the worker and storefront run new code against it. If the server's deployment doesn't reach `SUCCESS` (a failed migration, a failed health check, a crash), the script stops: the server keeps serving its old deployment, as Railway only switches traffic after the new one is healthy, and the worker and storefront are never touched.

The whole shop has one version: server, worker and storefront are released together, so they never need versions of their own. It starts at `0.1.0`. Below `1.0.0`, a feature bumps the minor version (`0.1.0` → `0.2.0`), a fix or performance change the patch (`0.2.0` → `0.2.1`), and a breaking change also only the minor.

## Releases

[release-please](https://github.com/googleapis/release-please) (googleapis/release-please-action, configured in `release-please-config.json`) runs as the `release` job in `ci.yml`, after both `publish` jobs on every push to `main`:

```text
merge a pull request into main
  CI: checks → publish goods-*:<sha> → release
    opens or updates the Release PR: next version, CHANGELOG.md entries
    no deploy

merge the Release PR
  CI: checks → publish goods-*:<sha> → release
    tags v<version>, publishes the GitHub Release with the changelog
  → deploy <sha> → smoke
    on a smoke failure: rollback target → rollback (deploy the release before) → smoke after rollback
```

The Release PR is a normal pull request titled `chore(main): release <version>`, on the branch `release-please--branches--main`. It changes only `CHANGELOG.md` and `.release-please-manifest.json`, and release-please rewrites it after every merge, so its changelog always lists what merging it would release. It runs the required checks like any pull request.

### Cut a release

1. Open the Release PR (Pull requests, label `autorelease: pending`) and read the changelog and the version. If it has a migration, follow [Releasing a migration that breaks rollback](#releasing-a-migration-that-breaks-rollback) first.
2. Merge it when the checks pass.
3. In that merge's CI run, `release` publishes the GitHub Release, then `deploy / deploy` deploys it and `smoke` checks the store (see [Deploy](#deploy)).

Nothing has to be released at once. Merges pile up in the Release PR until you merge it.

### Commits that reach the changelog

release-please reads the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) that reach `main` since the last release. With a squash merge that is one commit per pull request, whose message is the PR title, so the PR title is what counts; with a merge commit, each commit of the branch.

| Type | Changelog section | Version bump below 1.0 |
| --- | --- | --- |
| `feat` | Features | minor |
| `fix` | Bug Fixes | patch |
| `perf` | Performance | patch |
| `docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style`, `revert` | not listed | none |
| any type with `!` (`feat!:`) or a `BREAKING CHANGE:` footer | its type's section, flagged breaking | minor |

The notes are for developers. Write the subject as what changed for someone using the shop or the code: `feat(checkout): pay with BLIK`, `fix(storefront): keep the cart after sign-in`. A commit that isn't a Conventional Commit, such as `Merge pull request #64 …`, is skipped. Only hidden types since the last release means no new version: the Release PR stays as it is, or isn't opened.

To release a different version than the commits give, add `Release-As: 1.0.0` as a footer in a commit's message.

### Hotfixes

A fix is still a release. Merge the fix (`fix(...)`) into `main`, then merge the Release PR, which now holds it as a patch. Everything merged since the last release goes out with it; if something else in there isn't ready, revert it on `main` first, or roll back (below) while you prepare the fix.

### Release token

release-please opens the Release PR and pushes tags with a token from the GitHub App `goods-releases-tirso`, not the workflow's `GITHUB_TOKEN`. GitHub doesn't start workflows for events made with `GITHUB_TOKEN`, so a Release PR opened with it would never run the checks and couldn't be merged under branch protection.

| Setting | Value | Why |
| --- | --- | --- |
| App | `goods-releases-tirso` (your settings → Developer settings → GitHub Apps), webhook off, installable only on this account | Only mints tokens, so it needs no webhook and no user authorization. |
| Repository permissions | Contents, Pull requests and Issues: read and write | Release commits, tags and releases; the Release PR; its labels, through the issues API. |
| Installed on | `goods` only | |
| Where | Repository variable `RELEASE_APP_CLIENT_ID` (the Client ID isn't secret), repository secret `RELEASE_APP_PRIVATE_KEY` | `actions/create-github-app-token` mints an installation token per run that lasts one hour, so nothing expires. |

To rotate the key: generate a new private key in the app's settings, `gh secret set RELEASE_APP_PRIVATE_KEY < key.pem`, delete the file, then delete the old key in the app's settings.

A fine-grained personal token would also work, but it expires within a year, breaking releases until it's renewed, and everything it does shows up as you.

## How it runs

`scripts/railway-deploy.sh <sha>` does the work, through Railway's public GraphQL API (`https://backboard.railway.com/graphql/v2`). The Railway CLI can't set an image tag. For each service in order it:

1. Checks first that both images exist on GHCR, so a mistyped SHA changes nothing.
2. Sets the image with `serviceInstanceUpdate(input: {source: {image: ...}})`, and on the server also the pre-deploy command (below), then reads the service back to confirm both changed. If Railway staged the change instead of applying it, deploying would ship the old settings, so the script stops.
3. Deploys with `serviceInstanceDeployV2` and polls `deployment(id) { status }` every 10 seconds until `SUCCESS`. `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED` or 20 minutes without an end stops the release.

The server's pre-deploy command is set from `MIGRATE` in the script on every release, so it's reviewed in git and an edit in the dashboard lasts only until the next deploy. It runs `medusa db:migrate --execute-safe-links --execute-safe-search`. Besides migrations, `db:migrate` syncs module link tables and the search index to what the image defines. When the database has a link table the image doesn't define, which is what a rollback past a release that added a link finds (ours, or one from a Medusa upgrade), Medusa without these flags asks in a prompt which tables to delete. Pre-deploy has no terminal, so the rollback would fail or hang until the 600-second timeout. With them it creates what's new and never deletes or changes anything unprompted. A link table left behind is unused and harmless; drop it on purpose later if the link is really gone.

`.github/workflows/deploy.yml` runs the script. The `deploy` job at the end of `ci.yml` calls it with the pushed SHA only when the `release` job reports a release created, so a merge that isn't the Release PR builds and publishes images but doesn't deploy. The same workflow runs by hand for a rollback, with a release tag or a SHA; it turns a tag into its commit SHA before calling the script. Its concurrency group lets one release run at a time and never cancels one halfway, which could leave the server and worker on different releases.

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

Merge the Release PR ([Cut a release](#cut-a-release)). In the CI run, `deploy / deploy` follows `release`; its log has one group per service with the deployment ID and status changes, and ends with `All services run <sha>`. In the CI run of any other merge, `deploy` shows as skipped.

Then `smoke` runs the [smoke test](#smoke-test). Green means the store works on the new release. Red means it doesn't, and the [automatic rollback](#automatic-rollback) has put back the release before it, or says why it didn't.

Check by hand what the smoke test doesn't:

- Railway dashboard: each of the three services shows `...:<sha>` as its image and its latest deployment as Active.
- Server `/app` (the Admin) from the [Railway runbook](railway.md), and for a release that touches checkout, a test purchase ([Check a test purchase](railway.md#check-a-test-purchase)).

To redeploy the same release, re-run the `deploy` job of that CI run, or run Deploy by hand with its tag. Neither runs the smoke test: run it by hand (below).

## Smoke test

Railway only switches traffic to a deployment that passes its health check, so a migration, start or health check that fails keeps the old release serving. What that misses is a release that deploys fine and then breaks the store: pages error, the Store API returns 500s. `scripts/smoke-test.sh` checks that from the outside, the way a shopper reaches the store:

| Check | Passes when |
| --- | --- |
| Storefront `/api/store-config` | 200 with the server's URL and the publishable key. The other checks use these, so the Store API is called with the key the storefront really uses. |
| Server `/ready` | 200: the server answers and reaches Postgres. |
| Storefront `/api/health` | 200: the storefront has its key and reaches the server. |
| Storefront `/pl/categories/rings` | 200 with links to products. A category page renders its products on the server; `/store` loads them in the browser, so its HTML has none. |
| Store API `/store/products?limit=1&fields=id` with `x-publishable-api-key` | 200 with at least one product. |

Each check tries 5 times, 3 seconds apart, with 10 seconds per request: enough for a fresh deployment to warm up, short enough that a broken store fails the test within a minute or so (about 5 minutes if every request hangs) and the rollback starts. All checks run even after one fails, so the log shows everything that's broken, as `::error::` lines.

The `smoke` job in `ci.yml` runs it after `deploy`, against `STOREFRONT_URL` at the top of `ci.yml`. Run it by hand after a deploy or rollback from the Deploy workflow, which doesn't run it:

```sh
scripts/smoke-test.sh https://goods-storefront-production.up.railway.app
```

### Why there's no test checkout

A scripted checkout (cart, shipping, Stripe test payment, order) would test the flow that matters most, and the smoke test doesn't do it:

- **It writes to the store every release.** Each run leaves an order in Admin, a payment in Stripe's test dashboard and an inventory reservation on a seeded product, until the stock runs out and the smoke test fails on its own data.
- **It fails for reasons a rollback can't fix.** A Stripe outage or a declined test payment would roll back a good release; the previous release fails the same way.
- **The other checks cover most of what it shares with them.** The Store API call proves the server, Postgres, the publishable key and its sales channel; the category page proves the storefront renders from the Store API.

Checkout code changes rarely and on purpose, so a release that touches it gets a test purchase by hand, as under [Deploy](#deploy). Revisit this if the store gets a separate test environment, where test orders don't matter.

## Automatic rollback

When `smoke` fails, CI rolls back on its own, once:

1. `rollback target` runs `scripts/rollback-target.sh <sha>`. It finds the previous release, the nearest `v*` tag before this commit, and checks that rolling back to it is safe.
2. `rollback / deploy` deploys that tag through the Deploy workflow, the same path as a manual rollback.
3. `smoke after rollback` runs the smoke test against it.

`smoke` stays red either way, so the run is red and the bad release is noticed. Then fix or revert it on `main` before releasing again ([Hotfixes](#hotfixes)).

It doesn't roll back when:

- **The release accepted a migration that breaks rollback.** If `apps/backend/migrations-reviewed.txt` gained a line since the previous release, `rollback target` fails and names the migrations. Old code may not survive that schema ([Releasing a migration that breaks rollback](#releasing-a-migration-that-breaks-rollback)): fix forward, or restore the backup and deploy the previous release by hand.
- **There's no previous release.** The first release (`v0.1.0`) has nothing to go back to.
- **`deploy` failed.** Railway kept serving the old deployment of the service that failed, and the services after it weren't touched, so there's nothing the smoke test can judge. Re-run `deploy` or roll back by hand.

It rolls back at most once. If `smoke after rollback` fails too, the failure is probably outside the release (Railway, the database, the network), and nothing rolls the rollback back. The store is left on the previous release; find the cause before deploying anything.

"Previous release" is the tag before this one, even if that release was itself rolled back. Rolling back to a release that was bad makes `smoke after rollback` fail; then roll back by hand to the last release whose `smoke` passed.

## Rollback

Deploy the previous good release through the same workflow:

1. Find it: Releases on GitHub, or `gh release list`. Use the tag, such as `v0.1.0`.
2. Actions → Deploy → Run workflow, branch `main`, enter the tag. Or `gh workflow run deploy.yml --ref main -f release=v0.1.0`.
3. Run the [smoke test](#smoke-test) by hand, and the other checks under [Deploy](#deploy).

The Deploy workflow also takes a full 40-character commit SHA, for any commit whose CI run passed `publish`, released or not. Prefer tags: a tag is a version someone read the changelog of.

The images stay on GHCR, so any release can come back, unlike Railway's own Rollback button, which can only restore images Railway still keeps: 24 hours on the Trial, 72 on Hobby, 120 on Pro. That button is fine for a fast undo of the last deploy of one service, but the next deploy overwrites it, and it doesn't keep the three services on one SHA.

Merging to `main` doesn't deploy anymore, but the Release PR now holds the bad change. Fix or revert it on `main` before merging the Release PR again ([Hotfixes](#hotfixes)).

### What a rollback does not undo

- **Migrations.** The rollback deploys old code; it doesn't reverse the schema. The server's pre-deploy runs `medusa db:migrate` from the old image, which only applies migrations that old image knows and finds none pending. Old code then runs against the new schema. That works when the migration only added things (tables, nullable columns, columns with a default), and breaks when it renamed, dropped or tightened something the old code uses. The rules below keep every release on the side that works.
- **Link tables.** A link the new release added keeps its table; `--execute-safe-links` leaves it, and the old code ignores it.
- **Data.** Orders, customers and anything the new release wrote stay. Data the new code wrote in a new shape (a new status value, new metadata keys) stays in that shape, and old code has to cope with it.
- **Queued events and running workflows.** Events the new code queued in Redis and workflows it started (checkout and payment run as workflows, stored in Postgres and Redis) stay. If the old worker doesn't know an event, a workflow or one of its steps, those fail or stall.
- **Variables and settings.** Only the image and the server's pre-deploy command change. A variable added or changed for the bad release is still there; change it back by hand.
- **Side effects outside Railway.** Stripe charges and refunds, emails, R2 uploads. Stripe retries webhooks, so none are lost, but the old code receives them.

## Release rules that keep rollback safe

A rollback is only as safe as the release it undoes. These rules make "deploy the previous release" always work, without reading the release first.

1. **Expand, then contract.** A release only adds to the schema: new tables, nullable columns, columns with a default, new indexes. Code that stops using a column, table or link ships first; removing, renaming or tightening it (a type change, `NOT NULL`, a new unique or check constraint) ships in a later release, once the release before it no longer reads it. A rename is three releases: add the new column and write both, backfill and read the new one, drop the old one. This is required for every deploy, not only rollbacks: between the server's deployment and the worker's, the old worker runs on the new schema.
2. **The same for anything stored that old code reads.** Workflow, step and event names, and the shape of their payloads, are only added. A workflow or subscriber is removed one release after nothing starts or emits it, so the release before still knows everything in flight.
3. **CI checks every migration.** `pnpm check:migrations` (in the `lint` job) reads the `up()` of every migration `db:migrate` runs: ours in `apps/backend/src`, and the installed `@medusajs/*` packages', so a Medusa upgrade (Dependabot's `medusa` group) is checked too. A migration that drops a table or column, renames, changes a column type, sets `NOT NULL` or adds a required column without a default fails the check until it's listed in `apps/backend/migrations-reviewed.txt`. The list starts with the 52 such migrations in Medusa 2.21.2, which production ran before this check. The check doesn't see constraints, data changes or code, so rules 1 and 2 still need a reviewer.
4. **Variables are only added.** A release that needs a variable changed adds a new one and reads it, so the previous release still finds the old one. Remove the old one a release later.
5. **Drill the rollback.** After every Medusa upgrade and every release that carries a migration, roll back to the previous release and forward again, with the checks under Deploy. A rollback that's never run isn't a rollback path.

### Drill the automatic rollback

Proves the smoke test catches a broken release and CI puts back the one before it, with different app code on each side. It takes two releases.

1. Merge a pull request titled `fix(storefront): break the category page for the rollback drill` (a `fix` so it releases) that makes `/pl/categories/[...category]` throw, such as `throw new Error("rollback drill")` at the top of its page component. Nothing else in it, and no migration.
2. Merge the Release PR. In that CI run: `deploy` green, `smoke` red on `storefront /pl/categories/rings lists products`, `rollback target` prints the previous tag, `rollback / deploy` and `smoke after rollback` green.
3. Check that the three Railway services show the previous release's SHA and that a category page lists products.
4. Revert the drill pull request (`fix(storefront): revert the rollback drill`) and release it. Its `smoke` must pass. The drill's own release stays in the changelog and on GitHub; don't roll back to it.

Record the run in [Results](#results).

### Releasing a migration that breaks rollback

When `pnpm check:migrations` fails, ours or Medusa's:

1. Read each listed migration. For ours, split it per rule 1 instead if you can, and the check passes.
2. If it has to ship (a contract step, or a Medusa upgrade), check that the release before it doesn't use what it removes or tightens. For Medusa, read the release notes for the version and the migration's `up()`.
3. Run `node scripts/check-migrations.mjs --accept` and commit `migrations-reviewed.txt` in the same pull request, saying in its description which migrations and why they're safe to release.
4. Before merging the Release PR that carries it, take a database backup (#19). Rolling back past this release then means restoring that backup as well as deploying the older release, and losing what was written after it; fixing forward is usually better. The [automatic rollback](#automatic-rollback) is off for this release for the same reason.
5. Release it alone: merge the pending Release PR first, then merge this pull request and release it before merging anything else, so a problem in anything else can still roll back to the release just before it.

## Results

24 October 2026, project `goods-throwaway`, environment `production`:

| What | Run | Result |
| --- | --- | --- |
| First merge (#63) | [CI 40105656548](https://github.com/Tirso0882/goods/actions/runs/40105656548) | `deploy` failed before reaching Railway: `RAILWAY_TOKEN` was empty, because a called workflow only gets an environment secret the caller passes. Fixed in #64. The store kept running `88dce76`. |
| Deploy on merge (#64), `35da4c30` | [CI 40106728751](https://github.com/Tirso0882/goods/actions/runs/40106728751) | Server, worker, storefront each `INITIALIZING` → `DEPLOYING` → `SUCCESS`, about 2 minutes in all. The project token was allowed to set the image and pre-deploy command, and Railway applied them without staging. `/ready`, `/app`, `/api/health`, `/pl` all 200. |
| Rollback to `88dce76` | [Deploy 40109100496](https://github.com/Tirso0882/goods/actions/runs/40109100496) | All three `SUCCESS` on `88dce76`. Pre-deploy ended with `Migration scripts completed`. Endpoints 200, a test purchase with `4242 4242 4242 4242` completed and showed in Admin → Orders. |
| Roll forward to `35da4c30` | [Deploy 40109563089](https://github.com/Tirso0882/goods/actions/runs/40109563089) | All three `SUCCESS`, endpoints 200. |

No app code changed between `88dce76` and `35da4c30`, so the drill proved the path (API calls, order, waiting, the token, the unprompted migrate) but not old code on a newer schema. Repeat it per rule 5 when a release changes the schema.

26 October 2026, project `goods-production`, environment `production`, with a new `RAILWAY_TOKEN` (#18):

| What | Run | Result |
| --- | --- | --- |
| Deploy on merge (#74), `93c458d` | [CI 40300883813](https://github.com/Tirso0882/goods/actions/runs/40300883813) | First attempt: server and worker `SUCCESS`, then `No service named storefront in this environment`: the service was still named `goods-storefront`. The script stopped as designed, leaving the storefront on `2f9956ed` (same app code). After renaming it `storefront`, the re-run deployed all three. Endpoints 200, CORS exact origin. |
| Rollback to `2f9956ed` | [Deploy 40302731944](https://github.com/Tirso0882/goods/actions/runs/40302731944) | All three `SUCCESS`, about 40 seconds. `/ready`, `/app`, `/api/health`, `/pl` all 200. |
| Roll forward to `93c458d` | [Deploy 40303047194](https://github.com/Tirso0882/goods/actions/runs/40303047194) | All three `SUCCESS`, endpoints 200, CORS exact origin. |

As on 24 October, no app code changed between the two SHAs, so this proved the path on the real project, not old code on a newer schema.
