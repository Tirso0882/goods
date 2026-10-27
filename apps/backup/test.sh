#!/usr/bin/env bash
# Backs up throwaway databases with the backup image, restores them into a
# separate Postgres and checks nothing was lost. A local folder stands in for
# the R2 buckets, so nothing here touches Railway or Cloudflare. The live drill
# in docs/runbooks/restore-all-state.md covers what this can't: real R2
# credentials and the real database.
#
#   apps/backup/test.sh
#
# Needs Docker. Run from anywhere.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
IMAGE=${IMAGE:-goods-backup:test}
# Runs the fake Railway API. The node image of apps/backend/Dockerfile: copy
# its Dependabot bumps here.
NODE=node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
# The image Railway and compose.yaml run, so a dump restores into pgvector.
# Dependabot bumps it in compose.yaml only: copy each bump here.
PGVECTOR=pgvector/pgvector:0.8.7-pg17-bookworm@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d
RUN=goods-backup-test-$$
WORK=$(mktemp -d)

cleanup() {
  docker rm -f "$RUN-source" "$RUN-target" "$RUN-railway" >/dev/null 2>&1 || true
  docker network rm "$RUN" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

# From the repo root, as CI's publish job builds it.
docker build -q -t "$IMAGE" -f "$HERE/Dockerfile" "$ROOT" >/dev/null
docker network create "$RUN" >/dev/null

start_postgres() {
  docker run -d --name "$1" --network "$RUN" -e POSTGRES_PASSWORD=test "$PGVECTOR" >/dev/null
}
# Over TCP: during initdb, Postgres answers only on its socket.
wait_postgres() {
  for _ in $(seq 60); do
    docker exec "$1" pg_isready -q -h 127.0.0.1 -U postgres && return
    sleep 1
  done
  fail "$1 did not start"
}
psql_in() { local c=$1; shift; docker exec -i "$c" psql -q -v ON_ERROR_STOP=1 -U postgres "$@"; }

start_postgres "$RUN-source"
start_postgres "$RUN-target"
wait_postgres "$RUN-source"
wait_postgres "$RUN-target"

# Two databases, one with its own schema, like Medusa next to a future agent
# database. The marker shows whether the stored files are readable.
psql_in "$RUN-source" <<'SQL'
CREATE DATABASE medusa;
CREATE DATABASE agent;
SQL
psql_in "$RUN-source" -d medusa <<'SQL'
CREATE EXTENSION vector;
CREATE TABLE product (id text PRIMARY KEY, title text, embedding vector(3));
INSERT INTO product SELECT 'prod_' || i, 'Ring ' || i, '[1,2,3]' FROM generate_series(1, 25) i;
CREATE TABLE "order" (id text PRIMARY KEY, email text);
INSERT INTO "order" VALUES ('order_1', 'SECRET-MARKER-19@example.com');
SQL
psql_in "$RUN-source" -d agent <<'SQL'
CREATE SCHEMA agent;
CREATE TABLE agent.cases (id int PRIMARY KEY);
INSERT INTO agent.cases SELECT generate_series(1, 7);
SQL

mkdir -p "$WORK/bucket" "$WORK/media"
docker run --rm "$IMAGE" age-keygen 2>/dev/null >"$WORK/key.txt"
RECIPIENT=$(docker run --rm -i "$IMAGE" age-keygen -y <"$WORK/key.txt")

# in_image <postgres container> <command...>: runs the image as this user, with
# the local folder as the backups bucket.
in_image() {
  local pg=$1; shift
  docker run --rm --network "$RUN" --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$WORK:/w" \
    -e PGHOST="$pg" -e PGUSER=postgres -e PGPASSWORD=test \
    -e RCLONE_CONFIG_BACKUPS_TYPE=local -e BACKUP_BUCKET=/w/bucket \
    -e RCLONE_CONFIG_MEDIA_TYPE=local -e MEDIA_BUCKET=/w/media \
    -e AGE_RECIPIENT="$RECIPIENT" -e AGE_IDENTITY_FILE=/w/key.txt \
    -e BACKUP_PARTS="${BACKUP_PARTS:-postgres}" \
    -e HEARTBEAT_URL="${HEARTBEAT_URL:-}" \
    -e RAILWAY_API="http://$RUN-railway:4000/graphql/v2" -e RAILWAY_CONFIG_TOKEN="${RAILWAY_TOKEN_OVERRIDE:-test-token}" \
    "$IMAGE" "$@"
}

# --- Data comes back ---------------------------------------------------------

in_image "$RUN-source" backup.sh
grep -rqs SECRET-MARKER-19 "$WORK/bucket" && fail "the bucket holds readable data"
pass "the stored backup is encrypted"

in_image "$RUN-target" restore.sh
for db in medusa agent; do
  want=$(psql_in "$RUN-source" -d "$db" -At <"$HERE/integrity.sql")
  got=$(psql_in "$RUN-target" -d "$db" -At <"$HERE/integrity.sql")
  [[ -n $want ]] || fail "no tables counted in $db"
  [[ $got == "$want" ]] || fail "$db differs after restore:"$'\n'"$(diff <(echo "$want") <(echo "$got"))"
done
pass "every database restores with the same rows"

# --- Restore is safe ---------------------------------------------------------

# agent restores before medusa, so this also catches a restore that creates
# agent and only then stops at medusa.
psql_in "$RUN-target" -d medusa -c "INSERT INTO \"order\" VALUES ('order_2', 'drill@example.com')"
psql_in "$RUN-target" -c "DROP DATABASE agent"
in_image "$RUN-target" restore.sh >/dev/null 2>&1 && fail "restore ran over an existing database"
[[ $(psql_in "$RUN-target" -d medusa -At -c 'SELECT count(*) FROM "order"') == 2 ]] \
  || fail "the refused restore changed the existing database"
[[ -z $(psql_in "$RUN-target" -At -c "SELECT 1 FROM pg_database WHERE datname = 'agent'") ]] \
  || fail "the refused restore created a database"
pass "restore refuses an existing database and changes nothing"

# --- Images are kept ---------------------------------------------------------

echo ring >"$WORK/media/ring.png"
echo earring >"$WORK/media/earring.png"
BACKUP_PARTS=media in_image "$RUN-source" backup.sh >/dev/null 2>&1
cmp -s "$WORK/media/ring.png" "$WORK/bucket/media/current/ring.png" || fail "ring.png was not copied"
cmp -s "$WORK/media/earring.png" "$WORK/bucket/media/current/earring.png" || fail "earring.png was not copied"
pass "media files are copied"

rm "$WORK/media/earring.png"
echo bracelet >"$WORK/media/bracelet.png"
BACKUP_PARTS=media in_image "$RUN-source" backup.sh >/dev/null 2>&1
[[ -f $WORK/bucket/media/current/bracelet.png ]] || fail "a new file was not copied"
[[ ! -e $WORK/bucket/media/current/earring.png ]] || fail "a deleted file stayed in media/current"
kept=("$WORK"/bucket/media/deleted/*/earring.png)
[[ -f ${kept[0]} ]] || fail "a deleted file was not kept under media/deleted/"
cmp -s "${kept[0]}" <(echo earring) || fail "the kept file differs from the deleted one"
pass "a file deleted from the store is kept under media/deleted/"

# --- Railway config saved ----------------------------------------------------

# Answers the export's queries the way Railway's API does, for one project
# token, with references left unrendered. Also stands in for the Better Stack
# heartbeat: GET requests are recorded, and /hits lists them.
cat >"$WORK/railway.js" <<'JS'
const hits = []
require('http').createServer((req, res) => {
  if (req.method === 'GET') {
    if (req.url !== '/hits') hits.push(req.url)
    return res.end(JSON.stringify(hits))
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const { query, variables: v } = JSON.parse(body)
    const reply = (data) => res.end(JSON.stringify(data))
    if (req.headers['project-access-token'] !== 'test-token') return reply({ errors: [{ message: 'Not Authorized' }] })
    if (query.includes('projectToken')) return reply({ data: { projectToken: { projectId: 'p1', environmentId: 'e1' } } })
    if (query.includes('volumeInstanceBackupScheduleList'))
      return reply({ data: { volumeInstanceBackupScheduleList: [{ name: 'Daily', kind: 'DAILY', cron: '0 3 * * *', retentionSeconds: 518400 }] } })
    if (query.includes('variables('))
      return reply({ data: { variables: v.serviceId === 's1' ? { DATABASE_URL: '${{Postgres.DATABASE_URL}}' } : v.serviceId ? {} : { SHARED: 'yes' } } })
    if (query.includes('environment('))
      return reply({ data: { environment: {
        id: 'e1', name: 'production',
        config: { services: { s1: {
          source: { image: 'ghcr.io/tirso0882/goods-backend:abc' },
          networking: { serviceDomains: { 'medusa-server-production.up.railway.app': { port: 9000 } } },
        } } },
        serviceInstances: { edges: [{ node: { serviceId: 's1', serviceName: 'medusa-server' } }, { node: { serviceId: 's2', serviceName: 'Postgres' } }] },
        volumeInstances: { edges: [{ node: { id: 'vi1', mountPath: '/var/lib/postgresql/data', serviceId: 's2', volume: { name: 'postgres-volume' } } }] },
      } } })
    reply({ errors: [{ message: 'unexpected query: ' + query }] })
  })
}).listen(4000)
JS
docker run -d --name "$RUN-railway" --network "$RUN" -v "$WORK/railway.js:/railway.js:ro" "$NODE" node /railway.js >/dev/null

BACKUP_PARTS=railway in_image "$RUN-source" backup.sh >/dev/null 2>&1 || fail "the Railway export failed"
latest=$(find "$WORK/bucket/nightly" -name railway.json.age | sort | tail -1)
[[ -n $latest ]] || fail "no railway.json.age uploaded"
grep -qs medusa-server "$latest" && fail "the Railway export is readable"
export_json=$(docker run --rm --user "$(id -u):$(id -g)" -v "$WORK:/w" "$IMAGE" age -d -i /w/key.txt "/w/${latest#"$WORK"/}")
jq -e '.environment.name == "production"
  and .config.services.s1.source.image == "ghcr.io/tirso0882/goods-backend:abc"
  and .config.services.s1.networking.serviceDomains["medusa-server-production.up.railway.app"].port == 9000
  and .services["medusa-server"].variables.DATABASE_URL == "${{Postgres.DATABASE_URL}}"
  and .sharedVariables.SHARED == "yes"
  and .volumes[0].name == "postgres-volume"
  and .volumes[0].service == "Postgres"
  and .volumes[0].backupSchedules[0].kind == "DAILY"' <<<"$export_json" >/dev/null \
  || fail "the Railway export is missing settings:"$'\n'"$export_json"
pass "the Railway config and variables are exported, encrypted"

# --- A failing part doesn't cost the database backup -------------------------

before=$(find "$WORK/bucket/nightly" -mindepth 1 -maxdepth 1 | sort)
sleep 1 # folders are stamped to the second; don't reuse the last run's
BACKUP_PARTS="postgres railway" RAILWAY_TOKEN_OVERRIDE=wrong in_image "$RUN-source" backup.sh >/dev/null 2>&1 \
  && fail "backup succeeded although the Railway export failed"
night=$(comm -13 <(echo "$before") <(find "$WORK/bucket/nightly" -mindepth 1 -maxdepth 1 | sort))
[[ -f $night/medusa.dump.age && -f $night/SHA256SUMS ]] || fail "the Railway failure dropped the database dump"
[[ ! -e $night/railway.json.age ]] || fail "a failed Railway export was uploaded"
pass "a failed part still uploads the others, and the run fails"

# --- Failures alert -----------------------------------------------------------

hits() { docker exec "$RUN-railway" wget -qO- http://localhost:4000/hits; }
HEARTBEAT_URL="http://$RUN-railway:4000/heartbeat" BACKUP_PARTS=postgres \
  in_image "$RUN-source" backup.sh >/dev/null 2>&1 || fail "backup failed"
[[ $(hits | jq -r 'last') == /heartbeat ]] || fail "a good run didn't report success: $(hits)"
HEARTBEAT_URL="http://$RUN-railway:4000/heartbeat" BACKUP_PARTS="postgres railway" RAILWAY_TOKEN_OVERRIDE=wrong \
  in_image "$RUN-source" backup.sh >/dev/null 2>&1 && fail "backup succeeded although the Railway export failed"
[[ $(hits | jq -r 'last') == /heartbeat/1 ]] || fail "a failed run didn't report its exit code: $(hits)"
pass "the heartbeat hears about every run, failures with their exit code"

echo "all backup tests passed"
