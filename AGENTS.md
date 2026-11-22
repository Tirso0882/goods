## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## Working in goods

### Where things are

- `GLOSSARY.md`: the domain language. Name things with its terms, in code, tests and commit messages, and avoid the synonyms it lists under _Avoid_.
- `docs/adr/`: the decisions. Read the ADRs for the area you touch. A change that contradicts one needs a new ADR, decided by a person.
- `docs/design.md`: the support agent's design, for anything in `apps/agent`, `packages/agent-core`, `evals` or the support routes.
- `docs/runbooks/` and `docs/architecture/`: how the store runs locally.
- `.factory/CODING_STANDARDS.md`: how code here is written. The factory's reviewer holds every branch to it.

### Tests

Tests live next to the code they cover: `packages/agent-core/tests/`, `apps/agent/tests/`, `apps/backend/integration-tests/http/` and the `__tests__` folders. The backend's tests need Postgres and Redis.

Run the narrowest check that covers a change while you work, such as `pnpm turbo test --filter=@dtc/backend` or `uv run pytest packages/agent-core`, and every check CI runs (`.github/workflows/ci.yml`) before the last commit.

Also run `pnpm build` if you change build configuration, `apps/storefront/next.config.js`, `apps/backend/medusa-config.ts` or a package's exports. CI's `backup` job and `infra/postgres/test.sh` need Docker: leave them to CI when you have none.

### Commits

Conventional Commits: `type(scope): subject`. The type is `feat`, `fix`, `test`, `refactor`, `docs`, `ci` or `chore`. The scope is the area: `backend`, `storefront`, `agent`, `agent-core`, `evals`, `contracts`, `compose`, `seed`, `scripts`, `sandcastle`, or the docs folder for `docs`. The subject is plain words, lowercase, with no full stop. One logical change per commit, split by type. Pull requests are merged with Rebase and merge, so each commit reaches the changelog (see `docs/runbooks/deploy-and-rollback.md`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
