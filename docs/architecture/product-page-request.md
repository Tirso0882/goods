# Product page request trace

Traced on 9 October 2026: `GET http://localhost:8000/pl/products/sweatpants` on the local stack (Medusa 2.21.2, Next.js 15.5.24).

## Path

1. **Browser to Next.js (port 8000).** `app/[countryCode]/(main)/products/[handle]/page.tsx` is a React Server Component. It renders on the Next.js server, so the browser never calls Medusa for this page.
2. **Next.js data layer.** The page calls `listProducts` in `src/lib/data/products.ts`. That first resolves `pl` to a region with `getRegion` (`GET /store/regions`), then fetches the product with `handle`, `region_id`, and a `fields` string (`*variants.calculated_price,+variants.inventory_quantity,...`). In `fields`, `*` adds a relation and `+` adds a field to the defaults.
3. **SDK to Medusa (port 9000).** The SDK from `src/lib/config.ts` calls `GET /store/products` and adds the `x-publishable-api-key` header. Next.js caches responses by tag (`getCacheOptions("products")`).
4. **Medusa Store API.** The publishable key is resolved to a sales channel (`api_key`, `publishable_api_key_sales_channel`), and the product list is limited to that channel. The route reads data through Query across the product, pricing, inventory, and sales channel modules.
5. **Postgres.** One uncached page load ran 103 SQL statements. The most-read tables were `product`, `product_collection`, `product_type`, `product_category`, `image`, `region`, `api_key`, and `publishable_api_key_sales_channel`. Prices come from `product_variant_price_set`, `price_set`, `price_rule`, and `price_preference`. Stock comes from `inventory_item` and `inventory_level`.

## Findings

- The product is fetched twice per view, once in `generateMetadata` and once in `ProductPage`, and `listProducts` re-fetches the region each time. Next.js caching hides most of this after the first load.
- Without the header, the Store API returns `400 not_allowed: Publishable API key required in the request header: x-publishable-api-key`.
- **No PLN prices exist.** The `price` table only has `eur` and `usd`. For the Poland region, `calculated_price` is `null`, so `/pl` product pages show no price. The Europe region returns `10 eur` for the same variant. The seed or the README setup needs to add PLN prices.
- Without `region_id`, `calculated_price` is also `null`. Medusa needs a region to pick a currency.

## Reproduce

```bash
KEY=$(grep '^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=' apps/storefront/.env.local | cut -d= -f2)
curl -s "http://localhost:9000/store/products?handle=sweatpants&region_id=<region-id>&fields=*variants.calculated_price" \
  -H "x-publishable-api-key: $KEY" | jq '.products[0].variants[0].calculated_price'
```

SQL: `ALTER SYSTEM SET log_statement='all'; SELECT pg_reload_conf();` in `goods-postgres`, load the page, read `docker logs goods-postgres`, then `ALTER SYSTEM RESET log_statement; SELECT pg_reload_conf();`.
