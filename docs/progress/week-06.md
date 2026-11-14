# Week 6: 1 to 8 November 2026

## Steps and objectives

A planning week between Step 1 and Step 2, with no agent build.

Objectives:

- Plan the store track: one build day a week for store features, alongside the core roadmap ([#107](https://github.com/Tirso0882/goods/issues/107), ADR 0013).
- Reassess the plan after the Railway account was deleted on 7 November, and record what changed as ADRs 0014 to 0019.
- Leave the store green and up to date before Step 2 starts on 9 November: security alerts, image versions, the seed catalog and the release path.

Outcome: the roadmap, `docs/design.md` and the glossary match the 7 November decisions. The store runs locally only, with no open security alert above low. Step 2 is replanned to start on Monday 9 November, and the core roadmap ends on 21 January 2027 if no gate slips.

## Pull requests

| Issue | Pull request |
| --- | --- |
| [#107](https://github.com/Tirso0882/goods/issues/107) Store track | [#106](https://github.com/Tirso0882/goods/pull/106): Step 2 builds on `create_agent` (ADR 0012), assistant-ui for the chat, a weekly store track (ADR 0013) |
| [#107](https://github.com/Tirso0882/goods/issues/107), [#110](https://github.com/Tirso0882/goods/issues/110), [#124](https://github.com/Tirso0882/goods/issues/124) EU markets | [#121](https://github.com/Tirso0882/goods/pull/121): sell to all 27 EU countries and nowhere else, opened one at a time |
| 7 November plan assessment | [#126](https://github.com/Tirso0882/goods/pull/126): ADRs 0014 to 0019, design and roadmap updates, label API research, the replanned schedule |
| [#133](https://github.com/Tirso0882/goods/issues/133) Product copy rules | [#138](https://github.com/Tirso0882/goods/pull/138): the seed catalog drops claims its fields don't back, with a claim test |
| Security alerts | [#130](https://github.com/Tirso0882/goods/pull/130) (Dependabot's 34 updates), [#136](https://github.com/Tirso0882/goods/pull/136) (overrides for pinned transitive packages, grouped security updates) |
| Image versions | [#137](https://github.com/Tirso0882/goods/pull/137): node 24.22.2, Ollama 0.40.14, new Redis and pgvector digests; [#91](https://github.com/Tirso0882/goods/pull/91) `docker/login-action` |
| Release path | [#140](https://github.com/Tirso0882/goods/pull/140) rebase merges, [#141](https://github.com/Tirso0882/goods/pull/141) backend image build fix |
| Daily workflow | [#143](https://github.com/Tirso0882/goods/pull/143), [#144](https://github.com/Tirso0882/goods/pull/144): `pnpm day` starts and stops the local store |
| Releases | [#139](https://github.com/Tirso0882/goods/pull/139) `v0.2.1`, [#142](https://github.com/Tirso0882/goods/pull/142) `v0.2.2`, [#145](https://github.com/Tirso0882/goods/pull/145) `v0.3.0` |

Issues closed: [#122](https://github.com/Tirso0882/goods/issues/122) Contentful (dropped), [#123](https://github.com/Tirso0882/goods/issues/123) Meilisearch (deferred), [#115](https://github.com/Tirso0882/goods/issues/115) export check for Montenegro and Colombia (not planned).

Issues opened: [#124](https://github.com/Tirso0882/goods/issues/124) EU shipping per country, [#125](https://github.com/Tirso0882/goods/issues/125) smoke-test the published images in CI, [#131](https://github.com/Tirso0882/goods/issues/131) Stripe Radar, [#132](https://github.com/Tirso0882/goods/issues/132) marketing agent, [#133](https://github.com/Tirso0882/goods/issues/133) catalog enrichment agent.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm audit`, before #130 and #136 | 19 findings: 9 high, 9 moderate, 1 low |
| `pnpm audit`, after | 1 low: `deepmerge` under jest, which has no patched version |
| `jest src/seed/__tests__/jewelry-catalog`, before #138 | 13 of 13 claim tests fail (`Nickel-free`, `18K`, `natural`, `sensitive ears` …) |
| `jest src/seed/__tests__/jewelry-catalog`, after | 36 of 36 pass |
| `pnpm test`, after #138 | 46 unit and 9 integration tests pass |
| `apps/backup/test.sh`, after #137 | All backup tests pass on node 24.22.2 and the new pgvector digest |
| `docker compose build && docker compose up`, after #137 | Every container healthy; `/ready` and the storefront return 200; the existing database still serves all 16 products |
| `docker build` of the backend with the layer cache warm and the store mount pruned, after #141 | Deploy step succeeds; before the fix it failed with `ERR_PNPM_NO_OFFLINE_TARBALL` |
| CI on `main` at `d44d20b` | Pass |

Eval report: none yet. The agent and its first baseline report come in Step 2.

## Failures found and fixes

- 19 audit findings, 9 of them high. Dependabot couldn't move the ones whose parents pin them, such as `postcss` under `next` and `lodash` under `@medusajs/cli`. #136 overrides only the vulnerable ranges, so each override goes idle once the parent catches up, and groups future security updates.
- The seed catalog made claims its fields don't back: "nickel-free", "hypoallergenic", "hallmarked in Poland", "18K gold plated", "natural" pearls. The agent will quote this catalog from Step 2. #138 rewrote the copy and added a regression test that runs the claim rules over every product.
- `publish (backend)` failed intermittently with `ERR_PNPM_NO_OFFLINE_TARBALL`: the layer cache was restored, but the pnpm store mount started empty on a fresh runner. #141 switched `pnpm deploy` to `--prefer-offline`.
- release-please listed a merge commit's PR title as a second change. #140 turned merge commits off; pull requests are now rebase-merged, which superseded the squash rule from weeks 3 to 5.
- Pins outside Dependabot's reach, in `ci.yml` and `apps/backup/test.sh`, had drifted from the Dockerfiles. #137 updated every copy.

## Decisions

- **A store track takes one build day a week** (ADR 0013). Agent steps take Monday to Thursday, the store Friday.
- **Sell to all 27 EU countries, opened one at a time** from Medusa Admin: Poland, the Czech Republic and Croatia first (#110, #124). Non-EU countries left the plan, so #115 closed.
- **Approvals are decided by the operator or a versioned approval policy** (ADR 0014). The policy ceiling launches at 0 PLN and rises only with eval evidence and a reviewed refund scenario catalog.
- **Voice and fine-tuning left the roadmap** (ADR 0015). The old Step 16 is now Step 14.
- **The store is built locally until it is mature** (ADR 0016). The Railway account was deleted on 7 November and the old R2 keys revoked on 8 November. Deploy, smoke and rollback in CI run only when `DEPLOY_ENABLED` is set.
- **Content stays as Markdown in git, and search stays on Medusa** (ADR 0017). Contentful dropped, Meilisearch deferred.
- **The shop fulfills orders itself, with labels bought by API** behind one shipping port (ADR 0018), backed by the label API research in `docs/research/shipping-label-apis-poland.md`.
- **The agent reaches commerce through a port** (ADR 0019): an `agent-core` Python package and an OpenAPI contract, with Medusa as the first adapter. Steps 2, 6 and 8 each gained a build day for it.
- **Step 2 builds on LangChain's `create_agent`** (ADR 0012), with assistant-ui for the chat. IP rate limits and Turnstile on the chat moved from Step 12 to Step 2.
- **After the core roadmap:** the catalog enrichment agent first (#133), then the marketing agent (#132). Stripe Radar joined the store track (#131).

## Remaining risks

- The schedule has no slack: Setup 1 and Setup 2 slipped 8 build days between them.
- Step 2's open decisions aren't settled: the day-one model (the Bedrock account and the monthly model budget are still `BLOCKED`), the Python layout in the pnpm monorepo, the port contract's shape, and whether Langfuse enters in Step 2.
- No host and no backups of the local store. Acceptable while the data is synthetic, but nothing is restorable today ([#19](https://github.com/Tirso0882/goods/issues/19)).
- The published images are no longer smoke-tested anywhere, because deploys are off ([#125](https://github.com/Tirso0882/goods/issues/125)).
- The repo has no coding standards file, so `/code-review` reviews against code smells only until one exists.

## Learning gate

None this week: no roadmap step ran. The Step 1 gate answer was read on 31 October (`learning/gate-answers/step-01-design.md`).

## Explain-back

Not recorded.

## Hours

Not recorded.

## Next smallest task

Step 2: run `/grill-with-docs` on its open decisions, then `/to-spec` for the Step 2 spec issue.
