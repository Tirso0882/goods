#!/usr/bin/env bash
# Restores one nightly backup into new databases on an isolated Postgres, for
# the restore drill (docs/runbooks/restore-all-state.md). Never point it at the
# store's own Postgres: it refuses to touch a database that already exists, so
# the worst it can do there is add copies, but the drill's point is isolation.
#
#   restore.sh [<UTC time>]    default: the latest complete backup
#
# Settings, all from the environment:
#   PGHOST PGPORT PGUSER PGPASSWORD   a superuser on the restore Postgres
#   AGE_IDENTITY_FILE                 the age private key (never in Railway)
#   BACKUP_BUCKET                     bucket (or folder) on the rclone remote
#   RCLONE_CONFIG_BACKUPS_*           the `backups` rclone remote, read access
#   RESTORE_DIR                       optional: keep the decrypted non-database
#                                     files (roles, Railway config) here
set -euo pipefail

[[ -z ${1:-} || $1 =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$ ]] \
  || { echo "usage: $0 [<UTC time of a nightly backup, like 2026-10-27T020000Z>]" >&2; exit 2; }
: "${PGHOST:?set PGHOST to the restore Postgres}"
: "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the backup private key file}"
: "${BACKUP_BUCKET:?set BACKUP_BUCKET}"
SRC="backups:$BACKUP_BUCKET/nightly"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

log() { echo "$(date -u +%H:%M:%S) $*"; }

# The newest folder with SHA256SUMS and a database dump. A night whose
# postgres part failed still uploads the other parts, so it has no dumps.
latest_complete() {
  local dirs dir files
  dirs=$(rclone lsf --dirs-only "$SRC" | sort -r)
  while IFS= read -r dir; do
    files=$(rclone lsf --files-only "$SRC/$dir")
    if grep -qx SHA256SUMS <<<"$files" && grep -q '\.dump\.age$' <<<"$files"; then
      echo "${dir%/}"
      return
    fi
  done <<<"$dirs"
  echo "no complete database backup under nightly/" >&2
  exit 1
}

STAMP=${1:-$(latest_complete)}
log "restoring nightly/$STAMP"
rclone copy "$SRC/$STAMP" "$WORK/sealed"
(cd "$WORK/sealed" && sha256sum --check --quiet SHA256SUMS)

mkdir "$WORK/plain"
for f in "$WORK"/sealed/*.age; do
  age --decrypt -i "$AGE_IDENTITY_FILE" -o "$WORK/plain/$(basename "$f" .age)" "$f"
done

dumps=("$WORK"/plain/*.dump)
[[ -e ${dumps[0]} ]] || { echo "nightly/$STAMP holds no database dumps" >&2; exit 1; }

# Check every name before creating any, so a refusal leaves nothing behind.
for dump in "${dumps[@]}"; do
  db=$(basename "$dump" .dump)
  exists=$(psql -d postgres -AtX -v db="$db" <<<"SELECT count(*) FROM pg_database WHERE datname = :'db'")
  ((exists == 0)) || { echo "database $db already exists on $PGHOST; restore only into new databases" >&2; exit 1; }
done

# Without owners and grants: the restore Postgres has none of the source's
# roles. globals.sql keeps them, for a rebuild that needs them.
for dump in "${dumps[@]}"; do
  db=$(basename "$dump" .dump)
  createdb "$db"
  pg_restore --exit-on-error --no-owner --no-acl --dbname="$db" "$dump"
  log "restored $db"
done

if [[ -n ${RESTORE_DIR:-} ]]; then
  mkdir -p "$RESTORE_DIR"
  find "$WORK/plain" -type f ! -name '*.dump' -exec cp {} "$RESTORE_DIR/" \;
  log "decrypted files kept in $RESTORE_DIR"
fi
log "restore complete: recovery point $STAMP"
