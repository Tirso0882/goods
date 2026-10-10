/**
 * Creates the synthetic customers and moves each of their orders to its
 * fixture state. Orders go through the storefront checkout (cart, shipping,
 * payment, complete), then the same workflows the admin uses: capture,
 * fulfill, ship, deliver, cancel, return, exchange, claim and refund.
 * Each step checks the order first, so re-runs skip it.
 */
import type { MedusaContainer } from '@medusajs/framework/types'
import {
  ClaimReason,
  ClaimType,
  ContainerRegistrationKeys,
  MedusaError,
} from '@medusajs/framework/utils'
import {
  addShippingMethodToCartWorkflow,
  beginClaimOrderWorkflow,
  beginExchangeOrderWorkflow,
  beginReceiveReturnWorkflow,
  beginReturnOrderWorkflow,
  cancelOrderWorkflow,
  capturePaymentWorkflow,
  completeCartWorkflow,
  confirmClaimRequestWorkflow,
  confirmExchangeRequestWorkflow,
  confirmReturnReceiveWorkflow,
  confirmReturnRequestWorkflow,
  createCartWorkflow,
  createClaimShippingMethodWorkflow,
  createCustomersWorkflow,
  createExchangeShippingMethodWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  createReturnReasonsWorkflow,
  dismissItemReturnRequestWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  orderClaimAddNewItemWorkflow,
  orderClaimItemWorkflow,
  orderExchangeAddNewItemWorkflow,
  orderExchangeRequestItemReturnWorkflow,
  receiveItemReturnRequestWorkflow,
  refundPaymentWorkflow,
  requestItemReturnWorkflow,
} from '@medusajs/medusa/core-flows'
import {
  CUSTOMERS,
  type FixtureCustomer,
  type FixtureOrder,
  ORDERS,
  RETURN_REASONS,
} from './customers-and-orders'

const COUNTRY = 'pl'
const CURRENCY = 'pln'

export async function ensureCustomers(container: MedusaContainer): Promise<Map<string, string>> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const emails = CUSTOMERS.map((c) => c.email)

  const { data: existing } = await query.graph({
    entity: 'customer',
    fields: ['id', 'email'],
    filters: { email: emails },
  })
  const missing = CUSTOMERS.filter((c) => !existing.some((e) => e.email === c.email))

  if (missing.length) {
    await createCustomersWorkflow(container).run({
      input: {
        customersData: missing.map((c) => ({
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          addresses: [{ ...address(c), is_default_shipping: true, is_default_billing: true }],
        })),
      },
    })
    logger.info(`Created ${missing.length} customer(s).`)
  } else {
    logger.info('All customers exist. Skipping.')
  }

  const { data: all } = await query.graph({
    entity: 'customer',
    fields: ['id', 'email'],
    filters: { email: emails },
  })
  return new Map(all.map((c) => [c.email!, c.id]))
}

type Store = { regionId: string; salesChannelId: string; customerIds: Map<string, string> }

export async function ensureOrders(container: MedusaContainer, store: Store) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({
    entity: 'order',
    fields: ['id', 'metadata'],
    filters: { email: CUSTOMERS.map((c) => c.email) },
  })
  const orderIds = new Map(existing.map((o) => [o.metadata?.seed_key as string, o.id]))
  const missing = ORDERS.filter((o) => !orderIds.has(o.key))
  const ctx = await seedContext(container)

  for (const fixture of missing) {
    orderIds.set(fixture.key, await placeOrder(container, fixture, store, ctx))
  }
  logger.info(missing.length ? `Placed ${missing.length} order(s).` : 'All orders exist. Skipping.')

  for (const fixture of ORDERS) {
    await advanceOrder(container, orderIds.get(fixture.key)!, fixture, ctx)
  }
  logger.info(`Orders ready: ${ORDERS.length} in their fixture states.`)
}

type SeedContext = {
  variantIds: Map<string, string>
  shippingOptionIds: Map<string, string>
  locationId: string
  reasonIds: Map<string, string>
}

async function seedContext(container: MedusaContainer): Promise<SeedContext> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const skus = ORDERS.flatMap((o) => [
    ...o.items.map((i) => i.sku),
    ...(o.state === 'exchanged' ? [o.new_sku] : []),
  ])

  const { data: variants } = await query.graph({
    entity: 'product_variant',
    fields: ['id', 'sku'],
    filters: { sku: [...new Set(skus)] },
  })
  const { data: shippingOptions } = await query.graph({
    entity: 'shipping_option',
    fields: ['id', 'name', 'service_zone.geo_zones.country_code'],
  })
  const {
    data: [location],
  } = await query.graph({ entity: 'stock_location', fields: ['id'] })

  if (!location) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      'No stock location. Run `pnpm medusa db:migrate` first.'
    )
  }

  return {
    variantIds: new Map(variants.map((v) => [v.sku!, v.id])),
    shippingOptionIds: new Map(
      shippingOptions
        .filter((o) => o.service_zone?.geo_zones?.some((g) => g?.country_code === COUNTRY))
        .map((o) => [o.name, o.id])
    ),
    locationId: location.id,
    reasonIds: await ensureReturnReasons(container),
  }
}

