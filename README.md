# goods

A learning project: a customer support agent for a Medusa e-commerce store. The store is the vehicle, not the goal.

## Synthetic data and test payments only

This system uses synthetic data and test payments only.

- Every product, customer, order, address, and conversation is synthetic. Email addresses use reserved example domains such as `example.com`.
- Payments run through Stripe test mode with test cards. No live keys (`sk_live_...`) are ever configured.
- Never put real customer data or real credentials in this repository, its issues, or its fixtures.

## Where things are

- `docs/research/top-1-percent-ai-agent-engineer-roadmap.md`: the core roadmap.
- `docs/project-configuration.md`: machine, versions, and project decisions.
- `docs/adr/`: architecture decision records.
- `CONTEXT.md`: project vocabulary.
- `learning/`: lessons and learning records.

## Requirements

- Node 24 LTS (pinned in `.nvmrc`)
- Python 3.12 (pinned in `.python-version`) with `uv`
- Docker Desktop
- Git

## Run locally

The repo is a pnpm monorepo: the Medusa backend and Admin are in `apps/backend`, the Next.js storefront is in `apps/storefront`.

1. Switch to the pinned Node version and enable pnpm:

   ```bash
   fnm use
   corepack enable
   ```

2. Start PostgreSQL (with pgvector, needed later for FAQ search) and create the database. If the container already exists, run `docker start goods-postgres` instead of `docker run`.

   ```bash
   docker run -d --name goods-postgres -e POSTGRES_PASSWORD=postgres \
     -p 5432:5432 -v goods-pgdata:/var/lib/postgresql/data pgvector/pgvector:pg17
   docker exec goods-postgres createdb -U postgres medusa-goods
   ```

3. Install dependencies and create the backend env file:

   ```bash
   pnpm install
   cp apps/backend/.env.example apps/backend/.env
   ```

4. Create the tables and seed the starter data (default sales channel, publishable API key, Europe region, stock location), then create an admin user:

   ```bash
   cd apps/backend
   pnpm medusa db:migrate
   pnpm medusa user -e admin@example.com -p <choose-a-password>
   cd ../..
   ```

5. Start the backend with `pnpm backend:dev`, open Admin at http://localhost:9000/app and log in. Then add the Poland region (until the seed does it):
   1. Settings, Store: add PLN to the store currencies.
   2. Settings, Regions, Create: name Poland, currency PLN, country Poland, payment provider "System default", tax-inclusive pricing on.
   3. Settings, Tax Regions: add Poland with tax provider "System" and a 23% default rate (VAT).

6. Create the storefront env file and paste the publishable key from Admin (Settings, Publishable API Keys, "Default Publishable API Key") into `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`:

   ```bash
   cp apps/storefront/.env.example apps/storefront/.env.local
   ```

7. Stop the backend and start everything:

   ```bash
   pnpm dev
   ```

   Backend health: http://localhost:9000/health (returns `OK`). Admin: http://localhost:9000/app. Storefront: http://localhost:8000/pl.
