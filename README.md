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

   Then start Redis. Medusa uses it for the event bus, workflow engine, locking, and cache. If the container already exists, run `docker start goods-redis` instead.

   ```bash
   docker run -d --name goods-redis -p 6379:6379 \
     -v goods-redisdata:/data redis:8-alpine redis-server --appendonly yes
   ```

3. Install dependencies and create the backend env file:

   ```bash
   pnpm install
   cp apps/backend/.env.example apps/backend/.env
   ```

4. Create the tables and the starter data (default sales channel, publishable API key, stock location), seed the jewelry store (Poland region with PLN and 23% VAT, shipping to Poland, the catalog with stock), then create an admin user:

   ```bash
   cd apps/backend
   pnpm medusa db:migrate
   pnpm seed
   pnpm medusa user -e admin@example.com -p <choose-a-password>
   cd ../..
   ```

   The seed is safe to re-run: it skips anything that already exists and never deletes products, so products you add in Admin stay. Its own 16 products get the catalog's images back on each run.

5. Create the storefront env file and paste the publishable key into `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`. Find it in Admin (`pnpm backend:dev`, then http://localhost:9000/app, Settings, Publishable API Keys, "Default Publishable API Key"):

   ```bash
   cp apps/storefront/.env.example apps/storefront/.env.local
   ```

6. Stop the backend and start everything:

   ```bash
   pnpm dev
   ```

   Backend health: http://localhost:9000/health (returns `OK`). Admin: http://localhost:9000/app. Storefront: http://localhost:8000/pl.

## Stripe test checkout

Without Stripe keys the store still runs, with only the manual system payment. To pay with Stripe's test card:

1. In the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys), switch to test mode and copy the secret key (`sk_test_...`) into `STRIPE_API_KEY` in `apps/backend/.env`, and the publishable key (`pk_test_...`) into `NEXT_PUBLIC_STRIPE_KEY` in `apps/storefront/.env.local`. Both files are ignored by git.
2. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) (`brew install stripe/stripe-cli/stripe`), run `stripe login`, then forward webhooks to Medusa's Stripe route:

   ```bash
   stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe \
     --events payment_intent.created,payment_intent.processing,payment_intent.canceled,payment_intent.payment_failed,payment_intent.requires_action,payment_intent.amount_capturable_updated,payment_intent.partially_funded,payment_intent.succeeded
   ```

   These are the events Medusa's Stripe provider handles. Recent Stripe CLI versions refuse to start without `--events`.

   Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET` in `apps/backend/.env`. It stays the same across `stripe listen` runs on the same machine. Keep the listener running while you test.
3. Run `pnpm seed` again. With the key set, it enables Stripe in the Poland region.
4. Restart `pnpm dev`, check out at http://localhost:8000/pl, choose Credit card, and pay with `4242 4242 4242 4242`, any future date, any CVC. Payments are captured automatically, so the order in Admin shows Captured and Not fulfilled.

## Tests

```bash
pnpm test
```

Needs the Postgres and Redis containers running. The backend tests check the catalog fixture, then run the migration scripts and the jewelry seed twice on a throwaway database (Redis database 1). They assert the product and variant counts, PLN prices, stock and Poland setup, the synthetic customers and the order count in each state, and that the second run changes nothing.

## Synthetic customers and orders

The seed also creates 10 customers (`@example.com` emails, made-up addresses) and 12 orders, defined in `apps/backend/src/seed/customers-and-orders.ts`. Each order goes through checkout, gets paid, then follows its story through Medusa's admin workflows, so the order's Activity panel shows every step:

| State | Story |
| --- | --- |
| unfulfilled | Paid, not fulfilled yet |
| fulfilled | Packed, not shipped |
| shipped | In transit |
| delivered | Delivered, no return |
| canceled | Canceled after payment, refunded |
| return-requested | Customer withdrew; the parcel hasn't arrived for inspection |
| return-approved | Received, inspection passed, goods and original delivery refunded |
| return-deducted | Received, inspection found wear, refund reduced by the diminished value |
| exchanged | Wrong ring size: returned, right size sent and delivered |
| claim-replaced | Arrived broken: replacement sent, no return needed |
| claim-refunded | Item missing from the parcel: that item refunded |

A return is only eligible for a refund once the item is received and inspected. Every date is the real time the seed ran.

## Reset local data

This deletes everything in the local database and Redis (products, orders, customers, the admin user) and rebuilds the same store from scratch. Stop `pnpm dev` first; the script refuses to run while anything is connected to the database.

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<choose-a-password> pnpm reset
pnpm dev
```

The script, `scripts/reset-local-data.sh`:

1. Drops and recreates the database from `DATABASE_URL` in `apps/backend/.env`.
2. Flushes the Redis database from `REDIS_URL` (cache, workflow and event state).
3. Runs `pnpm medusa db:migrate`, which also creates the starter data and the search index.
4. Runs the jewelry seed (catalog, customers and orders).
5. Recreates the admin user if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set. Without them, it prints the command to do it.
6. Deletes `apps/storefront/.next`, so the storefront doesn't serve cached products from the old database.
7. Writes the new publishable API key into `apps/storefront/.env.local`. Every fresh database gets a new key, and the storefront fails with the old one.
