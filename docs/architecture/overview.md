# Architecture overview

The test store as of 21 October 2026: what runs, where, how a commit reaches Railway, and what the roadmap still adds. Sources: [the Railway runbook](../runbooks/railway.md), [ADR 0005](../adr/0005-medusa-as-commerce-platform.md), [ADR 0006](../adr/0006-railway-hosts-the-test-store.md), [containers](containers.md), `.github/workflows/ci.yml`, `compose.yaml`, `apps/backend/medusa-config.ts`, the [core roadmap](../research/top-1-percent-ai-agent-engineer-roadmap.md) and the Setup 2 issues under [#3](https://github.com/Tirso0882/goods/issues/3).

## How to read this

- The diagrams go from the outside in: who talks to the store, how Railway hosts it, how a commit gets there, what one request does, how the same images run on a laptop, and what is still planned.
- Every flowchart uses the same shapes:

  | Shape | Kind of thing | Example |
  | --- | --- | --- |
  | `(( ))` circle | Person | Shopper, store admin |
  | `[ ]` rectangle | Service or process we run | `medusa-server`, CI job |
  | `[( )]` cylinder | Datastore | Postgres, Redis, R2 bucket |
  | `[[ ]]` double-sided box | External SaaS or platform | Stripe, GHCR, Railway API |

- Arrow labels say what flows, then the protocol: **HTTPS** (public internet, TLS), **private HTTP** (inside Railway's `*.railway.internal` network or a Compose network), **Postgres**, **Redis**, **webhook** (HTTPS POST started by a SaaS).
- Dashed lines and boxes are **planned**; solid ones run today.
- Sequence diagrams use stick figures for people and plain boxes for everything else, with the kind in brackets in the name.

## 1. System context

Who and what the test store talks to today. Shoppers and the admin reach Railway over HTTPS; Stripe calls back with webhooks; product uploads go to a Cloudflare R2 bucket; GitHub builds the images that Railway deploys. The developer laptop reaches the private databases only through `railway ssh` or `railway connect`.

```mermaid
flowchart LR
  shopper(("Shopper"))
  admin(("Store admin"))
  dev(("Developer laptop"))

  store["goods test store<br/>on Railway<br/>(goods-throwaway)"]

  stripe[["Stripe<br/>test mode, goods sandbox"]]
  r2[("Cloudflare R2<br/>goods-throwaway-media<br/>EU jurisdiction")]
  github[["GitHub<br/>repo, Actions CI"]]
  ghcr[["GHCR<br/>goods-backend, goods-storefront"]]
  railway[["Railway platform<br/>dashboard, CLI, API"]]

  shopper -->|"pages, cart, checkout · HTTPS"| store
  shopper -->|"card details, 3DS · HTTPS (Stripe.js)"| stripe
  shopper -->|"product images · HTTPS (r2.dev)"| r2
  admin -->|"Admin /app · HTTPS"| store
  store -->|"PaymentIntents · HTTPS"| stripe
  stripe -->|"payment_intent.* events · webhook"| store
  store -->|"uploaded files · HTTPS (S3 API)"| r2
  dev -->|"git push, PRs · HTTPS"| github
  github -->|"SHA-tagged images · HTTPS"| ghcr
  railway -->|"pulls images · HTTPS"| ghcr
  dev -->|"settings, image tag, deploy · HTTPS"| railway
  railway -->|"runs and deploys"| store
  dev -.->|"railway ssh / connect · encrypted tunnel"| store
```

Legend: circles are people, rectangles are services we run, cylinders are datastores, double-sided boxes are external platforms. The dotted laptop arrow is an operator tunnel, not a public route.

## 2. Deployment on Railway

The `goods-throwaway` project in EU West (Amsterdam), environment `production`. Only `medusa-server` and `storefront` have public domains; everything else is reached on `*.railway.internal`. Postgres and Redis keep data on volumes and have no TCP proxy. The server migrates in a pre-deploy container before each release, and Railway switches traffic only after the health check passes.

```mermaid
flowchart TB
  shopper(("Shopper"))
  admin(("Store admin"))
  stripe[["Stripe"]]
  r2[("Cloudflare R2<br/>goods-throwaway-media")]

  subgraph rw["Railway project goods-throwaway · env production · EU West"]
    direction TB
    sf["storefront<br/>goods-storefront:SHA<br/>:8000 · health /api/health<br/>public: storefront-production-f245.up.railway.app"]
    srv["medusa-server<br/>goods-backend:SHA<br/>MEDUSA_WORKER_MODE=server · :9000<br/>health /ready · public: medusa-server-production-166b.up.railway.app"]
    pre["pre-deploy: medusa db:migrate<br/>same image, one-off, 600 s timeout"]
    wrk["medusa-worker<br/>goods-backend:SHA<br/>MEDUSA_WORKER_MODE=worker · :9000<br/>health /health · no public domain"]
    pg[("Postgres<br/>pgvector 0.8.7, pg17 · :5432<br/>volume /var/lib/postgresql<br/>no public access")]
    rd[("Redis 8.10.2 · :6379<br/>AOF on, password<br/>volume /data · no public access")]
  end

  shopper -->|"pages · HTTPS"| sf
  shopper -->|"Store API from browser · HTTPS"| srv
  admin -->|"Admin /app, /admin/* · HTTPS"| srv
  stripe -->|"payment events · webhook"| srv
  sf -->|"Store API, server side · private HTTP<br/>medusa-server.railway.internal:9000"| srv
  pre -->|"schema migrations · Postgres"| pg
  pre -.->|"runs before each release of"| srv
  srv -->|"queries · Postgres<br/>postgres.railway.internal:5432"| pg
  srv -->|"events, workflows, locks, cache · Redis<br/>redis.railway.internal:6379"| rd
  wrk -->|"queries · Postgres"| pg
  wrk -->|"consumes events, runs workflows · Redis"| rd
  srv -->|"uploaded files · HTTPS (S3 API)"| r2
  srv -->|"PaymentIntents · HTTPS"| stripe
  wrk -->|"verifies and processes events · HTTPS"| stripe
```

Legend: rectangles are Railway services we deploy, cylinders are datastores (the two inside the box are Railway services with volumes, R2 is outside Railway), the double-sided box is external SaaS. The dotted arrow means "runs before", not a data flow. Port 9000 on the worker serves only Railway's health check.

## 3. Build and release pipeline

A push to `main` runs five required CI jobs, then the `publish` matrix pushes both images to GHCR tagged with the full commit SHA and attests their provenance. The `deploy` job then points the Railway services at that SHA through Railway's public API, server first, and waits for each deployment to succeed before the next ([#17](https://github.com/Tirso0882/goods/issues/17), [deploy and rollback runbook](../runbooks/deploy-and-rollback.md)). Rollback is the same workflow run by hand with an older SHA.

```mermaid
flowchart TB
  push["push to main<br/>(merged PR)"]

  subgraph ci["GitHub Actions · ci.yml"]
    direction LR
    fmt["format"]
    lint["lint"]
    tc["typecheck"]
    test["test<br/>with Postgres + Redis<br/>service containers"]
    build["build"]
  end

  pub["publish (backend)<br/>publish (storefront)<br/>linux/amd64"]
  ghcr[["GHCR<br/>goods-backend:SHA<br/>goods-storefront:SHA<br/>+ build attestation"]]

  job["deploy job (deploy.yml)<br/>serviceInstanceUpdate, then deploy<br/>server → worker → storefront<br/>project token · environment production"]
  rb["Deploy run by hand<br/>older SHA = rollback"]

  pull[["Railway pulls images"]]
  mig["medusa-server pre-deploy:<br/>medusa db:migrate"]
  hc["health checks<br/>/ready · /health · /api/health"]
  live["live: traffic switched<br/>to the new deployment"]
  fail["deploy stops,<br/>old version keeps serving"]

  push --> ci
  fmt & lint & tc & test & build -->|"all green"| pub
  pub -->|"images · HTTPS (docker push)"| ghcr
  pub --> job
  rb --> job
  job -->|"image tag · HTTPS (Railway API)"| pull
  ghcr -->|"image · HTTPS"| pull
  pull -->|"image · HTTPS"| mig
  mig -->|"exit 0"| hc
  mig -->|"fails"| fail
  hc -->|"2xx"| live
  hc -->|"no 2xx within 300 s"| fail
```

Legend: rectangles are pipeline steps, double-sided boxes are external platforms. Pull request runs stop after `build`: `publish` only runs on `main`.

## 4. Runtime request flows

### 4a. A shopper opens /pl

The page is a React Server Component, so the browser only talks to the storefront. The storefront's server calls the Store API over the private network with the publishable key; Medusa reads the catalog from Postgres and uses Redis for its cache. Product images load straight from their URL.

```mermaid
sequenceDiagram
  actor Shopper
  participant SF as storefront [service]
  participant SRV as medusa-server [service]
  participant RD as Redis [datastore]
  participant PG as Postgres [datastore]

  Shopper->>SF: GET /pl · HTTPS
  Note over SF: middleware and page render on the Next.js server
  SF->>SRV: GET /store/regions, x-publishable-api-key · private HTTP
  SRV->>RD: cache lookup · Redis
  SRV->>PG: regions, api_key, sales channel · Postgres
  SRV-->>SF: regions JSON · private HTTP
  SF->>SRV: GET /store/products?region_id=… · private HTTP
  SRV->>PG: products, prices (PLN), inventory · Postgres
  SRV-->>SF: products JSON · private HTTP
  SF-->>Shopper: rendered HTML · HTTPS
  Shopper->>SF: GET /api/store-config · HTTPS
  SF-->>Shopper: public backend URL, publishable key · HTTPS
  Note over Shopper: search and option picker then call the Store API on the server's public domain
```

Legend: stick figure is a person; `[service]` and `[datastore]` mark the kind of each box. Solid arrows are requests, dashed arrows are responses.

### 4b. A Stripe test checkout

Cart and payment-session calls go through the storefront's server actions to the Store API, which creates a PaymentIntent at Stripe. The browser confirms the card with Stripe.js and returns to `/api/payment-return`, which completes the cart. Independently, Stripe posts a webhook to the server, which acknowledges it and queues `payment.webhook_received` in Redis; the worker verifies the signature and processes it, so the order exists even if the shopper closes the tab.

```mermaid
sequenceDiagram
  actor Shopper
  participant SF as storefront [service]
  participant SRV as medusa-server [service]
  participant ST as Stripe [SaaS]
  participant RD as Redis [datastore]
  participant WRK as medusa-worker [service]
  participant PG as Postgres [datastore]

  Shopper->>SF: choose Credit card (server action) · HTTPS
  SF->>SRV: POST payment-collections/…/payment-sessions · private HTTP
  SRV->>ST: create PaymentIntent (sk_test) · HTTPS
  ST-->>SRV: PaymentIntent, client_secret · HTTPS
  SRV->>PG: payment session · Postgres
  SRV-->>SF: cart with session · private HTTP
  SF-->>Shopper: checkout page with pk_test · HTTPS
  Shopper->>ST: stripe.confirmPayment(card 4242…) · HTTPS
  ST-->>Shopper: redirect to /api/payment-return · HTTPS
  Shopper->>SF: GET /api/payment-return?cart_id&payment_intent · HTTPS
  SF->>SRV: POST /store/carts/:id/complete · private HTTP
  SRV->>PG: order, payment, capture · Postgres
  SRV-->>SF: order · private HTTP
  SF-->>Shopper: redirect to order confirmation · HTTPS

  par Stripe webhook (any time after confirm)
    ST->>SRV: POST /hooks/payment/stripe_stripe · webhook
    SRV-->>ST: 200 (acknowledged, not yet processed)
    SRV->>RD: emit payment.webhook_received · Redis
    RD-->>WRK: deliver event · Redis
    WRK->>WRK: verify signature with STRIPE_WEBHOOK_SECRET
    WRK->>PG: authorize/capture payment, complete cart if still open · Postgres
  end
```

Legend: as in 4a. The `par` block runs alongside the redirect path; whichever arrives second finds the cart already completed and changes nothing ([duplicate delivery is verified](../verification/stripe-failure-paths.md)).

## 5. Local environments

Two ways to run the store on a laptop. `pnpm dev` runs Medusa in shared mode (one process for HTTP and jobs) and Next.js from source, against Postgres and Redis in Docker. The Compose stack runs the same images CI publishes, with the same server/worker split and one-off migrate as Railway; set `BACKEND_IMAGE` and `STOREFRONT_IMAGE` to a GHCR SHA tag to run exactly what is deployed.

### 5a. `pnpm dev`

```mermaid
flowchart LR
  you(("Developer"))
  stripe[["Stripe CLI<br/>stripe listen"]]

  subgraph host["Laptop, from source"]
    direction TB
    sfd["Next.js storefront<br/>next dev · :8000"]
    md["Medusa backend<br/>shared mode · :9000<br/>API, Admin /app, jobs"]
  end

  subgraph dk["Docker"]
    direction TB
    pgd[("goods-postgres<br/>pgvector, pg17 · :5432<br/>volume goods-pgdata")]
    rdd[("goods-redis · :6379<br/>volume goods-redisdata")]
  end

  you -->|"pages · HTTP localhost:8000"| sfd
  you -->|"Admin · HTTP localhost:9000/app"| md
  sfd -->|"Store API · HTTP localhost:9000"| md
  md -->|"queries · Postgres"| pgd
  md -->|"events, workflows, locks, cache · Redis"| rdd
  stripe -->|"forwarded events · webhook (HTTP localhost)"| md
```

### 5b. Compose stack: long-running services (`compose.yaml`)

```mermaid
flowchart LR
  you(("Developer"))

  subgraph cs["Compose project goods-stack · one private network"]
    direction LR
    sfc["storefront<br/>127.0.0.1:8000"]
    srvc["medusa-server<br/>server mode · 127.0.0.1:9000"]
    wrkc["medusa-worker<br/>worker mode · no port"]
    pgc[("postgres · pgvector, pg17<br/>5432 internal · volume pgdata")]
    rdc[("redis · 6379 internal<br/>AOF · volume redisdata")]
    static[("medusa-static volume<br/>uploads")]
    oll["ollama 0.40.3 · 11434 internal<br/>volume ollama<br/>GPU with compose.gpu.yaml"]
  end

  you -->|"pages · HTTP"| sfc
  you -->|"Admin · HTTP"| srvc
  sfc -->|"Store API · private HTTP<br/>medusa-server:9000"| srvc
  srvc -->|"queries · Postgres"| pgc
  srvc -->|"events, workflows, locks, cache · Redis"| rdc
  wrkc -->|"queries · Postgres"| pgc
  wrkc -->|"consumes events · Redis"| rdc
  srvc & wrkc -->|"uploaded files · volume mount"| static
```

### 5c. Compose stack: one-off containers

```mermaid
flowchart LR
  ghcr[["GHCR SHA images<br/>or local build"]]
  mig["medusa-migrate<br/>every up"]
  key["publishable-key<br/>every up"]
  setup["setup profile:<br/>medusa-seed,<br/>medusa-admin-user"]
  pull["ollama-pull<br/>setup profile"]
  pgc[("postgres")]
  kv[("publishable-key volume")]
  sfc["storefront"]
  srvwrk["medusa-server,<br/>medusa-worker"]
  oll["ollama"]

  ghcr -->|"backend image"| mig
  mig -->|"migrations · Postgres"| pgc
  mig -->|"exit 0 gates start of"| srvwrk
  mig -->|"exit 0 gates"| key
  key -->|"reads key · Postgres"| pgc
  key -->|"key file"| kv
  kv -->|"read at start"| sfc
  setup -->|"seed, admin user · Postgres"| pgc
  pull -->|"pull model · private HTTP"| oll
```

Legend for 5a to 5c: as in diagram 1. In 5c, "gates" arrows are start order (`depends_on: service_completed_successfully`), not data. In Compose nothing calls Ollama yet: it waits for the agent. Without `S3_BUCKET`, server and worker share uploads on the `medusa-static` volume instead of R2.

| | `pnpm dev` | Compose | Railway |
| --- | --- | --- | --- |
| Backend | source, shared mode | `goods-backend` image, server + worker | `goods-backend:<sha>`, server + worker |
| Storefront | `next dev` | `goods-storefront` image | `goods-storefront:<sha>` |
| Migrations | `pnpm medusa db:migrate` by hand | `medusa-migrate` one-off on every `up` | server pre-deploy command |
| Files | local provider | `medusa-static` volume | R2 bucket |
| Stripe webhook | `stripe listen` | `stripe listen` | Stripe Dashboard endpoint |

## 6. Target architecture

What the roadmap adds to diagram 2. A Python agent service (FastAPI, LangGraph, LiteLLM) joins the project on the private network; it changes store data only through Medusa's APIs ([ADR 0005](../adr/0005-medusa-as-commerce-platform.md)), keeps its own tables in a separate Postgres schema, and searches FAQ and policy documents with pgvector. A nightly cron writes encrypted `pg_dump` backups to a separate R2 bucket ([#19](https://github.com/Tirso0882/goods/issues/19)), and the whole project is rebuilt from the runbook as the real one ([#18](https://github.com/Tirso0882/goods/issues/18)).

### 6a. The support agent on Railway

```mermaid
flowchart TB
  shopper(("Shopper"))
  admin(("Store admin<br/>approves refunds"))
  model[["Hosted model (planned)<br/>default: Claude Sonnet on Bedrock,<br/>eu-central-1"]]
  langfuse[["Langfuse Cloud EU (planned)<br/>traces and cost"]]

  subgraph rw["Real Railway project · EU West (planned)"]
    direction TB
    sf["storefront<br/>+ chat widget (planned)"]
    srv["medusa-server"]
    wrk["medusa-worker"]
    agent["agent service (planned)<br/>Python, FastAPI, LangGraph, LiteLLM"]
    pg[("Postgres + pgvector<br/>Medusa schema<br/>+ agent schema (planned)")]
  end

  shopper -->|"pages, chat · HTTPS"| sf
  sf -->|"Store API · private HTTP"| srv
  srv -->|"store data · Postgres"| pg
  sf -.->|"chat messages · private HTTP (planned)"| agent
  agent -.->|"tool calls: orders, returns · private HTTP (planned)"| srv
  wrk -.->|"order events (planned)"| agent
  agent -.->|"cases, approvals, checkpoints,<br/>search_faq vectors · Postgres (planned)"| pg
  agent -.->|"completions via LiteLLM · HTTPS (planned)"| model
  agent -.->|"traces · HTTPS (planned)"| langfuse
  admin -.->|"approve or reject refunds (planned)"| agent

  classDef planned stroke-dasharray: 5 5
  class agent,model,langfuse planned
```

Legend: shapes as in diagram 1; dashed outlines and arrows are planned. Redis, Stripe and R2 are left out here: nothing about them changes for the agent.

### 6b. Backups, monitoring and the real project

```mermaid
flowchart LR
  uptime[["Uptime monitor<br/>outside Railway (planned)"]]
  r2m[("R2 media bucket<br/>goods-throwaway-media")]
  r2b[("R2 backups bucket<br/>EU, separate token (planned)")]

  subgraph rw["Real Railway project · EU West (planned)<br/>rebuilt from the runbook, Hobby plan, replaces goods-throwaway"]
    direction TB
    sf["storefront"]
    srv["medusa-server"]
    cron["backup cron (planned)<br/>nightly encrypted pg_dump"]
    pg[("Postgres<br/>+ Railway volume backups (planned)")]
  end

  srv -->|"product files · HTTPS (S3 API)"| r2m
  cron -.->|"pg_dump · Postgres (planned)"| pg
  cron -.->|"encrypted dumps · HTTPS S3 API (planned)"| r2b
  uptime -.->|"/api/health · HTTPS (planned)"| sf
  uptime -.->|"/ready · HTTPS (planned)"| srv

  classDef planned stroke-dasharray: 5 5
  class cron,uptime,r2b planned
```

Legend: shapes as in diagram 1; dashed means planned. Media and backups use separate buckets, so a credential leaked from the store can't touch the backups (ADR 0006). The restore drill in #19 restores into an isolated environment, which is not drawn.

### 6c. Agent model routing: local and hosted

```mermaid
flowchart LR
  subgraph laptop["Developer laptop (MSI, RTX 4070)"]
    direction TB
    agentl["agent service (planned)<br/>in Compose"]
    olla["ollama · :11434<br/>nemotron-3-nano:4b,<br/>embedding models"]
  end
  agentp["agent service on Railway (planned)"]
  hosted[["Hosted model API (planned)<br/>one provider through LiteLLM"]]

  agentl -.->|"dev loop, free evals, embeddings · private HTTP (planned)"| olla
  agentl -.->|"baseline runs · HTTPS (planned)"| hosted
  agentp -.->|"all production traffic · HTTPS (planned)"| hosted

  classDef planned stroke-dasharray: 5 5
  class agentl,agentp,hosted planned
```

Legend: shapes as in diagram 1; dashed means planned. Ollama itself already runs in Compose (solid). Production has no GPU, so Ollama never runs on Railway.

## Assumptions

- **Stripe webhook on Railway.** The runbook does not yet record the deployed webhook endpoint; [#16](https://github.com/Tirso0882/goods/issues/16) requires one at the public HTTPS URL. Diagrams 2 and 4b assume it uses the same route as locally, `/hooks/payment/stripe_stripe` on `medusa-server`.
- **Webhook processing in 4b.** The server-acknowledges, worker-processes split is from the runbook ("the Stripe webhooks the server queues") and the local verification; the exact Medusa calls the worker makes after verifying are summarized, not traced.
- **Redis in 4a.** Medusa's Redis caching module is configured, but which Store API reads hit the cache was not measured; the arrow shows the configured path.
- **Private host names.** `postgres.railway.internal` and `redis.railway.internal` follow Railway's naming from the service names; the runbook only says the URLs use `${{RAILWAY_PRIVATE_DOMAIN}}`.
- **Store API calls from the browser.** The runbook says browsers call the Store API on the server's public domain for search and the option picker; other cart calls go through storefront server actions (`apps/storefront/src/lib/data/cart.ts`).
- **Chat path in 6a.** The roadmap shows "storefront → agent (chat widget)" but not whether the browser or the storefront server calls the agent, or whether the agent gets a public domain. The diagram assumes the storefront server calls it over the private network, keeping the agent private like the worker.
- **Order events to the agent.** The roadmap shows "order events" from Medusa to the agent without a transport; the diagram draws them from the worker, which runs subscribers.
- **Agent data placement.** The roadmap puts agent tables in a separate schema of the same Postgres; diagram 6a draws one database with two schemas, not a second Postgres service.
- **Hosted model.** Claude Sonnet on Amazon Bedrock (`eu-central-1`) is the roadmap's default, not a recorded decision; the "Hosted model provider" field is still open.
- **Backup cron and plan.** The backup cron is a sixth service, so ADR 0006 requires upgrading to Hobby first; R2 config and Railway config backups from #19 are not drawn.
