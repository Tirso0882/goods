import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk'
import { SUPPORT_VERIFICATION_MODULE } from '../../modules/support-verification'
import type SupportVerificationModuleService from '../../modules/support-verification/service'

export const GRANT_TTL_MS = 30 * 60_000

export type CreateVerificationGrantInput = {
  /** SHA-256 of the token. The token itself never enters the workflow. */
  token_hash: string
  case_id: string
  order_id: string
  order_number: string
}

/** A read grant for one order, bound to one support case, for 30 minutes. */
export const createVerificationGrantStep = createStep(
  'create-verification-grant',
  async (input: CreateVerificationGrantInput, { container }) => {
    const verifications = container.resolve<SupportVerificationModuleService>(
      SUPPORT_VERIFICATION_MODULE
    )
    const grant = await verifications.createVerificationGrants({
      ...input,
      tier: 'read',
      expires_at: new Date(Date.now() + GRANT_TTL_MS),
    })
    return new StepResponse(grant, grant.id)
  },
  async (id, { container }) => {
    if (!id) return
    const verifications = container.resolve<SupportVerificationModuleService>(
      SUPPORT_VERIFICATION_MODULE
    )
    await verifications.deleteVerificationGrants(id)
  }
)
