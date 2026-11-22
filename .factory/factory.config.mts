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
//   toolchains  presets that mount their caches, install and probe
//   env       the sandbox's variables, per parallel slot
//   setup     setup steps after the toolchains' installs
//   services  the compose file of test services, in this folder
//   maxSlots  how many parallel sandboxes the services can keep apart
//   skills    skills from ~/.claude/skills the agents may use
//   standards the coding standards file the reviewer holds branches to
//   instructions  guidance appended to one workflow's prompt
//
// What agents need to know about goods itself (test folders, commit scopes,
// build triggers) is in AGENTS.md, which every agent reads in its worktree.
//
// The factory's security checks (private home, no repo .env, no leaked host
// secret) always run after these, whatever this file says.

import { defineFactory, pnpm, uv } from "../.sandcastle/shared/factory.mts"

// The ports compose.yaml publishes on localhost.
const POSTGRES_PORT = "55432"
const REDIS_PORT = "56379"

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
  toolchains: [pnpm(), uv()],
  // The throwaway Postgres and Redis the backend's tests run against.
  services: "compose.yaml",
  // Redis has databases 0 to 15. Database 0 is for a run with no parallel
  // peer (the planner, preflight); each parallel slot gets its own, because
  // the store's Redis modules use fixed queue names, so two test runs in one
  // database would take each other's jobs. Postgres needs no slot: the
  // backend's test runner creates a database with a random name per suite.
  maxSlots: 15,
  // The variables CI's `test` and `agent` jobs set (.github/workflows/ci.yml),
  // pointed at the throwaway services.
  env: (slot) => ({
    DB_HOST: "localhost",
    DB_PORT: POSTGRES_PORT,
    DB_USERNAME: "postgres",
    DB_PASSWORD: "postgres",
    REDIS_URL: `redis://localhost:${REDIS_PORT}/${slot}`,
    AGENT_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/postgres`,
    // next.config.js refuses to load without it. Not a real key.
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_ci_placeholder",
    NEXT_TELEMETRY_DISABLED: "1",
    TURBO_TELEMETRY_DISABLED: "1",
    MEDUSA_DISABLE_TELEMETRY: "true",
  }),
  setup: [
    // SWC, which compiles the backend's tests, unpacks its native binary
    // into ~/.cache and refuses a home that anyone but the owner can write.
    // The sandbox's home starts group-writable. Turbo strips most variables
    // from a task, so pointing SWC at another cache would not reach it.
    { command: 'chmod 700 "$HOME"' },
  ],
  // The PR writer drafts the body with it.
  skills: ["pr"],
  standards: "CODING_STANDARDS.md",
  // The toolchains and skills add their own probes before these.
  probes: [
    // .nvmrc pins the major version only.
    {
      name: "node matches .nvmrc",
      command: 'case "$(node -v)" in "v$(cat .nvmrc)".*) ;; *) exit 1 ;; esac',
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
      name: "Postgres answers",
      command: `uv run --locked python -c "import os, socket; socket.create_connection((os.environ['DB_HOST'], int(os.environ['DB_PORT'])), 5)"`,
    },
    {
      name: "Redis answers",
      command: `node -e "const u = new URL(process.env.REDIS_URL); require('net').connect(+u.port, u.hostname).once('connect', () => process.exit(0)).once('error', () => process.exit(1))"`,
    },
  ],
})
