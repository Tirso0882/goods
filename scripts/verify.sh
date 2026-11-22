#!/usr/bin/env bash
# The checks CI runs, in one command: `pnpm verify`. The pre-commit hook
# (.husky/pre-commit) runs it before every commit.
#
# It only checks and never fixes, so a commit holds exactly what you staged.
# Left to CI: `build`, and the `backup` and `infra/postgres` tests, which need
# Docker. The backend and storefront tests need Postgres and Redis: they run
# when both answer, and otherwise this script says it skipped them.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

step() {
  printf '\n\033[1m▶ %s\033[0m\n' "$*"
  "$@"
}

# answers <host> <port>: true when something accepts a TCP connection there.
answers() { timeout 1 bash -c ">/dev/tcp/$1/$2" 2>/dev/null; }

redis_host_port() {
  local url=${REDIS_URL:-redis://localhost:6379}
  url=${url#*://}
  url=${url##*@}
  url=${url%%/*}
  echo "${url%%:*} ${url##*:}"
}

step pnpm -s format:check
step pnpm -s lint
step pnpm -s check:migrations
step pnpm -s typecheck

# shellcheck disable=SC2046
if answers "${DB_HOST:-localhost}" "${DB_PORT:-5432}" && answers $(redis_host_port); then
  step pnpm -s test
else
  step pnpm -s turbo test --filter='!@dtc/backend' --filter='!@dtc/storefront'
  step pnpm -s --filter @dtc/backend test:unit
  printf '\n\033[33m⚠ Skipped the backend integration and storefront tests: Postgres and Redis are not reachable on localhost. CI runs them.\033[0m\n'
fi

step uv run -q ruff check
step uv run -q ruff format --check
step uv run -q mypy
step uv run -q pytest -q

printf '\n\033[32m✔ verify passed\033[0m\n'
