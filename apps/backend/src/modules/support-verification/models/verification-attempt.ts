import { model } from '@medusajs/framework/utils'

export const ATTEMPT_OUTCOMES = ['granted', 'failed', 'locked'] as const
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number]

/**
 * One try at proving an order, whatever its outcome. The failed ones are the
 * lockout counters, so the limits live next to the check.
 */
const VerificationAttempt = model
  .define('verification_attempt', {
    id: model.id({ prefix: 'vatt' }).primaryKey(),
    case_id: model.text(),
    method: model.text(),
    /** SHA-256 of the normalized email, to count by. Not a secret: a known email hashes the same. */
    email_hash: model.text(),
    order_number: model.text(),
    outcome: model.enum([...ATTEMPT_OUTCOMES]),
  })
  .indexes([{ on: ['case_id', 'outcome'] }, { on: ['email_hash', 'outcome', 'created_at'] }])

export default VerificationAttempt
