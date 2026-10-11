# Containers

Process boundaries for the production images (#11). Compose (#12) and the VPS (Setup 2, Day 4) run these processes; this page is what they must provide.

## Images

| Image | Dockerfile | Build from repo root |
| --- | --- | --- |
| Backend (server and worker) | `apps/backend/Dockerfile` | `docker build -f apps/backend/Dockerfile -t goods-backend .` |
| Storefront | `apps/storefront/Dockerfile` | `docker build -f apps/storefront/Dockerfile -t goods-storefront .` |

Both are multi-stage on `node:24.21.0-alpine3.24`, pinned by digest, and run as the `node` user (uid 1000). The root `.dockerignore` is an allowlist: only the workspace manifests, `apps/backend` and `apps/storefront` enter the build context, and every `.env*`, `node_modules` and build output is excluded.

Neither build needs a database, a backend or a secret. The storefront image holds no publishable key.

## Published images

On every push to `main`, once format, lint, typecheck, test and build pass, the `publish` job in `.github/workflows/ci.yml` (#14) pushes both images to GHCR, tagged with the full commit SHA:

- `ghcr.io/tirso0882/goods-backend:<sha>`
- `ghcr.io/tirso0882/goods-storefront:<sha>`

There is no `latest` tag. Deploy a SHA, and roll back by deploying an older one. Images are `linux/amd64` only, the VPS platform; Apple Silicon runs them under emulation with `--platform linux/amd64`. The storefront is built with no build args, so it has the Dockerfile defaults (browser backend `http://localhost:9000`, base URL `http://localhost:8000`, region `pl`, no Stripe key). The deployed store needs its public URLs passed as build args in that job (#16).

New GHCR packages start private. Until the package is made public in its settings, run `docker login ghcr.io` with a classic personal access token that has `read:packages`.

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
  ghcr.io/tirso0882/goods-storefront:$SHA
```

On Linux, add `--add-host=host.docker.internal:host-gateway` to each `docker run`. `curl localhost:9000/health` and `curl localhost:8000/api/health` should both return `OK`. Admin login over plain HTTP fails in production mode (see Gotchas).

## Processes

| Process | Image and command | Port | Health check | Persistent volume | Secrets and required env |
| --- | --- | --- | --- | --- | --- |
| Medusa server | backend, default `medusa start` | 9000, published | `GET /health` returns `OK` | `/server/static` only if S3 is not configured | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `AUTH_MFA_ENCRYPTION_KEY`, `S3_*` keys. Also `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `MEDUSA_WORKER_MODE=server`, `DISABLE_MEDUSA_ADMIN=false`, `MEDUSA_BACKEND_URL` |
| Medusa worker | backend, default `medusa start` | 9000, internal only | `GET /health` returns `OK` | same as server | same secrets as server. `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true` |
| Migrate (one-off) | backend, `./node_modules/.bin/medusa db:migrate` | none | exit code 0 | none | `DATABASE_URL`, `REDIS_URL`, plus the CORS and JWT/cookie values the config reads |
| Seed (one-off) | backend, `./node_modules/.bin/medusa exec ./src/scripts/seed-jewelry.js` | none | exit code 0 | none | as migrate, plus `STRIPE_API_KEY` to enable Stripe in the region |
| Storefront | storefront, `node apps/storefront/server.js` | 8000, published | `GET /api/health` returns `OK` | none (`.next/cache` is disposable) | `MEDUSA_PUBLISHABLE_KEY` (public by design), `MEDUSA_BACKEND_URL` |
| PostgreSQL + pgvector | `pgvector/pgvector:0.8.7-pg17-bookworm` | 5432, never public | `pg_isready -U postgres -d medusa-goods` | `/var/lib/postgresql/data` | `POSTGRES_PASSWORD` |
| Redis | `redis:8.10.2-alpine3.23`, `--appendonly yes` | 6379, never public | `redis-cli ping` returns `PONG` | `/data` | none locally; a password on the VPS |
| Ollama | `ollama/ollama:0.40.3` | 11434, internal | `ollama list` | `/root/.ollama` (models, pulled at runtime) | none |

The last three are third-party images that #12 adds. Pin them by tag (and digest where the platform supports it), never `latest`. Ollama runs as root and has no documented non-root mode; it is the one exception to non-root runtime users.

## Health checks

Each check tests readiness, not that a process exists.

- Backend: Medusa registers `/health` only after every loader has finished, which includes connecting to Postgres and Redis. The worker serves it too. The image's `HEALTHCHECK` calls it with `node`, so it works without `curl` or `wget`.
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

## Storefront configuration

| Variable | When it is read | Purpose |
| --- | --- | --- |
| `MEDUSA_BACKEND_URL` | runtime, server only | Backend as seen from the storefront container, e.g. `http://medusa-server:9000` |
| `MEDUSA_PUBLISHABLE_KEY` | runtime, server only | Sent by server code, and served to the browser by `/api/store-config` |
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | build arg | Backend as seen from the browser (search, option picker). Must be reachable from the user's machine |
| `NEXT_PUBLIC_DEFAULT_REGION` | build arg, default `pl` | Region when the URL has no country |
| `NEXT_PUBLIC_BASE_URL` | build arg | Absolute URLs and metadata |
| `NEXT_PUBLIC_STRIPE_KEY` | build arg | Stripe publishable key (public) |

`NEXT_PUBLIC_*` values are inlined into the bundles, so changing one means a new image. Without a backend at build, product, category and collection pages are not prerendered and render per request. Their data fetches still use the Next fetch cache, which lives in the container and is cleared by recreating it.

For `pnpm dev` nothing changes: the server-only variables fall back to the `NEXT_PUBLIC_*` values in `.env.local`.

## Uploads

With `S3_BUCKET` set, the File Module uses the S3 provider (`S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET`, `S3_ENDPOINT`, and `S3_FORCE_PATH_STYLE=true` for MinIO). Without it, Medusa's local provider writes to `/server/static`, which the image creates for the `node` user. Mount a volume there on the server to keep uploads; the worker does not share it unless it mounts the same volume.

## Gotchas

- Postgres SSL: Medusa uses SSL for any database host other than `localhost`. Add `?sslmode=disable` for a database on the same private network. In Medusa 2.21.2 the `ssl_mode=disable` spelling hangs the migration connection check for 10 seconds and fails.
- Admin login with `NODE_ENV=production` over plain `http://localhost` fails, because production cookies are secure. Use HTTPS, or a local-only cookie override (#12).
- With no `PORT` and `HOST` set, Medusa listens on 9000 on all interfaces and Next on 8000 on `0.0.0.0` (`HOSTNAME` is set in the image, because Docker sets it to the container ID).
- The Mac builds `linux/arm64` images by default; the VPS is likely `linux/amd64`, which is what CI publishes. To reproduce the CI build locally, add `--platform linux/amd64`.
