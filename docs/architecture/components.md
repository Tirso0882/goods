# Components running today

Local stack as of 9 October 2026. Only what runs now: no agent, worker, Stripe, or VPS yet.

```mermaid
flowchart LR
  Browser["Browser"]
  Admin["Admin user"]

  subgraph Laptop["Laptop (macOS)"]
    Storefront["Next.js storefront<br/>:8000"]
    subgraph Medusa["Medusa server :9000"]
      StoreAPI["Store API /store"]
      AdminAPI["Admin API /admin"]
      Dashboard["Admin dashboard /app"]
    end
    subgraph Docker["Docker Desktop"]
      Postgres[("goods-postgres<br/>Postgres 17 + pgvector<br/>:5432")]
      Redis[("goods-redis<br/>Redis 8<br/>:6379")]
    end
  end

  S3[("Bamoer product images<br/>cdn.shopify.com")]

  Browser -->|"HTTP pages"| Storefront
  Storefront -->|"JS SDK, server side<br/>x-publishable-api-key"| StoreAPI
  Storefront -->|"next/image fetch"| S3
  Admin -->|"HTTP"| Dashboard
  Dashboard -->|"session cookie"| AdminAPI
  StoreAPI --> Postgres
  AdminAPI --> Postgres
  Medusa -->|"events, workflows,<br/>locks, cache, sessions"| Redis
```

- The storefront renders on the Next.js server, so the browser only talks to port 8000 for store pages.
- Medusa runs in shared mode: one process serves the APIs, the dashboard, and background jobs.
- The seeded catalog's images are hotlinked from Bamoer's Shopify CDN, for local development only. Images uploaded in Admin are stored on the laptop by Medusa's local file provider.
