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
import {
  CUSTOMERS,
  type FixtureOrder,
  ORDER_STATES,
  ORDERS,
  type OrderState,
} from '../../src/seed/customers-and-orders'
import { CATALOG, CATEGORIES } from '../../src/seed/jewelry-catalog'

jest.setTimeout(300_000)

type AfterSales = {
  returns: { status: string; from_exchange_or_claim: boolean; damaged: number }[]
  exchanged: boolean
  claim_type: string | null
}

/** What the support agent would conclude from the order alone, ignoring the seed key. */
function orderState(
  order: {
    status: string
    fulfillments: { shipped_at: unknown; delivered_at: unknown; canceled_at: unknown }[]
  },
  after: AfterSales
): OrderState {
  if (order.status === 'canceled') return 'canceled'
  if (after.claim_type) return after.claim_type === 'replace' ? 'claim-replaced' : 'claim-refunded'
  if (after.exchanged) return 'exchanged'
  const orderReturn = after.returns.find((r) => !r.from_exchange_or_claim)
  if (orderReturn) {
    if (orderReturn.status !== 'received') return 'return-requested'
    return orderReturn.damaged ? 'return-deducted' : 'return-approved'
  }
  const active = order.fulfillments.filter((f) => !f.canceled_at)
  if (!active.length) return 'unfulfilled'
  if (active.every((f) => f.delivered_at)) return 'delivered'
  if (active.every((f) => f.shipped_at)) return 'shipped'
  return 'fulfilled'
}

const PRICES = new Map(CATALOG.flatMap((p) => p.variants.map((v) => [v.sku, v.price_pln] as const)))
const SHIPPING_PRICE = { 'Standard Shipping': 15, 'Express Courier': 25 }

const goods = (items: { sku: string; quantity: number }[]) =>
  items.reduce((sum, i) => sum + PRICES.get(i.sku)! * i.quantity, 0)

function expectedRefund(o: FixtureOrder) {
  const paid = goods(o.items) + SHIPPING_PRICE[o.shipping]
  switch (o.state) {
    case 'canceled':
    case 'return-approved':
      return paid
    case 'return-deducted':
      return paid - o.deduction_pln
    case 'claim-refunded':
      return goods(o.items.filter((i) => i.sku === o.claim_sku))
    default:
      return 0
  }
}

/** Items on the order after exchanges and claims add the outbound ones. */
function expectedItems(o: FixtureOrder) {
  const items = [...o.items]
  if (o.state === 'exchanged') items.push({ sku: o.new_sku, quantity: o.items[0].quantity })
  if (o.state === 'claim-replaced') {
    items.push(o.items.find((i) => i.sku === o.claim_sku)!)
  }
  return items.sort((a, b) => a.sku.localeCompare(b.sku))
}

