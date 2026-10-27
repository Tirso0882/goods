# Restore all state

What the test store must not lose, how each part is backed up, and the drill that proves a backup restores. Written for [#19](https://github.com/Tirso0882/goods/issues/19). A backup counts only once it has been restored: a green backup job proves the job ran, not that its files hold a working store.

## Inventory of durable state

| State | Where it lives | Backed up by | Restored by |
| --- | --- | --- | --- |
| Medusa data: products, orders, customers, payments, carts, Admin users, API keys, workflow executions | Postgres database `medusa-goods` on the `Postgres` service volume | Nightly `pg_dump` to R2; Railway volume backups | `restore.sh` into a new database |
| Postgres roles | The same Postgres server | `globals.sql` in the nightly backup | By hand, only for a rebuild that needs the roles; the drill restores without owners |
| Product images and Admin uploads | R2 bucket `goods-production-media` | Nightly mirror to the backups bucket | `rclone copy` from `media/current/` |
| Railway configuration: services, images, start and pre-deploy commands, health checks, regions, variables (references unrendered), volumes, domains, volume backup schedules | Railway project `goods-production`, environment `production` | `railway.json` in the nightly backup, plus [the Railway runbook](railway.md) | Decrypt and compare with the runbook; rebuild from the runbook |
| Sealed variables (`JWT_SECRET`, `COOKIE_SECRET`, Stripe keys, R2 keys) | Railway only; sealed values can't be read back | Not backed up: Railway's API returns them empty | Rotated: generate, set, redeploy ([where secrets are kept](railway.md#where-secrets-are-kept)) |
| The backup private key | Password manager, and offline on paper | Itself recovery material: without it no backup decrypts | Read from the password manager |
| Redis: queues, workflow checkpoints, locks, cache | `Redis` service volume | Not backed up: see [Redis](#redis) | Rebuilt empty |
| Code, images, release history | GitHub and GHCR | GitHub | Out of scope here |
| Payments | Stripe, the system of record for money | Stripe | Out of scope here |

When a component is added, add its state here: agent cases, approvals and idempotency records, LiteLLM data and LangGraph checkpoints, each with how it's backed up and restored.

## How the backup runs

The Railway cron service `backup` runs `apps/backup/backup.sh` every night at 02:00 UTC (03:00 or 04:00 in Poland, the quietest hour), from the image `ghcr.io/tirso0882/goods-backup:<sha>`. Each run writes to the R2 bucket `goods-production-backups`, created with the EU jurisdiction like the media bucket ([ADR 0006](../adr/0006-railway-hosts-the-test-store.md)):

```text
goods-production-backups/
  nightly/<UTC time>/          one folder per run
    globals.sql.age            roles
    <database>.dump.age        one per database: pg_dump custom format
    railway.json.age           Railway environment export
    SHA256SUMS                 written last: a folder without it is incomplete
  media/current/               mirror of goods-production-media
  media/deleted/<UTC time>/    files the store deleted or replaced that night
```

- **Every database:** the script dumps every database on the server except the empty maintenance database `postgres`, and fails if `postgres` ever holds a table. A database added later (an agent database) is backed up without a change here. Each dump is read back with `pg_restore --list` before upload, so a truncated dump fails the run.
- **Encryption:** dumps and the Railway export are encrypted with [age](https://age-encryption.org) to a public key. The cron holds only the public key, so neither it nor anyone reading the bucket can decrypt a backup. The private key lives only in the password manager and on paper. Media isn't encrypted: product images are public on the store.
- **Media:** R2 has no versioning, so a plain mirror would lose a file the night the store deleted it. `rclone sync --backup-dir` moves deleted or replaced files to `media/deleted/<UTC time>/` instead.
- **Railway configuration:** the environment's config (every service's settings, variable names, volumes, domains) plus each service's variables with `${{...}}` references as written, and every volume's backup schedules, from Railway's GraphQL API with a project token.
- **A failed run:** each part runs on its own, so a failing Railway export or media sync doesn't cost the night's database dump. A failed part uploads nothing, the parts that finished are uploaded, and the run exits with an error, which Railway shows as a failed cron run.
- **Alerts:** every run, however it ends, reports to a Better Stack heartbeat: success, or the exit code on a failure. Better Stack alerts on a failure, and also when no run reports for a day, which catches a cron that never started. A failed setting check reports too.

`apps/backup/test.sh` runs all of this in CI, as the `backup` job, against throwaway databases, a local folder in place of R2 and a fake Railway API: every database restores with the same row counts, stored files are encrypted, restore refuses an existing database, deleted media is kept, the Railway export is complete, and a failing part doesn't cost the others. `backup` is one of the branch protection's required checks (Settings → Branches → `main`), so a pull request that breaks the backup can't merge.

## Retention

| What | Kept | How | Why |
| --- | --- | --- | --- |
| `nightly/` | 30 days | R2 lifecycle rule `nightly/` → delete after 30 days | A month of daily restore points. Backups hold customer data, so they expire: an erasure request is complete 30 days after the live data is deleted. |
| `nightly/` | Can't be deleted for 7 days | R2 bucket lock rule `nightly/`, age 7 days | The cron's R2 key can write and delete. A leaked key, or a bad script, can't remove the last week of backups. |
| `media/current/` | Until the store deletes the file | Mirror | |
| `media/deleted/` | 30 days | R2 lifecycle rule `media/deleted/` → delete after 30 days | Same window as the database: a restore from 30 days ago finds its images. |
| Railway volume backups of `Postgres` | Daily for 6 days, weekly for 27 days | Postgres → Backups, Daily and Weekly schedules | Railway's retention for each schedule. |

## Why Railway's volume backups are not enough

They're on, because they're the fastest way back from a bad migration: a few clicks, no download. But:

- they restore only into the same project and environment, so they can't rebuild the store if the project is deleted, the account is locked or Railway is down;
- wiping the volume deletes them, so they fail exactly when the volume is the problem;
- they live on the platform they protect, under the same account and 2FA.

The nightly `pg_dump` in R2 covers all three: another provider, its own credentials, restorable anywhere Postgres 17 with pgvector runs.

## Redis

Redis holds no business record that exists only there, so it isn't backed up. Medusa uses it for:

| Use | Keys | If lost |
| --- | --- | --- |
| Event bus | BullMQ queue `events-queue` | Events not yet handled by the worker are lost: subscribers (emails, Stripe webhook processing) don't run for them. |
| Workflow engine | BullMQ queues `medusa-workflows`, `medusa-workflows-jobs`, `workflows-cleaner`; checkpoints of running workflows | Running async workflows stop; scheduled jobs are registered again when the worker starts. Finished workflows that keep history are in Postgres (`workflow_execution`). |
| Locking | Lock keys | Released, which is what a restart wants. |
| Cache | Cache keys | Rebuilt on the next read. |

The orders, payments and customers those events are about are already in Postgres when the event is queued. The one gap is a Stripe webhook queued but not yet processed: Medusa answered Stripe with 200, so Stripe won't resend it on its own. After losing Redis, find the payments from the hours before in the Stripe Dashboard's events and resend their webhooks, then check each order's payment status in Admin. Redis writes to its volume with `--appendonly yes`, so a restart loses at most a second; only losing the volume loses the queues. Checked in the drill below: with server and worker stopped and the worker drained, no queue holds waiting or active work.

## Set it up

Once, in this order. Each secret goes into the password manager before Railway (see [where secrets are kept](railway.md#where-secrets-are-kept)).

1. **Plan:** the cron is the project's sixth service, and the Trial allows five: upgrade to Hobby first (Account → Plans), with the $10 budget alert from [ADR 0006](../adr/0006-railway-hosts-the-test-store.md).
2. **Railway volume backups:** `Postgres` → Backups → schedules **Daily** and **Weekly**. Check a first manual backup appears in the list.
3. **Backup key**, on your laptop, never in Railway:

   ```bash
   docker run --rm ghcr.io/tirso0882/goods-backup:<sha> age-keygen >goods-backup.key   # private
   docker run --rm -i ghcr.io/tirso0882/goods-backup:<sha> age-keygen -y <goods-backup.key  # public, starts age1
   ```

   Save the private key file's contents in the password manager (secure note `goods-production / backup key`) and on paper, offline, then delete the file. The public key is not secret.

4. **R2 bucket** `goods-production-backups`: R2 → Create bucket, Location → Specify jurisdiction → **European Union (EU)**, Standard storage class. Then Settings:
   - Object lifecycle rules: `nightly/`, delete after 30 days; `media/deleted/`, delete after 30 days.
   - Bucket lock rules: `nightly/`, retention 7 days.
5. **R2 tokens** (R2 → Manage API tokens → Create Account API token), each shown once, saved in the password manager:
   - `goods-backup-writer`: **Object Read & Write**, bucket `goods-production-backups` only.
   - `goods-backup-media-reader`: **Object Read only**, bucket `goods-production-media` only. The media token Medusa uses can write, so it isn't reused.
6. **Railway project token** `backup-cron`: Project Settings → Tokens, environment `production`. It can also deploy, which is why it lives only in the sealed `RAILWAY_CONFIG_TOKEN` and nowhere else.
7. **GHCR package:** the first CI run on `main` after this change pushes `goods-backup`. GitHub → Packages → `goods-backup` → Package settings → Change visibility → Public, as for the other two ([ADR 0006](../adr/0006-railway-hosts-the-test-store.md)).
8. **Better Stack heartbeat:** Better Stack → Uptime → Heartbeats → Create heartbeat, named `goods backup`, expected every **1 day**, grace period **3 hours** (time for a slow run), alerts by email and push like the [uptime monitors](railway.md#uptime-monitoring). Copy its URL for `HEARTBEAT_URL`. It stays Pending until the first run reports.
9. **The cron service:** + Create → Docker Image → `ghcr.io/tirso0882/goods-backup:<sha>`, renamed `backup`, with the settings below. Apply, wait for the first run (or trigger it), then seal the secrets ([sealing a variable](railway.md#sealing-a-variable)).

| Setting | Value | Why |
| --- | --- | --- |
| Image | `ghcr.io/tirso0882/goods-backup:<sha>` | Pinned by commit like the store's images. Releases don't deploy it: see [update the backup image](#update-the-backup-image). |
| Region | EU West (Amsterdam) | Next to Postgres; the dump never leaves the EU. |
| Cron schedule | `0 2 * * *` (Settings → Deploy → Cron Schedule) | Railway's schedules are UTC. A run still going when the next is due makes Railway skip the next one. |
| Start command | None: the image runs `backup.sh` | |
| Public domain, volume | None | It only connects out. Its temporary files go to the container disk and vanish with it. |
| Restart policy | Never | A failed backup should show as failed, not loop against the database. |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` | `${{Postgres.PGHOST}}`, `${{Postgres.PGPORT}}`, `${{Postgres.PGUSER}}`, `${{Postgres.PGPASSWORD}}` | References, so the password lives only on Postgres. Superuser, to dump every database and the roles. |
| `AGE_RECIPIENT` | The `age1...` public key | Not secret. |
| `BACKUP_BUCKET` | `goods-production-backups` | |
| `RCLONE_CONFIG_BACKUPS_TYPE`, `_PROVIDER`, `_ENDPOINT`, `_NO_CHECK_BUCKET` | `s3`, `Cloudflare`, `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`, `true` | rclone's `backups` remote, from variables instead of a config file. `.eu.` is required for an EU bucket. `NO_CHECK_BUCKET` stops rclone trying to create the bucket, which the token can't. |
| `RCLONE_CONFIG_BACKUPS_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | From `goods-backup-writer`, sealed | |
| `MEDIA_BUCKET` | `${{medusa-server.S3_BUCKET}}` | |
| `RCLONE_CONFIG_MEDIA_TYPE`, `_PROVIDER`, `_ENDPOINT`, `_NO_CHECK_BUCKET` | `s3`, `Cloudflare`, `${{medusa-server.S3_ENDPOINT}}`, `true` | |
| `RCLONE_CONFIG_MEDIA_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | From `goods-backup-media-reader`, sealed | |
| `RAILWAY_CONFIG_TOKEN` | The `backup-cron` project token, sealed | Not `RAILWAY_TOKEN`, which the Railway CLI would pick up. |
| `HEARTBEAT_URL` | The `goods backup` heartbeat URL, sealed | Anyone holding it could report a run that never happened. Without it the script still runs but tells nobody. |

Check the first run's log: `dumped medusa-goods`, `mirrored media`, `exported Railway environment production`, `uploaded nightly/<UTC time>`, `backup complete`. Then in R2 → `goods-production-backups` → Objects, the folder holds the four files, and the `goods backup` heartbeat is Up.

To test the alert, set `BACKUP_PARTS` on the cron to `none` and trigger a run: the script exits with code 2, and Better Stack opens an incident and sends the alert. Delete the variable, trigger again, and the incident resolves.

### Update the backup image

CI pushes `goods-backup:<sha>` on every push to `main`, but releases deploy only the store's three services, as a cron run can't pass a health check. When `apps/backup/` changes, set the cron's image to the new SHA by hand (Settings → Source), wait for the next run (or trigger one) and check its log. The Postgres major in `apps/backup/Dockerfile` must match the server's: `pg_dump` refuses a newer server.

## Restore drill

Restores the latest nightly backup into an isolated Postgres on your laptop, never over the store's database, and checks it against the source with writes stopped. Run it after setup, after any change to the backup, and before Step 12's repeat. Write down the UTC time wherever a step says so.

### 1. Stop writes, workers and jobs

1. Note the UTC time (writes stop), then `railway down --service medusa-server` (or its active deployment → ⋮ → Remove). The storefront and Admin stop writing. Stripe retries the webhooks it can't deliver: three times over a few hours in the sandbox, for up to 3 days in live mode.
2. Wait a minute for the worker to drain the queues, then check what Redis holds:

   ```bash
   railway ssh --service Redis
   r() { redis-cli -a "$REDIS_PASSWORD" --no-auth-warning "$@"; }
   r --scan | cut -d: -f1-2 | sort | uniq -c        # every key family
   for q in events-queue medusa-workflows medusa-workflows-jobs workflows-cleaner; do
     echo "$q wait=$(r LLEN bull:$q:wait) active=$(r LLEN bull:$q:active) delayed=$(r ZCARD bull:$q:delayed)"
   done
   ```

   The key families are the four `bull:<queue>` ones, locks and cache; anything else gets explained here before the drill goes on. Every `wait` and `active` is `0`. `delayed` on `medusa-workflows-jobs` and `workflows-cleaner` is the scheduled jobs' next runs, which the worker registers again on start. `delayed` on `medusa-workflows` or `events-queue` is a retry or a timeout waiting to run: work that exists only in Redis. Bring the worker back until it's `0`, or record the workflow it belongs to.

3. `railway down --service medusa-worker`. No scheduled job runs from here on.
4. Trigger the `backup` cron and wait for `backup complete`. Its `nightly/<UTC time>` is this drill's backup.
5. Count every table in the source, inside its container. The query goes base64-encoded, so the remote shell doesn't reinterpret its quotes:

   ```bash
   railway ssh --service Postgres -i ~/.ssh/id_ed25519_railway \
     "echo $(base64 -w0 apps/backup/integrity.sql) | base64 -d | psql -U postgres -d medusa-goods -AtX" >source-counts.txt
   ```

6. Bring the store back: each service → Deployments → the removed deployment → ⋮ → Redeploy, server first, then worker. The drill continues offline.

### 2. Restore in isolation

On your laptop, with a read-only token created for the drill (`goods-backup-drill`: Object Read only, `goods-production-backups` only; delete it after), in a file outside the repo:

```bash
install -m 600 /dev/null ~/.config/goods-restore.env
# RCLONE_CONFIG_BACKUPS_TYPE=s3
# RCLONE_CONFIG_BACKUPS_PROVIDER=Cloudflare
# RCLONE_CONFIG_BACKUPS_ENDPOINT=https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com
# RCLONE_CONFIG_BACKUPS_NO_CHECK_BUCKET=true
# RCLONE_CONFIG_BACKUPS_ACCESS_KEY_ID=...
# RCLONE_CONFIG_BACKUPS_SECRET_ACCESS_KEY=...
# BACKUP_BUCKET=goods-production-backups
```

Put the private key from the password manager in `~/.config/goods-backup.key` (`chmod 600`, readable by your user: the image runs as your user below). Then note the UTC time (restore starts) and run:

```bash
IMAGE=ghcr.io/tirso0882/goods-backup:<sha>
docker network create goods-restore
docker run -d --name goods-restore-pg --network goods-restore -e POSTGRES_PASSWORD=restore \
  pgvector/pgvector:0.8.7-pg17-bookworm@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d
mkdir -p restore-out
docker run --rm --network goods-restore --user "$(id -u):$(id -g)" -e HOME=/tmp \
  --env-file ~/.config/goods-restore.env \
  -v ~/.config/goods-backup.key:/key:ro -e AGE_IDENTITY_FILE=/key \
  -v "$PWD/restore-out:/out" -e RESTORE_DIR=/out \
  -e PGHOST=goods-restore-pg -e PGUSER=postgres -e PGPASSWORD=restore \
  "$IMAGE" restore.sh
```

It verifies `SHA256SUMS`, decrypts, creates each database and restores it, and leaves `globals.sql` and `railway.json` in `restore-out/` (both secret: delete them after the drill). It refuses to run if a database of the same name already exists.

### 3. Check the restore

1. **Integrity:** `pg_restore --exit-on-error` already failed the restore if a row broke a constraint: foreign keys are created after the data loads, so an order item without its order, or a duplicate key, stops it. Then the restored counts match the source exactly:

   ```bash
   docker exec -i goods-restore-pg psql -U postgres -d medusa-goods -AtX <apps/backup/integrity.sql >restore-counts.txt
   diff source-counts.txt restore-counts.txt && echo identical
   ```

2. **Admin:** run the release the store runs against the restored database, with an empty Redis and no S3 or Stripe:

   ```bash
   docker run -d --name goods-restore-redis --network goods-restore redis:8.10.2-alpine3.23
   docker run -d --name goods-restore-medusa --network goods-restore -p 9100:9000 \
     -e DATABASE_URL='postgres://postgres:restore@goods-restore-pg:5432/medusa-goods?sslmode=disable' \
     -e REDIS_URL=redis://goods-restore-redis:6379 \
     -e JWT_SECRET="$(openssl rand -hex 32)" -e COOKIE_SECRET="$(openssl rand -hex 32)" \
     -e MEDUSA_WORKER_MODE=shared -e MEDUSA_BACKEND_URL=http://localhost:9100 -e INSECURE_LOCAL_COOKIES=true \
     -e ADMIN_CORS=http://localhost:9100 -e AUTH_CORS=http://localhost:9100 -e STORE_CORS=http://localhost:8000 \
     ghcr.io/tirso0882/goods-backend:<the release's sha>
   ```

   Open http://localhost:9100/app, log in with the production Admin user (passwords are hashed in the database, so they survive the restore), and open at least three orders, including the latest paid one: items, customer, payment and fulfillment status match the live Admin. Images load from the live `r2.dev` URL, as their URLs are stored in the database.

3. **Media:** download the mirror and compare it with the live bucket:

   ```bash
   docker run --rm --env-file ~/.config/goods-restore.env -e HOME=/tmp \
     --user "$(id -u):$(id -g)" -v "$PWD/restore-out:/out" "$IMAGE" \
     sh -c 'rclone copy "backups:$BACKUP_BUCKET/media/current" /out/media && ls /out/media | wc -l'
   ```

   The count matches R2 → `goods-production-media` → Objects (or `cf r2 objects list --bucket-name goods-production-media --cf-r2-jurisdiction eu`), and a file opens.

4. **Railway configuration:** `jq '.services | keys' restore-out/railway.json` lists the six services, `jq '[.config.services[].networking.serviceDomains // {} | keys[]]' restore-out/railway.json` the two domains in [current domains](railway.md#current-domains), and `jq '.volumes'` the Postgres volume with its Daily and Weekly schedules. Compare each service's image, start and pre-deploy commands and variables with the [Railway runbook](railway.md); a difference is drift, fixed in whichever one is wrong. Note the UTC time (restore done).

### 4. Clean up

```bash
docker rm -f goods-restore-medusa goods-restore-redis goods-restore-pg
docker network rm goods-restore
rm -rf restore-out ~/.config/goods-backup.key source-counts.txt restore-counts.txt
```

Delete the `goods-backup-drill` R2 token. Keep `~/.config/goods-restore.env` only if the token stays.

### Recovery time and recovery point

- **Recovery time (RTO):** from the start of step 2 to the last check in step 3: how long the store is down when everything but the backup is gone and the steps are followed as written. Rebuilding the Railway project isn't included: that's the [Railway runbook](railway.md), timed separately.
- **Recovery point (RPO):** the newest data a restore can bring back. In the drill it's the gap between stopping writes and the backup's time: zero by design. In an incident it's the time since the last nightly backup: up to 24 hours, plus the run.

## Results

Not run yet: filled in by the first drill.

| Date | Backup | Recovery time | Recovery point | Integrity | Orders in Admin | Media | Railway config | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
