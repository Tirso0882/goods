// Goods' settings for the agent factory. Every field is optional: what isn't
// set here keeps the factory's default (see .sandcastle/shared/factory.mts).
//
//   names     labels, the base branch and the factory's branch names
//   models    the model and effort for each agent role
//   limits    parallel agents, waves, iterations, CI fix attempts
//   timeouts  per ticket, per pull request update or review, CI
//   retries   attempts and delay when the model API has trouble
//   checks    quality gates: the agents run them, and so does factory:check
//   probes    environment health: only factory:check runs them
//
// The factory's security checks (private home, no repo .env, no leaked host
// secret) always run after these, whatever this file says.

import { defineFactory } from "../.sandcastle/shared/factory.mts"

export default defineFactory({
  limits: {
    // Parallel agents share one Claude subscription's rate limits.
    parallel: 3,
  },
  // CI's checks (.github/workflows/ci.yml). Each runs over the whole repo,
  // so `factory:check --quick` skips them all.
  checks: [
    {
      name: "formatting; fix with: pnpm exec prettier --write <files>",
      command: "pnpm format:check",
      slow: true,
    },
    { name: "lint", command: "pnpm lint", slow: true },
    { name: "migrations", command: "pnpm check:migrations", slow: true },
    { name: "types", command: "pnpm typecheck", slow: true },
    {
      name: "tests: backend against Postgres and Redis, storefront",
      command: "pnpm test",
      slow: true,
    },
    { name: "Python lint", command: "uv run ruff check", slow: true },
    {
      name: "Python formatting",
      command: "uv run ruff format --check",
      slow: true,
    },
    { name: "Python types", command: "uv run mypy", slow: true },
    { name: "Python tests", command: "uv run --locked pytest", slow: true },
  ],
  probes: [
    // .nvmrc pins the major version only.
    {
      name: "node matches .nvmrc",
      command: 'case "$(node -v)" in "v$(cat .nvmrc)".*) ;; *) exit 1 ;; esac',
    },
    {
      name: "pnpm runs from the mounted corepack cache",
      command: "pnpm --version",
    },
    {
      name: "pnpm uses the mounted store",
      command:
        'test "$(dirname "$(pnpm store path)")" = "$npm_config_store_dir"',
    },
    {
      name: "node_modules is installed in every app",
      command:
        "test -d node_modules && test -d apps/backend/node_modules && test -d apps/storefront/node_modules",
    },
    {
      name: "the virtualenv runs the pinned Python",
      command:
        'test "$(uv run --locked python -c "import platform; print(platform.python_version())")" = "$(cat .python-version)"',
    },
    {
      name: "the /pr skill is linked into the sandbox's home",
      command: 'test -f "$HOME/.claude/skills/pr/SKILL.md"',
    },
    {
      name: "Postgres answers",
      command: `uv run --locked python -c "import os, socket; socket.create_connection((os.environ['DB_HOST'], int(os.environ['DB_PORT'])), 5)"`,
    },
    {
      name: "Redis answers",
      command: `node -e "const u = new URL(process.env.REDIS_URL); require('net').connect(+u.port, u.hostname).once('connect', () => process.exit(0)).once('error', () => process.exit(1))"`,
    },
  ],
})
