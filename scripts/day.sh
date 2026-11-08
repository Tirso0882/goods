#!/usr/bin/env bash
# Daily commands for the local store (docs/runbooks/local-store.md).
#
#   pnpm day start     before coding: containers up, migrate, pnpm dev + stripe listen
#   pnpm day update    after a PR merged: switch to main, pull, install if needed, migrate
#   pnpm day status    is everything up?
#   pnpm day check     before pushing: format, lint, typecheck, migrations check, tests
#   pnpm day stop      after coding: stop the containers (Ctrl+C pnpm dev first)
#
# `start --no-stripe` skips the webhook listener.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

CONTAINERS=(goods-postgres goods-redis)
STRIPE_EVENTS=payment_intent.created,payment_intent.processing,payment_intent.canceled,payment_intent.payment_failed,payment_intent.requires_action,payment_intent.amount_capturable_updated,payment_intent.partially_funded,payment_intent.succeeded

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

use_node() {
  local want
  want=$(cat .nvmrc)
  if command -v fnm >/dev/null; then
    eval "$(fnm env --shell bash)"
    fnm use --silent-if-unchanged >/dev/null
  fi
  [[ $(node --version) == v"$want".* ]] || die "Node $(node --version) is active, this repo needs v$want. Run: fnm install $want"
}

containers_up() {
  step "Starting ${CONTAINERS[*]}"
  for c in "${CONTAINERS[@]}"; do
    docker container inspect "$c" >/dev/null 2>&1 || die "Container $c doesn't exist. Create it with the first-time setup in README.md."
  done
  docker start "${CONTAINERS[@]}" >/dev/null
  for _ in $(seq 30); do
    if docker exec goods-postgres pg_isready -q 2>/dev/null &&
      [[ $(docker exec goods-redis redis-cli ping 2>/dev/null) == PONG ]]; then
      ok "Postgres and Redis are answering"
      return
    fi
    sleep 1
  done
  die "Postgres or Redis didn't answer within 30 seconds. Check: docker logs goods-postgres"
}

migrate() {
  step "Applying pending migrations (does nothing if there are none)"
  (cd apps/backend && pnpm medusa db:migrate)
}

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

cmd_start() {
  local stripe=1
  [[ ${1:-} == --no-stripe ]] && stripe=0

  use_node
  for port in 9000 8000; do
    port_busy "$port" && die "Port $port is in use, a dev server is probably already running. Find it with: lsof -iTCP:$port -sTCP:LISTEN"
  done
  containers_up
  migrate

  if ((stripe)); then
    if command -v stripe >/dev/null; then
      step "Starting stripe listen in the background (lines prefixed [stripe])"
      stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe --events "$STRIPE_EVENTS" 2>&1 |
        sed -u 's/^/[stripe] /' &
      trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
    else
      bad "stripe CLI not found, skipping the webhook listener (card payments won't create orders)"
    fi
  fi

  step "Starting pnpm dev: storefront http://localhost:8000/pl, admin http://localhost:9000/app. Ctrl+C stops it."
  pnpm dev
}

cmd_update() {
  [[ -z $(git status --porcelain) ]] || die "You have uncommitted changes. Commit or stash them first."
  port_busy 9000 && bad "pnpm dev seems to be running. Stop it (Ctrl+C) and run pnpm day start after this."

  use_node
  step "Switching to main and pulling"
  git switch main
  local before
  before=$(git rev-parse HEAD)
  git pull --ff-only

  if git diff --quiet "$before" HEAD -- pnpm-lock.yaml; then
    ok "Dependencies unchanged, skipping pnpm install"
  else
    step "Dependencies changed, running pnpm install"
    pnpm install --frozen-lockfile
  fi

  containers_up
  migrate
  step "Up to date. Next: pnpm day start"
}

cmd_status() {
  step "Status"
  for c in "${CONTAINERS[@]}"; do
    if [[ $(docker container inspect -f '{{.State.Running}}' "$c" 2>/dev/null) == true ]]; then ok "$c running"; else bad "$c not running"; fi
  done
  if docker exec goods-postgres pg_isready -q 2>/dev/null; then ok "Postgres accepting connections"; else bad "Postgres not answering"; fi
  if [[ $(docker exec goods-redis redis-cli ping 2>/dev/null) == PONG ]]; then ok "Redis answers PONG"; else bad "Redis not answering"; fi
  if [[ $(curl -s --max-time 3 localhost:9000/health) == OK ]]; then ok "Backend healthy on :9000"; else bad "Backend not up on :9000"; fi
  if curl -s --max-time 5 -o /dev/null localhost:8000/pl; then ok "Storefront up on :8000"; else bad "Storefront not up on :8000"; fi
  if pgrep -f 'stripe listen' >/dev/null; then ok "stripe listen running"; else bad "stripe listen not running"; fi
}

cmd_check() {
  use_node
  containers_up
  step "Format"
  pnpm format:check
  step "Lint"
  pnpm lint
  step "Typecheck"
  pnpm typecheck
  step "Migrations check"
  pnpm check:migrations
  step "Tests"
  pnpm test
  step "All checks passed. Safe to push."
}

cmd_stop() {
  port_busy 9000 && bad "pnpm dev is still running on :9000. Press Ctrl+C in its terminal."
  step "Stopping ${CONTAINERS[*]} (data stays in their volumes)"
  docker stop "${CONTAINERS[@]}" >/dev/null
  ok "Stopped"
}

case ${1:-} in
  start) shift; cmd_start "$@" ;;
  update) cmd_update ;;
  status) cmd_status ;;
  check) cmd_check ;;
  stop) cmd_stop ;;
  "" | help | -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
