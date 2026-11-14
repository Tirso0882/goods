#!/bin/sh
# Creates the agent's and the model proxy's databases on the store's Postgres
# server, each owned by its own login role. Safe to run on every `up`: a
# second run changes nothing. Postgres init scripts only run on an empty
# volume, so this runs as a one-off Compose service instead (agent-db-setup).
#
# Isolation: CONNECT is revoked from PUBLIC on every database, so a role can
# connect only to the database it owns. The superuser that Medusa uses is not
# affected.
#
# Needs: PGHOST (reached over TCP with a password), PGUSER (a superuser),
# PGPASSWORD, AGENT_DB_PASSWORD and LITELLM_DB_PASSWORD.
set -eu

: "${AGENT_DB_PASSWORD:?set AGENT_DB_PASSWORD}"
: "${LITELLM_DB_PASSWORD:?set LITELLM_DB_PASSWORD}"

# A role's password is set only when logging in with the one in the env fails:
# on the first run, or after it changed in .env. Otherwise a rerun would write
# a new hash and salt, which is a change.
password_needed() {
  ! PGUSER=$1 PGPASSWORD=$2 PGDATABASE=$1 psql -X -q -tA -c "select 1" >/dev/null 2>&1
}
set_agent=false
set_litellm=false
password_needed agent "$AGENT_DB_PASSWORD" && set_agent=true
password_needed litellm "$LITELLM_DB_PASSWORD" && set_litellm=true

# Passwords go in as psql variables, quoted by psql, never spliced into SQL.
psql -X -q -v ON_ERROR_STOP=1 -d postgres \
  -v set_agent="$set_agent" \
  -v set_litellm="$set_litellm" \
  -v agent_password="$AGENT_DB_PASSWORD" \
  -v litellm_password="$LITELLM_DB_PASSWORD" <<'SQL'
-- One role and one database for each, created only when missing.
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', name)
FROM (VALUES ('agent'), ('litellm')) AS wanted(name)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = name)
\gexec

\if :set_agent
ALTER ROLE agent PASSWORD :'agent_password';
\endif
\if :set_litellm
ALTER ROLE litellm PASSWORD :'litellm_password';
\endif

SELECT format('CREATE DATABASE %I OWNER %I', name, name)
FROM (VALUES ('agent'), ('litellm')) AS wanted(name)
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = name)
\gexec

-- Nobody but the owner and superusers may connect, to any database that
-- accepts connections. template1 included, so a database created from it
-- later starts closed too.
SELECT format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', datname)
FROM pg_database
WHERE datallowconn
\gexec
SQL

echo "Databases ready: agent, litellm"
