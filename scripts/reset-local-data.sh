#!/usr/bin/env bash
# Wipes local Medusa data and rebuilds it: fresh database, empty Redis,
# migrations (which run the starter data script), then the jewelry seed.
# Stop `pnpm dev` first. Synthetic local data only: never point this at a
# shared or production database.
#
#   pnpm reset
#   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... pnpm reset   # also recreates the admin user
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BACKEND="$ROOT/apps/backend"
STOREFRONT="$ROOT/apps/storefront"
PG_CONTAINER=${PG_CONTAINER:-goods-postgres}
REDIS_CONTAINER=${REDIS_CONTAINER:-goods-redis}

env_file_value() {
  grep -E "^$1=" "$BACKEND/.env" | tail -n 1 | cut -d= -f2- || true
}

export DATABASE_URL=${DATABASE_URL:-$(env_file_value DATABASE_URL)}
export REDIS_URL=${REDIS_URL:-$(env_file_value REDIS_URL)}
[[ -n $DATABASE_URL ]] || { echo "DATABASE_URL is not set (apps/backend/.env)" >&2; exit 1; }
[[ -n $REDIS_URL ]] || { echo "REDIS_URL is not set (apps/backend/.env)" >&2; exit 1; }

db=${DATABASE_URL##*/}
db=${db%%\?*}
if [[ $REDIS_URL =~ /([0-9]+)$ ]]; then redis_db=${BASH_REMATCH[1]}; else redis_db=0; fi

psql_admin() {
  docker exec "$PG_CONTAINER" psql -U postgres -d postgres -tAc "$1"
}

sessions=$(psql_admin "select count(*) from pg_stat_activity where datname = '$db'")
if [[ $sessions != 0 ]]; then
  echo "Database '$db' has $sessions open connection(s). Stop \`pnpm dev\` and run this again." >&2
  exit 1
fi

echo "==> Recreating database '$db'"
docker exec "$PG_CONTAINER" dropdb -U postgres --if-exists "$db"
docker exec "$PG_CONTAINER" createdb -U postgres "$db"

echo "==> Flushing Redis database $redis_db"
docker exec "$REDIS_CONTAINER" redis-cli -n "$redis_db" FLUSHDB >/dev/null

cd "$BACKEND"
echo "==> Running migrations and the starter data script"
pnpm medusa db:migrate

echo "==> Seeding the jewelry catalog"
pnpm medusa exec ./src/scripts/seed-jewelry.ts

if [[ -n ${ADMIN_EMAIL:-} && -n ${ADMIN_PASSWORD:-} ]]; then
  echo "==> Creating admin user $ADMIN_EMAIL"
  pnpm medusa user -e "$ADMIN_EMAIL" -p "$ADMIN_PASSWORD"
fi

key=$(docker exec "$PG_CONTAINER" psql -U postgres -d "$db" -tAc \
  "select token from api_key where type = 'publishable' and deleted_at is null order by created_at limit 1")

echo "==> Clearing the storefront's Next.js cache"
rm -rf "$STOREFRONT/.next"

if [[ -f $STOREFRONT/.env.local ]]; then
  sed -i.bak -E "s|^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$key|" "$STOREFRONT/.env.local"
  rm "$STOREFRONT/.env.local.bak"
  echo "==> Wrote the new publishable key to apps/storefront/.env.local"
else
  echo "==> New publishable key (put it in apps/storefront/.env.local): $key"
fi

echo "Done."
if [[ -z ${ADMIN_EMAIL:-} || -z ${ADMIN_PASSWORD:-} ]]; then
  echo "The admin user was deleted. Recreate it: cd apps/backend && pnpm medusa user -e admin@example.com -p <password>"
fi
