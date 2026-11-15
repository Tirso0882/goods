import type { MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk'
import { SUPPORT_VERIFICATION_MODULE } from '../../modules/support-verification'
import type SupportVerificationModuleService from '../../modules/support-verification/service'
import type { AttemptOutcome } from '../../modules/support-verification/models/verification-attempt'

/** Failed attempts allowed per support case, and per email address in the window. */
export const MAX_FAILED_ATTEMPTS = 5
export const EMAIL_WINDOW_MS = 24 * 60 * 60_000

export type EvaluateGuestProofInput = {
  case_id: string
  email_hash: string
  email: string
  order_number: string
  postcode: string
}

export type ProofEvaluation = {
  outcome: AttemptOutcome
  /** Medusa's ID of the proven order, only when the outcome is `granted`. */
  order_id: string | null
}

const MAX_DISPLAY_ID = 2 ** 31 - 1

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const normalizePostcode = (postcode: string) => postcode.replace(/[\s-]/g, '').toUpperCase()

/**
 * Decides an attempt without changing anything: locked if either limit is
 * already reached, else granted only when the order number, email and
 * postcode all match one order.
 */
export const evaluateGuestProofStep = createStep(
  'evaluate-guest-proof',
  async (input: EvaluateGuestProofInput, { container }) => {
    const verifications = container.resolve<SupportVerificationModuleService>(
      SUPPORT_VERIFICATION_MODULE
    )

    const [, failedInCase] = await verifications.listAndCountVerificationAttempts(
      { case_id: input.case_id, outcome: 'failed' },
      { take: 0 }
    )
    const [, failedForEmail] = await verifications.listAndCountVerificationAttempts(
      {
        email_hash: input.email_hash,
        outcome: 'failed',
        created_at: { $gte: new Date(Date.now() - EMAIL_WINDOW_MS) },
      },
      { take: 0 }
    )
    if (failedInCase >= MAX_FAILED_ATTEMPTS || failedForEmail >= MAX_FAILED_ATTEMPTS) {
      return new StepResponse<ProofEvaluation>({ outcome: 'locked', order_id: null })
    }

    const order = await findOrder(container, input.order_number)
    const matches =
      !!order &&
      normalizeEmail(order.email ?? '') === normalizeEmail(input.email) &&
      normalizePostcode(order.postal_code ?? '') === normalizePostcode(input.postcode)

    return new StepResponse<ProofEvaluation>(
      matches ? { outcome: 'granted', order_id: order.id } : { outcome: 'failed', order_id: null }
    )
  }
)

/** The order whose number is exactly `orderNumber`, so "01042" never finds 1042. */
async function findOrder(container: MedusaContainer, orderNumber: string) {
  // display_id is a Postgres integer, so anything else can't be an order number.
  if (!/^[1-9]\d{0,9}$/.test(orderNumber) || Number(orderNumber) > MAX_DISPLAY_ID) return null
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: ['id', 'display_id', 'email', 'shipping_address.postal_code'],
    filters: { display_id: orderNumber },
  })
  const order = data.find((o) => String(o.display_id) === orderNumber)
  if (!order) return null
  return { id: order.id, email: order.email, postal_code: order.shipping_address?.postal_code }
}
