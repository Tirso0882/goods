# The shop fulfills orders itself, with API labels behind a shipping port

On 7 November 2026 we decided that the shop packs and ships orders itself, buying labels by API, behind one shipping port: a Medusa fulfillment provider. The first provider is our own, `goods-shipping`, on Furgonetka's REST API. A later 3PL becomes a second provider and a config change, not a rewrite. Findings are in `docs/research/shipping-label-apis-poland.md`.

A jewelry parcel is small and the volume is low, so a 3PL's monthly minimums and onboarding cost more than packing at home. What has to be right from day one is the seam: the storefront, orders and returns see only Medusa shipping options and fulfillments, never a carrier.

## Why Furgonetka first

- One integration covers InPost lockers in Poland, which most Polish shoppers prefer (#109), and couriers to the Czech Republic and Croatia, the first markets after Poland (#110, #124). InPost's own ShipX API doesn't reach Croatia, and its Czech service runs through Packeta behind a contact form.
- No contract and no subscription: it charges per label and invoices monthly.
- Its API is the best documented of the brokers: OpenAPI 3, OAuth2 client credentials, a sandbox, webhooks, labels and return labels.

## Considered options

- **InPost ShipX directly, with a community plugin:** self-service and contract-free for lockers, but Poland only. The two Medusa plugins are early 0.x releases. `@koda-plus/medusa-plugin-inpost` (MIT, webhooks) is the stopgap if Poland must launch before `goods-shipping` exists. Never install both.
- **Apaczka:** also contract-free, the fallback broker. Its sandbox has no tracking, and every call is a signed RPC POST that always returns HTTP 200.
- **Sendcloud:** Poland is not one of its supported ship-from countries.
- **A 3PL now:** no volume to justify it yet.

## Consequences

- `goods-shipping` extends Medusa's `AbstractFulfillmentProviderService`: fulfillment options, locker validation, price calculation, labels and return labels. No Medusa provider exists for Furgonetka, so we write and test it against Furgonetka's sandbox.
- Furgonetka, and each carrier it books, joins the processor list and DPA work. Its OAuth credentials join the go-live host's secrets.
- Switching to a 3PL means registering its provider and moving shipping options to it. Open fulfillments finish on the old provider. Ask any 3PL whether it ships to InPost lockers before signing.
- Furgonetka's live InPost prices, Apaczka's return labels and the DPD sandbox are unverified. Check them before the unit economics in #124 are fixed.
