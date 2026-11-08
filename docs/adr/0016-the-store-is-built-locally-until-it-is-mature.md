# The store is built locally until it is mature

On 7 November 2026 the Railway account was deleted, and we decided to build the store and the agent fully locally until they are mature. This supersedes the hosting part of ADR 0006. Then comes pre-production, then production, both on the same host and from the same runbook, chosen in a new ADR at the go-live gate.

Nothing hosted is needed to build the agent: synthetic data, test payments and evals all run in the Compose stack on the laptop, from the same commit-SHA images CI publishes. A host costs money every month, and every setting on it has to be kept in step with the code while the code still changes every day.

## What changes

- **Compose is the only environment.** `compose.yaml` runs the published images, Postgres and Redis. CI keeps building and publishing the images to GHCR.
- **CI proves the images without a host:** a job starts them in Compose and runs the smoke test (#125).
- **Deploys are off.** The `deploy`, `smoke` and `rollback` jobs run only when the repository variable `DEPLOY_ENABLED` is `true`, and the smoke test reads its URL from the `STOREFRONT_URL` variable. Both are unset until go-live.
- **The Railway runbooks are history.** `docs/runbooks/railway.md`, the Railway parts of `deploy-and-rollback.md` and `restore-all-state.md`, and `scripts/railway-deploy.sh` stay as reference for the next host, not as current instructions.
- **Go-live gate:** backups and a proven restore (#19), point-in-time recovery (#89) and pre-production (#84) move to "Before taking real orders", done on the chosen host.

## What stays from ADR 0006

- Public GHCR images tagged by commit SHA, with no secrets in them.
- Cloudflare R2 with EU-jurisdiction buckets, separate for files and backups, when hosting returns. Whether the buckets made in October still exist is unconfirmed.
- An EU region for hosting, backups, object storage and observability data.

## Considered options

- **Move to another platform now** (a VPS with Coolify, Scaleway, Fly.io): keeps a live demo, but pays for and maintains a host before anything needs one.
- **Keep the Railway project for the demo:** no longer possible.

## Consequences

- No public demo until pre-production. Setup 2's deploy, rollback and restore drills are evidence of the skill, not of a running system.
- Production gets its own project or environment and its own deploy token at go-live, separate from pre-production.
- The data-flow diagram has no hosting processor until the host is chosen. Its DPA and log location are checked then.
