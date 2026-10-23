# One discoverability layer serves search engines and AI agents

On 22 October 2026 we decided not to treat SEO and GEO (generative engine optimization: being found and recommended by ChatGPT, Google AI Mode, Perplexity and similar assistants) as two separate strategies. They are one discoverability layer, fed by the same structured product data. AI assistants mostly find products through search indexes, crawlers and merchant feeds, so they reward what search engines reward: server-rendered pages, schema.org product data, honest specs, clear prices, stock and policies. Choosing only SEO would leave the store out of the product feeds that assistants read. Choosing only GEO would skip the search index those assistants retrieve from.

The goal for now is to get the store recommended by AI assistants, not to sell inside them. OpenAI deprioritized ChatGPT Instant Checkout on 24 March 2026: merchants now use their own checkout, and ChatGPT focuses on discovery from merchant product feeds. Google's in-chat checkout through the Universal Commerce Protocol (UCP) is US-only, with no date for Europe. So the sale happens on our own storefront, and the product page and checkout still matter.

## What gets built, and when

This doesn't change the order of the core roadmap. Each part goes into a step that already exists:

1. **Now, one small ticket:** every deployment that isn't production sends `noindex` and serves a robots.txt that blocks all crawlers. The throwaway Railway store has synthetic products and test payments, and they must not be indexed or quoted under the future brand.
2. **The catalog enrichment second project:** structured jewelry attributes are stored in Medusa: metal and purity, hallmark, stone, dimensions, ring sizes, weight, care, and PL/EN copy. If the store sells its own brand without GTIN codes, it uses brand plus MPN instead. This attribute data feeds everything else in this ADR.
3. **Before taking real orders, one storefront module turns a Medusa product into every output that machines read:**
   - schema.org `Product` and `Offer` JSON-LD on the product page;
   - a real title and description (today they are `<title> | Medusa Store` and the product title again);
   - `sitemap.xml`;
   - a robots.txt with explicit rules for each crawler;
   - a Google Merchant Center feed.

   All of these come from the same product data, so they can't drift apart from each other or from the product page.
4. **After the core roadmap:** a ChatGPT product feed, and a read-only MCP endpoint for product search, stock and the shipping and returns policy. It reuses the support agent's read tools rather than duplicating them.

## Rules

- **Server rendering stays.** Product content must be in the first HTML response, because most AI crawlers don't run JavaScript. The product pages already render on the server.
- **Allow search crawlers, decide training crawlers separately.** Search and retrieval crawlers (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-SearchBot`, `Googlebot`) are allowed, because blocking them removes the store from assistant answers. Whether to block training crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`) is a separate choice, made before launch.
- **Every claim must be true.** Product copy states facts a model can quote: purity, materials, sizes, care, returns. Claims such as "hypoallergenic" or "nickel-free" are made only when they are true and allowed under the rules in `docs/research/product-regulation-poland.md`.
- **No GEO hacks are planned work.** An `llms.txt` is cheap and may be added, but no major assistant has committed to reading it. No plan depends on it.

## Considered options

- **SEO only:** rejected, because it leaves out the product feeds that ChatGPT and Google AI Mode read for shopping answers.
- **GEO only:** rejected, because assistants retrieve from search indexes. A page that ranks badly and has thin data is rarely cited.
- **Agent checkout now (ACP or UCP):** deferred until in-chat checkout reaches Polish merchants and shows real uptake. OpenAI has already pulled back once.

## Consequences

- Catalog enrichment becomes a precondition for discoverability, not only a back-office convenience. Thin product data shows up in search results, feeds and AI answers at the same time.
- `apps/storefront/next-sitemap.js` is a leftover from the starter. No build step runs it, the package isn't installed, and it reads `NEXT_PUBLIC_VERCEL_URL`, which isn't set on Railway. Step 3 above either wires it to `PUBLIC_BASE_URL` or replaces it with Next.js `sitemap.ts` and `robots.ts`.
- Measuring this needs referral tracking from day one of real traffic. ChatGPT tags its links with `utm_source=chatgpt.com`, and Perplexity shows up as a referrer.
- Revisit this ADR when ACP or UCP checkout becomes available to merchants in Poland.
