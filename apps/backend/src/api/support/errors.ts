import type { MedusaResponse } from '@medusajs/framework/http'

/** The commerce port's error codes (contracts/commerce-port.openapi.yaml, `Error`). */
export type PortErrorCode =
  'invalid_request' | 'unauthorized' | 'verification_failed' | 'verification_locked'

/** The port's errors are `{ code, message }`, not Medusa's `{ type, message }`. */
export function sendPortError(
  res: MedusaResponse,
  status: number,
  code: PortErrorCode,
  message: string
) {
  res.status(status).json({ code, message })
}
