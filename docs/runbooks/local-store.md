# Local store runbook

How to run, reset and test the local jewelry store. First-time setup (containers, env files, admin user, Stripe keys) is in the [README](../../README.md). This runbook assumes that setup is done.

Everything here is synthetic data and Stripe test mode. Never point these commands at a shared or production database.

| Part | Where |
| --- | --- |
| Storefront | http://localhost:8000/pl |
| Admin | http://localhost:9000/app |
| Backend health | http://localhost:9000/health (returns `OK`) |
| Postgres | Docker container `goods-postgres`, port 5432, database `medusa-goods` |
| Redis | Docker container `goods-redis`, port 6379 |
| Stripe webhook route | `localhost:9000/hooks/payment/stripe_stripe` |

## Start

Run from the repo root, in this order. Medusa fails to boot if Postgres or Redis is down.

```bash
fnm use
docker start goods-postgres goods-redis
pnpm dev
```

In a second terminal, start the webhook listener (only needed for Stripe payments):

```bash
stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe \
  --events payment_intent.created,payment_intent.processing,payment_intent.canceled,payment_intent.payment_failed,payment_intent.requires_action,payment_intent.amount_capturable_updated,payment_intent.partially_funded,payment_intent.succeeded
```

Check it's up: `curl -s localhost:9000/health` prints `OK`, and the storefront at http://localhost:8000/pl shows the jewelry catalog with PLN prices.

## Stop

1. Press Ctrl+C in the `pnpm dev` terminal and in the `stripe listen` terminal.
2. Optionally stop the containers. Their data stays in the `goods-pgdata` and `goods-redisdata` volumes.

   ```bash
   docker stop goods-postgres goods-redis
   ```

## Seed

Adds the jewelry catalog, the Poland region (PLN, 23% VAT), shipping, stock, 10 synthetic customers and 12 orders. Safe to re-run against a running or stopped backend:

```bash
cd apps/backend && pnpm seed
```

It skips anything that already exists and never deletes products. Re-run it after you set `STRIPE_API_KEY`, because that is when it enables Stripe in the Poland region.

## Reset

Wipes the local database and Redis and rebuilds the same store from scratch. Stop `pnpm dev` first; the script refuses to run while anything is connected to the database.

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<choose-a-password> pnpm reset
pnpm dev
```

The script (`scripts/reset-local-data.sh`) recreates the database, flushes Redis, runs migrations and the seed, recreates the admin user, clears the storefront's `.next` cache, and writes the new publishable key into `apps/storefront/.env.local`. It never edits tables by hand: all data comes from migrations and the seed.

To check the seed is repeatable without touching your local data, run `pnpm test`. It migrates and seeds a throwaway database twice and asserts the counts don't change.

## Purchase

1. Start the store and `stripe listen` (see Start).
2. Open http://localhost:8000/pl, add a product to the cart, and check out.
3. Use a synthetic `@example.com` email and a made-up Polish address.
4. Pick a shipping option, then Credit card, and pay with one of Stripe's test cards (any future date, any CVC):

   | Card | Result |
   | --- | --- |
   | `4242 4242 4242 4242` | Succeeds |
   | `4000 0000 0000 0002` | Declined; no order, the cart stays open |
   | `4000 0027 6000 3184` | 3D Secure challenge, then succeeds |

5. The browser shows the order confirmation page.
6. In Admin, open Orders. The new order shows the customer, items and total, payment Captured, fulfillment Not fulfilled. The `stripe listen` terminal shows the `payment_intent.*` events with `[200]`.

To refund, open the order in Admin, go to Payments and choose Refund. Admin then shows Refunded, and the Stripe Dashboard (test mode) shows the refund.

## Webhook

- Medusa learns about a Stripe payment from either the storefront calling complete or the `payment_intent.succeeded` webhook, whichever arrives first. Duplicate deliveries are harmless: the order, payment and capture are created once.
- The hook route returns 200 for every request, even a badly signed one. The signature is checked later, in the `payment.webhook_received` subscriber, and bad events are dropped. A 200 does not mean the event was processed; check the order in Admin.
- `STRIPE_WEBHOOK_SECRET` in `apps/backend/.env` must match the `whsec_...` that `stripe listen` prints. It stays the same across restarts on the same machine.
- `stripe listen` does not queue events while it's stopped. Redeliver a missed event with:

  ```bash
  stripe events list --limit 5
  stripe events resend <evt_...>
  ```

Each failure case and what was observed is in [docs/verification/stripe-failure-paths.md](../verification/stripe-failure-paths.md).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Backend logs `ECONNREFUSED 127.0.0.1:6379` or `:5432` | Redis or Postgres isn't running. `docker start goods-postgres goods-redis`, then restart `pnpm dev`. |
| `EADDRINUSE` on port 9000 or 8000 | An old dev server is still running. Find it with `lsof -iTCP:9000 -sTCP:LISTEN` and stop it with `kill <pid>`. |
| Storefront errors with a publishable key message, or the Store API returns `400 not_allowed` | `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `apps/storefront/.env.local` is empty or from an old database. Copy it from Admin (Settings, Publishable API Keys), or run `pnpm reset`, which writes it for you. Restart the storefront. |
| Storefront shows old products or 404s after a reset | Stale Next.js cache. Stop the storefront, `rm -rf apps/storefront/.next`, start it again. |
| Prices are missing on the storefront | The page isn't using the Poland region. Use http://localhost:8000/pl and check `NEXT_PUBLIC_DEFAULT_REGION=pl`. |
| Credit card isn't offered at checkout | Stripe isn't enabled in the region. Check `STRIPE_API_KEY` is set in `apps/backend/.env`, run `pnpm seed`, restart `pnpm dev`. Also check `NEXT_PUBLIC_STRIPE_KEY` in the storefront env. |
| Payment succeeds in Stripe but no order appears | The webhook didn't arrive. Check `stripe listen` is running and its secret matches `STRIPE_WEBHOOK_SECRET`, then `stripe events resend <evt_...>`. |
| `stripe listen` refuses to start | Recent CLI versions need `--events`. Use the full command in Start. |
| Completing the cart says `Payment sessions are required to complete cart` | The last payment failed (for example a decline). Pick the payment method again in the payment step. |
| `pnpm seed` fails on an order that already exists in another state | The local data was seeded by an older version of the fixtures. Run `pnpm reset`. |
| `pnpm reset` says the database has open connections | `pnpm dev` (or another client) is still connected. Stop it and re-run. |
| `node --version` isn't v24 | Run `fnm use` in the repo root. |
