/**
 * Seeds the synthetic jewelry store: Poland region, 23% VAT, the catalog, and
 * synthetic customers with orders in every state.
 * Safe to re-run: every step looks for what it creates and skips it if present.
 *
 *   pnpm medusa exec ./src/scripts/seed-jewelry.ts
 */
import type { ExecArgs, MedusaContainer } from '@medusajs/framework/types'
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  ProductStatus,
} from '@medusajs/framework/utils'
import {
  createInventoryLevelsWorkflow,
  createPricePreferencesWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  createTaxRegionsWorkflow,
  updatePricePreferencesWorkflow,
  updateProductsWorkflow,
  updateStoresWorkflow,
} from '@medusajs/medusa/core-flows'
import { CATALOG, CATEGORIES } from '../seed/jewelry-catalog'
import { ensureCustomers, ensureOrders } from '../seed/seed-orders'

const COUNTRY = 'pl'
const CURRENCY = 'pln'
const VAT_RATE = 23

export default async function seedJewelry({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  await ensurePlnCurrency(container)
  const regionId = await ensurePolandRegion(container)
  await ensureTaxInclusive(container, 'currency_code', CURRENCY)
  await ensureTaxInclusive(container, 'region_id', regionId)
  await ensurePolandTaxRegion(container)
  await ensurePolandShipping(container, regionId)
  logger.info(`Poland region ready: ${regionId}`)

  const salesChannelId = await findStockedSalesChannel(container)
  const categoryIds = await ensureCategories(container)
  await ensureProducts(container, categoryIds, salesChannelId)
  await ensureProductImages(container)
  await ensureInventoryLevels(container)
  await syncSearchIndex(container)
  logger.info(`Catalog ready: ${CATALOG.length} products.`)

  const customerIds = await ensureCustomers(container)
  await ensureOrders(container, { regionId, salesChannelId, customerIds })
}

/** Carts can only sell from a channel linked to a stock location; there may be others. */
async function findStockedSalesChannel(container: MedusaContainer): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: channels } = await query.graph({
    entity: 'sales_channel',
    fields: ['id', 'stock_locations.id'],
  })
  const stocked = channels.find((c) => c.stock_locations?.length)

  if (!stocked) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      'No sales channel with a stock location. Run `pnpm medusa db:migrate` first.'
    )
  }
  return stocked.id
}

async function ensurePlnCurrency(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [store],
  } = await query.graph({
    entity: 'store',
    fields: ['id', 'supported_currencies.currency_code', 'supported_currencies.is_default'],
  })
  const currencies = (store.supported_currencies ?? []).filter((c) => c !== null)

  if (currencies.some((c) => c.currency_code === CURRENCY)) {
    logger.info('PLN already supported. Skipping.')
    return
  }

  // Tax inclusivity lives in pricing's price preferences, not on the store currency.
  const { data: preferences } = await query.graph({
    entity: 'price_preference',
    fields: ['value', 'is_tax_inclusive'],
    filters: { attribute: 'currency_code' },
  })
  const taxInclusive = new Map(preferences.map((p) => [p.value, p.is_tax_inclusive]))

  // The update replaces the whole list, so the existing currencies go back in.
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          ...currencies.map((c) => ({
            currency_code: c.currency_code,
            is_default: c.is_default,
            is_tax_inclusive: taxInclusive.get(c.currency_code) ?? false,
          })),
          { currency_code: CURRENCY, is_tax_inclusive: true },
        ],
      },
    },
  })
  logger.info('Added PLN to the store currencies.')
}

async function ensurePolandRegion(container: MedusaContainer): Promise<string> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regions } = await query.graph({
    entity: 'region',
    fields: ['id', 'countries.iso_2'],
  })
  const existing = regions.find((r) => r.countries?.some((c) => c?.iso_2 === COUNTRY))

  if (existing) {
    logger.info('Poland region already exists. Skipping.')
    return existing.id
  }

  const {
    result: [region],
  } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: 'Poland',
          currency_code: CURRENCY,
          countries: [COUNTRY],
          payment_providers: ['pp_system_default'],
          is_tax_inclusive: true,
        },
      ],
    },
  })
  logger.info('Created the Poland region.')
  return region.id
}

async function ensurePolandTaxRegion(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: taxRegions } = await query.graph({
    entity: 'tax_region',
    fields: ['id'],
    filters: { country_code: COUNTRY },
  })

  if (taxRegions.length) {
    logger.info('Poland tax region already exists. Skipping.')
    return
  }

  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: COUNTRY,
        provider_id: 'tp_system',
        default_tax_rate: { name: 'VAT', code: 'VAT23', rate: VAT_RATE },
      },
    ],
  })
  logger.info('Created the Poland tax region at 23%.')
}

