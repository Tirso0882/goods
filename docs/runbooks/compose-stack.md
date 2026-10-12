# Compose stack runbook

How to run the whole store in Docker Compose, from a fresh clone to a seeded store with a Stripe test checkout. Everything runs from the production images in [containers.md](../architecture/containers.md). For day-to-day coding with hot reload, use `pnpm dev` and the [local store runbook](local-store.md) instead.

Synthetic data and Stripe test mode only. Never point this stack at a shared or production database.

| Service | What it is | Reach it at |
| --- | --- | --- |
| `medusa-server` | Store API and Admin (`MEDUSA_WORKER_MODE=server`) | http://localhost:9000/app, http://localhost:9000/ready |
| `medusa-worker` | Subscribers, scheduled jobs, workflows (`worker`, no Admin) | internal only |
| `storefront` | Next.js storefront | http://localhost:8000/pl |
| `postgres` | PostgreSQL 17 with pgvector, database `medusa-goods` | `docker compose exec postgres psql -U postgres -d medusa-goods` |
| `redis` | Redis with append-only persistence | `docker compose exec redis redis-cli` |
| `ollama` | Ollama on CPU | `docker compose exec ollama ollama list` |
| `medusa-migrate` | One-off: `medusa db:migrate`, runs on every `up` | logs only |
| `publishable-key` | One-off: copies the publishable key into a volume for the storefront | logs only |
| `medusa-seed`, `medusa-admin-user`, `ollama-pull` | One-offs in the `setup` profile, run by hand | logs only |

The ports above are the defaults from `MEDUSA_PORT` and `STOREFRONT_PORT`, bound to `127.0.0.1`. Postgres, Redis and Ollama publish no host ports, so the stack can run next to the `goods-postgres` and `goods-redis` containers. Its project name is `goods-stack`, so its containers and volumes (`goods-stack_pgdata` and so on) never touch the `pnpm dev` ones.

## First run

Needs Docker Desktop (or Docker Engine with Compose v2) with at least 8 GB of memory for Docker. Run from the repo root.

