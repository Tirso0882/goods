# Coding standards

How code in goods is written, drawn from its ADRs, its configs and the code already merged. The reviewer agent holds every branch to this file. The implementer reads the same sources (`AGENTS.md`, `GLOSSARY.md`, `docs/adr/`), so nothing here should surprise it.

Where a tool enforces a rule (Prettier, ESLint, ruff, mypy, TypeScript), the tool is the authority and this file only says why.

## The architecture is decided

- **Business rules live in code, not in prompts (ADR 0008).** The model chooses a tool; the tool and the route behind it decide whether the action is allowed. A rule enforced only by prompt wording is a finding.
- **The agent reaches commerce only through the commerce port (ADR 0010, ADR 0019).** `contracts/commerce-port.openapi.yaml` is the contract. A new capability adds the port operation first, then the Medusa support route, then the tool. `agent-core` and `evals` never import TypeScript or know Medusa's types.
- **Every model call goes through the LiteLLM proxy (ADR 0009).** No direct provider SDK clients.
- **The agent database is the only source of the conversation (ADR 0020).** A turn rebuilds its history from the stored messages, never from what the caller sends.
- **Approvals come from the operator or a versioned policy (ADR 0011, ADR 0014).** Money moves in Medusa on the operator's click or the policy's decision, never on the model's say-so.
- **Storefront content stays in git, search stays on Medusa (ADR 0017).**
- A change that contradicts an ADR is a finding, even when the code is good. The fix is a new ADR, decided by a person, not a quiet override.

## Language

- Use the terms of `GLOSSARY.md` in names, tests, comments, commit messages and PR text: **shopper**, not user or customer, in support code; **operator**, not admin; **turn**, **support case**, **handoff**, **commerce port**. Don't use the words listed under _Avoid_.
- A concept the glossary lacks is either invented language (rename it) or a real gap (say so in the PR, for `/domain-modeling`).

## Comments and docs

- Comments say why, not what: the constraint, the decision or the trap. Name the ADR or the doc when one holds the reason (`see ADR 0020`, `docs/design.md#budgets`).
- Plain words and short sentences, in the voice of the existing code: "A URL, not key=value: the service's settings take only URLs."
- Every module starts with a docstring or comment saying what it is for. Public functions and types get a one-line doc comment when the name doesn't say it all.
- No commented-out code. A TODO names the gap and why it's left for now, with an issue number when there is one.
- A change in behaviour that a runbook or `docs/design.md` describes updates that doc in the same branch, as a `docs(...)` commit.

## TypeScript

Formatting is Prettier's: no semicolons, trailing commas, and in `apps/backend` single quotes and 100 columns. ESLint runs `@medusajs/eslint-plugin`.

- **Strict types, no escape hatches.** No `any`, no `as` casts to silence the checker, no non-null `!` on values that can really be missing. Narrow with a type guard or a check, or parse at the boundary. `as const` is fine.
- **Parse input at the boundary.** Request bodies, query strings, cookies, environment variables and responses from other services are validated once, where they enter, and typed from then on. Inside, trust the types.
- **Literal unions over enums**, as in `PortErrorCode`. Unions of the contract's strings keep the TypeScript and the OpenAPI file in step.
- **Errors at the port follow the contract:** `{ code, message }` through `sendPortError`, with the contract's codes, never Medusa's `{ type, message }`.
- **Backend (Medusa v2):** routes under `src/api/`, business logic in modules and workflows, not in route handlers. Workflow steps that write must be idempotent or have a compensation. Migrations must roll back (`pnpm check:migrations`).
- **Storefront (Next.js):** data access in `src/lib/data`, server-only secrets never reach a client component, and the store API is called through the Medusa SDK.
- Prefer small named functions and early returns over nested conditionals. No nested ternaries.

## Python

ruff (`E, W, F, I, B, UP, SIM, RUF, S, PT, TID`) and mypy `--strict` are the authority. Python 3.12, 100 columns.

- **Fully typed.** No `Any` in a public signature, no `# type: ignore` or `# noqa` without a comment saying why it's right.
- **Data as frozen dataclasses or pydantic models**, states as `Literal` unions, as in `agent_core.cases`.
- **Errors are specific types** with a docstring, subclassing the closest built-in (`CaseNotFoundError(LookupError)`), and carry the data a caller needs.
- **SQL is parameterised.** Identifiers go through `psycopg.sql.Identifier`. Never build SQL with f-strings.
- **Async all the way** in the agent service and core: no blocking calls on the event loop.
- `agent-core` is a library: no FastAPI, no settings, no environment reads. `apps/agent` is the shell that wires it up.

## Tests

### What a test is

- A test checks behaviour through a public interface: a route, a package's exports, a module's functions. It survives a refactor that keeps the behaviour.
- The test name is a sentence about the behaviour, in domain words: `test_a_turn_stores_both_messages_with_its_correlation_id`, `"a cookie signed with another secret is not a case"`.
- One behaviour per test. Arrange, act, then assert, with a blank line between them.
- Every new behaviour and every bug fix comes with a test that failed before the change.

### Where tests live and what they run against

| Code | Runner | Where |
| --- | --- | --- |
| Backend routes | Jest, `medusaIntegrationTestRunner` | `apps/backend/integration-tests/http/*.spec.ts` |
| Backend units | Jest | `src/**/__tests__/*.unit.spec.ts` |
| Storefront | `node:test` | `src/**/*.test.ts`, next to the code |
| Agent service | pytest | `apps/agent/tests/` |
| Agent core | pytest | `packages/agent-core/tests/` |

- **Real databases, not mocks.** Backend integration tests run against Postgres and Redis; Python tests use the `database_url` fixture's throwaway, migrated database.
- **Contract tests at the port.** Support route tests check every response against the OpenAPI contract (`contract.expectResponse`).
- **No model calls in tests.** The agent's model is `ScriptedChatModel`. Real-model behaviour belongs to evals (`evals/`), not to tests.
- **Mock only at system boundaries**: other services over HTTP, time, randomness. Never mock the repo's own modules or classes. If something is hard to test without that, the interface is wrong.
- Test secrets are obviously fake (`test-agent-secret-0123…`) and never look like a real key.
- Never skip, delete or loosen a test to make a branch pass.

## Security and data

- **Secrets come from the environment**, never from code, fixtures or logs. `.env` files are never committed.
- **The shopper's identity is proven, not claimed.** Order data is read only with a verification grant from the support routes (`docs/design.md#identity-authentication-and-authorization`).
- **No personal data in logs or traces**: email, address, postcode, phone and order contents are masked or left out. Correlation IDs and case IDs are fine.
- Shared-secret comparisons are constant-time.

## Commits and pull requests

- Conventional Commits: `type(scope): subject (#issue)`. The types are `feat`, `fix`, `test`, `refactor`, `docs`, `ci`, `chore`, and the scope is the area (`backend`, `storefront`, `agent`, `agent-core`, `evals`, `contracts`, `compose`, `seed`, `scripts`, `factory`, or the docs folder).
- The subject is plain words in lowercase, with no full stop, and says what changes for the reader.
- One logical change per commit, split by type: behaviour, its standalone tests, and docs in separate commits.
- The PR body has Summary, Evidence and Merge Danger sections, from the `pr` skill or the factory's built-in template. It lists every acceptance criterion that wasn't verified, and closes its issue.