async function ensureReturnReasons(container: MedusaContainer): Promise<Map<string, string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const values = RETURN_REASONS.map((r) => r.value as string)

  const { data: existing } = await query.graph({
    entity: 'return_reason',
    fields: ['id', 'value'],
    filters: { value: values },
  })
  const missing = RETURN_REASONS.filter((r) => !existing.some((e) => e.value === r.value))

  if (missing.length) {
    await createReturnReasonsWorkflow(container).run({
      input: { data: missing.map((r) => ({ ...r })) },
    })
  }

  const { data: all } = await query.graph({
    entity: 'return_reason',
    fields: ['id', 'value'],
    filters: { value: values },
  })
  return new Map(all.map((r) => [r.value, r.id]))
}

async function placeOrder(
  container: MedusaContainer,
  fixture: FixtureOrder,
  store: Store,
  ctx: SeedContext
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const customer = CUSTOMERS.find((c) => c.email === fixture.email)!

  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: store.regionId,
      sales_channel_id: store.salesChannelId,
      currency_code: CURRENCY,
      customer_id: store.customerIds.get(customer.email),
      email: customer.email,
      shipping_address: address(customer),
      billing_address: address(customer),
      items: fixture.items.map((i) => ({
        variant_id: ctx.variantIds.get(i.sku)!,
        quantity: i.quantity,
      })),
      metadata: { seed_key: fixture.key },
    },
  })

  await addShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cart.id, options: [{ id: ctx.shippingOptionIds.get(fixture.shipping)! }] },
  })
  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cart.id } })

  const {
    data: [withCollection],
  } = await query.graph({
    entity: 'cart',
    fields: ['payment_collection.id'],
    filters: { id: cart.id },
  })
  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: withCollection.payment_collection!.id,
      provider_id: 'pp_system_default',
    },
  })

  const { result } = await completeCartWorkflow(container).run({ input: { id: cart.id } })
  return result.id
}

async function loadOrder(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: 'order',
    fields: [
      'id',
      'status',
      // Quantities live on the order item detail; `items.*` merges them in.
      'items.*',
      'payment_collections.payments.id',
      'payment_collections.payments.captures.amount',
      'payment_collections.payments.refunds.amount',
      'fulfillments.id',
      'fulfillments.shipped_at',
      'fulfillments.delivered_at',
      'fulfillments.canceled_at',
      'fulfillments.items.line_item_id',
      'fulfillments.items.quantity',
    ],
    filters: { id: orderId },
  })
  return order
}
type Order = Awaited<ReturnType<typeof loadOrder>>

async function loadAfterSales(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters = { order_id: orderId }

  const { data: returns } = await query.graph({
    entity: 'return',
    fields: ['id', 'status', 'exchange.id', 'claim.id'],
    filters,
  })
  const { data: exchanges } = await query.graph({
    entity: 'order_exchange',
    fields: ['id', 'return_id', 'canceled_at'],
    filters,
  })
  const { data: claims } = await query.graph({
    entity: 'order_claim',
    fields: ['id', 'canceled_at'],
    filters,
  })
  return {
    returns: returns.filter((r) => r.status !== 'canceled'),
    exchange: exchanges.find((e) => !e.canceled_at),
    claim: claims.find((c) => !c.canceled_at),
  }
}

const items = (order: Order) =>
  (order.items ?? []).map((i) => ({
    id: i!.id,
    sku: i!.variant_sku,
    quantity: Number(i!.quantity),
    unit_price: Number(i!.unit_price),
    // Not on the generated type, but `items.*` returns it.
    fulfilled: Number((i as { detail?: { fulfilled_quantity?: number } }).detail?.fulfilled_quantity ?? 0),
  }))

const payments = (order: Order) =>
  (order.payment_collections ?? []).flatMap((pc) => pc?.payments ?? []).filter((p) => !!p)

