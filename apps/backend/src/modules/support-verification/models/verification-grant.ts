import { model } from '@medusajs/framework/utils'

/** A grant the store issued. The token itself is never stored, only its hash. */
const VerificationGrant = model.define('verification_grant', {
  id: model.id({ prefix: 'vgr' }).primaryKey(),
  token_hash: model.text().unique(),
  case_id: model.text(),
  tier: model.enum(['read']),
  order_id: model.text(),
  order_number: model.text(),
  expires_at: model.dateTime(),
})

export default VerificationGrant
