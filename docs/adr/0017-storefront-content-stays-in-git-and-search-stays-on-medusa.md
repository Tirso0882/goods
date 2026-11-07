# Storefront content stays in git, and search stays on Medusa

On 7 November 2026 we dropped Contentful (#122) and deferred Meilisearch (#123). This amends ADR 0013, whose store track listed both as items 6 and 7.

**Content:** storefront pages, banners and editorial copy stay as Markdown per locale in the repo. The same files feed the agent's retrieval, and a change reaches shoppers only through a reviewed PR, which is the defense against a poisoned FAQ (`docs/design.md`, Threat model). A CMS comes only if a client demands one, behind a content port, so the storefront and retrieval don't change.

**Search:** Medusa's Postgres search module in `apps/backend/src/search/product.ts`, with the InstantSearch adapter, already gives typo tolerance and facets. Meilisearch comes back only on a measured relevance gap, including per locale once translations land (#112).

## Considered options

- **Contentful:** an editor UI for one person who already edits Markdown, a paid processor with a DPA, and a second source of truth for text the agent cites.
- **Meilisearch now:** one more service to host, sync and back up, for a catalog small enough that Postgres search answers well.

## Consequences

- No new processors, secrets or backup scope for content or search.
- Per-locale search quality gets an eval of its own when #112 adds the second locale. That eval decides whether #123 reopens.
