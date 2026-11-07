# Shipping label APIs from Poland: carriers, brokers and Medusa

Checked on 7 November 2026. Sources are primary where I could reach them: the carriers' and brokers' own API docs, OpenAPI files and price pages, Medusa's documentation, and the npm and GitHub pages of the plugins. Anything I could not confirm is marked **unverified**.

**Short version:**

- InPost ShipX lets anyone with an InPost Manager Paczek account generate an API token on their own. For locker-only use you need no courier contract: you click "Generate" without a contract number. A sandbox exists. But ShipX on its own does not reach Croatia, and InPost's Czech service goes through Packeta.
- Furgonetka and Apaczka are Polish brokers. Both offer InPost lockers, DPD and others through one API, with no contract and no subscription. You pay per label. Furgonetka publishes a full OpenAPI file with a sandbox, webhooks, labels and return shipments.
- Sendcloud is out for now. Poland is not one of its fully supported ship-from countries.
- Medusa v2 lets you put any of these behind one Fulfillment Module Provider. Two InPost providers exist (both 0.x). There is no Medusa provider for Furgonetka or Apaczka, so that one would be ours to write.
- Recommendation: one custom provider on Furgonetka's REST API. A later 3PL becomes a second provider, picked by config and shipping options.

## Direct carriers

| | InPost ShipX | DPD Polska | Poczta Polska / DHL Parcel PL |
| --- | --- | --- | --- |
| API | REST, Bearer token | Several services, REST and SOAP | Not checked in depth |
| Self-service access | Yes, in Manager Paczek | No, documentation as ZIP plus email to DPD's IT team | **Unverified** |
| Contract | Lockers: no. Standard courier: courier contract needed | Business account with a customer number (FID) | **Unverified** |
| Sandbox | Yes | **Unverified** (third-party clients mention one) | **Unverified** |
| Tracking | Webhooks plus polling. Tracking is off in the sandbox | SOAP InfoServices (polling) | **Unverified** |
| Returns | Separate InPost Returns API | Domestic and international consumer returns in DPD Services | **Unverified** |
| Czech Republic | Through InPost International, delivered to Packeta points and couriers | DPD network, **unverified** through this API | **Unverified** |
| Croatia | Not offered | DPD network, **unverified** through this API | **Unverified** |

**InPost.** InPost's guide [How to set up access to the ShipX API and Geowidget](https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/1187086337) walks you through it. Fill in company and invoice data in Manager Paczek, then go to My Account → API → "Generate". A dialog asks for a courier contract number. "If you only need access to locker services, simply click Generate." The same panel gives a Geowidget token for the locker map and lets you set a tracking webhook URL. The [ShipX FAQ](https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/53706753/1.0+FAQ) says standard courier service is "only available after signing a courier contract". Prepaid accounts get the C2C courier (`inpost_courier_c2c`) instead. It also says "in a sandbox environment, the tracking component is disabled". The sandbox lives at `sandbox-manager.paczkomaty.pl` and the API at `sandbox-api-shipx-pl.easypack24.net`. You top up its balance with fake money. Webhooks send events such as `shipment_status_changed` and `offers_prepared` ([webhooks page](https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/28639231/%5B1.23.0%5D+Webhooks)). Shipments you make in Manager Paczek by hand do not show up in the API ([integration process](https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/40206337)).