/**
 * Prices are gross. Pricing reads this preference, so a PLN currency or Poland
 * region set up by hand without "tax inclusive" would make every price net.
 */
async function ensureTaxInclusive(
  container: MedusaContainer,
  attribute: 'currency_code' | 'region_id',
  value: string
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [preference],
  } = await query.graph({
    entity: 'price_preference',
    fields: ['id', 'is_tax_inclusive'],
    filters: { attribute, value },
  })

  if (preference?.is_tax_inclusive) {
    logger.info(`Prices for ${attribute} ${value} already tax-inclusive. Skipping.`)
    return
  }

  if (preference) {
    await updatePricePreferencesWorkflow(container).run({
      input: { selector: { id: preference.id }, update: { is_tax_inclusive: true } },
    })
  } else {
    await createPricePreferencesWorkflow(container).run({
      input: [{ attribute, value, is_tax_inclusive: true }],
    })
  }
  logger.info(`Made prices for ${attribute} ${value} tax-inclusive.`)
}

/** Gross PLN, like product prices. */
const POLAND_SHIPPING = [
  { name: 'Standard Shipping', code: 'standard', description: 'Delivered in 2-4 business days.', amount: 15 },
  { name: 'Express Courier', code: 'express', description: 'Delivered in 1-2 business days.', amount: 25 },
]

/** The starter seed ships to its Europe zone only, which leaves Poland without checkout. */
async function ensurePolandShipping(container: MedusaContainer, regionId: string) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: zones } = await query.graph({
    entity: 'service_zone',
    fields: ['id', 'geo_zones.country_code'],
  })
  let zoneId = zones.find((z) => z.geo_zones?.some((g) => g?.country_code === COUNTRY))?.id

  if (!zoneId) {
    const {
      data: [fulfillmentSet],
    } = await query.graph({
      entity: 'fulfillment_set',
      fields: ['id'],
      filters: { type: 'shipping' },
    })

    if (!fulfillmentSet) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        'No shipping fulfillment set. Run `pnpm medusa db:migrate` first.'
      )
    }

    const {
      result: [zone],
    } = await createServiceZonesWorkflow(container).run({
      input: {
        data: [
          {
            name: 'Poland',
            fulfillment_set_id: fulfillmentSet.id,
            geo_zones: [{ type: 'country', country_code: COUNTRY }],
          },
        ],
      },
    })
    zoneId = zone.id
    logger.info('Created the Poland shipping zone.')
  }

  const { data: existingOptions } = await query.graph({
    entity: 'shipping_option',
    fields: ['name'],
    filters: { service_zone_id: zoneId },
  })
  const missing = POLAND_SHIPPING.filter(
    (option) => !existingOptions.some((existing) => existing.name === option.name)
  )

  if (!missing.length) {
    logger.info('Poland shipping options exist. Skipping.')
    return
  }

  const {
    data: [shippingProfile],
  } = await query.graph({ entity: 'shipping_profile', fields: ['id'] })

  await createShippingOptionsWorkflow(container).run({
    input: missing.map((option) => ({
      name: option.name,
      price_type: 'flat',
      provider_id: 'manual_manual',
      service_zone_id: zoneId!,
      shipping_profile_id: shippingProfile.id,
      type: { label: option.name, description: option.description, code: option.code },
      prices: [
        { currency_code: CURRENCY, amount: option.amount },
        { region_id: regionId, amount: option.amount },
      ],
      rules: [
        { attribute: 'enabled_in_store', value: 'true', operator: 'eq' },
        { attribute: 'is_return', value: 'false', operator: 'eq' },
      ],
    })),
  })
  logger.info(`Created ${missing.length} Poland shipping option(s).`)
}

async function ensureCategories(container: MedusaContainer): Promise<Map<string, string>> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({
    entity: 'product_category',
    fields: ['id', 'name'],
  })
  const missing = CATEGORIES.filter((name) => !existing.some((c) => c.name === name))

  if (missing.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((name) => ({ name, is_active: true })),
      },
    })
    logger.info(`Created ${missing.length} categor(ies).`)
  } else {
    logger.info('All categories exist. Skipping.')
  }

  const { data: all } = await query.graph({ entity: 'product_category', fields: ['id', 'name'] })
  return new Map(all.map((c) => [c.name, c.id]))
}

