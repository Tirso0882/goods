# syntax=docker/dockerfile:1
#
# The backup cron service and the restore drill
# (docs/runbooks/restore-all-state.md). The same image runs both:
#   backup:  backup.sh   (the Railway cron's start command)
#   restore: restore.sh  (on a laptop, against an isolated Postgres)
#
# Build from the repo root: docker build -f apps/backup/Dockerfile .
#
# Postgres 17 to match the pgvector image the store runs: pg_dump refuses a
# newer server, and pg_restore reads dumps from its own major or older.
# Dependabot skips majors here, so it never bumps past the server.
FROM postgres:17.11-alpine3.24@sha256:e5d2edd28b1f8d40a0a6c0c9cdc545b19b56a0d5d88f94bc11a97d970d4700d0

# age encrypts to a public key, so the cron can't decrypt what it wrote.
# rclone talks to R2's S3 API and mirrors the media bucket.
RUN apk add --no-cache age bash coreutils curl jq rclone
# Remotes come only from RCLONE_CONFIG_<NAME>_* variables, never a file.
ENV RCLONE_CONFIG=""

COPY apps/backup/backup.sh apps/backup/restore.sh /usr/local/bin/
COPY apps/backup/integrity.sql /usr/local/share/backup/

# The postgres image's entrypoint would start a server; this image never does.
ENTRYPOINT []
# The image's own unprivileged user: the scripts only need /tmp.
USER postgres
CMD ["backup.sh"]
