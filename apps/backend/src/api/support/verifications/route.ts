import { randomBytes } from 'crypto'
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { sha256Hex } from '../../../modules/support-verification/hash'
import { verifyShopperWorkflow } from '../../../workflows/verify-shopper'
import { sendPortError } from '../errors'
import type { VerifyShopperBody } from '../middlewares'

/**
 * Verify a shopper (commerce port `verifyShopper`). The grant token is made
 * here and only its hash goes further, so the store never holds the token.
 */
export async function POST(req: MedusaRequest<VerifyShopperBody>, res: MedusaResponse) {
  const { case_id, proof } = req.validatedBody
  const token = randomBytes(32).toString('base64url')

  const { result } = await verifyShopperWorkflow(req.scope).run({
    input: {
      case_id,
      email: proof.email,
      order_number: proof.order_number,
      postcode: proof.postcode,
      token_hash: sha256Hex(token),
    },
  })

  if (result.outcome === 'locked') {
    sendPortError(
      res,
      429,
      'verification_locked',
      'Too many failed attempts. Verification is locked.'
    )
    return
  }
  if (!result.grant) {
    sendPortError(res, 403, 'verification_failed', "The details don't match an order.")
    return
  }

  const { tier, order_number, expires_at } = result.grant
  res.status(201).json({
    grant: token,
    case_id: result.grant.case_id,
    tier,
    scope: { type: 'order', order_number },
    expires_at,
  })
}
