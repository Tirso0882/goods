# E-commerce project: AI features you can build

Research date: 25 September 2026. Source link analysed: [NVIDIA retail resources hub](https://resources.nvidia.com/en-us-resources-for-retail-practitioner/). The hub is a list of links; the useful content is in the pages it points to, cited below.

## What matters from the NVIDIA material

**From the 2026 State of AI in Retail and CPG survey** ([NVIDIA blog, Jan 2026](https://blogs.nvidia.com/blog/ai-in-retail-cpg-survey-2026/)):

- 47% of retail and CPG companies are using or assessing agentic AI.
- The top goals for agents are process speed and efficiency (57%), customer experience and personalization (40%), and better real-time decisions (40%).
- 79% say open-source models and software matter to their AI strategy.
- 41% report improved customer service as an AI benefit.
- Advice quoted in the report: "start with boring use cases that solve specific P&L problems, prove the value, then scale."

**From "How AI Agents Enhance Online Shopping"** ([NVIDIA blog](https://blogs.nvidia.com/blog/ai-agents-online-shopping/)):

- There are three kinds of online shopping agents, and each builds on the one before:
  1. **Catalog enrichment:** attributes, titles, descriptions, service info.
  2. **Search:** semantic and personalized.
  3. **Shopping assistant:** conversational recommendations on top of the first two.
- Extras: virtual try-on, voice, omnichannel, 24/7 multilingual support.
- The building blocks are an LLM, retrieval over structured and unstructured data, guardrails, and optionally speech and 3D simulation.
- 64% of those investing in AI for digital retail prioritize hyper-personalized recommendations. This figure is from NVIDIA's earlier survey, as quoted in the blog.

**From NVIDIA's open-source retail shopping assistant blueprint** ([GitHub](https://github.com/NVIDIA-AI-Blueprints/retail-shopping-assistant), [architecture notes](https://github.com/NVIDIA-AI-Blueprints/retail-shopping-assistant/blob/main/AGENTS.md)). This is a useful reference architecture to read:

- FastAPI plus LangGraph "chain server" with planner, retriever, cart, chatter, and summary steps.
- Catalog retriever using text and image embeddings in Milvus.
- Memory service (SQLite) for per-user context and cart.
- Guardrails service wrapping NeMo Guardrails, checking input and output.
- React UI streaming responses over server-sent events.
- Docker Compose, with unit and integration tests and CI.

**What this means for your project:** split it into three layers. The commerce core (catalog, cart, checkout, orders) comes first. The data layer (catalog data, embeddings, events) sits on top. AI features sit on top of both. Every AI feature needs the commerce core underneath it.

## Feature list

Difficulty: ★ easy, ★★ medium, ★★★ hard. "Risk" means what happens when the AI gets it wrong.

### A. Commerce core (needed before any AI)

Don't build this yourself. Use an open-source commerce platform (see stack below) for:

- catalog, cart, checkout;
- payments (hosted checkout);
- orders, returns, customer accounts;
- admin dashboard, transactional emails, and VAT and shipping rules.

### B. Customer-facing AI

| # | Feature | What it does | Difficulty | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **Customer support agent** | Order status, returns, address changes, FAQ; refunds with your approval | ★★★ | Medium (it takes actions) | The core roadmap. Best for learning tools, approvals, idempotency |
| 2 | **Semantic product search** | Finds products from vague or misspelled queries | ★★ | Low | Hybrid keyword plus vector search. Improves conversion directly |
| 3 | **Shopping assistant** | Chat that recommends products and adds them to the cart | ★★★ | Low to medium | What the NVIDIA blueprint does. Needs 2 first |
| 4 | **Visual search** | Upload a photo, get similar products | ★★ | Low | Image embeddings (CLIP-style models) |
| 5 | **Recommendations** | "You may also like", personalized home page | ★★ | Low | Strongly fits your data engineering skills |
| 6 | Voice assistant | Browse and ask by voice | ★★★ | Low | Skip for now |
| 7 | Virtual try-on | See the product on you or in your room | ★★★ | Low | Needs GPUs and 3D or vision work. Skip |

### C. Back-office AI (running the store)

| # | Feature | What it does | Difficulty | Risk | Notes |
|---|---|---|---|---|---|
| 8 | **Catalog enrichment agent** | Turns supplier data and photos into titles, descriptions, attributes, and PL/EN translations; you approve before publishing | ★★ | Low (approved before going live) | The "boring P&L" case. A new store needs it from day one. Chosen as the second project |
| 9 | Review analysis | Summarizes reviews, flags product problems | ★ | Low | Easy win once reviews exist |
| 10 | Ops copilot | "How did sales go yesterday?" answered from your data | ★★ | Low | Text-to-SQL over your warehouse; fits your Databricks background |
| 11 | Demand forecasting and stock alerts | Predicts sales, warns before stock runs out | ★★ | Medium | Classic forecasting plus an agent that drafts purchase orders |
| 12 | Marketing content agent | Drafts emails, social posts, promotions | ★ | Low (approved) | Human approval before sending |
| 13 | Pricing suggestions | Proposes price changes from demand and competitors | ★★★ | High (money) | Build last |

### D. Platform (every feature needs these to be production-ready)

- **LLM gateway:** one place to switch models and track cost.
- **Guardrails:** input and output checks, staying on topic.
- **Evals in CI:** tau-bench plus your own test sets.
- **Tracing and cost dashboard.**
- **Durable workflows:** so approvals and retries survive crashes.
- **Vector store.**
- **Secrets, CI/CD, infrastructure as code, backups.**
- **GDPR handling of chat logs and customer data.**
- **AI disclosure to customers** (EU AI Act).

## Recommended open-source stack

| Layer | Choice | Why |
|---|---|---|
| Commerce core | [Medusa](https://github.com/medusajs/medusa) (core under MIT; Enterprise Edition parts need a commercial agreement) | A framework built for customizing, with a Next.js storefront. Good for a solo developer |
| Alternative | [Saleor](https://github.com/saleor/saleor) (Python/Django, GraphQL) | Stays in Python. Its own README warns the service-oriented approach can feel complex for a single developer with a small business |
| Database and vectors | PostgreSQL with pgvector | One database to run. Milvus (used by NVIDIA) is overkill at your scale |
| AI service | Python, FastAPI, LangGraph | Same as the NVIDIA blueprint and the core roadmap |
| Model access | LiteLLM gateway | Swap between hosted APIs and open-weight models without code changes |
| Guardrails | NeMo Guardrails | Open source, and used in the NVIDIA blueprint |
| Tracing and evals | Langfuse Cloud EU plus OpenTelemetry; tau-bench plus pytest | Cost and trace dashboard, evals in CI. Self-host Langfuse later, on separate capacity: its stack is too big for the store's VPS |
| Infrastructure | Docker, GitHub Actions, [Coolify](https://github.com/coollabsio/coolify) on an EU VPS | No Azure access. Coolify is an open-source, self-hosted alternative to Heroku and Vercel |
| Local models | Ollama on the laptop RTX 4070 (8 GB VRAM), Nemotron 3 Nano 4B | Embeddings, small models, free eval runs; the main agent uses a hosted API |
| Synthetic data and agent profiling | NeMo Data Designer, NeMo Agent Toolkit (both Apache 2.0) | Eval conversations in Step 9; token and latency profiling in Step 10 |
| Payments | Stripe in test mode (not open source, but you shouldn't build payments) | Add Polish methods such as BLIK or Przelewy24 when you go live |

## Commerce platform comparison

What the support agent needs from the platform:

- A clean API for orders, returns, refunds, and customers, so each agent tool is a thin wrapper.
- Webhooks or events, so the agent can react to order changes.
- A stack you can run and debug alone.

| Platform | Stack | License | API for agent tools | Fit for this project |
|---|---|---|---|---|
| [Medusa](https://github.com/medusajs/medusa) | TypeScript / Node, Postgres | Core MIT; Enterprise Edition parts need a commercial agreement | Headless, API-first. Described as a framework for customizing commerce | **Best fit.** Modern, API-first, Next.js storefront, one Postgres |
| [Saleor](https://github.com/saleor/saleor) | Python / Django, GraphQL | Open source ("no hidden charges", per README) | API-only, with webhooks, apps, and subscription payloads. Orders include returns | **Strong fit** if you want the whole stack in Python. Its README warns it can feel complex for a single developer with a small business |
| [WooCommerce](https://github.com/woocommerce/woocommerce) | PHP plugin on WordPress | GPL | REST API, but the platform is WordPress plus plugins | Fastest way to a *selling* store with no code. Weak for learning production engineering; plugins add security and upgrade risk |
| [Magento Open Source](https://github.com/magento/magento2) | PHP | OSL 3.0 | Full APIs, but a very large codebase | Overkill for one person. Its own README calls it "basic eCommerce capabilities" and points full-featured needs to paid Adobe Commerce |
| [nopCommerce](https://github.com/nopSolutions/nopCommerce) | ASP.NET Core (.NET 9); SQL Server, PostgreSQL, or MySQL | Check its own license terms before use | Full REST through a separate Web API plugin | Solid and Azure-friendly, but .NET is a new language for you, and the API is an add-on |
| [OpenCart](https://github.com/opencart/opencart) | PHP 8+, MySQL/MariaDB | GPLv3 | Classic PHP monolith, not built API-first | Simple store, poor base for agent tools |
| [Zen Cart](https://github.com/zencart/zencart) | PHP 8, MySQL, Apache | Open source | Classic PHP monolith. The latest release (2.2.2) is PHP 8 fixes on top of the v1.5.4 codebase | Not recommended; oldest architecture of the group |

**Decision (25 September 2026): Medusa.** Saleor was the Python alternative. Both are API-first, which is what an agent needs. The PHP platforms (WooCommerce, OpenCart, Zen Cart, Magento) are built for running a store, not for integrating agents, and would move your learning away from the stack you want to master. WooCommerce is only worth it if selling fast mattered more than learning.

**On models:** open-weight models like NVIDIA's Nemotron family are open, but self-hosting the large ones needs expensive GPUs. Start with hosted APIs behind LiteLLM, and move individual steps to open-weight models once your evals show they're good enough.

## Does "learn and build for production in parallel" make sense?

Yes, with three adjustments:

1. **You're building two products: a store and AI features.** Use Medusa or Saleor for the store so your time goes into the AI and the production engineering, not rebuilding checkout.
2. **Production-ready is not the same as selling.** Run it in production with test payments. Your employer and a lawyer have confirmed you can run the business, so real orders wait only on the steps in "Before taking real orders" in the roadmap.
3. **Stand up the commerce core first,** with synthetic products and orders. The roadmap's Setup 1 and Setup 2 steps do this.
