# Railway

How the test store's Railway project is set up, with the reason for every setting. Written while building the throwaway project in [#15](https://github.com/Tirso0882/goods/issues/15); [#18](https://github.com/Tirso0882/goods/issues/18) rebuilds the real project from this runbook alone, so any step missing here is a bug in the runbook.

## Account

| Setting | Value | Why |
| --- | --- | --- |
| Sign-in | With GitHub | Railway verifies accounts partly from the age and activity of the connected GitHub account. An unverified account gets the Limited Trial. |
| Plan | Trial, started 13 October 2026, ends 12 November 2026 at the latest | The throwaway project fits in the trial's one-time $5 credit. The trial allows at most 5 services per project, 0.5 GB volumes, and RAM per service of 0.5 GB on this account's plan page (the docs say 1 GB). The store needs 5 services (server, worker, storefront, Postgres, Redis), and the backup cron in #19 is a sixth, so upgrade to Hobby before #19, when the credit runs low, or if a Medusa service runs out of memory. Railway deletes trial volumes 30 days after the credit expires. |
| Trial type | Full Trial: the account is verified (check at https://railway.com/verify) | The Limited Trial restricts outbound network access and ports, so the store could not reach Stripe. |
| Two-factor authentication | On, with an authenticator app (Account Settings → Security). Recovery codes are in the password manager, never in the repo. | Whoever signs in to this account controls the production database, its variables and every deploy. With 2FA on, Railway also asks for a code before destructive actions. |
| Railway GitHub app | Installed with access to `Tirso0882/goods` only (https://github.com/settings/installations → Railway → Configure → Repository access → Only select repositories) | Services deploy from GHCR images, not from the repo, so Railway needs no other repo. Limiting it means a leaked Railway session can't read or deploy any other repository. Signing in with GitHub is a separate authorized OAuth app, which can't read repo code. |
| Preferred region | EU West (Amsterdam, Netherlands), `europe-west4-drams3a` (avatar → Account Settings) | New services start in the EU, close to customers in Poland, and their data stays in the EU. Each service's own region setting still decides where it runs, so check it on every service. Service logs, including client IPs, are stored in US West for 90 days whatever the region (see the Railway ADR). |
| Usage limit | None on the Trial: Railway doesn't offer usage limits there. On upgrading, set a Custom email alert at the monthly budget (https://railway.com/workspace/usage → Set Usage Limits → Compute Usage) and leave Hard limit empty unless the budget is $10 or more, its minimum. | On the Trial the one-time $5 credit is the cap, because trial accounts can't buy more credit. On a paid plan nothing caps spending without an alert or limit. |

## Project

| Setting | Value | Why |
| --- | --- | --- |
| Project | `goods-throwaway`, created as an Empty project (https://railway.com/new) | The name says which project #18 deletes. Starting empty means every service is added on purpose and written down here. |
| Project ID | `59613d42-0f2d-482c-b313-b7725287e919` (project Settings) | Needed by the Railway API in #17. Not secret. |
| Environment | `production` | Railway's default environment. |

The first project (`b259ae5d-...`, 13–23 October 2026) was deleted on 24 October 2026 and rebuilt from this runbook; see "Rebuild after Railway's security notice" below.

## Postgres

Added from Railway's pgvector template (https://railway.com/deploy/3jJFCA), renamed from `pgvector` to `Postgres` (other services reference it as `${{Postgres.DATABASE_URL}}`), then changed as below. Postgres only reads `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` when it first initializes the volume, so set them before it initializes.

Three traps, all hit in #16:

- **The template deploys at once, on `pg18`.** That first run initializes the volume as Postgres 18, and the pinned Postgres 17 image then crash-loops with `unrecognized configuration parameter "autovacuum_worker_slots"`. After switching the image and setting the variables, wipe the volume (volume card → Settings → Wipe volume) and redeploy, so Postgres 17 initializes it with the right name and password.
- **Renaming the service doesn't rename its private domain.** Set Settings → Networking → Private Networking to `postgres`, so the address is `postgres.railway.internal` and matches the name.
- **Replacing the Raw Editor contents deletes the template's variables.** Add to them; don't paste over them. Without `DATABASE_URL` on Postgres, `${{Postgres.DATABASE_URL}}` resolves to nothing, and the server's pre-deploy retries an empty host (`ENOTFOUND ... "hostname":"base"`) until it times out.

| Setting | Value | Why |
| --- | --- | --- |
| Image | `pgvector/pgvector:0.8.7-pg17-bookworm` (service Settings → Source) | The template uses `pgvector/pgvector:pg18`, a moving tag on a newer major. CI tests on exactly this image (`.github/workflows/ci.yml`) and Compose runs Postgres 17, so a dump from Railway restores locally in the #19 drill. |
| Region | EU West (Amsterdam) | Customer data stays in the EU. |
| Private domain | `postgres.railway.internal` (Settings → Networking → Private Networking) | Matches the service name; the template's `pgvector` survives a rename. |
| Volume | Mounted at `/var/lib/postgresql/data` (the template's mount path, kept) | Without a volume, every redeploy loses the data. It's the Postgres 17 image's data path. |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | A new volume holds a `lost+found` folder, and Postgres refuses to initialize a data directory that isn't empty, so the data goes in a subfolder on the volume. |
| `POSTGRES_DB` | `medusa-goods` | The template says `railway`. One database name everywhere (Compose, dumps, restore drill). |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`, typed into the Raw Editor and nowhere else | Letters and digits only, because it goes into a URL. It lives only in Railway variables, never in the repo, chat or notes. |
| `POSTGRES_USER`, `PGUSER` | `postgres` | The superuser Postgres creates on first start. Without `POSTGRES_USER`, `psql -U "$POSTGRES_USER"` in the container falls back to `root`, which doesn't exist. |
| `PGPASSWORD`, `PGDATABASE`, `PGHOST`, `PGPORT` | `${{POSTGRES_PASSWORD}}`, `${{POSTGRES_DB}}`, `${{RAILWAY_PRIVATE_DOMAIN}}`, `5432` | The template's connection variables; `DATABASE_URL` is built from them. |
| `DATABASE_URL` | `postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}` | The private address `*.railway.internal` only resolves inside the project, so the database is reached without leaving Railway's network. |
| Public access | None: no TCP Proxy (Settings → Networking), and `DATABASE_PUBLIC_URL` deleted in the Variables Raw Editor (the variable list has no delete icon for it) | A TCP proxy would put the database on the internet, guarded by its password alone. The Setup 2 gate fails if the production database is publicly exposed. |

### Check pgvector from inside the project

The database has no public address, so check it from a shell inside its container. `railway ssh` needs an SSH key in `~/.ssh` (`ssh-keygen -t ed25519`, press Enter at the file prompt so it lands in `~/.ssh/id_ed25519`, never in the repo) loaded with `ssh-add`; Railway only receives the public half.

```bash
railway link                       # workspace → project → production
railway ssh --service Postgres -i ~/.ssh/id_ed25519_railway
psql -U postgres -d medusa-goods -c "BEGIN; CREATE EXTENSION vector; SELECT version(); SELECT extversion FROM pg_extension WHERE extname = 'vector'; SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance; ROLLBACK;"
```

Expected: `PostgreSQL 17.11`, `extversion` `0.8.7`, `distance` `1`, then `ROLLBACK`, which leaves no extension behind. Result on 19 October 2026: all four as expected. Rebuilt project, 24 October 2026: `PostgreSQL 17.11` and `vector` `0.8.7` available.

## Redis

Added with + New → Database → Redis, renamed `Redis`. That service runs an image Railway manages and doesn't show, so pin it with Settings → Source → Connect Image.

| Setting | Value | Why |
| --- | --- | --- |
| Image | `redis:8.10.2-alpine3.23` (Settings → Source → Connect Image) | Railway's managed image was Redis 8.2.10. This is the version Compose and CI run. Connecting an image keeps the volume, variables and start command. |
| Region | EU West (Amsterdam) | Same region as Postgres and the Medusa services. |
| Volume | Mounted at `/data` (`$RAILWAY_VOLUME_MOUNT_PATH`) | Medusa's workflow engine keeps running workflows in Redis; without a volume a restart loses them. |
| Start command | `/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH --appendonly yes"` (Settings → Deploy → Custom Start Command) | Railway's command plus `--appendonly yes`. `rm lost+found` gives Redis a clean directory; `exec` lets Redis receive the stop signal and flush; `--requirepass` makes every client authenticate, even inside the private network; `--dir` writes to the volume; `--appendonly yes` logs every write, so a restart loses at most about a second, as in Compose. Turn it on before Redis holds data. |
| `REDIS_PASSWORD`, `REDIS_URL` | Created by Railway; `REDIS_URL` uses the private address | Other services reference `${{Redis.REDIS_URL}}`. |
| Public access | None: Settings → Networking shows only the **Add Public Access** button, so there's no `REDIS_PUBLIC_URL` | Anyone who reaches Redis can read or disrupt store events, locks and workflows. |

### Check Redis from inside the project

```bash
railway ssh --service Redis
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO server | grep redis_version   # 8.10.2
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET appendonly             # yes
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET dir                    # /data
ls -la "$RAILWAY_VOLUME_MOUNT_PATH"                                                # appendonlydir/ and dump.rdb
redis-cli PING                                                                     # NOAUTH Authentication required
```

Result on 19 October 2026: all five as expected.

## Medusa server

Added with + Create → Docker Image, renamed `medusa-server` (other services reference it by that name). Serves the Store API, the Admin at `/app` and Stripe webhooks.

| Setting | Value | Why |
| --- | --- | --- |
| Image | `ghcr.io/tirso0882/goods-backend:<sha>`, the full commit SHA of a green `main` CI run (first deploy: `b162024f1af7328c7e5deeb3057626be2533dd40`; rebuilt project: `88dce76af614727b604e2650efe851f02f0821f2`) | One tag is one exact build, so a rollback is redeploying an older SHA. A moving tag such as `latest` can't be rolled back to. |
| Region | EU West (Amsterdam) | Next to Postgres and Redis, and customer data stays in the EU. |
| Public domain | Railway-provided, `medusa-server-production-0b75.up.railway.app`, target port 9000 (Settings → Networking → Public Networking → Generate Domain) | Browsers (Admin, Store API from the storefront) and Stripe webhooks start connections from outside Railway. Railway only detects the target port once the service is running, so after the first deploy check it with the edit icon next to the domain. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}?sslmode=disable` | A reference, so the password lives only on Postgres. Medusa uses SSL for any host but localhost, and the pgvector image has no TLS; the connection stays on Railway's encrypted private network. |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | The private address with the password. It feeds the Redis caching, event bus, workflow engine and locking modules in `apps/backend/medusa-config.ts`. |
| `MEDUSA_WORKER_MODE` | `server` | This process only serves HTTP; jobs and subscribers run on the worker, so a slow job can't hold up a checkout. |
| `DISABLE_MEDUSA_ADMIN` | `false` | The server serves the Admin at `/app`. |
| `PORT` | `9000` | Without it Railway injects its own `PORT`, which overrides the image's. Pinning it keeps the app, the domain's target port and the health check on one port. |
| `MEDUSA_BACKEND_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | The public HTTPS URL the Admin calls. The reference follows the service's own domain if it changes. Over `http://` the browser drops the Secure session cookie and Admin login fails. |
| `ADMIN_CORS` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Only the Admin's own origin may call `/admin/*` from a browser. Exact origin, no wildcard. |
| `AUTH_CORS` | `https://${{RAILWAY_PUBLIC_DOMAIN}}`, plus the storefront origin once it has a domain | The origins allowed to log in: Admin and storefront. |
| `JWT_SECRET`, `COOKIE_SECRET` | Each its own `openssl rand -hex 32`, added with + New Variable and then sealed (⋮ → Seal) | Either one lets someone forge an admin login. Sealed values reach the deploy but never show in the dashboard, API, `railway variables` or `railway run`, and aren't copied to duplicated or PR environments. Never the local `.env` values. Rotate with ⋮ → Edit and a redeploy. |
| `STRIPE_API_KEY` | A secret key from the **goods sandbox** (Developers → API keys → Create secret key), named `goods-railway-medusa-server`, template **Full access, except sensitive operations**, sealed | The seed enables Stripe in the Poland region only when the key is set. The storefront key and the webhook must come from the same sandbox. Full access could also move money out and manage the account; a custom set risks missing one of the PaymentIntents, Refunds, Customers and PaymentMethods calls Medusa makes. Its own key, not the local `.env` one, so either can be revoked alone. |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_...` of the goods sandbox webhook destination (see "Stripe webhook" below), sealed after the first green deploy that uses it | Medusa rejects webhook calls whose signature doesn't match, so a forged "payment succeeded" can't complete an order. It's a different secret from the one `stripe listen` prints locally. |
| Pre-deploy command | `sh -c 'S3_BUCKET="" JWT_SECRET="${JWT_SECRET:-migrate-only}" COOKIE_SECRET="${COOKIE_SECRET:-migrate-only}" exec ./node_modules/.bin/medusa db:migrate --execute-safe-links --execute-safe-search'` (Settings → Deploy). Since #17 the deploy script sets it on every release from `MIGRATE` in `scripts/railway-deploy.sh`; change it there, not in the dashboard. The two flags keep a rollback from stopping at an interactive prompt ([deploy and rollback](deploy-and-rollback.md#how-it-runs)). | Migrates once per release, before the new version takes traffic; a failure stops the deploy and the old version keeps serving. It runs in a separate container from the same image, and in #16 sealed secrets were empty there (JWT, cookie, S3) while they also failed to reach the server until re-added (see "Sealing a variable" below), so whether pre-deploy gets sealed values is not settled; the command doesn't depend on it. Medusa refuses to load its config without the JWT and cookie secrets, and the S3 provider refuses to start without its keys. Migrations sign nothing and touch no files, so the placeholders are used only when the real value is missing, only in that container, and an empty `S3_BUCKET` leaves the S3 provider out. The server starts with the real values, and would fail its health check without them. Any new sealed variable that config loading requires needs the same treatment here. Only the server has a pre-deploy command, so two migrations never race. |
| Pre-deploy timeout | 600 seconds | No limit by default, so a migration stuck on a lock would hang the release. A fresh migrate takes 1–2 minutes. |
| Healthcheck path | `/ready`, default timeout 300 seconds (Settings → Deploy) | Railway switches traffic only after a 2xx. `/ready` also needs Postgres to answer within 3 seconds; `/health` only says the process booted. The check uses `PORT`. Railway stops checking once the deploy is live, so it isn't monitoring. |

### Check the server

```bash
curl -i https://medusa-server-production-0b75.up.railway.app/ready    # 200 OK
curl -i https://medusa-server-production-0b75.up.railway.app/health   # 200 OK
```

`/app` opens the Admin login. The pre-deploy log ends with `Migration scripts completed`; until the Stripe webhook exists it also warns that `webhookSecret` is missing. Result on 19 October 2026: all as expected. Rebuilt project, 24 October 2026: `/ready`, `/health` and `/app` 200.

### Stripe webhook

In the **goods sandbox**: Workbench → Webhooks → add a destination. A destination is tied to one server domain, so a rebuilt server needs a new one; delete the old destination.

| Setting | Value | Why |
| --- | --- | --- |
| Scope | Your account | Connected accounts are for Stripe Connect platforms. |
| Payload style | Snapshot | Medusa reads the payment intent from `data.object`; a thin payload carries only its ID. |
| API version | The default | |
| Destination type | Webhook endpoint | |
| Endpoint URL | `https://medusa-server-production-0b75.up.railway.app/hooks/payment/stripe_stripe` | The route of the Stripe provider with id `stripe` in `apps/backend/medusa-config.ts`. Stripe calls the server's public HTTPS domain; the worker has none. |
| Events | `payment_intent.created`, `.processing`, `.canceled`, `.payment_failed`, `.requires_action`, `.amount_capturable_updated`, `.partially_funded`, `.succeeded` | The same set as `stripe listen` in the local runbook, so the test store behaves like the local one. |
| Signing secret | Copied into `STRIPE_WEBHOOK_SECRET` on `medusa-server`; the worker references it | Never in the repo, chat or notes. |

With the destination in place, the server and worker logs no longer warn that `webhookSecret` is missing.

### Check a test purchase

On the storefront, buy any product with a Polish address and the test card `4242 4242 4242 4242` (any future date, any CVC). Expected: the order confirmation page; the order in Admin → Orders with payment **Captured**; and in the destination's Event deliveries, `payment_intent.created` and `payment_intent.succeeded` delivered (`pending_webhooks: 0`). Result on 24 October 2026, rebuilt project: all three as expected (244.00 zł, card).

## Medusa worker

Added with + Create → Docker Image, renamed `medusa-worker`. Runs subscribers, scheduled jobs and workflow steps, including the Stripe webhooks the server queues.

| Setting | Value | Why |
| --- | --- | --- |
| Image | The same `goods-backend:<sha>` as the server | One image, two roles chosen by variables. Server and worker share the database and Redis queues, so they always run the same release. |
| Region | EU West (Amsterdam) | Same as the rest of the store. |
| Public domain | None | Nothing outside Railway connects to it: it reaches Postgres and Redis itself over the private network. A domain would expose a process holding the store's secrets. |
| Pre-deploy command | None | The server migrates once per release; a second migration would race it. |
| Healthcheck path | `/health` | Worker mode loads no API routes, so there's no `/ready`, but Medusa answers `/health` on `PORT` once booted. Railway checks over its own network, so no domain is needed. |
| `MEDUSA_WORKER_MODE`, `DISABLE_MEDUSA_ADMIN` | `worker`, `true` | The documented worker role: no API, no Admin. |
| `DATABASE_URL`, `REDIS_URL`, `PORT` | As on the server | Same database and queues; `PORT` for the health check. |
| `JWT_SECRET`, `COOKIE_SECRET`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `S3_*` | `${{medusa-server.<NAME>}}` | One source of truth, so a rotation on the server reaches the worker on its next deploy. References to sealed variables resolve to the real value: in #16 the worker started with the S3 provider, which refuses to start without its keys. The worker processes Stripe webhooks with the Stripe provider, so it needs both Stripe values. |

The worker needs no CORS and no `MEDUSA_BACKEND_URL`: nothing calls it from a browser. Its first deploy log shows it picking up the events queued by the first migration (`Processing sales-channel.created ...`) and seeding the product search index, which proves the event bus between server and worker works.

## Storefront

Added with + Create → Docker Image, renamed `storefront`.

| Setting | Value | Why |
| --- | --- | --- |
| Image | `ghcr.io/tirso0882/goods-storefront:<sha>`, the same SHA as the backend | Storefront and backend of a release come from one commit. |
| Region | EU West (Amsterdam) | Same as the rest of the store. |
| Public domain | Railway-provided, `storefront-production-7294.up.railway.app`, target port 8000 | Shoppers' browsers load its pages. |
| Healthcheck path | `/api/health` | OK only when the publishable key is set and the backend answers, so a storefront that would serve error pages never takes traffic. No pre-deploy command. |
| `PORT` | `8000` | The image's port; keeps Railway's injected `PORT` out and the health check on the right port. |
| `MEDUSA_BACKEND_URL` | `http://${{medusa-server.RAILWAY_PRIVATE_DOMAIN}}:9000` | The storefront's own server (page rendering, health check) reaches the backend over the private network: no egress, no public hop. Plain HTTP inside Railway's WireGuard network. Environments created after 16 October 2025 are dual-stack, so no IPv6 binding is needed. |
| `PUBLIC_MEDUSA_BACKEND_URL` | `https://${{medusa-server.RAILWAY_PUBLIC_DOMAIN}}` | Shoppers' browsers call the Store API here; they can't resolve `*.railway.internal`. |
| `PUBLIC_BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | The storefront's own URL, for absolute links. |
| `MEDUSA_PUBLISHABLE_KEY` | The `pk_...` from Admin → Settings → Publishable API Keys → Default Publishable API Key | Created by the first migration. Plain, not sealed: it's sent to every browser by design and grants no secret access. |
| `PUBLIC_STRIPE_KEY` | `pk_test_...` from the **goods sandbox** | Publishable, so plain. Same sandbox as the server's `sk_test_...`. |
| `ALLOW_INDEXING` | Not set on the test store. `true` only on the real production project | Unset, the storefront serves a robots.txt with `Disallow: /` and sends `X-Robots-Tag: noindex, nofollow`, so the synthetic catalog and test prices never reach search or AI answers under the brand (ADR 0007). Only the exact value `true` lets crawlers in, so a missing or mistyped variable keeps the store hidden. |

Then on `medusa-server`, now that the storefront has a domain:

| Variable | Value | Why |
| --- | --- | --- |
| `STORE_CORS` | `https://${{storefront.RAILWAY_PUBLIC_DOMAIN}}` | Only the storefront's origin may call the Store API from a browser, so another site can't use a shopper's cart session. |
| `AUTH_CORS` | `https://${{RAILWAY_PUBLIC_DOMAIN}},https://${{storefront.RAILWAY_PUBLIC_DOMAIN}}` | Admin login and customer login. |

### Check the storefront and CORS

```bash
curl -i https://storefront-production-7294.up.railway.app/api/health    # 200 OK
S=https://medusa-server-production-0b75.up.railway.app
curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://storefront-production-7294.up.railway.app" \
  -H "Access-Control-Request-Method: GET" $S/store/regions | grep -i allow-origin   # the storefront origin
curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: GET" $S/store/regions | grep -i allow-origin   # nothing
F=https://storefront-production-7294.up.railway.app
curl -s $F/robots.txt                                   # User-Agent: *, Disallow: /
curl -sI $F/pl | grep -iE '^HTTP|x-robots'               # 200, x-robots-tag: noindex, nofollow
```

`/pl` shows the jewelry catalog in PLN. Result on 20 October 2026: all as expected. Rebuilt project, 24 October 2026: health, CORS (exact origin, none for a foreign one) and catalog as expected.

## R2 bucket for product images

In the Cloudflare dashboard, not Railway.

| Setting | Value | Why |
| --- | --- | --- |
| Bucket | `goods-throwaway-media`, R2 Object Storage → Create bucket, Location → Specify jurisdiction → **European Union (EU)**, Standard storage class | The EU jurisdiction keeps objects in the EU and can't be changed later. The name says which bucket #18 deletes. Backups get their own bucket in #19. |
| Public access | Bucket Settings → Public Development URL → Allow (`https://pub-....r2.dev`) | Shoppers' browsers load product images directly. `r2.dev` is rate-limited and meant for development; a custom domain replaces it once the domain field is unblocked. |
| API token | R2 → Manage API tokens → Create Account API token, **Object Read & Write**, this bucket only | A leaked key can't reach backups, other buckets or account settings. The secret is shown once; keep it in the password manager. Rotate by creating a new token, editing the variables, then deleting the old token. |
| CORS | None | Admin uploads go to the Medusa server, which writes to R2; browsers only GET images. |

Variables on `medusa-server` (the S3 provider loads only when `S3_BUCKET` is set):

| Variable | Value |
| --- | --- |
| `S3_BUCKET` | `goods-throwaway-media` |
| `S3_REGION` | `auto` (Medusa's R2 setting) |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`; an EU bucket fails through the endpoint without `.eu.` |
| `S3_FILE_URL` | the `r2.dev` URL |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from the token, sealed |

`S3_FORCE_PATH_STYLE` stays unset; it's for MinIO.

To check, upload an image to any product in the deployed Admin (Media → Upload → Save) and open it in a new tab: the URL starts with the `r2.dev` URL, and the object shows under R2 → `goods-throwaway-media` → Objects. A URL under `/static/` means the S3 provider isn't loaded. The seed's product images are hotlinked from the supplier's CDN, so they don't test R2. Result on 20 October 2026: as expected. Rebuilt project, 24 October 2026: as expected, with a new token.

## Seed the store and create the Admin user

Once, after the first green deploy of the server, from a laptop over `railway ssh` (never a pre-deploy step: it's test-store setup, not part of a release).

```bash
railway ssh --service medusa-server -i ~/.ssh/id_ed25519_railway -- ./node_modules/.bin/medusa exec ./src/scripts/seed-jewelry.js
```

The image holds the compiled build, so the script is `.js`. The log must say Stripe is enabled (or already enabled) in the Poland region and `Catalog ready: 16 products.`; `Stripe is not configured` means the server has no `STRIPE_API_KEY`.

Create the Admin user from an interactive session, so the password is neither on screen nor in the laptop's shell history:

```sh
railway ssh --service medusa-server -i ~/.ssh/id_ed25519_railway
# the container shell may show no prompt
read -rs ADMIN_PASSWORD
./node_modules/.bin/medusa user -e <your email> -p "$ADMIN_PASSWORD"
unset ADMIN_PASSWORD
exit
```

Not `admin@example.com`: this Admin is on the public internet. The password goes in the password manager. Logging in at `/app` proves the Secure session cookie works over HTTPS.

### SSH key for `railway ssh`

A dedicated key, `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_railway`, with its passphrase in the password manager, registered with `railway ssh keys add` and checked with `railway ssh keys list`. Remove keys you can no longer unlock with `railway ssh keys remove`. On GNOME the default agent (`gcr-ssh-agent`) asks for the passphrase in a desktop dialog, so `railway ssh` seems to hang until it's answered; `ssh-add` in the terminal asks there instead. In #16 Railway accepted the key and the login then stalled on exactly that.

## Sealing a variable

Add the variable, apply the change and wait for a green deploy, then seal it (⋮ → Seal) and redeploy to check it still reaches the service. In #16, variables sealed before their change was applied reached the deploy empty (`COOKIE_SECRET`, `STRIPE_API_KEY`, the S3 keys): Medusa failed with `http.cookieSecret not found` or `Access key ID and secret access key are required`. The fix was to delete the variable and add it again in this order. A sealed value can't be read back, so the deploy log is the only check.

## Applying changes

Railway stages setting changes until you click the **Apply / Deploy changes** banner on the canvas. In #15 the first Redis deploy went out with the template's image and start command, though the edits showed in Settings. After every change, check over `railway ssh` what is actually running instead of trusting the dashboard.

## Reaching a database from your laptop

`railway connect Postgres` or `railway connect Redis` opens an encrypted tunnel into the private network for `psql` or `redis-cli` on your laptop, with no public access. Add `--tunnel-only` to keep it open for a GUI client. `railway ssh` runs commands inside the container instead.