# Containers

Process boundaries for the production images (#11). Compose (#12, `compose.yaml`, run with [the Compose runbook](../runbooks/compose-stack.md)) and Railway (Setup 2, Day 4) run these processes; this page is what they must provide.

## Images

| Image | Dockerfile | Build from repo root |
| --- | --- | --- |
| Backend (server and worker) | `apps/backend/Dockerfile` | `docker build -f apps/backend/Dockerfile -t goods-backend .` |
| Storefront | `apps/storefront/Dockerfile` | `docker build -f apps/storefront/Dockerfile -t goods-storefront .` |

Both are multi-stage on `node:24.21.0-alpine3.24`, pinned by digest, and run as the `node` user (uid 1000). The root `.dockerignore` is an allowlist: only the workspace manifests, `apps/backend` and `apps/storefront` enter the build context, and every `.env*`, `node_modules` and build output is excluded.

Neither build needs a database, a backend or a secret. The storefront image holds no publishable key, URL or Stripe key, so the same image runs in every environment.

## Published images

On every push to `main`, once format, lint, typecheck, test and build pass, the `publish` job in `.github/workflows/ci.yml` (#14) pushes both images to GHCR, tagged with the full commit SHA:

- `ghcr.io/tirso0882/goods-backend:<sha>`
- `ghcr.io/tirso0882/goods-storefront:<sha>`

There is no `latest` tag. Deploy a SHA, and roll back by deploying an older one. Images are `linux/amd64` only, the platform of Railway and of the MSI laptop; Apple Silicon runs them under emulation with `--platform linux/amd64`. The storefront is built with no build args: every URL and key comes from the container environment at start (see [Storefront configuration](#storefront-configuration)), so one published image serves local runs, Railway (#16) and any rollback.

New GHCR packages start private. Until the package is made public in its settings, run `docker login ghcr.io` with a classic personal access token that has `read:packages`. Railway deploys private images only on the Pro plan.

Pull and run a published commit. The backend example uses the local Postgres and Redis from the README:

```bash
SHA=$(git rev-parse origin/main)  # any main commit whose CI run passed
docker pull --platform linux/amd64 ghcr.io/tirso0882/goods-backend:$SHA
docker pull --platform linux/amd64 ghcr.io/tirso0882/goods-storefront:$SHA

# Optional: check the build provenance
gh attestation verify oci://ghcr.io/tirso0882/goods-backend:$SHA -R Tirso0882/goods

BACKEND_ENV=(
  -e DATABASE_URL="postgres://postgres:postgres@host.docker.internal:5432/medusa-goods?sslmode=disable"
  -e REDIS_URL=redis://host.docker.internal:6379
  -e JWT_SECRET="$(openssl rand -hex 32)" -e COOKIE_SECRET="$(openssl rand -hex 32)"
  -e STORE_CORS=http://localhost:8000 -e ADMIN_CORS=http://localhost:9000 -e AUTH_CORS=http://localhost:8000,http://localhost:9000
)
docker run --rm --platform linux/amd64 "${BACKEND_ENV[@]}" ghcr.io/tirso0882/goods-backend:$SHA ./node_modules/.bin/medusa db:migrate
docker run -d --name goods-backend-$SHA --platform linux/amd64 -p 9000:9000 "${BACKEND_ENV[@]}" ghcr.io/tirso0882/goods-backend:$SHA
docker run -d --name goods-storefront-$SHA --platform linux/amd64 -p 8000:8000 \
  -e MEDUSA_BACKEND_URL=http://host.docker.internal:9000 \
  -e MEDUSA_PUBLISHABLE_KEY=<key from the psql query under "Server and worker"> \
  -e PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000 -e PUBLIC_BASE_URL=http://localhost:8000 \
  ghcr.io/tirso0882/goods-storefront:$SHA
```

On Linux, add `--add-host=host.docker.internal:host-gateway` to each `docker run`. `curl localhost:9000/ready` and `curl localhost:8000/api/health` should both return `OK`. Admin login over plain HTTP fails in production mode (see Gotchas).

## Processes

| Process | Image and command | Port | Health check | Persistent volume | Secrets and required env |
| --- | --- | --- | --- | --- | --- |
| Medusa server | backend, default `medusa start` | 9000, published | `GET /ready` returns `OK` (Postgres answers `select 1`) | `/server/static` only if S3 is not configured | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `AUTH_MFA_ENCRYPTION_KEY`, `S3_*` keys. Also `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `MEDUSA_WORKER_MODE=server`, `DISABLE_MEDUSA_ADMIN=false`, `MEDUSA_BACKEND_URL` |
| Medusa worker | backend, default `medusa start` | 9000, internal only | `GET /health` returns `OK` and `select 1` succeeds | same as server | same secrets as server. `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true` |
| Migrate (one-off) | backend, `./node_modules/.bin/medusa db:migrate` | none | exit code 0 | none | `DATABASE_URL`, `REDIS_URL`, plus the CORS and JWT/cookie values the config reads |
| Seed (one-off) | backend, `./node_modules/.bin/medusa exec ./src/scripts/seed-jewelry.js` | none | exit code 0 | none | as migrate, plus `STRIPE_API_KEY` to enable Stripe in the region |
| Storefront | storefront, `node apps/storefront/server.js` | 8000, published | `GET /api/health` returns `OK` | none (`.next/cache` is disposable) | `MEDUSA_PUBLISHABLE_KEY` (public by design), `MEDUSA_BACKEND_URL`, `PUBLIC_MEDUSA_BACKEND_URL`, `PUBLIC_BASE_URL`, `PUBLIC_STRIPE_KEY` (public) |
| PostgreSQL + pgvector | `pgvector/pgvector:0.8.7-pg17-bookworm` | 5432, never public | `pg_isready -U postgres -d medusa-goods` | `/var/lib/postgresql/data` | `POSTGRES_PASSWORD` |
| Redis | `redis:8.10.2-alpine3.23`, `--appendonly yes` | 6379, never public | `redis-cli ping` returns `PONG` | `/data` | none locally; a password on Railway |
| Ollama | `ollama/ollama:0.40.3` | 11434, internal | `ollama list` | `/root/.ollama` (models, pulled at runtime) | none |

The last three are third-party images that #12 adds. Pin them by tag (and digest where the platform supports it), never `latest`. Ollama runs as root and has no documented non-root mode; it is the one exception to non-root runtime users.

## Health checks

Each check tests readiness, not that a process exists.

- Backend `/health`: Medusa's static `OK`, registered once every loader has finished. It means the process booted, and it stays `OK` while Postgres is down, so use it for uptime checks only. Both roles serve it.
- Backend `/ready` (server only): runs `select 1` on Medusa's Postgres connection and returns 503 with the reason when the query fails or takes longer than 3 seconds. Worker mode loads no API routes, so a worker has no `/ready`.
- The image's `HEALTHCHECK` runs `healthcheck.mjs` with `node` (no `curl` or `wget` needed). On a server it calls `/ready`. On a worker (`MEDUSA_WORKER_MODE=worker`) it calls `/health` and then runs `select 1` itself with `DATABASE_URL`. Measured in Compose: with Postgres stopped, `/ready` returned 503 within 3 seconds, both containers turned unhealthy after about 40 seconds (three failed checks), and both were healthy again 6 seconds after Postgres started, without a restart.
- Storefront: `/api/health` returns 200 only when a publishable key is configured and the backend's `/health` answers within 3 seconds. Otherwise it returns 503 with the reason. This matches what the middleware needs to render any page, so the storefront reports unhealthy while the backend is down and recovers without a restart.

## Server and worker

One backend image, two roles, chosen at runtime:

- `MEDUSA_WORKER_MODE=server`: serves HTTP and the Admin, does not run subscribers or scheduled jobs.
- `MEDUSA_WORKER_MODE=worker`: runs subscribers, scheduled jobs and workflows. With `DISABLE_MEDUSA_ADMIN=true` it does not serve the Admin (`/app` returns 404).
- Unset (local `pnpm dev`): `shared`, one process does both.

The Admin is compiled into the image at build, so `DISABLE_MEDUSA_ADMIN` must stay unset when building. Admin calls the backend on its own origin unless `MEDUSA_BACKEND_URL` is set.

Migrations never run on start. Run the migrate one-off once per release, before starting the new server and worker, so replicas never race. A fresh database gets a new publishable key from that step:

```bash
psql "$DATABASE_URL" -tAc "select token from api_key where type = 'publishable' and deleted_at is null order by created_at limit 1"
```

Compose runs that query in its `publishable-key` one-off after each migrate and hands the result to the storefront through a volume, so a fresh database needs no manual step.

## Storefront configuration

| Variable | When it is read | Purpose |
| --- | --- | --- |
| `MEDUSA_BACKEND_URL` | runtime | Backend as seen from the storefront container, e.g. `http://medusa-server:9000` |
| `MEDUSA_PUBLISHABLE_KEY` | runtime | Sent by server code, and served to the browser by `/api/store-config` |
| `PUBLIC_MEDUSA_BACKEND_URL` | runtime | Backend as seen from the browser (search, option picker), served by `/api/store-config`. Must be reachable from the user's machine |
| `PUBLIC_BASE_URL` | runtime | The storefront's public URL, for absolute URLs and metadata |
| `PUBLIC_STRIPE_KEY` | runtime | Stripe publishable key, handed to the checkout page by the server |
| `NEXT_PUBLIC_DEFAULT_REGION` | build arg, default `pl` | Region when the URL has no country. A store setting, the same everywhere |

Only the server reads the environment. The browser bundle holds no URL or key: it asks `/api/store-config` once for the backend URL and publishable key, and the checkout page receives the Stripe key from the server. Changing any runtime value needs a container restart, not a new image. Check what a running storefront serves with `curl -s <storefront>/api/store-config`.

Store pages render per request, so the build never calls the backend. Data fetches still use the Next fetch cache, which lives in the container and is cleared by recreating it.

For `pnpm dev` nothing changes: each runtime variable falls back to its `NEXT_PUBLIC_*` value in `.env.local`.

## Uploads

With `S3_BUCKET` set, the File Module uses the S3 provider (`S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET`, `S3_ENDPOINT`, and `S3_FORCE_PATH_STYLE=true` for MinIO). Without it, Medusa's local provider writes to `/server/static`, which the image creates for the `node` user. Mount a volume there on the server to keep uploads; the worker does not share it unless it mounts the same volume.

## Gotchas

- Postgres SSL: Medusa uses SSL for any database host other than `localhost`. Add `?sslmode=disable` for a database on the same private network. In Medusa 2.21.2 the `ssl_mode=disable` spelling hangs the migration connection check for 10 seconds and fails.
- Admin login with `NODE_ENV=production` over plain `http://localhost` fails, because production session cookies are `Secure` and Medusa does not set them over HTTP. Use HTTPS. Local Compose sets `INSECURE_LOCAL_COOKIES=true`, which drops the `Secure` flag. The backend only honors it when `MEDUSA_BACKEND_URL` is `http://localhost` or `http://127.0.0.1` (any port), so a deployed server keeps Secure cookies even if the flag is copied over.
- With no `PORT` and `HOST` set, Medusa listens on 9000 on all interfaces and Next on 8000 on `0.0.0.0` (`HOSTNAME` is set in the image, because Docker sets it to the container ID).
- CI publishes `linux/amd64`, which is what Railway runs and what the MSI laptop builds by default. A Mac builds `linux/arm64` by default; add `--platform linux/amd64` there to reproduce the CI build.
