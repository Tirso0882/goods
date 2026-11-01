# A store track takes one build day a week

On 31 October 2026 we decided that, from 2 November 2026, one build day a week goes to store features alongside the core roadmap. The agent steps keep the other four build days, so the core roadmap ends about three weeks later, in late January 2027 instead of 31 December 2026. The store is still the vehicle (`learning/MISSION.md`), but selling for real needs more than the single-market test store, and the agent's evals gain realistic cases from it: several currencies, exchanges and claims.

The store track, in order ([#107](https://github.com/Tirso0882/goods/issues/107)):

1. BLIK and Przelewy24 at checkout, through Medusa's Stripe provider, which already includes both.
2. InPost parcel lockers at checkout.
3. Regions for the Czech Republic (CZK) and Croatia (EUR) next to Poland (PLN). The storefront suggests the shopper's region from Cloudflare's country header and never redirects on its own: the EU geo-blocking regulation (2018/302) forbids redirecting a shopper to another country's version without consent.
4. Storefront and product translations for each market.
5. Exchange and claim journeys for the agent, on new support routes. Medusa's Store API has no routes for them.

The store sells only to EU countries.

Refunds don't change: each refund is still its own operator click (ADR 0011, `docs/design.md`).

## Considered options

- **After the core roadmap, in January:** keeps the agent dates, but the store stays single-market and Polish-payment-poor until then.
- **Pausing the agent roadmap for about three weeks:** store first, but the agent evidence slips the most.
- **Montenegro and Colombia:** dropped on 1 November 2026, with every other country outside the EU. They are exports: each parcel needs a customs declaration, import VAT and duties apply on arrival, and the EU's OSS scheme doesn't cover them.
- **Contentful and Meilisearch:** not adopted. Product content lives in Medusa, which has its own translation module, and Medusa's search index already serves the storefront. Contentful would also add a paid processor that needs a DPA.

## Consequences

- From week 6, each week has four agent build days. Shift the schedule's dates as gates pass.
- "Before taking real orders" gains each market's legal work: OSS VAT once cross-border EU sales pass EUR 10,000 a year, and terms and the withdrawal form in each market's language.
- Each third-party plugin or service (InPost, a carrier, a translation service) adds a processor to the privacy policy and DPA list, its secrets to the runbooks, and its state to the backup scope (#19).
- A claim that ends in a refund goes to the operator, like every other refund.
