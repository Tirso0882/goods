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
FROM postgres:17.11-alpine3.24@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b

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
