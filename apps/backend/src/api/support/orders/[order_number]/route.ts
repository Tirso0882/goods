import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { SUPPORT_VERIFICATION_MODULE } from '../../../../modules/support-verification'
import { sha256Hex } from '../../../../modules/support-verification/hash'
import type SupportVerificationModuleService from '../../../../modules/support-verification/service'
import { sendPortError } from '../../errors'
import { type MedusaAfterSales, type MedusaOrderView, toPortOrder } from '../port-order'

/**
 * Get one order (commerce port `getOrder`). Reads only. The grant decides
 * which order can be read; the path only has to name that same order.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const header = req.headers['x-verification-grant']
  const token = typeof header === 'string' ? header : ''
  const grant = token ? await findLiveGrant(req.scope, token) : null
  if (!grant) {
    sendPortError(
      res,
      403,
      'grant_invalid',
      'The verification grant is missing, unknown or expired.'
    )
    return
  }

  // An unknown number and someone else's order look the same from here.
  const found =
    grant.order_number === req.params.order_number
      ? await readOrderForPort(req.scope, grant.order_id)
      : null
  if (!found || String(found.order.display_id) !== grant.order_number) {
    sendPortError(res, 404, 'order_not_found', 'No order with this number is covered by the grant.')
    return
  }

  res.status(200).json(toPortOrder(found.order, found.afterSales))
}

async function findLiveGrant(container: MedusaContainer, token: string) {
  const verifications = container.resolve<SupportVerificationModuleService>(
    SUPPORT_VERIFICATION_MODULE
  )
  const [grant] = await verifications.listVerificationGrants({ token_hash: sha256Hex(token) })
  // Only read grants exist; a future tier must opt in here rather than pass by default.
  if (!grant || grant.tier !== 'read' || new Date(grant.expires_at).getTime() <= Date.now()) {
    return null
  }
  return grant
}

/** The order and its after-sales, with only the fields the port's `Order` is made from. */
async function readOrderForPort(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ofOrder = { order_id: orderId }

  const {
    data: [order],
  } = await query.graph({
    entity: 'order',
    fields: [
      'display_id',
      'created_at',
      'status',
      'items.id',
      'items.title',
      'items.product_title',
      'items.variant_title',
      'items.variant_sku',
      'items.quantity',
      'shipping_methods.name',
      'shipping_methods.created_at',
      'fulfillments.shipped_at',
      'fulfillments.delivered_at',
      'fulfillments.canceled_at',
      'fulfillments.labels.tracking_number',
      'fulfillments.labels.tracking_url',
    ],
    filters: { id: orderId },
  })
  if (!order) return null

  const { data: returns } = await query.graph({
    entity: 'return',
    fields: ['status', 'exchange.id', 'claim.id'],
    filters: ofOrder,
  })
  const { data: exchanges } = await query.graph({
    entity: 'order_exchange',
    fields: ['canceled_at', 'additional_items.item_id'],
    filters: ofOrder,
  })
  const { data: claims } = await query.graph({
    entity: 'order_claim',
    fields: ['type', 'canceled_at', 'additional_items.item_id'],
    filters: ofOrder,
  })

  const afterSales: MedusaAfterSales = { returns, exchanges, claims }
  return { order: order as unknown as MedusaOrderView, afterSales }
}
