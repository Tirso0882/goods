import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk'
import { SUPPORT_VERIFICATION_MODULE } from '../../modules/support-verification'
import type SupportVerificationModuleService from '../../modules/support-verification/service'
import type { AttemptOutcome } from '../../modules/support-verification/models/verification-attempt'

export type RecordVerificationAttemptInput = {
  case_id: string
  method: 'guest_order'
  email_hash: string
  order_number: string
  outcome: AttemptOutcome
}

/**
 * Every attempt is kept with its outcome; the failed ones are the lockout
 * counters. No compensation: a later step failing must not erase a guess.
 */
export const recordVerificationAttemptStep = createStep(
  'record-verification-attempt',
  async (input: RecordVerificationAttemptInput, { container }) => {
    const verifications = container.resolve<SupportVerificationModuleService>(
      SUPPORT_VERIFICATION_MODULE
    )
    const attempt = await verifications.createVerificationAttempts(input)
    return new StepResponse(attempt)
  }
)