/** Stock moves: out when fulfilled, back in only when a return passes inspection. */
function expectedStockChange() {
  const change = new Map<string, number>()
  const add = (sku: string, n: number) => change.set(sku, (change.get(sku) ?? 0) + n)
  for (const o of ORDERS) {
    if (o.state === 'unfulfilled' || o.state === 'canceled') continue
    for (const i of expectedItems(o)) add(i.sku, -i.quantity)
    if (o.state === 'return-approved' || o.state === 'exchanged') {
      for (const i of o.items) add(i.sku, i.quantity)
    }
  }
  return change
}

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
  const { data: customers } = await query.graph({
    entity: 'customer',
    fields: ['email', 'first_name', 'last_name', 'addresses.address_1', 'addresses.country_code'],
  })
  const { data: orders } = await query.graph({
    entity: 'order',
    fields: [
      'id',
      'email',
      'status',
      'metadata',
      'customer.email',
      'shipping_address.address_1',
      'items.*',
      'shipping_methods.name',
      'fulfillments.shipped_at',
      'fulfillments.delivered_at',
      'fulfillments.canceled_at',
      'payment_collections.payments.captures.amount',
      'payment_collections.payments.refunds.amount',
      'payment_collections.payments.refunds.note',
    ],
  })
  const { data: returns } = await query.graph({
    entity: 'return',
    fields: [
      'order_id',
      'status',
      'exchange.id',
      'claim.id',
      'items.damaged_quantity',
      'items.reason.value',
    ],
  })
  const { data: exchanges } = await query.graph({ entity: 'order_exchange', fields: ['order_id'] })
  const { data: claims } = await query.graph({ entity: 'order_claim', fields: ['order_id', 'type'] })

  const afterSales = (orderId: string): AfterSales => ({
    returns: returns
      .filter((r) => r.order_id === orderId)
      .map((r) => ({
        status: r.status as string,
        from_exchange_or_claim: !!(r.exchange || r.claim),
        damaged: (r.items ?? []).reduce((s, i) => s + Number(i!.damaged_quantity), 0),
      })),
    exchanged: exchanges.some((e) => e.order_id === orderId),
    claim_type: claims.find((c) => c.order_id === orderId)?.type ?? null,
  })
  const returnReasons = (orderId: string) =>
    returns
      .filter((r) => r.order_id === orderId)
      .flatMap((r) => (r.items ?? []).map((i) => i!.reason?.value))
      .filter((v) => !!v)

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
    customers: customers
      .map((c) => ({
        email: c.email,
        name: `${c.first_name} ${c.last_name}`,
        addresses: (c.addresses ?? []).map((a) => `${a!.address_1}, ${a!.country_code}`),
      }))
      .sort((a, b) => a.email!.localeCompare(b.email!)),
    orders: orders
      .map((o) => {
        const payments = (o.payment_collections ?? []).flatMap((pc) => pc!.payments ?? [])
        return {
          key: o.metadata?.seed_key as string,
          email: o.email,
          customer: o.customer?.email,
          address: o.shipping_address?.address_1,
          state: orderState(
            {
              status: o.status,
              fulfillments: (o.fulfillments ?? []).map((f) => ({
                shipped_at: f!.shipped_at,
                delivered_at: f!.delivered_at,
                canceled_at: f!.canceled_at,
              })),
            },
            afterSales(o.id)
          ),
          return_reasons: returnReasons(o.id),
          shipping: (o.shipping_methods ?? []).map((m) => m!.name),
          items: (o.items ?? [])
            .map((i) => ({ sku: i!.variant_sku, quantity: Number(i!.quantity) }))
            .sort((a, b) => a.sku!.localeCompare(b.sku!)),
          captured: payments.flatMap((p) => p!.captures ?? []).reduce((s, c) => s + Number(c!.amount), 0),
          refunded: payments.flatMap((p) => p!.refunds ?? []).reduce((s, r) => s + Number(r!.amount), 0),
          refund_notes: payments.flatMap((p) => p!.refunds ?? []).map((r) => r!.note).filter((n) => !!n),
        }
      })
      .sort((a, b) => a.key.localeCompare(b.key)),
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

      it('creates the expected number of variants, each with its PLN price and stock after orders and returns', () => {
        const stockChange = expectedStockChange()
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
            stock: [variant.stock + (stockChange.get(variant.sku) ?? 0)],
          })
        }
      })

      it('creates the synthetic customers, each with a made-up Polish address', () => {
        expect(first.customers).toEqual(
          CUSTOMERS.map((c) => ({
            email: c.email,
            name: `${c.first_name} ${c.last_name}`,
            addresses: [`${c.address_1}, pl`],
          })).sort((a, b) => a.email.localeCompare(b.email))
        )
      })

      it('creates the expected number of orders in each state', () => {
        const count = (states: OrderState[]) =>
          Object.fromEntries(ORDER_STATES.map((s) => [s, states.filter((x) => x === s).length]))
        const expected = count(ORDERS.map((o) => o.state))
        expect(count(first.orders.map((o) => o.state))).toEqual(expected)
        for (const state of ORDER_STATES) {
          expect(expected[state]).toBeGreaterThan(0)
        }
      })

      it('places each fixture order for its customer, paid, and takes it through its story', () => {
        expect(first.orders).toEqual(
          ORDERS.map((o) => {
            const customer = CUSTOMERS.find((c) => c.email === o.email)!
            const refunded = expectedRefund(o)
            return {
              key: o.key,
              email: o.email,
              customer: o.email,
              address: customer.address_1,
              state: o.state,
              return_reasons: 'reason' in o ? o.items.map(() => o.reason) : [],
              // Exchanges and replacements go out again, free, with the same option.
              shipping: ['exchanged', 'claim-replaced'].includes(o.state)
                ? [o.shipping, o.shipping]
                : [o.shipping],
              items: expectedItems(o),
              captured: goods(o.items) + SHIPPING_PRICE[o.shipping],
              refunded,
              refund_notes: refunded && 'note' in o ? [o.note] : [],
            }
          }).sort((a, b) => a.key.localeCompare(b.key))
        )
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