1. Create the env file and fill in the secrets:

   ```bash
   cp .env.example .env
   openssl rand -hex 16   # POSTGRES_PASSWORD
   openssl rand -hex 32   # JWT_SECRET, run again for COOKIE_SECRET
   ```

   Also set `ADMIN_PASSWORD`. For Stripe, set `STRIPE_API_KEY` (`sk_test_...`), `PUBLIC_STRIPE_KEY` (`pk_test_...`) and `STRIPE_WEBHOOK_SECRET` (see [Stripe test checkout](#stripe-test-checkout)). If `pnpm dev` is using 9000 and 8000, change `MEDUSA_PORT` and `STOREFRONT_PORT`.

2. Build the images and start the stack. The first build takes a few minutes.

   ```bash
   docker compose up -d --build --wait
   ```

   This starts Postgres and Redis, runs the migrations (which create the starter data and a publishable key), starts the server and worker, copies the key for the storefront, and starts the storefront. `--wait` returns once every service is healthy.

3. Seed the jewelry store and create the admin user:

   ```bash
   docker compose run --rm medusa-seed
   docker compose run --rm medusa-admin-user
   ```

   The seed adds the Poland region (PLN, 23% VAT), shipping, the 16-product catalog with stock, 10 synthetic customers and 12 orders. It enables Stripe in the region when `STRIPE_API_KEY` is set. It is safe to re-run.

4. Pull the Ollama model (`OLLAMA_MODEL`, default `nemotron-3-nano:4b`, the roadmap model, 2.8 GB) into the `ollama` volume:

   ```bash
   docker compose run --rm ollama-pull
   docker compose exec ollama ollama run nemotron-3-nano:4b "Say hello in Polish"
   ```

   On a slow machine, or with little memory for Docker, set `OLLAMA_MODEL=qwen3:0.6b` (about 520 MB) in `.env` first and use that name in the `ollama run` line.

Check it worked:

```bash
curl -s localhost:9000/ready           # OK, Postgres answers
curl -s localhost:8000/api/health      # OK
docker compose exec postgres psql -U postgres -d medusa-goods -c \
  "select (select count(*) from product where deleted_at is null) as products,
          (select count(*) from customer where deleted_at is null) as customers,
          (select count(*) from \"order\" where deleted_at is null) as orders"
```

A freshly seeded store shows 16 products, 10 customers and 12 orders. Then open http://localhost:8000/pl and http://localhost:9000/app (log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`).

## Publishable key

Nothing to copy. Every fresh database gets a new key from the migration. On each `up`, the `publishable-key` service reads it from Postgres and writes it to the `publishable-key` volume, and the storefront reads it from there when it starts. Check which key, backend URL and Stripe key the storefront hands to the browser with `curl -s localhost:8000/api/store-config`.

To force a specific key instead, set `MEDUSA_PUBLISHABLE_KEY` in `.env` and run `docker compose up -d --wait`.

## Stripe test checkout

1. Set the three Stripe values in `.env` (test mode only), then run `docker compose up -d --wait` so the server, worker and storefront read them. No rebuild: the storefront reads `PUBLIC_STRIPE_KEY` at start.
2. Forward webhooks to the Compose server (use your `MEDUSA_PORT`):

   ```bash
   stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe \
     --events payment_intent.created,payment_intent.processing,payment_intent.canceled,payment_intent.payment_failed,payment_intent.requires_action,payment_intent.amount_capturable_updated,payment_intent.partially_funded,payment_intent.succeeded
   ```

   Its `whsec_...` goes into `STRIPE_WEBHOOK_SECRET`. It is the same secret `pnpm dev` uses on this machine. After changing it, run `docker compose up -d --wait` so the server and worker pick it up. The worker processes the webhook (`payment.webhook_received`).

3. If the seed ran before the Stripe key was set, run `docker compose run --rm medusa-seed` again.
4. Check out at http://localhost:8000/pl in Chrome with `4242 4242 4242 4242`, any future date, any CVC. The order shows in Admin as Captured and Not fulfilled. The other test cards are in the [local store runbook](local-store.md#purchase).

## Stop and start

```bash
docker compose stop            # keeps containers and data
docker compose up -d --wait    # start again; migrations re-run and do nothing new
```

## Recreate containers, keep data

```bash
docker compose down
docker compose up -d --wait
```

Products, customers, orders, the admin user, the publishable key and Admin sessions all survive, because they live in the named volumes.

## Update after a code change

```bash
docker compose up -d --build --wait
```

The migrate service runs before the new server and worker start. Changing only `.env` values, such as `MEDUSA_PORT`, `STOREFRONT_PORT` or `PUBLIC_STRIPE_KEY`, needs no rebuild: `docker compose up -d --wait` recreates the containers that use them.

## Reset to a fresh store

Deletes every volume of this stack, including the Ollama model, then rebuilds the same store:

```bash
docker compose --profile setup down -v
docker compose up -d --wait
docker compose run --rm medusa-seed
docker compose run --rm medusa-admin-user
docker compose run --rm ollama-pull
```

To keep the downloaded model, remove only the store volumes instead of using `-v`:

```bash
docker compose --profile setup down
docker volume rm goods-stack_pgdata goods-stack_redisdata goods-stack_publishable-key goods-stack_medusa-static
```

`--profile setup` also removes any stopped one-off containers. `down -v` only removes this project's volumes; it never touches `goods-pgdata` or `goods-redisdata`.

## When Postgres or Redis goes away

The server and worker have `restart: unless-stopped` and do not need it for short outages:

- Redis stopped for 20 seconds: both kept running and healthy, logged reconnect attempts, and served the Store API from Postgres meanwhile. After Redis came back, new carts were created and the worker processed their events.
- Postgres stopped for 20 seconds: both kept running. Store API requests hang until Postgres returns, then everything answers again within about 5 seconds.
- Postgres stopped for longer: `curl -s localhost:9000/ready` returned 503 (`postgres: no answer within 3000 ms`) from the first second, and `docker compose ps` showed the server and worker `unhealthy` after about 40 seconds. Both turned `healthy` again 6 seconds after `docker compose start postgres`, with no restart.
- Server started while Postgres was down: it kept retrying the connection for over a minute and became healthy about 10 seconds after Postgres started.

Throughout, `/health` stays `OK`: it only reports that Medusa booted. Use `/ready` to see whether the backend can reach Postgres.

## GPU

The default is CPU, which is the only option on a Mac: Docker Desktop on macOS has no NVIDIA passthrough. On Linux with the NVIDIA Container Toolkit, or Windows with Docker Desktop and WSL 2, first check that containers can see the GPU with Docker's documented test ([Docker Desktop GPU](https://docs.docker.com/desktop/features/gpu), setup notes in [roadmap-platform-verification-notes.md](../research/roadmap-platform-verification-notes.md)), then add the override:

```bash
docker compose -f compose.yaml -f compose.gpu.yaml up -d --wait
```

To avoid repeating `-f`, set `COMPOSE_FILE=compose.yaml:compose.gpu.yaml` in `.env` (use `;` as the separator on Windows).

## Behind a TLS-inspecting proxy

If `ollama-pull` fails with `x509: certificate signed by unknown authority`, a proxy such as Zscaler is re-signing HTTPS. Give Ollama a PEM bundle with the public roots plus the proxy's root CA. Docker Desktop can only mount paths it shares (by default `/Users`, not `/opt/homebrew`), so copy the bundle somewhere under your home folder first:

```bash
CA_BUNDLE=$HOME/.config/goods/ca-bundle.pem \
  docker compose -f compose.yaml -f compose.proxy-ca.yaml up -d --wait
```

If the pull then returns an HTML page instead of a TLS error, the proxy blocks the Ollama registry by policy. Ask for access; the rest of the stack works without a model.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `required variable POSTGRES_PASSWORD is missing a value` (or `JWT_SECRET`, `COOKIE_SECRET`) | `.env` is missing or incomplete. See First run. |
| `port is already allocated` on start | `pnpm dev` or another stack uses the port. Change `MEDUSA_PORT` or `STOREFRONT_PORT` in `.env` and run `docker compose up -d --wait`. |
| `medusa-migrate` exits non-zero | Read `docker compose logs medusa-migrate`. A password with symbols breaks the database URL; use letters and digits only. |
| Storefront unhealthy, `/api/health` says `MEDUSA_PUBLISHABLE_KEY is not set` | The `publishable-key` service failed. `docker compose logs publishable-key`, then `docker compose up -d --wait`. |
| Store API returns `400 not_allowed` after the database was reset some other way | The storefront still has the old key. `docker compose up -d --wait` copies the new one, then `docker compose restart storefront` reads it. |
| Store listing is empty but product pages work | The listing calls the backend from the browser at the `backendUrl` that `curl -s localhost:$STOREFRONT_PORT/api/store-config` shows. If it is wrong, fix `MEDUSA_PORT` in `.env` and run `docker compose up -d --wait`. |
| Credit card isn't offered at checkout | `STRIPE_API_KEY` was empty when the seed ran, or `PUBLIC_STRIPE_KEY` is empty. Set them, run `docker compose up -d --wait`, and re-run the seed. |
| Admin login fails over plain HTTP on a server you built yourself | Production session cookies are `Secure`. The Compose stack sets `INSECURE_LOCAL_COOKIES=true`, which the backend only honors with a localhost `MEDUSA_BACKEND_URL`; a deployed server needs HTTPS instead. |
| `medusa-admin-user` fails with `User with email: ... already exists` | The user is already in this database. Log in, or reset. |