/** Every order is paid first; canceling a paid order refunds it. */
async function advanceOrder(
  container: MedusaContainer,
  orderId: string,
  fixture: FixtureOrder,
  ctx: SeedContext
) {
  const order = await loadOrder(container, orderId)
  if (order.status === 'canceled') {
    return
  }

  for (const payment of payments(order).filter((p) => !p.captures?.length)) {
    await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } })
  }

  switch (fixture.state) {
    case 'unfulfilled':
      return
    case 'canceled':
      await cancelOrderWorkflow(container).run({ input: { order_id: orderId } })
      return
    case 'fulfilled':
    case 'shipped':
    case 'delivered':
      await sendItems(container, orderId, fixture.state)
      return
    case 'return-requested':
    case 'return-approved':
    case 'return-deducted':
      await sendItems(container, orderId, 'delivered')
      await ensureReturn(container, orderId, fixture, ctx)
      break
    case 'exchanged':
      await sendItems(container, orderId, 'delivered')
      await ensureExchange(container, orderId, fixture, ctx)
      await sendItems(container, orderId, 'delivered')
      break
    case 'claim-replaced':
    case 'claim-refunded':
      await sendItems(container, orderId, 'delivered')
      await ensureClaim(container, orderId, fixture, ctx)
      await sendItems(container, orderId, 'shipped')
      break
  }

  await ensureRefund(container, orderId, fixture)
}

/** Fulfills, ships and delivers whatever hasn't reached `until` yet, including exchange and claim items. */
async function sendItems(
  container: MedusaContainer,
  orderId: string,
  until: 'fulfilled' | 'shipped' | 'delivered'
) {
  const unfulfilled = items(await loadOrder(container, orderId))
    .filter((i) => i.quantity > i.fulfilled)
    .map((i) => ({ id: i.id, quantity: i.quantity - i.fulfilled }))
  if (unfulfilled.length) {
    await createOrderFulfillmentWorkflow(container).run({
      input: { order_id: orderId, items: unfulfilled },
    })
  }
  if (until === 'fulfilled') {
    return
  }

  const fulfillments = ((await loadOrder(container, orderId)).fulfillments ?? []).filter(
    (f) => f && !f.canceled_at
  )
  for (const f of fulfillments.filter((f) => !f!.shipped_at)) {
    await createOrderShipmentWorkflow(container).run({
      input: {
        order_id: orderId,
        fulfillment_id: f!.id,
        items: (f!.items ?? []).map((i) => ({ id: i!.line_item_id!, quantity: Number(i!.quantity) })),
      },
    })
  }
  if (until === 'shipped') {
    return
  }

  for (const f of fulfillments.filter((f) => !f!.delivered_at)) {
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId, fulfillmentId: f!.id },
    })
  }
}

type ReturnFixture = Extract<FixtureOrder, { reason: string }>

async function ensureReturn(
  container: MedusaContainer,
  orderId: string,
  fixture: Extract<ReturnFixture, { state: `return-${string}` }>,
  ctx: SeedContext
) {
  const order = await loadOrder(container, orderId)
  const returned = items(order).map((i) => ({ id: i.id, quantity: i.quantity }))
  const { returns } = await loadAfterSales(container, orderId)
  let orderReturn: { id: string; status: string } | undefined = returns.find(
    (r) => !r.exchange && !r.claim
  )

  if (!orderReturn) {
    const { result: change } = await beginReturnOrderWorkflow(container).run({
      input: { order_id: orderId, location_id: ctx.locationId, description: fixture.note },
    })
    await requestItemReturnWorkflow(container).run({
      input: {
        return_id: change.return_id!,
        items: returned.map((i) => ({ ...i, reason_id: ctx.reasonIds.get(fixture.reason) })),
      },
    })
    await confirmReturnRequestWorkflow(container).run({ input: { return_id: change.return_id! } })
    orderReturn = { id: change.return_id!, status: 'requested' }
  }

  if (fixture.state !== 'return-requested' && orderReturn.status !== 'received') {
    await receiveReturn(container, orderReturn.id, returned, fixture)
  }
}

/** Inspection: items in resellable condition go back to stock; worn ones are dismissed. */
async function receiveReturn(
  container: MedusaContainer,
  returnId: string,
  returned: { id: string; quantity: number }[],
  fixture: ReturnFixture
) {
  await beginReceiveReturnWorkflow(container).run({
    input: { return_id: returnId, description: fixture.note },
  })
  if (fixture.state === 'return-deducted') {
    await dismissItemReturnRequestWorkflow(container).run({
      input: {
        return_id: returnId,
        items: returned.map((i) => ({ ...i, internal_note: fixture.note })),
      },
    })
  } else {
    await receiveItemReturnRequestWorkflow(container).run({
      input: { return_id: returnId, items: returned },
    })
  }
  await confirmReturnReceiveWorkflow(container).run({ input: { return_id: returnId } })
}

