#!/usr/bin/env bash
# Nightly backup of the store's durable state to the R2 backups bucket, run by
# the Railway cron service `backup` (docs/runbooks/restore-all-state.md).
#
#   postgres  every database on the server, pg_dump custom format, plus roles
#   media     the media bucket, mirrored to media/current/
#   railway   the environment's settings, variables (references unrendered),
#             volumes and their backup schedules, from Railway's API
#
# The postgres and railway parts are encrypted to AGE_RECIPIENT and uploaded to
# nightly/<UTC time>/, with SHA256SUMS written last: a folder without it is an
# incomplete backup, and restore.sh skips it. Each part runs on its own: one
# that fails (Railway's API, the media bucket) doesn't cost the others the
# night, but the run still fails. Media stays unencrypted: product
# images are public on the store anyway.
#
# Settings, all from the environment:
#   PGHOST PGPORT PGUSER PGPASSWORD   a superuser on the store's Postgres
#   AGE_RECIPIENT                     age public key(s), space-separated
#   BACKUP_BUCKET                     bucket (or folder) on the rclone remote
#   RCLONE_CONFIG_BACKUPS_*           the `backups` rclone remote
#   MEDIA_BUCKET                      bucket on the `media` remote
#   RCLONE_CONFIG_MEDIA_*             the `media` rclone remote, read access
#   RAILWAY_CONFIG_TOKEN              a project token for the store's environment
#   BACKUP_PARTS                      which parts, default: all of them
# shellcheck disable=SC2016 # $names in the GraphQL queries are GraphQL variables
set -euo pipefail

: "${AGE_RECIPIENT:?set AGE_RECIPIENT to the backup public key}"
: "${BACKUP_BUCKET:?set BACKUP_BUCKET}"
read -ra PARTS <<<"${BACKUP_PARTS:-postgres media railway}"
read -ra RECIPIENTS <<<"$AGE_RECIPIENT"
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
DEST="backups:$BACKUP_BUCKET/nightly/$STAMP"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
mkdir "$OUT/plain" "$OUT/sealed"
# Where the running part writes. Its files reach plain/ only if it finishes.
PART_DIR=

log() { echo "$(date -u +%H:%M:%S) $*"; }