**InPost outside Poland.** The [InPost International business page](https://inpost.pl/en/inpost-international/klient-biznesowy) lists lockers in IT, FR, BE, NL, LU, ES and PT. Austria and Hungary are courier with Austrian Post. Czechia and Slovakia are "courier and pick-up points (with Packeta)". Croatia is not listed. You sign up through a contact form, not on your own. The [developer shipping guide](https://developers.inpost-group.com/shipping-guide) covers a newer "Global" API (`shipments/point-to-point` and others) for nine destinations, and the Czech Republic is not among them. The `medusa-inpost-fulfillment` README confirms that this Global API is separate from ShipX PL.

**DPD Polska.** The [DPD web services page](https://www.dpd.com/pl/en/oferta-dla-firm/rozwiazania-it/web-service-dpd-polska/) lists six services. DPD Services (REST) generates waybills, books couriers and creates returns. InfoServices (SOAP) gives tracking. PickupServices (REST) lists pickup points. You download the docs as ZIP files and ask DPD's IT customer team for access. I found no sandbox or self-service sign-up on that page. Using it needs a DPD business account. It is a reasonable second carrier, but not as a first integration.

**Poczta Polska and DHL Parcel PL.** Both have business APIs (e-Nadawca and DHL24 WebAPI), but I did not check them. They add nothing for lockers that InPost, ORLEN or DPD do not already cover through a broker.

## Brokers

| | Furgonetka | Apaczka | Sendcloud |
| --- | --- | --- | --- |
| API | REST, OpenAPI 3, OAuth2 | RPC over HTTP POST, HMAC-SHA256 signed | REST |
| Sandbox | `api.sandbox.furgonetka.pl` | `panel-sandbox.apaczka.pl` (no tracking there) | Yes |
| InPost lockers | Yes (`inpost`) | Yes (`points/` and `foreign_address_id`) | Yes, but see next row |
| Ship from Poland | Yes | Yes | Only with an invoice address in a supported country and your own carrier contract |
| Carriers | InPost, DPD, DHL, ORLEN, Poczta, GLS, UPS, FedEx and others | 17 carriers | Many |
| Czech Republic and Croatia | Both listed | Czech Republic yes; Croatia **unverified** | n/a |
| Webhooks | Yes, with logs and resend | Yes, per order (`push_tracking_url`) | Yes |
| Return labels | Yes (`/packages/return`) | **Unverified** | Yes |
| Price model | No contract or subscription, pay per shipment, monthly invoice | No contract, subscription or panel fee, prepaid or postpaid | Monthly plan plus a fee per label |
| Medusa provider | None | None | `@saphes/medusa-sendcloud-plugin` 0.0.18 |

**Furgonetka.** The REST docs at [furgonetka.pl/api/rest](https://furgonetka.pl/api/rest) load an [OpenAPI file](https://furgonetka.pl/js/swagger/api-rest-documentation.7c293c0a56.yaml). It names `https://api.furgonetka.pl` (production) and `https://api.sandbox.furgonetka.pl` (sandbox). It has endpoints for price calculation (`/packages/calculate-price`), creating packages, labels (`/packages/{id}/label`), tracking, a points map, webhook settings with logs and resend, and returns (`/packages/return`, `/packages/return/calculate-price`). Its service list covers `inpost`, `dpd`, `dhl`, `orlen`, `poczta`, `gls`, `ups`, `fedex` and others. Login is [OAuth2](https://demo.furgonetka.pl/api/oauth?lang=en_GB), including client credentials. The [international page](https://furgonetka.pl/przesylki-miedzynarodowe) lists Czechy and Chorwacja among 41 countries, but gives no carrier or locker detail for each country. Furgonetka's [business page](https://furgonetka.pl/en/offer/business-and-offices) says "you pay only for the shipment sent" and "without signing a contract". You get one invoice for the whole month. The [InPost price page](https://furgonetka.pl/cennik/inpost) says fuel and road fees are included and business rates start from 40 parcels a month. The table is rendered so I could not read it, so its prices are **unverified**.

**Apaczka.** The [developer portal](https://api-docs.apaczka.pl/introduction) (moved there 8 October 2026) describes API v2. Every call is an HTTP POST with an HMAC-SHA256 signature. Every response returns HTTP 200, and the real result is in the body. You get keys in the panel under Settings → API. The only SDK is in PHP. The [testing guide](https://api-docs.apaczka.pl/guides/testing.md) says the sandbox runs an older version: `tracking/` is missing, `points/` may time out, and its service list is smaller. You drop at a locker with pickup `SELF` plus a point id ([pickups](https://api-docs.apaczka.pl/guides/pickups.md)). Push-tracking webhooks were documented on 5 October 2026 ([changelog](https://api-docs.apaczka.pl/changelog.md)). The [homepage](https://www.apaczka.pl/) says "bez umów ... bez abonamentu", "brak opłat za korzystanie z panelu", "postpaid lub prepaid", 17 carriers, and domestic prices "od 7,32 zł netto". Its [InPost abroad page](https://www.apaczka.pl/oferta/przesylki-miedzynarodowe-zagraniczne/inpost-za-granice/) covers the same countries as InPost International (no Czech Republic, no Croatia). Czech parcels are a separate service.

**Sendcloud.** The [pricing page](https://www.sendcloud.com/pricing/) lists eight fully supported ship-from countries: AT, BE, FR, DE, IT, NL, ES and UK. Poland works only "if you have an invoice address in a supported country (except UK) and a direct contract with a supported courier". Plans: Free (€0), then Lite €28 a month plus €0.10 per label, then Growth €87 a month plus €0.09 per label. That rules it out for a Polish sole trader. **Others:** ShipMonk is a 3PL, not a label API. Packeta suits Czech pickup points, and a [Medusa Packeta plugin](https://medusajs.com/integrations/medusa-plugin-packeta) exists, but its Poland-to-Croatia service is **unverified**.

## Medusa v2: the fulfillment provider port

From [Medusa's provider reference](https://docs.medusajs.com/resources/references/fulfillment/provider): a provider extends `AbstractFulfillmentProviderService` and sets a `static identifier`. You register it under the Fulfillment Module's `providers` in `medusa-config.ts`, with `resolve`, `id` and `options`. Medusa stores it as `fp_{identifier}_{id}`. These are the methods it uses:

| Method | Job |
| --- | --- |
| `getFulfillmentOptions` | Lists the options an admin can attach to a shipping option (for example InPost locker, DPD courier) |
| `validateOption` / `validateFulfillmentData` | Checks the option, and the shopper's data at checkout (for example a chosen locker id) |
| `canCalculate` / `calculatePrice` | Gives a live price for a "calculated" shipping option |
| `createFulfillment` | Buys the label from the carrier. Returns data and labels to store |
| `cancelFulfillment` | Cancels with the carrier |
| `createReturnFulfillment` | Creates the return shipment or label |
| `getFulfillmentDocuments`, `getReturnDocuments`, `getShipmentDocuments`, `retrieveDocuments` | Fetches labels and other documents |

**Existing community providers**, as of 7 November 2026:

| Package | Version and dates | Notes |
| --- | --- | --- |
| [`medusa-inpost-fulfillment`](https://github.com/digity-studio/medusa-inpost-fulfillment) | 0.5.3, first release Apr 2026, last Oct 2026. 8 stars, 1,134 downloads a month, no licence | ShipX PL v1. Lockers and courier, labels, InPost Returns API, admin UI. **No webhooks** (scheduled polling). Its README says it has been tested in the sandbox, "but not yet end-to-end against a production InPost account" |
| [`@koda-plus/medusa-plugin-inpost`](https://github.com/Koda-Plus/medusa-integrations) | 0.2.0, published once on 8 Oct 2026. MIT, 361 downloads a month | ShipX. Lockers, courier, cash on delivery, webhooks with a 15-minute polling fallback, Returns API (drop-off code), handles `offers_prepared` on prepaid accounts. Shipment writes are off by default. Part of a 20-package monorepo |
| [`@saphes/medusa-sendcloud-plugin`](https://www.npmjs.com/package/@saphes/medusa-sendcloud-plugin) | 0.0.18, peers `@medusajs/medusa ^2.21.2` | Sendcloud, which does not fit Poland (see above) |
| `@hifive-dev/medusa-fulfillment-sendcloud` | 1.1.0 (2024) | Medusa v1 only |

No npm package for Medusa and Furgonetka, Apaczka or DPD turned up (searches on npm for "medusa furgonetka", "medusa apaczka" and "medusa dpd").

## Recommendation

**Write one fulfillment provider (`goods-shipping`) on Furgonetka's REST API.** The reasons:

1. One integration covers InPost lockers in Poland (the must-have) and couriers to the Czech Republic and Croatia (DPD, GLS, UPS). ShipX alone cannot reach Croatia, and InPost's Czech service is a contact-form contract with Packeta behind it.
2. No contract and no subscription, paid per label. That fits one person shipping small volumes.
3. It is the best-documented broker API: OpenAPI 3, OAuth2 client credentials, a sandbox, webhooks, labels and returns. Apaczka is the fallback. Its sandbox has no tracking, and it signs every request with HMAC in an RPC style.
4. Each shipping option maps to one method. `getFulfillmentOptions` returns Furgonetka services. `validateFulfillmentData` stores the locker id from the map. `createFulfillment` creates the package and saves the label. `createReturnFulfillment` calls `/packages/return`.

If the store must launch in Poland before that provider exists, the existing InPost plugins are a stopgap. Of the two, `@koda-plus/medusa-plugin-inpost` has webhooks and an MIT licence. Never install both (issue #109). Plan on replacing it later, not keeping it beside the broker.

**What a later 3PL switch changes.** You register the 3PL's own provider (or a thin one on its API) beside or instead of `goods-shipping`. Then you move shipping options to it in the admin or the seed script. The storefront, orders and returns flow stay as they are, because they only see Medusa shipping options and fulfillments. Locker choice moves to whatever the 3PL supports. Open fulfillments stay on the old provider until they finish. **Unverified:** whether a chosen 3PL ships to InPost lockers at all. Ask before you sign.