async function ensureProducts(
  container: MedusaContainer,
  categoryIds: Map<string, string>,
  salesChannelId: string
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({ entity: 'product', fields: ['handle'] })
  const taken = new Set(existing.map((p) => p.handle))
  const missing = CATALOG.filter((p) => !taken.has(p.handle))

  if (!missing.length) {
    logger.info('All catalog products exist. Skipping.')
    return
  }

  const {
    data: [shippingProfile],
  } = await query.graph({ entity: 'shipping_profile', fields: ['id'] })

  if (!shippingProfile) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      'No shipping profile. Run `pnpm medusa db:migrate` first.'
    )
  }

  // One run for every missing product, so a failure rolls back the whole batch.
  await createProductsWorkflow(container).run({
    input: {
      products: missing.map((p) => ({
        title: p.title,
        handle: p.handle,
        description: p.description,
        status: ProductStatus.PUBLISHED,
        weight: p.weight_g,
        material: p.material,
        thumbnail: p.images[0],
        images: p.images.map((url) => ({ url })),
        category_ids: [categoryIds.get(p.category)!],
        shipping_profile_id: shippingProfile.id,
        sales_channels: [{ id: salesChannelId }],
        options: p.options,
        variants: p.variants.map((v) => ({
          title: Object.values(v.options).join(' / '),
          sku: v.sku,
          options: v.options,
          manage_inventory: true,
          prices: [{ currency_code: CURRENCY, amount: v.price_pln }],
        })),
      })),
    },
  })
  logger.info(`Created ${missing.length} product(s).`)
}

/** Brings images in line with the fixture for products created before it had them. */
async function ensureProductImages(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const imagesByHandle = new Map(CATALOG.map((p) => [p.handle, p.images]))

  const { data: products } = await query.graph({
    entity: 'product',
    fields: ['id', 'handle', 'thumbnail', 'images.url', 'images.rank'],
  })

  const stale = products.filter((product) => {
    const wanted = imagesByHandle.get(product.handle) ?? []
    const current = [...(product.images ?? [])]
      .sort((a, b) => (a?.rank ?? 0) - (b?.rank ?? 0))
      .map((image) => image?.url)
    return (
      product.thumbnail !== wanted[0] ||
      current.length !== wanted.length ||
      current.some((url, index) => url !== wanted[index])
    )
  })

  if (!stale.length) {
    logger.info('All product images match the catalog. Skipping.')
    return
  }

  await updateProductsWorkflow(container).run({
    input: {
      products: stale.map((product) => {
        const wanted = imagesByHandle.get(product.handle) ?? []
        return {
          id: product.id,
          thumbnail: wanted[0],
          images: wanted.map((url) => ({ url })),
        }
      }),
    },
  })
  logger.info(`Updated images on ${stale.length} product(s).`)
}

/** Only adds missing stock levels; existing quantities are left for orders to change. */
async function ensureInventoryLevels(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [location],
  } = await query.graph({ entity: 'stock_location', fields: ['id'] })

  if (!location) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      'No stock location. Run `pnpm medusa db:migrate` first.'
    )
  }

  const stockBySku = new Map(
    CATALOG.flatMap((p) => p.variants.map((v) => [v.sku, v.stock] as const))
  )
  const { data: items } = await query.graph({
    entity: 'inventory_item',
    fields: ['id', 'sku', 'location_levels.location_id'],
    filters: { sku: [...stockBySku.keys()] },
  })

  if (items.length !== stockBySku.size) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Expected ${stockBySku.size} inventory items, found ${items.length}.`
    )
  }

  const missing = items.filter(
    (i) => !i.location_levels?.some((l) => l?.location_id === location.id)
  )

  if (!missing.length) {
    logger.info('All variants have stock. Skipping.')
    return
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: missing.map((i) => ({
        inventory_item_id: i.id,
        location_id: location.id,
        stocked_quantity: stockBySku.get(i.sku!)!,
      })),
    },
  })
  logger.info(`Added stock for ${missing.length} variant(s).`)
}

/**
 * Product events are handled asynchronously, so `medusa exec` can exit before
 * the search index catches up. Replaying them here is awaited.
 */
async function syncSearchIndex(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const search = container.resolve(Modules.SEARCH)

  // A freshly migrated index has no active version until the backend's first
  // start seeds it from the database, which picks up these products anyway.
  const indexes = await search.listIndexes()
  const productIndex = indexes.find((i) => i.name === 'product')
  if (productIndex?.status !== 'ready') {
    logger.info(
      `Search index is ${productIndex?.status ?? 'missing'}; the backend fills it on start. Skipping.`
    )
    return
  }

  const { data: products } = await query.graph({ entity: 'product', fields: ['id'] })
  await search.ingest({
    name: 'product.created',
    data: products.map((p) => ({ id: p.id })),
  } as never)
}