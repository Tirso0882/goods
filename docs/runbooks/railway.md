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
| Project | `goods-production`, created as an Empty project (https://railway.com/new) | Starting empty means every service is added on purpose and written down here. |
| Project ID | Project Settings → General | Checked against the deploy token in [deploy and rollback](deploy-and-rollback.md#set-it-up). Not secret. |
| Environment | `production` | Railway's default environment. |
| Service names | Exactly `Postgres`, `Redis`, `medusa-server`, `medusa-worker`, `storefront` | Other services reference them by name (`${{Postgres.DATABASE_URL}}`, `${{storefront.RAILWAY_PUBLIC_DOMAIN}}`), and `scripts/railway-deploy.sh` finds the three app services by name. A reference to a service that doesn't exist resolves to nothing without an error: in #18, `STORE_CORS` came out empty and the Store API refused the storefront's origin. |

History: the throwaway project `goods-throwaway` was built in #15, rebuilt on 24 October 2026, and deleted on 24 October 2026 in #18, when `goods-production` was built from this runbook (images `2f9956edf964cedf781915b93a592d32d6d1fe38`).

### Current domains

Railway generates the public domains, so they change when a service is rebuilt. The commands below use `$S` and `$F`:

```bash
S=https://medusa-server-production-f0ee.up.railway.app      # medusa-server
F=https://goods-storefront-production.up.railway.app        # storefront
```

Update these two lines, the Stripe webhook endpoint and the `url` in `.github/workflows/deploy.yml` whenever a domain changes.

### Custom domain

None yet; the store runs on the Railway-provided domains above. A custom domain needs two things checked first: the Trial allows **one** custom domain in total (Hobby: two per service), so on the Trial only the storefront gets one; and a root domain (`example.com`, not `shop.example.com`) needs a DNS provider with CNAME flattening or ALIAS records, such as Cloudflare. Railway shows a CNAME and a TXT record to add; the domain doesn't verify without the TXT.

### Where secrets are kept

**Now (test store):** Railway's variables are the only store. Each secret is generated (`openssl rand -hex 32`), typed straight into Railway and sealed after a green deploy. A sealed value can't be read back, so a lost one is rotated, never recovered: generate a new value, edit the variable, redeploy. That's acceptable while the store holds only test data and sandbox keys.

**Before going live: set up Bitwarden once**, and from then on save every secret there before it goes into Railway.

1. Account on the EU server, https://vault.bitwarden.eu (accounts can't move between servers). The master password is a memorized passphrase of 4–5 random words, never stored in Bitwarden.
2. Settings → Security → Two-step login → Authenticator app. Bitwarden's own recovery code goes on paper, offline: it's the one secret that can't live in the vault.
3. Install the browser extension and the desktop app (https://bitwarden.com/download); in both, Settings → Options → Clear clipboard → 30 seconds. Not the `bw` CLI: it would let scripts and agents read the vault.
4. A folder `goods` with:

   | Item | Type | Contents |
   | --- | --- | --- |
   | Railway, Cloudflare, Stripe, GitHub accounts | Login, one each | Password and 2FA recovery codes |
   | `<project> / Medusa Admin` | Login | Email, password, the `/app` URL |
   | `<project> / Postgres` | Secure note | `POSTGRES_PASSWORD` |
   | `<project> / medusa-server` | Secure note | `JWT_SECRET`, `COOKIE_SECRET`, `STRIPE_API_KEY` (and the Stripe key's name), `STRIPE_WEBHOOK_SECRET` |
   | `<project> / R2 media token` | Secure note | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, the token's name and bucket |
   | `<project> / RAILWAY_TOKEN` | Secure note | The project token for GitHub Actions |
   | Railway SSH key | Secure note | Passphrase of `~/.ssh/id_ed25519_railway` |

   Secure notes get one Hidden custom field per variable, named like the variable.
5. Fill it by rotating every sealed secret, as sealed values can't be copied out: generate, save in Bitwarden, edit in Railway, redeploy, seal. The live store also gets live Stripe keys, which go through the same order.

From then on the order for every new secret is: generate, save in Bitwarden, set in Railway, seal after a green deploy. A value shown once (an R2 secret, a Stripe key) is saved before its page closes. Redis's password needs no copy: nothing outside Railway uses it.

### Secrets stay out of chat

Generate every secret in a terminal or Bitwarden and type it straight into Railway. A secret pasted into a chat, an issue or a terminal recording is burned: rotate it at once. In #18 the Postgres and Redis passwords were pasted into a chat before first use and replaced before anything relied on them. When showing variables to anyone, redact the values: names and references are enough.

## Postgres

Postgres only reads `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` when it first initializes the volume, and Railway's Postgres deploys the moment it's added, with its own values. So the order is: add it, change everything, wipe the volume, redeploy.

1. On the project canvas, + Create → Database → PostgreSQL. It deploys at once on Railway's `postgres-ssl:18` image. (Railway's pgvector template, https://railway.com/deploy/3jJFCA, works the same way and deploys `pgvector:pg18`.)
2. Rename the service `Postgres`, and set Settings → Networking → Private Networking to `postgres`. Renaming doesn't rename the private domain.
3. Settings → Source → Source Image → edit: `pgvector/pgvector:0.8.7-pg17-bookworm`.
4. Settings → Deploy → Custom Start Command: empty, so the pgvector image starts with its own entrypoint.
5. Settings → Networking: remove the TCP Proxy if there is one.
6. Settings → Region: EU West (Amsterdam).
7. Variables: make the list match the block below. Add to what's there; pasting over the Raw Editor deletes variables Railway created. Then close the Raw Editor and check every name shows in the plain list: in #18 several were missing after a paste, and in #16 a missing `DATABASE_URL` made the server's pre-deploy retry an empty host (`ENOTFOUND ... "hostname":"base"`) until it timed out. Delete `DATABASE_PUBLIC_URL` in the Raw Editor (the list has no delete icon for it).

   ```
   PGDATA=/var/lib/postgresql/data/pgdata
   POSTGRES_DB=medusa-goods
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=<openssl rand -hex 32, typed here and nowhere else>
   PGUSER=postgres
   PGPASSWORD=${{POSTGRES_PASSWORD}}
   PGDATABASE=${{POSTGRES_DB}}
   PGHOST=${{RAILWAY_PRIVATE_DOMAIN}}
   PGPORT=5432
   DATABASE_URL=postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}
   ```

8. Apply the changes, then wipe the volume (volume card → Settings → Wipe volume) and redeploy. The first deploy initialized it as Postgres 18 with Railway's database name and password; Postgres 17 crash-loops on it with `unrecognized configuration parameter "autovacuum_worker_slots"` and never reads the new variables.
9. The deploy log ends with `database system is ready to accept connections`. `initdb: error: directory "/var/lib/postgresql/data" exists but is not empty ... lost+found` means `PGDATA` is missing (hit in #18).

| Setting | Value | Why |
| --- | --- | --- |
| Image | `pgvector/pgvector:0.8.7-pg17-bookworm` (service Settings → Source) | The template uses `pgvector/pgvector:pg18`, a moving tag on a newer major. CI tests on exactly this image (`.github/workflows/ci.yml`) and Compose runs Postgres 17, so a dump from Railway restores locally in the #19 drill. |
| Region | EU West (Amsterdam) | Customer data stays in the EU. |
| Private domain | `postgres.railway.internal` (Settings → Networking → Private Networking) | Matches the service name; the template's `pgvector` survives a rename. |
| Volume | Mounted at `/var/lib/postgresql/data` (the template's mount path, kept) | Without a volume, every redeploy loses the data. It's the Postgres 17 image's data path. |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | A new volume holds a `lost+found` folder, and Postgres refuses to initialize a data directory that isn't empty, so the data goes in a subfolder on the volume. |
| `POSTGRES_DB` | `medusa-goods` | The template says `railway`. One database name everywhere (Compose, dumps, restore drill). |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`, typed into the Raw Editor and nowhere else | Letters and digits only, because it goes into a URL. It lives only in Railway variables, never in the repo, chat or notes. |
| `POSTGRES_USER`, `PGUSER` | Both `postgres` | Two readers: `POSTGRES_USER` is read by the image once, to create the superuser; `PGUSER` by clients (`psql`, and `DATABASE_URL`, built from it). They must match, or the URL logs in as a user that doesn't exist. Without `POSTGRES_USER`, `psql -U "$POSTGRES_USER"` in the container falls back to `root`. |
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

Expected: `PostgreSQL 17.11`, `extversion` `0.8.7`, `distance` `1`, then `ROLLBACK`, which leaves no extension behind. Result on 19 October 2026: all four as expected. Rebuilt project, 24 October 2026: `PostgreSQL 17.11` and `vector` `0.8.7` available. `goods-production`, 25 October 2026: all four as expected.

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

Result on 19 October 2026: all five as expected. `goods-production`, 25 October 2026: version, AOF, dir and `NOAUTH` as expected.

## Medusa server

Added with + Create → Docker Image, renamed `medusa-server` (other services reference it by that name). Serves the Store API, the Admin at `/app` and Stripe webhooks.

Order: image, name and region; then Generate Domain, because the variables reference `${{RAILWAY_PUBLIC_DOMAIN}}`; then the variables; then the deploy settings; then Apply. Generate `JWT_SECRET` and `COOKIE_SECRET` with `openssl rand -hex 32` each and create the Stripe key (below) first, then paste this into the Raw Editor and check all 11 show in the plain list. Seal the secrets only after the first green deploy ("Sealing a variable").

```
DATABASE_URL=${{Postgres.DATABASE_URL}}?sslmode=disable
REDIS_URL=${{Redis.REDIS_URL}}
MEDUSA_WORKER_MODE=server
DISABLE_MEDUSA_ADMIN=false
PORT=9000
MEDUSA_BACKEND_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
ADMIN_CORS=https://${{RAILWAY_PUBLIC_DOMAIN}}
AUTH_CORS=https://${{RAILWAY_PUBLIC_DOMAIN}}
JWT_SECRET=<openssl rand -hex 32>
COOKIE_SECRET=<another openssl rand -hex 32>
STRIPE_API_KEY=<sk_test_... of the goods sandbox>
```

The image is the full SHA of the latest green `main` CI run: GitHub → Actions → CI → branch `main`, newest run with a green check, its commit SHA. Only green runs pushed images, as `publish` runs after the tests. The package page on GitHub also lists `sha256-...` versions next to each SHA tag: those are the build provenance attestations from `actions/attest`, not images.

| Setting | Value | Why |
| --- | --- | --- |
| Image | `ghcr.io/tirso0882/goods-backend:<sha>`, the full commit SHA of a green `main` CI run | One tag is one exact build, so a rollback is redeploying an older SHA. A moving tag such as `latest` can't be rolled back to. |
| Region | EU West (Amsterdam) | Next to Postgres and Redis, and customer data stays in the EU. |
| Public domain | Railway-provided (`$S` under "Current domains"), target port 9000 (Settings → Networking → Public Networking → Generate Domain) | Browsers (Admin, Store API from the storefront) and Stripe webhooks start connections from outside Railway. Railway only detects the target port once the service is running, so after the first deploy check it with the edit icon next to the domain. |
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
curl -i $S/ready    # 200 OK
curl -i $S/health   # 200 OK
```

`/app` opens the Admin login. The pre-deploy log ends with `Migration scripts completed`; until the Stripe webhook exists it also warns that `webhookSecret` is missing. Result on 19 October 2026: all as expected. Rebuilt project, 24 October 2026: `/ready`, `/health` and `/app` 200. `goods-production`, 25 October 2026: the same.

### Stripe webhook

In the **goods sandbox**: Workbench → Webhooks → add a destination. A destination is tied to one server domain, so a rebuilt server needs a new one; delete the old destination. Description: `<project> medusa-server (Railway): payment_intent events for Medusa's Stripe provider`, so the right one gets deleted later.

| Setting | Value | Why |
| --- | --- | --- |
| Scope | Your account | Connected accounts are for Stripe Connect platforms. |
| Payload style | Snapshot | Medusa reads the payment intent from `data.object`; a thin payload carries only its ID. |
| API version | The default | |
| Destination type | Webhook endpoint | |
| Endpoint URL | `$S/hooks/payment/stripe_stripe` | The route of the Stripe provider with id `stripe` in `apps/backend/medusa-config.ts`. Stripe calls the server's public HTTPS domain; the worker has none. |
| Events | `payment_intent.created`, `.processing`, `.canceled`, `.payment_failed`, `.requires_action`, `.amount_capturable_updated`, `.partially_funded`, `.succeeded` | The same set as `stripe listen` in the local runbook, so the test store behaves like the local one. |
| Signing secret | Copied into `STRIPE_WEBHOOK_SECRET` on `medusa-server`; the worker references it | Never in the repo, chat or notes. |

With the destination in place, the server and worker logs no longer warn that `webhookSecret` is missing. The webhook is tested end to end by the test purchase, once the worker, storefront and seed are in place (see "Check a test purchase" below).

## Medusa worker

Added with + Create → Docker Image, renamed `medusa-worker`. Runs subscribers, scheduled jobs and workflow steps, including the Stripe webhooks the server queues. The server answers HTTP and puts events and jobs in Redis; the worker takes them from there, so a slow job never holds up a shopper's request.

```
MEDUSA_WORKER_MODE=worker
DISABLE_MEDUSA_ADMIN=true
DATABASE_URL=${{Postgres.DATABASE_URL}}?sslmode=disable
REDIS_URL=${{Redis.REDIS_URL}}
PORT=9000
JWT_SECRET=${{medusa-server.JWT_SECRET}}
COOKIE_SECRET=${{medusa-server.COOKIE_SECRET}}
STRIPE_API_KEY=${{medusa-server.STRIPE_API_KEY}}
STRIPE_WEBHOOK_SECRET=${{medusa-server.STRIPE_WEBHOOK_SECRET}}
```

Add the `S3_*` references the same way once R2 is set up.

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

## Seed the store and create the Admin user

Once, after the first green deploy of the server and worker, and before the storefront, which needs the publishable key from the Admin. From a laptop over `railway ssh` (never a pre-deploy step: it's test-store setup, not part of a release; the SSH key is set up as in "SSH key for `railway ssh`" below).

### Seed the catalog

```bash
railway link    # workspace → project → production, if this folder isn't linked yet
railway ssh --service medusa-server -i ~/.ssh/id_ed25519_railway -- ./node_modules/.bin/medusa exec ./src/scripts/seed-jewelry.js
```

The image holds the compiled build, so the script is `.js`. The log must say Stripe is enabled (or already enabled) in the Poland region and `Catalog ready: 16 products.`; `Stripe is not configured` means the server has no `STRIPE_API_KEY`.

### Create the Admin user

1. Pick the login: your own email, not `admin@example.com`, because this Admin is on the public internet.
2. Generate the password in your password manager (or `openssl rand -base64 24`) and save it there with the email and the Admin URL, `https://<server domain>/app`. It goes nowhere else: not the repo, chat or notes.
3. Create the user from an interactive session, so the password is neither on screen nor in the laptop's shell history:

   ```sh
   railway ssh --service medusa-server -i ~/.ssh/id_ed25519_railway
   # the container shell may show no prompt
   read -rs ADMIN_PASSWORD        # paste the password, press Enter; nothing is echoed
   ./node_modules/.bin/medusa user -e <your email> -p "$ADMIN_PASSWORD"
   unset ADMIN_PASSWORD
   exit
   ```

   Expected: `User created successfully.`

4. Open `https://<server domain>/app` and log in with that email and password. Logging in proves the Secure session cookie works over HTTPS; a login that loops back to the form means `MEDUSA_BACKEND_URL` isn't `https://`. An empty Admin (no products, customers or orders) means the seed above hasn't run or failed.

### Get the publishable key

In the Admin at `https://<server domain>/app`: Settings (bottom left) → Publishable API Keys → **Default Publishable API Key** → copy the token (`pk_...`). The first migration created it and linked it to the default sales channel, so it shows the seeded products. It goes into the storefront's `MEDUSA_PUBLISHABLE_KEY` below.

### SSH key for `railway ssh`

A dedicated key, `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_railway`, with its passphrase in the password manager, registered with `railway ssh keys add` and checked with `railway ssh keys list`. Remove keys you can no longer unlock with `railway ssh keys remove`. On GNOME the default agent (`gcr-ssh-agent`) asks for the passphrase in a desktop dialog, so `railway ssh` seems to hang until it's answered; `ssh-add` in the terminal asks there instead. In #16 Railway accepted the key and the login then stalled on exactly that.

## Storefront

Added with + Create → Docker Image, renamed `storefront`. Generate its domain (target port 8000) before the variables.

```
PORT=8000
MEDUSA_BACKEND_URL=http://${{medusa-server.RAILWAY_PRIVATE_DOMAIN}}:9000
PUBLIC_MEDUSA_BACKEND_URL=https://${{medusa-server.RAILWAY_PUBLIC_DOMAIN}}
PUBLIC_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
MEDUSA_PUBLISHABLE_KEY=<pk_... from the Admin>
PUBLIC_STRIPE_KEY=<pk_test_... of the goods sandbox>
```

Both keys are publishable (`pk_`): they reach every browser by design, so they stay plain. Seal only secrets (`sk_`, `whsec_`, generated values).

| Setting | Value | Why |
| --- | --- | --- |
| Image | `ghcr.io/tirso0882/goods-storefront:<sha>`, the same SHA as the backend | Storefront and backend of a release come from one commit. |
| Region | EU West (Amsterdam) | Same as the rest of the store. |
| Public domain | Railway-provided (`$F` under "Current domains"), target port 8000 | Shoppers' browsers load its pages. |
| Healthcheck path | `/api/health` | OK only when the publishable key is set and the backend answers, so a storefront that would serve error pages never takes traffic. No pre-deploy command. |
| `PORT` | `8000` | The image's port; keeps Railway's injected `PORT` out and the health check on the right port. |
| `MEDUSA_BACKEND_URL` | `http://${{medusa-server.RAILWAY_PRIVATE_DOMAIN}}:9000` | The storefront's own server (page rendering, health check) reaches the backend over the private network: no egress, no public hop. Plain HTTP inside Railway's WireGuard network. Environments created after 16 October 2025 are dual-stack, so no IPv6 binding is needed. |
| `PUBLIC_MEDUSA_BACKEND_URL` | `https://${{medusa-server.RAILWAY_PUBLIC_DOMAIN}}` | Shoppers' browsers call the Store API here; they can't resolve `*.railway.internal`. |
| `PUBLIC_BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | The storefront's own URL, for absolute links. |
| `MEDUSA_PUBLISHABLE_KEY` | The `pk_...` of the Default Publishable API Key: log in at `https://<server domain>/app` → Settings → Publishable API Keys → Default Publishable API Key → copy the token. Logging in needs the Admin user, so create it first (see "Seed the store and create the Admin user") | Created by the first migration. Plain, not sealed: it's sent to every browser by design and grants no secret access. |
| `PUBLIC_STRIPE_KEY` | The `pk_test_...` of the **goods sandbox**: Stripe Dashboard → switch to the goods sandbox (account picker, top left) → Developers → API keys → Standard keys → Publishable key | Publishable, so plain. Same sandbox as the server's `sk_test_...`, or payments fail. |
| `ALLOW_INDEXING` | Not set. Add it as `true` only once the store sells for real: a real catalog, live Stripe keys and its own domain. Until then `goods-production` leaves it out too | Unset, the storefront serves a robots.txt with `Disallow: /` and sends `X-Robots-Tag: noindex, nofollow`, so the synthetic catalog and test prices never reach search or AI answers under the brand (ADR 0007). Only the exact value `true` lets crawlers in, so a missing or mistyped variable keeps the store hidden. |

Then on `medusa-server`, now that the storefront has a domain:

| Variable | Value | Why |
| --- | --- | --- |
| `STORE_CORS` | `https://${{storefront.RAILWAY_PUBLIC_DOMAIN}}` | Only the storefront's origin may call the Store API from a browser, so another site can't use a shopper's cart session. |
| `AUTH_CORS` | `https://${{RAILWAY_PUBLIC_DOMAIN}},https://${{storefront.RAILWAY_PUBLIC_DOMAIN}}` | Admin login and customer login. |

### Check the storefront and CORS

With `$S` and `$F` set as under "Current domains" (copy the domains from each service's Settings → Networking; don't guess them):

```bash
curl -i $F/api/health    # 200 OK
curl -s -o /dev/null -D - -X OPTIONS -H "Origin: $F" \
  -H "Access-Control-Request-Method: GET" $S/store/regions | grep -i allow-origin   # the storefront origin
curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: GET" $S/store/regions | grep -i allow-origin   # nothing
curl -s $F/robots.txt                                   # User-Agent: *, Disallow: /
curl -sI $F/pl | grep -iE '^HTTP|x-robots'               # 200, x-robots-tag: noindex, nofollow
```

`https://evil.example` stands for any other site (`.example` is reserved and belongs to no one); the server must send no `allow-origin` for it. If the storefront origin gets nothing either, `STORE_CORS` resolved empty: check the service is named exactly `storefront`. `/pl` shows the jewelry catalog in PLN. Result on 20 October 2026: all as expected. Rebuilt project, 24 October 2026: health, CORS (exact origin, none for a foreign one) and catalog as expected. `goods-production`, 25 October 2026: the same, after `STORE_CORS` was fixed.

## R2 bucket for product images

In the Cloudflare dashboard, not Railway.

| Setting | Value | Why |
| --- | --- | --- |
| Bucket | `goods-production-media`, R2 Object Storage → Create bucket, Location → Specify jurisdiction → **European Union (EU)**, Standard storage class | The EU jurisdiction keeps objects in the EU and can't be changed later. Backups get their own bucket in #19. |
| Public access | Bucket Settings → Public Development URL → Allow (`https://pub-....r2.dev`) | Shoppers' browsers load product images directly. `r2.dev` is rate-limited and meant for development; a custom domain replaces it once the domain field is unblocked. |
| API token | R2 → Manage API tokens → Create Account API token, **Object Read & Write**, this bucket only | A leaked key can't reach backups, other buckets or account settings. The secret is shown once; keep it in the password manager. Rotate by creating a new token, editing the variables, then deleting the old token. |
| CORS | None | Admin uploads go to the Medusa server, which writes to R2; browsers only GET images. |

Variables on `medusa-server` (the S3 provider loads only when `S3_BUCKET` is set):

| Variable | Value |
| --- | --- |
| `S3_BUCKET` | `goods-production-media` |
| `S3_REGION` | `auto` (Medusa's R2 setting) |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`; an EU bucket fails through the endpoint without `.eu.` |
| `S3_FILE_URL` | the `r2.dev` URL |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from the token, sealed |

`S3_FORCE_PATH_STYLE` stays unset; it's for MinIO.

To check, upload an image to any product in the deployed Admin (Media → Upload → Save) and open it in a new tab: the URL starts with the `r2.dev` URL, and the object shows under R2 → `goods-production-media` → Objects (or `cf r2 objects list --bucket-name goods-production-media --cf-r2-jurisdiction eu`). A URL under `/static/` means the S3 provider isn't loaded. The seed's product images are hotlinked from the supplier's CDN, so they don't test R2. Result on 20 October 2026: as expected. Rebuilt project, 24 October 2026: as expected, with a new token. `goods-production`, 25 October 2026: as expected (`pandora-earrings-....png` served from `r2.dev`), and the server stayed healthy after the secrets were sealed.

## Check a test purchase

The last check of a new project, because it needs every piece: server, worker, storefront, the Stripe webhook and the seeded catalog.

On the storefront, buy any product with a Polish address and the test card `4242 4242 4242 4242` (any future date, any CVC). Expected: the order confirmation page; the order in Admin → Orders with payment **Captured**; and in the destination's Event deliveries, `payment_intent.created` and `payment_intent.succeeded` delivered (`pending_webhooks: 0`). Result on 24 October 2026, rebuilt project: all three as expected (244.00 zł, card). `goods-production`, 26 October 2026: all three as expected.

## Uptime monitoring

Better Stack Uptime (https://betterstack.com), outside Railway, so it still alerts when Railway itself is down. Railway's health checks only gate a deploy; nothing watches a live service.

| Monitor | URL | Why |
| --- | --- | --- |
| `goods storefront` | `$F/api/health` | Fails when the storefront is down, can't reach the backend, or has a wrong publishable key. |
| `goods backend ready` | `$S/ready` | Fails when Medusa or Postgres is down. Not `/health`, which stays `OK` with the database down. |

Both: type `status` (any 2xx is up), every 180 seconds, from the `eu`, `us`, `as` and `au` regions, request timeout 30 seconds, alerts by email and push to the Better Stack phone app. No phone calls, SMS or integrations: one person, a test store. Update both URLs when a domain changes (see "Current domains").

Account setup, by hand: sign up with 2FA on, confirm the email, install the phone app and log in, skip the integrations step. The onboarding creates the first monitor; the second was created through the Uptime API (`POST https://incidents.betterstack.com/api/v2/monitors`, `Authorization: Bearer <team Uptime API token>`), with the token kept in a `chmod 600` file outside the repo, never on screen. Delete the token when it's no longer needed: the monitors keep running.

### Test an alert

Point a monitor at a path that doesn't exist (`$S/ready-alert-test`, a 404), wait for the incident and the alert, then restore the URL. Production isn't touched. Result on 26 October 2026: incident `Status 404` opened at 10:30:01 UTC within seconds of the change; after the URL was restored it was resolved at 10:33:15, once the recovery check passed. Both alerts, down and resolved, arrived by email.

## Sealing a variable

Add the variable, apply the change and wait for a green deploy, then seal it (⋮ → Seal) and redeploy to check it still reaches the service. In #16, variables sealed before their change was applied reached the deploy empty (`COOKIE_SECRET`, `STRIPE_API_KEY`, the S3 keys): Medusa failed with `http.cookieSecret not found` or `Access key ID and secret access key are required`. The fix was to delete the variable and add it again in this order. A sealed value can't be read back, so the deploy log is the only check.

## Applying changes

Railway stages setting changes until you click the **Apply / Deploy changes** banner on the canvas. In #15 the first Redis deploy went out with the template's image and start command, though the edits showed in Settings. After every change, check over `railway ssh` what is actually running instead of trusting the dashboard.

## Deleting a project

In Railway: the project → Settings → Danger → Delete Project (2FA asks for a code). It deletes the services, environments and deployments; check afterwards that both old domains answer `Application not found`. Its project tokens stop working with it, so the GitHub `RAILWAY_TOKEN` secret must be replaced before the next merge to `main`, or the deploy job fails.

Outside Railway, delete by hand, as none of these go with the project:

- **Stripe** (goods sandbox): the webhook destination for the old server domain (Workbench → Webhooks), and the old project's secret key `goods-railway-medusa-server` (Developers → API keys). The key is still valid after the project is gone.
- **Cloudflare R2**: the old bucket's API token (Manage API tokens), then empty and delete the bucket.

## Reaching a database from your laptop

`railway connect Postgres` or `railway connect Redis` opens an encrypted tunnel into the private network for `psql` or `redis-cli` on your laptop, with no public access. Add `--tunnel-only` to keep it open for a GUI client. `railway ssh` runs commands inside the container instead.