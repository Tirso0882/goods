# Railway hosts the test store, with Cloudflare R2 for files and backups

On 12 October 2026 we chose Railway to host the test store, replacing the plan to harden a VPS and run Coolify on it. On 19 October 2026, while building the throwaway project in #15, we settled the region, plan, image access and object storage. How each setting is applied, and why, is in `docs/runbooks/railway.md`.

Railway runs the Medusa server, Medusa worker, storefront, Postgres and Redis as separate services on one private network, deploys prebuilt images, and gives each service volumes, health checks, pre-deploy commands and rollbacks. That leaves the Setup 2 time for deploys, rollback and restore drills instead of operating a server. A VPS with Coolify would teach more Linux hardening, but it adds an operating system, a reverse proxy and Coolify itself to patch and back up, for one person.

## Region and plan

- **Region:** EU West Metal, Amsterdam (`europe-west4-drams3a`), for every service. Customers are in Poland, so their data stays in the EU and requests stay close.
- **Plan:** the Trial for #15, with a one-time $5 credit and an end date of 12 November 2026 at the latest. It allows 5 services per project, 0.5 GB RAM per service on this account, and 0.5 GB volumes. The store needs exactly 5 services, so upgrade to Hobby ($5 a month, including $5 of usage) before #19 adds the backup cron as a sixth service, when the credit runs low, or if a Medusa service runs out of memory.
- **Budget:** the $5 credit caps spending on the Trial, which can't buy more credit and offers no usage limits. On Hobby, the budget is $10 a month, with a Custom email alert at $10.

## GDPR trade-offs

Railway is a US company. It offers a self-service Data Processing Agreement, which we sign before real customer data reaches the store. Service logs, including client IPs, are stored in US West for 90 days whatever the deploy region. So the services must not log personal data beyond what's needed, and the privacy notice must mention the log transfer.

## Images come from public GHCR packages

Railway deploys the commit-SHA images that CI pushes to `ghcr.io/tirso0882/goods-backend` and `ghcr.io/tirso0882/goods-storefront`. Pulling private GHCR images needs the Pro plan and a classic token with `read:packages`, so on the Trial and Hobby both packages are public. That matches the public repository: anyone can build the same images from the source, and the images hold no secrets, which Railway injects as variables at runtime.

## Cloudflare R2 for Medusa files and backups

Product images and the off-platform backups in #19 go to Cloudflare R2 buckets created with the EU jurisdiction, which guarantees the objects are stored in the EU. Medusa's S3 file provider and the backup job use the S3 endpoint `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`. Product images and backups go in separate buckets, so a credential leaked from the store can't touch the backups.

Railway Buckets were rejected. They are private only, so product images would need presigned URLs or a proxy, and they have no versioning or built-in backups. Backups kept on the platform they protect also fail when that platform or account does. Other EU S3 providers, such as Hetzner Object Storage and Scaleway, would work as well. R2 was chosen for its free egress and its free tier of 10 GB of storage a month.

## Consequences

- Leaving Railway means moving five services, but each runs a standard image with environment variables, so the same images run in Compose today.
- The database has no public address. Admin work on it goes through `railway ssh` or `railway connect`, never a TCP proxy.
- Railway's one-click rollback keeps old images for 24 hours on the Trial and 72 hours on Hobby, so #17 builds rollback on redeploying an older SHA image.
- Railway's volume backups restore only into the same project and environment, so #19 also needs `pg_dump` backups to R2.
- The R2 jurisdiction can't be changed after a bucket is created, so create the buckets with EU from the start.
