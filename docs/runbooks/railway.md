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
| Project ID | `b259ae5d-641b-41bb-8624-08a02d9643a6` (project Settings) | Needed by the Railway API in #17. Not secret. |
| Environment | `production` | Railway's default environment. |

## Postgres

Added from Railway's pgvector template (https://railway.com/deploy/3jJFCA), renamed from `pgvector` to `Postgres` (other services reference it as `${{Postgres.DATABASE_URL}}`), then changed as below before the first deploy. Postgres only reads `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` when it first initializes the volume, so set them before deploying.

| Setting | Value | Why |
| --- | --- | --- |
| Image | `pgvector/pgvector:0.8.7-pg17-bookworm` (service Settings → Source) | The template uses `pgvector/pgvector:pg18`, a moving tag on a newer major. CI tests on exactly this image (`.github/workflows/ci.yml`) and Compose runs Postgres 17, so a dump from Railway restores locally in the #19 drill. |
| Region | EU West (Amsterdam) | Customer data stays in the EU. |
| Volume | Mounted at `/var/lib/postgresql` | Without a volume, every redeploy loses the data. |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | A new volume holds a `lost+found` folder, and Postgres refuses to initialize a data directory that isn't empty, so the data goes in a subfolder on the volume. |
| `POSTGRES_DB` | `medusa-goods` | The template says `railway`. One database name everywhere (Compose, dumps, restore drill). |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`, typed into the Raw Editor and nowhere else | Letters and digits only, because it goes into a URL. It lives only in Railway variables, never in the repo, chat or notes. |
| `DATABASE_URL` | `postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}` (from the template, kept) | The private address `*.railway.internal` only resolves inside the project, so the database is reached without leaving Railway's network. |
| Public access | None: no TCP Proxy (Settings → Networking), and `DATABASE_PUBLIC_URL` deleted in the Variables Raw Editor (the variable list has no delete icon for it) | A TCP proxy would put the database on the internet, guarded by its password alone. The Setup 2 gate fails if the production database is publicly exposed. |

### Check pgvector from inside the project

The database has no public address, so check it from a shell inside its container. `railway ssh` needs an SSH key in `~/.ssh` (`ssh-keygen -t ed25519`, press Enter at the file prompt so it lands in `~/.ssh/id_ed25519`, never in the repo) loaded with `ssh-add`; Railway only receives the public half.

```bash
railway link                       # workspace → project → production
railway ssh --service Postgres
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN; CREATE EXTENSION vector; SELECT version(); SELECT extversion FROM pg_extension WHERE extname = 'vector'; SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance; ROLLBACK;"
```

Expected: `PostgreSQL 17.11`, `extversion` `0.8.7`, `distance` `1`, then `ROLLBACK`, which leaves no extension behind. Result on 19 October 2026: all four as expected.

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

## Applying changes

Railway stages setting changes until you click the **Apply / Deploy changes** banner on the canvas. In #15 the first Redis deploy went out with the template's image and start command, though the edits showed in Settings. After every change, check over `railway ssh` what is actually running instead of trusting the dashboard.

## Reaching a database from your laptop

`railway connect Postgres` or `railway connect Redis` opens an encrypted tunnel into the private network for `psql` or `redis-cli` on your laptop, with no public access. Add `--tunnel-only` to keep it open for a GUI client. `railway ssh` runs commands inside the container instead.
