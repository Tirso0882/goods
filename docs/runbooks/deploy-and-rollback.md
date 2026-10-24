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
2. Sets the image with `serviceInstanceUpdate(input: {source: {image: ...}})`, then reads the service back to confirm the image changed. If Railway staged the change instead of applying it, deploying would ship the old image, so the script stops.
3. Deploys with `serviceInstanceDeployV2` and polls `deployment(id) { status }` every 10 seconds until `SUCCESS`. `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED` or 20 minutes without an end stops the release.

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

- **Migrations.** The rollback deploys old code; it doesn't reverse the schema. The server's pre-deploy runs `medusa db:migrate` from the old image, which only applies migrations that old image knows and finds none pending. Old code then runs against the new schema. That works when the migration only added things (tables, nullable columns), and breaks when it renamed, dropped or tightened something the old code uses. Before rolling back past a migration, read it. If the old code can't run on the new schema, restore the database from the backup taken before the release instead (the restore runbook, #19), or fix forward.
- **Data.** Orders, customers and anything the new release wrote stay. Data the new code wrote in a new shape stays in that shape.
- **Variables and settings.** Only the image changes. A variable added or changed for the bad release is still there; change it back by hand.
- **Side effects outside Railway.** Stripe charges and webhooks, emails, R2 uploads.

## Results

To be filled in by the first deploy and the rollback test.