backup_postgres() {
  : "${PGHOST:?set PGHOST to the store Postgres}"
  # The maintenance database is skipped, so make sure nothing lives there.
  local stray
  stray=$(psql -d postgres -AtX -c "SELECT count(*) FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')")
  ((stray == 0)) || { echo "the postgres database holds $stray tables, which this backup skips" >&2; exit 1; }

  local db
  pg_dumpall --globals-only -f "$PART_DIR/globals.sql"
  while IFS= read -r db; do
    pg_dump --format=custom --dbname="$db" --file="$PART_DIR/$db.dump"
    # Reads the dump's table of contents back, so a truncated file fails here.
    pg_restore --list "$PART_DIR/$db.dump" >/dev/null
    log "dumped $db ($(du -h "$PART_DIR/$db.dump" | cut -f1))"
  done < <(psql -d postgres -AtX -c "SELECT datname FROM pg_database
    WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres' ORDER BY 1")
}

# R2 has no versioning, so a plain mirror would lose a file the moment the store
# deletes it. Files deleted or replaced in the store move to
# media/deleted/<UTC time>/ instead, which a lifecycle rule expires.
backup_media() {
  : "${MEDIA_BUCKET:?set MEDIA_BUCKET}"
  rclone sync "media:$MEDIA_BUCKET" "backups:$BACKUP_BUCKET/media/current" \
    --backup-dir "backups:$BACKUP_BUCKET/media/deleted/$STAMP"
  log "mirrored media"
}

RAILWAY_API=${RAILWAY_API:-https://backboard.railway.com/graphql/v2}

# gql <query> [variables json] -> the response's data, or exit on any error.
# As in scripts/railway-deploy.sh.
gql() {
  local body response
  body=$(jq -n --arg q "$1" --argjson v "${2:-{\}}" '{query: $q, variables: $v}')
  response=$(curl -sS --fail-with-body --retry 3 --retry-connrefused "$RAILWAY_API" \
    -H "Project-Access-Token: $RAILWAY_CONFIG_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body") || { echo "Railway API request failed: $response" >&2; exit 1; }
  if jq -e '.errors' <<<"$response" >/dev/null; then
    echo "Railway API error: $(jq -c '.errors' <<<"$response")" >&2
    exit 1
  fi
  jq -c '.data' <<<"$response"
}

# The environment's config holds every service's settings and the variable
# names, but no values; the variables query adds them, with ${{...}}
# references as written rather than resolved. Sealed values come back empty:
# those live only in Railway, and are rotated after a loss.
backup_railway() {
  : "${RAILWAY_CONFIG_TOKEN:?set RAILWAY_CONFIG_TOKEN to a project token}"
  local scope env ids services shared volumes='[]' service_vars='{}' sid name vars volume schedules
  scope=$(gql '{ projectToken { projectId environmentId } }')
  env=$(gql 'query ($id: String!) { environment(id: $id) {
    id name config
    serviceInstances { edges { node { serviceId serviceName } } }
    volumeInstances { edges { node { id mountPath serviceId volume { name } } } }
  } }' "$(jq -c '{id: .projectToken.environmentId}' <<<"$scope")")
  ids=$(jq -c '{projectId: .projectToken.projectId, environmentId: .projectToken.environmentId}' <<<"$scope")
  services=$(jq -c '[.environment.serviceInstances.edges[].node]' <<<"$env")

  while IFS=$'\t' read -r sid name; do
    vars=$(gql 'query ($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, unrendered: true)
    }' "$(jq -c --arg s "$sid" '. + {serviceId: $s}' <<<"$ids")")
    service_vars=$(jq -c --arg n "$name" --arg s "$sid" --argjson v "$vars" '. + {($n): {id: $s, variables: $v.variables}}' <<<"$service_vars")
  done < <(jq -r '.[] | [.serviceId, .serviceName] | @tsv' <<<"$services")
  shared=$(gql 'query ($projectId: String!, $environmentId: String!) {
    variables(projectId: $projectId, environmentId: $environmentId, unrendered: true)
  }' "$ids")

  while IFS= read -r volume; do
    schedules=$(gql 'query ($id: String!) { volumeInstanceBackupScheduleList(volumeInstanceId: $id) {
      name kind cron retentionSeconds
    } }' "$(jq -c '{id: .id}' <<<"$volume")")
    volumes=$(jq -c --argjson v "$volume" --argjson s "$schedules" --argjson services "$services" '. + [{
      name: $v.volume.name, mountPath: $v.mountPath,
      service: (first($services[] | select(.serviceId == $v.serviceId) | .serviceName) // null),
      backupSchedules: $s.volumeInstanceBackupScheduleList
    }]' <<<"$volumes")
  done < <(jq -c '.environment.volumeInstances.edges[].node' <<<"$env")

  jq -n --arg at "$STAMP" --argjson scope "$scope" --argjson env "$env" \
    --argjson services "$service_vars" --argjson shared "$shared" --argjson volumes "$volumes" '{
      exportedAt: $at,
      projectId: $scope.projectToken.projectId,
      environment: {id: $env.environment.id, name: $env.environment.name},
      config: $env.environment.config,
      services: $services,
      sharedVariables: $shared.variables,
      volumes: $volumes
    }' >"$PART_DIR/railway.json"
  log "exported Railway environment $(jq -r '.environment.name' <<<"$env")"
}

for part in "${PARTS[@]}"; do
  case $part in
    postgres | media | railway) ;;
    *) echo "unknown part in BACKUP_PARTS: $part" >&2; exit 2 ;;
  esac
done

failed=()
for part in "${PARTS[@]}"; do
  PART_DIR="$OUT/$part"
  mkdir "$PART_DIR"
  # A subshell that isn't an if or || test, so set -e still stops the part at
  # its first error without stopping the run.
  set +e
  (set -e; "backup_$part")
  status=$?
  set -e
  if ((status == 0)); then
    find "$PART_DIR" -mindepth 1 -maxdepth 1 -exec mv -t "$OUT/plain" {} +
  else
    echo "part $part failed" >&2
    failed+=("$part")
  fi
done

shopt -s nullglob
plain=("$OUT"/plain/*)
if ((${#plain[@]})); then
  keys=()
  for r in "${RECIPIENTS[@]}"; do keys+=(-r "$r"); done
  for f in "${plain[@]}"; do
    age "${keys[@]}" -o "$OUT/sealed/$(basename "$f").age" "$f"
  done
  (cd "$OUT/sealed" && sha256sum -- *.age >../SHA256SUMS)

  rclone copy --no-traverse "$OUT/sealed" "$DEST"
  rclone copyto "$OUT/SHA256SUMS" "$DEST/SHA256SUMS"
  log "uploaded nightly/$STAMP"
fi
if ((${#failed[@]})); then
  echo "backup failed: ${failed[*]}" >&2
  exit 1
fi
log "backup complete: ${PARTS[*]}"
