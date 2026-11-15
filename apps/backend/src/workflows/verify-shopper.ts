import { acquireLockStep, releaseLockStep } from '@medusajs/medusa/core-flows'
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { sha256Hex } from '../modules/support-verification/hash'
import { createVerificationGrantStep } from './steps/create-verification-grant'
import { evaluateGuestProofStep, normalizeEmail } from './steps/evaluate-guest-proof'
import { recordVerificationAttemptStep } from './steps/record-verification-attempt'

export type VerifyShopperInput = {
  case_id: string
  email: string
  order_number: string
  postcode: string
  /** SHA-256 of the grant token the route will hand out if the proof matches. */
  token_hash: string
}

/**
 * Checks a guest's proof of one order and records the attempt. Returns a read
 * grant only when the proof matches and neither lockout limit is reached.
 *
 * A failed proof is an outcome, not an error, so its attempt is kept. The case
 * and email are locked for the run, so parallel guesses can't overrun the limits.
 */
export const verifyShopperWorkflow = createWorkflow(
  'verify-shopper',
  function (input: VerifyShopperInput) {
    const email_hash = transform({ input }, ({ input }) => sha256Hex(normalizeEmail(input.email)))
    const lockKeys = transform({ input, email_hash }, ({ input, email_hash }) => [
      `support-verification:case:${input.case_id}`,
      `support-verification:email:${email_hash}`,
    ])

    acquireLockStep({ key: lockKeys, timeout: 5, ttl: 30 })

    const evaluation = evaluateGuestProofStep(
      transform({ input, email_hash }, ({ input, email_hash }) => ({
        case_id: input.case_id,
        email_hash,
        email: input.email,
        order_number: input.order_number,
        postcode: input.postcode,
      }))
    )

    recordVerificationAttemptStep(
      transform({ input, email_hash, evaluation }, ({ input, email_hash, evaluation }) => ({
        case_id: input.case_id,
        method: 'guest_order' as const,
        email_hash,
        order_number: input.order_number,
        outcome: evaluation.outcome,
      }))
    )

    const grant = when({ evaluation }, ({ evaluation }) => evaluation.outcome === 'granted').then(
      function () {
        return createVerificationGrantStep(
          transform({ input, evaluation }, ({ input, evaluation }) => ({
            token_hash: input.token_hash,
            case_id: input.case_id,
            order_id: evaluation.order_id!,
            order_number: input.order_number,
          }))
        )
      }
    )

    releaseLockStep({ key: lockKeys })

    const result = transform({ evaluation, grant }, ({ evaluation, grant }) => ({
      outcome: evaluation.outcome,
      grant: grant
        ? {
            case_id: grant.case_id,
            tier: grant.tier,
            order_number: grant.order_number,
            expires_at: new Date(grant.expires_at).toISOString(),
          }
        : null,
    }))

    return new WorkflowResponse(result)
  }
)

export default verifyShopperWorkflow