async function ensureExchange(
  container: MedusaContainer,
  orderId: string,
  fixture: Extract<FixtureOrder, { state: 'exchanged' }>,
  ctx: SeedContext
) {
  const [item] = items(await loadOrder(container, orderId))
  const returned = [{ id: item.id, quantity: item.quantity }]

  if (!(await loadAfterSales(container, orderId)).exchange) {
    const { result: change } = await beginExchangeOrderWorkflow(container).run({
      input: { order_id: orderId, description: fixture.note },
    })
    const exchangeId = change.exchange_id!
    await orderExchangeRequestItemReturnWorkflow(container).run({
      input: {
        exchange_id: exchangeId,
        // The workflow creates the exchange's return when it has none yet.
        return_id: undefined as unknown as string,
        location_id: ctx.locationId,
        items: returned.map((i) => ({ ...i, reason_id: ctx.reasonIds.get(fixture.reason) })),
      },
    })
    await orderExchangeAddNewItemWorkflow(container).run({
      input: {
        exchange_id: exchangeId,
        items: [{ variant_id: ctx.variantIds.get(fixture.new_sku)!, quantity: item.quantity }],
      },
    })
    // Without an outbound shipping method, confirming reserves no stock and the item can't be fulfilled.
    await createExchangeShippingMethodWorkflow(container).run({
      input: {
        exchange_id: exchangeId,
        shipping_option_id: ctx.shippingOptionIds.get(fixture.shipping)!,
        custom_amount: 0,
      },
    })
    await confirmExchangeRequestWorkflow(container).run({ input: { exchange_id: exchangeId } })
  }

  const { exchange, returns } = await loadAfterSales(container, orderId)
  const exchangeReturn = returns.find((r) => r.id === exchange!.return_id)
  if (exchangeReturn?.status !== 'received') {
    await receiveReturn(container, exchange!.return_id!, returned, fixture)
  }
}

async function ensureClaim(
  container: MedusaContainer,
  orderId: string,
  fixture: Extract<FixtureOrder, { claim_sku: string }>,
  ctx: SeedContext
) {
  if ((await loadAfterSales(container, orderId)).claim) {
    return
  }
  const order = await loadOrder(container, orderId)

  const replace = fixture.state === 'claim-replaced'
  const item = items(order).find((i) => i.sku === fixture.claim_sku)!
  const { result: change } = await beginClaimOrderWorkflow(container).run({
    input: {
      order_id: orderId,
      type: replace ? ClaimType.REPLACE : ClaimType.REFUND,
      description: fixture.note,
    },
  })
  const claimId = change.claim_id!

  await orderClaimItemWorkflow(container).run({
    input: {
      claim_id: claimId,
      items: [
        { id: item.id, quantity: item.quantity, reason: fixture.claim_reason as ClaimReason },
      ],
    },
  })
  if (replace) {
    await orderClaimAddNewItemWorkflow(container).run({
      input: {
        claim_id: claimId,
        items: [{ variant_id: ctx.variantIds.get(item.sku!)!, quantity: item.quantity }],
      },
    })
    await createClaimShippingMethodWorkflow(container).run({
      input: {
        claim_id: claimId,
        shipping_option_id: ctx.shippingOptionIds.get(fixture.shipping)!,
        custom_amount: 0,
      },
    })
  }
  await confirmClaimRequestWorkflow(container).run({ input: { claim_id: claimId } })
}

/**
 * Refund the customer is owed after inspection or a claim: the full payment
 * (goods and delivery) for an approved return, minus the diminished value for
 * a worn one, or the claimed item for a missing one.
 */
async function ensureRefund(container: MedusaContainer, orderId: string, fixture: FixtureOrder) {
  const order = await loadOrder(container, orderId)
  const paid = payments(order)
  const captured = paid.flatMap((p) => p.captures ?? []).reduce((s, c) => s + Number(c!.amount), 0)
  const refunded = paid.flatMap((p) => p.refunds ?? []).reduce((s, r) => s + Number(r!.amount), 0)

  let owed = 0
  if (fixture.state === 'return-approved') {
    owed = captured
  } else if (fixture.state === 'return-deducted') {
    owed = captured - fixture.deduction_pln
  } else if (fixture.state === 'claim-refunded') {
    const item = items(order).find((i) => i.sku === fixture.claim_sku)!
    owed = item.unit_price * item.quantity
  }

  if (owed > refunded && 'note' in fixture) {
    await refundPaymentWorkflow(container).run({
      input: { payment_id: paid[0].id, amount: owed - refunded, note: fixture.note },
    })
  }
}

function address(c: FixtureCustomer) {
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    address_1: c.address_1,
    postal_code: c.postal_code,
    city: c.city,
    country_code: COUNTRY,
  }
}
