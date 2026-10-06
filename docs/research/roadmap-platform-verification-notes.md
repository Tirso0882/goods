# Platform verification notes for the Medusa v2 agent roadmap

Checked against primary sources on 2026-09-25. These are implementation inputs, not the final roadmap. Commands below are copied from current official documentation or source unless marked as a choice.

## Recommended compatibility baseline

**Verified**

- Use **Python 3.12** for the agent and evaluation workspace. This is the common supported version across the current tools:
  - tau2-bench requires `>=3.12,<3.14` and currently pins 3.12 in `.python-version` ([README](https://github.com/sierra-research/tau2-bench/blob/main/README.md), [pyproject.toml](https://github.com/sierra-research/tau2-bench/blob/main/pyproject.toml)).
  - NeMo Agent Toolkit requires `>=3.11,<3.14` ([pyproject.toml](https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/develop/pyproject.toml)).
  - NeMo Guardrails supports Python 3.10 through 3.13 ([installation guide](https://docs.nvidia.com/nemo/guardrails/latest/get-started/installation-guide)).
  - Data Designer declares Python `>=3.10` ([pyproject.toml](https://github.com/NVIDIA-NeMo/DataDesigner/blob/main/pyproject.toml)).
- Medusa's installer reference requires Node.js `20.19.0+` or `22.12.0+`. The installation guide permits Node 20 LTS and later LTS versions, but says to use Node 24 LTS or lower with the Next.js starter ([installer reference](https://docs.medusajs.com/resources/create-medusa-app), [installation guide](https://docs.medusajs.com/learn/installation)).

**Roadmap choice**

- Pin Node 24 LTS and Python 3.12 for the whole core roadmap. Node 24 is the newest LTS that Medusa's Next.js starter allows. Commit the generated Node lockfile and a Python `uv.lock`. Do not teach `latest` as a reproducible production pin even when an official bootstrap command uses it.
- Keep tau2-bench in its own `uv` project or workspace boundary. Its current package pins LiteLLM to `>=1.80.15,<1.82.7`, which can conflict with the agent gateway's independently evolving dependencies ([tau2 pyproject](https://github.com/sierra-research/tau2-bench/blob/main/pyproject.toml)).

## Medusa v2 and Next.js starter

**Verified bootstrap**

Prerequisites are Node, Git, and a running PostgreSQL server. The current noninteractive scaffold command is:

```bash
npx create-medusa-app@latest my-medusa-store --with-nextjs-starter
```

The result is a monorepo with `apps/backend` and `apps/storefront`. This monorepo behavior applies since Medusa v2.14.0. The standalone starter is deprecated ([create-medusa-app](https://docs.medusajs.com/resources/create-medusa-app), [starter docs](https://docs.medusajs.com/resources/nextjs-starter)).

**Required storefront configuration**

- Set server-only `MEDUSA_BACKEND_URL` to the backend URL.
- Set `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` to a publishable key created in Medusa Admin.
- Configure at least one region with countries. The current middleware fails when no regions exist.
- `NEXT_PUBLIC_DEFAULT_REGION` is optional and defaults to `us`.

The current starter source deliberately reads `MEDUSA_BACKEND_URL`, not `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, so the backend URL is not exposed as a public Next.js variable ([current middleware source](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/middleware.ts)). The starter documentation still contains an older example using `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, then later documents `MEDUSA_BACKEND_URL` ([starter docs](https://docs.medusajs.com/resources/nextjs-starter)). Follow the current source and generated `.env.template`. This documentation inconsistency is a likely setup failure.

**Required production topology**

- PostgreSQL and Redis are required.
- Run two Medusa instances from the same build: one with `MEDUSA_WORKER_MODE=server`, one with `MEDUSA_WORKER_MODE=worker`. Set `DISABLE_MEDUSA_ADMIN=false` on the server and `true` on the worker.
- Set random, different `JWT_SECRET` and `COOKIE_SECRET`. Set `STORE_CORS`, `ADMIN_CORS`, and `AUTH_CORS` to the exact deployed HTTPS origins.
- The production build is emitted to `.medusa/server`. The official generic start sequence is:

```bash
cd .medusa/server && npm install && npm run predeploy && npm run start
```

The deployment guide also requires production providers rather than in-memory/local defaults: Redis caching, event bus, workflow engine, and locking, plus S3-compatible file storage ([deployment guide](https://docs.medusajs.com/learn/deployment/general)). A version-sensitive detail: the Workflow Engine Redis option was `url` before Medusa v2.12.2 and is now `redisUrl` ([same guide](https://docs.medusajs.com/learn/deployment/general)).

**Failure points to make explicit**

- Do not start server and worker with the default `shared` mode in production, or scheduled jobs and subscribers can run in the wrong topology ([worker mode](https://docs.medusajs.com/learn/production/worker-mode)).
- Do not use the local file provider in production. Container replacement can lose uploaded product files ([File Module](https://docs.medusajs.com/resources/infrastructure-modules/file)).
- Run database migration/predeploy as a single deployment step, not concurrently in every replica. Verify the generated application's `predeploy` script before encoding a command in CI.
- Deploy the backend first, create the production publishable key and region, then deploy the storefront with those values.

## Stripe sandbox checkout

**Verified**

- Medusa includes the Stripe provider. Register `@medusajs/medusa/payment-stripe`, set `STRIPE_API_KEY=sk_test_...`, and enable Stripe on the target region in Admin. For a deployed backend, `webhookSecret` is required ([Medusa Stripe provider](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider/stripe)).
- Stripe sandboxes and test-mode keys do not move real money. Use `pm_card_visa` in server-side test code. `4242 4242 4242 4242` is for interactive testing, not direct server-side card-number calls ([Stripe testing](https://docs.stripe.com/testing)).
- Local webhook verification flow:

```bash
stripe login
stripe listen --forward-to localhost:9000/<medusa-stripe-webhook-path>
stripe trigger payment_intent.succeeded
```

The path is intentionally parameterized. Copy it from the Medusa Stripe provider documentation or the installed version rather than guessing it. Use the `whsec_...` value printed by `stripe listen` for local verification ([Stripe CLI webhooks](https://docs.stripe.com/cli/webhooks)).

**Risk**

- A successful card form is not enough. The Setup 1 step should verify successful payment, decline, 3D Secure, webhook signature failure, duplicate delivery, refund, and delayed webhook handling. Keep test and live keys, webhook secrets, and objects completely separate.

## Local Docker and NVIDIA GPU

**Verified**

- Docker Desktop GPU support is available only on Windows using the WSL 2 backend. It requires an NVIDIA GPU, current Windows and NVIDIA drivers, and an updated WSL kernel:

```powershell
wsl --update
```

Validate container access with Docker's documented test before adding Ollama or another model service ([Docker Desktop GPU](https://docs.docker.com/desktop/features/gpu)).
- In Compose, GPU reservations require `capabilities: [gpu]`. `count` and `device_ids` cannot be used together ([Compose GPU support](https://docs.docker.com/compose/how-tos/gpu-support)).
- Native Linux hosts need NVIDIA Container Toolkit configured for Docker:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Use the package version shown in the current NVIDIA install guide instead of copying an old hard-coded toolkit version ([NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)).

**Roadmap choice**

- GPU support is development-only and optional. The production deployment does not require Docker GPU configuration when inference uses a hosted API. VRAM fit estimates are model, quantization, and context-length dependent, so make `nvidia-smi` plus an actual load test the acceptance check rather than promising that every 4B or 8B model fits.

## Coolify deployment and recovery

**Verified setup**

- The recommended automatic installation supports Ubuntu LTS 20.04, 22.04, and 24.04. It expects SSH, `curl`, firewall setup, and preferably root. Manual installation requires Docker Engine 24+ and Docker installed with Snap is unsupported ([Coolify installation](https://coolify.io/docs/get-started/installation)).

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

- Configure a public Coolify FQDN before GitHub integration. Changing it later breaks existing webhook callback URLs until they are updated.
- Model backend, worker, storefront, agent, PostgreSQL, and Redis as separate resources with explicit health checks and persistent storage. Deploy immutable image tags such as the Git commit SHA, not only `latest`.

**Backups and restore**

- Coolify scheduled PostgreSQL backups use cron. Selected databases use custom-format `pg_dump`; "all databases" uses compressed `pg_dumpall`. Backups can be sent to S3-compatible storage with local and remote retention settings ([backup docs](https://coolify.io/docs/databases/backups), [PostgreSQL docs](https://next.coolify.io/docs/databases/postgresql)).
- Coolify's built-in import supports PostgreSQL while the database is running, but its restore guide says to stop application writes, workers, and scheduled jobs first. Custom-format dumps use `pg_restore`; plain SQL uses `psql` ([restore guide](https://coolify.io/docs/databases/restore)).
- The restore acceptance test must cover all stateful data, not only Medusa:
  1. Medusa PostgreSQL database.
  2. Agent cases, approvals, idempotency records, and LangGraph checkpoints.
  3. S3-compatible product files and generated artifacts.
  4. Coolify's own configuration backup.

Redis is not the source of truth for store or agent business state. Coolify's database restore UI does not support Redis or ClickHouse. Document engine-specific recovery if either contains data that cannot be rebuilt.

**Capacity risk**

- An 8 GiB VPS is a starting experiment, not a verified capacity target. Add memory limits and load-test checkout plus agent traffic. Do not self-host Langfuse on this host: its official Compose guide recommends at least 4 cores, 16 GiB RAM, and about 100 GiB storage by itself ([Langfuse Compose](https://langfuse.com/self-hosting/deployment/docker-compose)).

## GitHub Actions and GHCR

**Verified minimum**

For a GHCR publishing job, GitHub documents:

```yaml
permissions:
  contents: read
  packages: write
```

Authenticate `docker/login-action` to `ghcr.io` with `${{ github.actor }}` and `${{ secrets.GITHUB_TOKEN }}`, then build and push with `docker/build-push-action`. If adding provenance, also grant `attestations: write` and `id-token: write`, and pass the pushed digest to `actions/attest@v4` ([publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)).

**Roadmap choice**

- Pin third-party Actions to full commit SHAs, as GitHub's own example does.
- Run unit tests and a small deterministic eval gate before image publication. Put costly multi-trial or hosted-model evals in a separately budgeted job.
- Publish one image per deployable component tagged with the commit SHA. Let Coolify pull that immutable tag. A private GHCR package requires registry credentials in Coolify; making a demo image public avoids that credential but is a deliberate visibility choice.
- Do not claim that Coolify automatically deploys a GHCR image "on merge" until its webhook or deployment trigger is configured and tested. Git source webhooks and registry-image deployments are different paths.

## LangGraph persistence and approval interrupts

**Verified**

- Install the production checkpointer separately and initialize its schema once:

```bash
pip install langgraph-checkpoint-postgres
```

Use `PostgresSaver` or `AsyncPostgresSaver`, call `.setup()` once, and compile the graph with the checkpointer. Every invocation and resume needs the same stable `thread_id`; keep it under 255 characters. `InMemorySaver` loses state on restart ([checkpointer docs](https://docs.langchain.com/oss/python/langgraph/checkpointers), [persistence troubleshooting](https://docs.langchain.com/oss/python/langgraph/persistence)).
- When supplying a psycopg connection manually, the official package requires `autocommit=True` and `row_factory=dict_row` ([checkpoint-postgres source](https://github.com/langchain-ai/langgraph/tree/main/libs/checkpoint-postgres)).

**Failure points**

- A checkpoint makes graph state durable, but it does not make an external Medusa write exactly once. Keep a unique idempotency record in the agent database, record the proposed action before execution, and reconcile uncertain outcomes before retrying.
- Test the approval flow across a real process restart: interrupt, persist, stop the agent container, start it, then resume with the original `thread_id`.

## LiteLLM and Langfuse

**LiteLLM verified**

- `LITELLM_MASTER_KEY` is required by the current proxy and must be strong. A database is required for virtual keys, Admin UI model management, spend tracking, and enforceable budgets.
- Set `LITELLM_SALT_KEY` once and back it up. Regenerating or changing it makes provider credentials already stored in PostgreSQL unreadable.
- Without a database, `max_budget` does not enforce a global spend cap. Enforce provider-side limits if running config-only LiteLLM ([Docker quickstart](https://docs.litellm.ai/docs/proxy/docker_quick_start), [production deployment](https://docs.litellm.ai/docs/proxy/deploy)).

**Langfuse verified**

- For the Python SDK:

```bash
pip install langfuse
```

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`. Python SDK v4 needs a self-hosted server at least 3.63.0 for tracing, while its default observations and metrics APIs require Langfuse server v4 ([SDK overview](https://langfuse.com/docs/observability/sdk/overview), [compatibility](https://langfuse.com/docs/compatibility)).
- Current self-hosted Langfuse requires PostgreSQL, ClickHouse, Redis or Valkey, and S3-compatible blob storage. Compose has no high availability, scaling, or backup facility. For Langfuse v4, current minimums are PostgreSQL 15, ClickHouse 25.12, and Redis 7.0; PostgreSQL 16, ClickHouse 26.4, and Redis 7.2 are recommended ([v3 to v4 guide](https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4)).
- Self-hosted backups must cover PostgreSQL, ClickHouse, and blob storage. Redis is treated as cache/queue state. Restoring only PostgreSQL is incomplete ([backup guide](https://langfuse.com/self-hosting/configuration/backups)).

**Roadmap choice**

- Use Langfuse Cloud EU during the core roadmap. Self-host later on separate capacity if data policy requires it. Record the SDK and server major together because their APIs are version-coupled.

## tau2-bench

**Verified current install**

```bash
git clone https://github.com/sierra-research/tau2-bench
cd tau2-bench
uv sync
uv run tau2 check-data
uv run tau2 run --domain retail --agent-llm <model> --user-llm <model> --num-trials 1 --num-tasks 5
```

The core install includes text-mode retail. Current installation uses `uv`, not the older `pip install -e .`, and requires Python `>=3.12,<3.14` ([README](https://github.com/sierra-research/tau2-bench/blob/main/README.md), [getting started](https://github.com/sierra-research/tau2-bench/blob/main/docs/getting-started.md)).

**Scope correction**

- The bundled retail benchmark evaluates its own retail environment and policies. Treat an unmodified run as an external baseline and learning exercise. It is not evidence that the Medusa agent works.
- The production agent still needs Medusa-native integration tests that inspect the actual tool arguments and resulting PostgreSQL/API state. Any adapter that connects the agent to tau2 is implementation work and should be version-pinned to the tau2 commit because internal APIs have recently changed.
- Five trials per task multiplies model cost. Start with the documented smoke run above, then expand only after the adapter and scoring are stable.

## NVIDIA tools

**NeMo Guardrails**

```bash
pip install nemoguardrails
pip install langgraph nemoguardrails langchain-openai
```

The second command is NVIDIA's documented LangGraph integration setup. Guardrails runs on CPU and supports Python 3.10 through 3.13. Colang 1.0 remains the default. Colang 2.x is beta and must be selected with `colang_version: "2.x"` ([installation](https://docs.nvidia.com/nemo/guardrails/latest/get-started/installation-guide), [LangGraph integration](https://docs.nvidia.com/nemo/guardrails/integration-with-third-party-libraries/langchain/langgraph-integration), [Colang guide](https://docs.nvidia.com/nemo/guardrails/configure-guardrails/colang)).

**Choice:** use the documented LangGraph `RunnableRails` integration and start with Colang 1.0 unless a required feature justifies the 2.x beta. Guardrails is not a substitute for authorization, customer verification, idempotency, or approval checks in deterministic code.

**NeMo Data Designer**

```bash
pip install data-designer
```

Official default providers use `NVIDIA_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`. Source development uses `uv` and `make install-dev` ([README](https://github.com/NVIDIA-NeMo/DataDesigner/blob/main/README.md), [development guide](https://github.com/NVIDIA-NeMo/DataDesigner/blob/main/DEVELOPMENT.md)).

**Choice:** pin the package in the Python lockfile and save generation configs, seeds, provider/model identifiers, and generated artifacts. Synthetic judged data supplements hand-labeled cases; it does not validate real Medusa side effects.

**NeMo Agent Toolkit**

```bash
pip install "nvidia-nat[langchain]"
pip install "nvidia-nat[profiler]"
pip install "nvidia-nat[eval]"
```

The LangChain extra includes LangGraph integration. Profiler and eval are optional packages, not part of the minimal install. Current supported Python is 3.11 through 3.13. Profiling uses `nat eval` and requires the workflow to be registered with the appropriate framework wrapper ([installation](https://docs.nvidia.com/nemo/agent-toolkit/latest/get-started/installation.html), [profiler](https://docs.nvidia.com/nemo/agent-toolkit/latest/workflows/profiler.html), [CLI](https://docs.nvidia.com/nemo/agent-toolkit/latest/reference/cli.html)).

**Choice:** adopt this only after the native eval harness exists. First prove it can wrap the existing LangGraph without replacing the application architecture. Keep it as profiling/evaluation tooling, not a second orchestration framework.

## Corrections the roadmap should incorporate

Status, 27 September 2026: all twelve are incorporated in `top-1-percent-ai-agent-engineer-roadmap.md`. Recheck the version-sensitive sections of this file with `/research` before Step 8 (LangGraph), Step 10 (NeMo Agent Toolkit), and Step 11 (NeMo Guardrails).

1. Standardize on Python 3.12 and Node 24 LTS for the course, then lock dependencies.
2. Use `MEDUSA_BACKEND_URL` for the current starter and call out the stale public-variable example.
3. Make separate Medusa server and worker deployments, production Redis modules, S3 files, secrets, CORS, and a single migration step explicit acceptance criteria.
4. Require a Stripe webhook secret and webhook failure/duplicate tests, not only a successful test-card checkout.
5. Treat Docker GPU setup as Windows WSL 2 development setup only. Do not make it a production prerequisite.
6. Expand backup work from "nightly database backup" to all PostgreSQL databases, object storage, Coolify configuration, and a write-frozen restore drill.
7. Keep Langfuse Cloud EU in the initial production architecture. Its self-hosted stack exceeds the proposed single 8 GiB VPS budget.
8. Separate tau2's retail benchmark from proof of Medusa correctness. Add a Medusa-native eval suite and pin any tau2 adapter.
9. State that LiteLLM budgets require PostgreSQL and that `LITELLM_SALT_KEY` is durable recovery material.
10. Make LangGraph's Postgres checkpointer, stable `thread_id`, restart/resume test, and application-level idempotency separate requirements.
11. Install NeMo Agent Toolkit optional extras deliberately. Do not assume profiling or eval support is included in the base package.
12. Use immutable commit-SHA image tags and verify the actual Coolify deployment trigger. "Deploys on merge" is configuration, not a default guarantee.
