/**
 * Turns Medusa's view of an order into the commerce port's `Order`
 * (contracts/commerce-port.openapi.yaml). Only the fields listed here leave
 * the store: no email, address or payment data is read, so none can leak.
 */

export type OrderStatus = 'processing' | 'shipped' | 'delivered' | 'canceled'
export type AfterSale =
  'none' | 'return_in_progress' | 'returned' | 'exchanged' | 'replacement_sent' | 'partly_refunded'

export type PortOrder = {
  order_number: string
  placed_at: string
  status: OrderStatus
  after_sale: AfterSale
  items: { title: string; variant: string | null; sku: string | null; quantity: number }[]
  shipping_method: string
  tracking: { number: string; url: string | null }[]
}

type Maybe<T> = T | null | undefined

export type MedusaOrderView = {
  display_id: Maybe<number | string>
  created_at: Maybe<Date | string>
  status: Maybe<string>
  items: Maybe<
    Maybe<{
      id: string
      title?: Maybe<string>
      product_title?: Maybe<string>
      variant_title?: Maybe<string>
      variant_sku?: Maybe<string>
      quantity: Maybe<number | string>
    }>[]
  >
  shipping_methods: Maybe<Maybe<{ name?: Maybe<string>; created_at?: Maybe<Date | string> }>[]>
  fulfillments: Maybe<
    Maybe<{
      shipped_at?: Maybe<Date | string>
      delivered_at?: Maybe<Date | string>
      canceled_at?: Maybe<Date | string>
      labels?: Maybe<Maybe<{ tracking_number?: Maybe<string>; tracking_url?: Maybe<string> }>[]>
    }>[]
  >
}

type AddedItems = Maybe<Maybe<{ item_id?: Maybe<string> }>[]>

/** Every return, exchange and claim on the order, as Medusa keeps them. */
export type MedusaAfterSales = {
  returns: {
    status: Maybe<string>
    /** Set when an exchange or a claim made the return. */
    exchange?: Maybe<{ id: string }>
    claim?: Maybe<{ id: string }>
  }[]
  exchanges: { canceled_at?: Maybe<Date | string>; additional_items?: AddedItems }[]
  claims: {
    type: Maybe<string>
    canceled_at?: Maybe<Date | string>
    additional_items?: AddedItems
  }[]
}

const time = (value: Maybe<Date | string>) => new Date(value as string | Date).getTime()
const present = <T>(values: Maybe<Maybe<T>[]>): T[] =>
  (values ?? []).filter((v): v is T => v != null)

/** The parcels the order still has, canceled fulfillments left out. */
const parcelsOf = (order: MedusaOrderView) =>
  present(order.fulfillments).filter((f) => !f.canceled_at)

/**
 * The after-sales the shopper knows about: confirmed, not canceled, and for
 * returns only those of their own, since an exchange or a claim speaks for its return.
 */
function liveAfterSales(afterSales: MedusaAfterSales) {
  return {
    // `open` is a return still being drafted, not yet asked for.
    returns: afterSales.returns.filter(
      (r) => !['open', 'canceled'].includes(r.status ?? '') && !r.exchange && !r.claim
    ),
    exchanges: afterSales.exchanges.filter((e) => !e.canceled_at),
    claims: afterSales.claims.filter((c) => !c.canceled_at),
  }
}

/**
 * What happened after delivery. When several have, the one the shopper is
 * still waiting on wins, then the ones that sent or refunded something.
 */
function afterSaleOf(afterSales: ReturnType<typeof liveAfterSales>): AfterSale {
  const received = (status: Maybe<string>) =>
    ['received', 'partially_received'].includes(status ?? '')
  if (afterSales.returns.some((r) => !received(r.status))) return 'return_in_progress'
  if (afterSales.claims.some((c) => c.type === 'replace')) return 'replacement_sent'
  if (afterSales.claims.some((c) => c.type === 'refund')) return 'partly_refunded'
  if (afterSales.exchanges.length) return 'exchanged'
  if (afterSales.returns.length) return 'returned'
  return 'none'
}

/**
 * Where the order is on its way to the shopper. After-sales only follow a
 * delivery, so an order with one is delivered whatever its later parcels are doing.
 */
function statusOf(order: MedusaOrderView, afterSale: AfterSale): OrderStatus {
  if (order.status === 'canceled') return 'canceled'
  if (afterSale !== 'none') return 'delivered'
  const parcels = parcelsOf(order)
  if (parcels.length && parcels.every((f) => f.delivered_at)) return 'delivered'
  if (parcels.some((f) => f.shipped_at || f.delivered_at)) return 'shipped'
  return 'processing'
}

export function toPortOrder(order: MedusaOrderView, afterSales: MedusaAfterSales): PortOrder {
  const live = liveAfterSales(afterSales)
  const after_sale = afterSaleOf(live)
  // Items an exchange or a claim sent are part of the after-sale, not of what was ordered.
  const added = new Set(
    [...live.exchanges, ...live.claims].flatMap((a) =>
      present(a.additional_items).flatMap((i) => (i.item_id ? [i.item_id] : []))
    )
  )
  const [chosen] = present(order.shipping_methods).sort(
    (a, b) => time(a.created_at) - time(b.created_at)
  )

  return {
    order_number: String(order.display_id),
    placed_at: new Date(order.created_at as string | Date).toISOString(),
    status: statusOf(order, after_sale),
    after_sale,
    items: present(order.items)
      .filter((i) => !added.has(i.id))
      .map((i) => ({
        title: i.product_title ?? i.title ?? '',
        variant: i.variant_title ?? null,
        sku: i.variant_sku ?? null,
        quantity: Number(i.quantity),
      })),
    shipping_method: chosen?.name ?? '',
    tracking: parcelsOf(order)
      .flatMap((f) => present(f.labels))
      .filter((l) => !!l.tracking_number)
      .map((l) => ({ number: l.tracking_number!, url: l.tracking_url || null })),
  }
}
