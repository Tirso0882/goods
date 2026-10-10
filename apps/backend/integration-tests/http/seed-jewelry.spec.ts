import path from 'path'
import { MigrationScriptsMigrator } from '@medusajs/framework/migrations'
import type { ExecArgs, MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from '@medusajs/medusa/core-flows'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import seedJewelry from '../../src/scripts/seed-jewelry'
import { CATALOG, CATEGORIES } from '../../src/seed/jewelry-catalog'

jest.setTimeout(180_000)

const ADMIN_HANDLE = 'silver-anklet'
const ADMIN_CATEGORY = 'Anklets'

/**
 * `db:migrate` runs these, the test runner does not. Core's create the default
 * shipping profile; ours create the sales channel, API key and stock location.
 */
async function runMigrationScripts(container: MedusaContainer) {
  const migrator = new MigrationScriptsMigrator({ container })
  await migrator.ensureMigrationsTable()
  await migrator.run([
    path.join(path.dirname(require.resolve('@medusajs/medusa')), 'migration-scripts'),
    path.join(__dirname, '../../src/migration-scripts'),
  ])
}

const seed = (container: MedusaContainer) =>
  seedJewelry({ container, args: [] } as unknown as ExecArgs)

/** Everything the seed owns, without generated IDs, sorted so runs compare equal. */
async function snapshot(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: 'product',
    fields: [
      'handle',
      'status',
      'categories.name',
      'images.url',
      'variants.sku',
      'variants.price_set.prices.amount',
      'variants.price_set.prices.currency_code',
      'variants.inventory_items.inventory.location_levels.stocked_quantity',
    ],
  })
  const { data: categories } = await query.graph({ entity: 'product_category', fields: ['name'] })
  const { data: regions } = await query.graph({
    entity: 'region',
    fields: ['name', 'currency_code', 'countries.iso_2'],
  })
  const { data: taxRegions } = await query.graph({
    entity: 'tax_region',
    fields: ['country_code', 'tax_rates.rate', 'tax_rates.is_default'],
    filters: { country_code: 'pl' },
  })
  const { data: shippingOptions } = await query.graph({
    entity: 'shipping_option',
    fields: ['name', 'service_zone.geo_zones.country_code'],
  })

  return {
    products: products
      .map((p) => ({
        handle: p.handle,
        status: p.status,
        categories: (p.categories ?? []).map((c) => c!.name).sort(),
        images: (p.images ?? []).map((i) => i!.url).sort(),
        variants: (p.variants ?? [])
          .map((v) => ({
            sku: v!.sku,
            pln: (v!.price_set?.prices ?? [])
              .filter((pr) => pr!.currency_code === 'pln')
              .map((pr) => Number(pr!.amount)),
            stock: (v!.inventory_items ?? []).flatMap((ii) =>
              (ii!.inventory?.location_levels ?? []).map((l) => Number(l!.stocked_quantity))
            ),
          }))
          .sort((a, b) => a.sku!.localeCompare(b.sku!)),
      }))
      .sort((a, b) => a.handle.localeCompare(b.handle)),
    categories: categories.map((c) => c.name).sort(),
    regions: regions
      .map((r) => ({
        name: r.name,
        currency: r.currency_code,
        countries: (r.countries ?? []).map((c) => c!.iso_2).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    polandTaxRates: taxRegions.flatMap((t) =>
      (t.tax_rates ?? []).map((r) => ({ rate: Number(r!.rate), is_default: r!.is_default }))
    ),
    polandShipping: shippingOptions
      .filter((o) => o.service_zone?.geo_zones?.some((g) => g?.country_code === 'pl'))
      .map((o) => o.name)
      .sort(),
  }
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe('jewelry seed', () => {
      let first: Awaited<ReturnType<typeof snapshot>>
      let second: Awaited<ReturnType<typeof snapshot>>

      beforeAll(async () => {
        const container = getContainer()
        await runMigrationScripts(container)
        const {
          result: [adminCategory],
        } = await createProductCategoriesWorkflow(container).run({
          input: { product_categories: [{ name: ADMIN_CATEGORY, is_active: true }] },
        })
        await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: 'Silver Anklet',
                handle: ADMIN_HANDLE,
                category_ids: [adminCategory.id],
                options: [{ title: 'Default', values: ['Default'] }],
                variants: [{ title: 'Default', options: { Default: 'Default' }, prices: [] }],
              },
            ],
          },
        })
        await seed(container)
        first = await snapshot(container)
        await seed(container)
        second = await snapshot(container)
      })

      it('creates the catalog and keeps products added in Admin', () => {
        expect(first.products.map((p) => p.handle)).toEqual(
          [...CATALOG.map((p) => p.handle), ADMIN_HANDLE].sort()
        )
        expect(first.categories).toEqual([...CATEGORIES, ADMIN_CATEGORY].sort())
      })

      it('creates the expected number of variants, each with its PLN price and stock', () => {
        const expected = CATALOG.flatMap((p) => p.variants)
        const actual = first.products
          .filter((p) => p.handle !== ADMIN_HANDLE)
          .flatMap((p) => p.variants)
        expect(actual).toHaveLength(expected.length)

        const bySku = new Map(actual.map((v) => [v.sku, v]))
        for (const variant of expected) {
          expect(bySku.get(variant.sku)).toEqual({
            sku: variant.sku,
            pln: [variant.price_pln],
            stock: [variant.stock],
          })
        }
      })

      it('sets up Poland: one PLN region, 23% VAT and shipping', () => {
        expect(first.regions.filter((r) => r.countries.includes('pl'))).toEqual([
          { name: 'Poland', currency: 'pln', countries: ['pl'] },
        ])
        expect(first.polandTaxRates).toEqual([{ rate: 23, is_default: true }])
        expect(first.polandShipping).toEqual(['Express Courier', 'Standard Shipping'])
      })

      it('gives the same dataset when run a second time', () => {
        expect(second).toEqual(first)
      })
    })
  },
})
