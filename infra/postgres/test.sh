#!/usr/bin/env bash
# Checks create-databases.sh against a throwaway Postgres that already holds a
# store database with data, as an existing Compose volume does:
#   - it creates the agent's and the model proxy's databases and roles;
#   - a second run exits 0 and changes no database, role, password or privilege;
#   - each role connects to its own database only, never the store's or the
#     other's;
#   - a changed password in the env reaches the role on the next run;
#   - the store's data and its superuser's access are untouched.
#
#   infra/postgres/test.sh
#
# Needs Docker. Run from anywhere.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
# The image compose.yaml runs. Dependabot bumps it there only: copy each bump here.
PGVECTOR=pgvector/pgvector:0.8.7-pg17-bookworm@sha256:7d0a41464797aeb9862dfdc0bbf1526b82cfd324cdd8036df19e3545f4a9ccb8
RUN=goods-db-setup-test-$$
AGENT_DB_PASSWORD=agenttest
LITELLM_DB_PASSWORD=litellmtest

cleanup() { docker rm -f "$RUN" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

docker run -d --name "$RUN" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=medusa-goods \
  "$PGVECTOR" >/dev/null
# Over TCP: during initdb, Postgres answers only on its socket.
for _ in $(seq 60); do
  docker exec "$RUN" pg_isready -q -h 127.0.0.1 -U postgres && break
  sleep 1
done
docker exec "$RUN" pg_isready -q -h 127.0.0.1 -U postgres || fail "Postgres did not start"

superuser() { docker exec -i "$RUN" psql -X -q -tA -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres "$@"; }

# The store's database already holds data before the setup first runs.
superuser -d medusa-goods -c "create table product (id text primary key); insert into product values ('p1')"

setup() {
  docker exec -i -e PGHOST=127.0.0.1 -e PGUSER=postgres -e PGPASSWORD=test \
    -e AGENT_DB_PASSWORD="$AGENT_DB_PASSWORD" -e LITELLM_DB_PASSWORD="$LITELLM_DB_PASSWORD" \
    "$RUN" sh -s <"$HERE/create-databases.sh"
}

# Databases, their owners and privileges, and the login roles' attributes.
state() {
  superuser -d postgres -c "
    select datname, pg_get_userbyid(datdba), datacl::text from pg_database
    where datname in ('postgres', 'medusa-goods', 'agent', 'litellm') order by datname;
    select datname, datacl::text from pg_database where datname = 'template1';
    select rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolpassword from pg_authid
    where rolname in ('agent', 'litellm') order by rolname"
}

setup >/dev/null || fail "first run exited non-zero"
first=$(state)
[ "$(superuser -d postgres -c "select count(*) from pg_database where datname in ('agent', 'litellm')")" = 2 ] \
  || fail "databases missing after the first run"
pass "first run created the agent and litellm databases"

setup >/dev/null || fail "second run exited non-zero"
[ "$(state)" = "$first" ] || fail "second run changed the databases or roles"
pass "second run exited 0 and changed nothing"

# Over TCP with a password, as the services connect.
as_role() {
  docker exec -e PGPASSWORD="$3" "$RUN" \
    psql -X -q -tA -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$1" -d "$2" -c "$4" >/dev/null 2>&1
}
connects() { as_role "$1" "$2" "$3" "select 1"; }
expect_connect() { connects "$@" || fail "$1 can't connect to $2"; pass "$1 connects to $2"; }
expect_refused() { ! connects "$@" || fail "$1 connected to $2"; pass "$1 can't connect to $2"; }

expect_connect agent agent "$AGENT_DB_PASSWORD"
expect_refused agent medusa-goods "$AGENT_DB_PASSWORD"
expect_refused agent litellm "$AGENT_DB_PASSWORD"
expect_refused agent postgres "$AGENT_DB_PASSWORD"
expect_connect litellm litellm "$LITELLM_DB_PASSWORD"
expect_refused litellm medusa-goods "$LITELLM_DB_PASSWORD"
expect_refused litellm agent "$LITELLM_DB_PASSWORD"
expect_refused agent template1 "$AGENT_DB_PASSWORD"

# A new password in the env reaches the role on the next run.
AGENT_DB_PASSWORD=agentrotated
setup >/dev/null || fail "run with a new password exited non-zero"
expect_connect agent agent "$AGENT_DB_PASSWORD"

# Each owner can build its own tables.
as_role agent agent "$AGENT_DB_PASSWORD" "create table probe (id int); drop table probe" \
  || fail "agent can't create tables in its database"
pass "agent can create tables in its database"

[ "$(superuser -d medusa-goods -c "select id from product")" = p1 ] || fail "store data changed"
pass "store data and the superuser's access are untouched"
