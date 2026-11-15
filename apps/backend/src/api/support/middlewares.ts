import { createHash, timingSafeEqual } from 'crypto'
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from '@medusajs/framework/http'
import { z } from '@medusajs/framework/zod'
import { sendPortError } from './errors'

/** Shorter than this and the route refuses every call, so a placeholder can't open it. */
const MIN_SECRET_LENGTH = 32

const digest = (value: string) => new Uint8Array(createHash('sha256').update(value).digest())

/**
 * The commerce port's routes take only the agent's own secret, as a bearer
 * token. It is not an admin key and opens nothing else.
 */
export function requireAgentSecret(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const secret = process.env.AGENT_SUPPORT_SECRET ?? ''
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  // Comparing digests keeps the comparison constant-time whatever the lengths.
  const valid =
    secret.length >= MIN_SECRET_LENGTH &&
    !!match &&
    timingSafeEqual(digest(match[1]), digest(secret))
  if (!valid) {
    sendPortError(res, 401, 'unauthorized', 'Missing or wrong agent secret.')
    return
  }
  next()
}

/** Parses the body with `schema`, answering a mismatch with the port's `invalid_request`. */
function validatePortBody(schema: z.ZodType) {
  return (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ')
      sendPortError(res, 400, 'invalid_request', message)
      return
    }
    req.validatedBody = result.data
    next()
  }
}

export const VerifyShopperBody = z.strictObject({
  case_id: z.uuid(),
  proof: z.strictObject({
    method: z.literal('guest_order'),
    email: z.string().min(1).max(320),
    order_number: z.string().min(1).max(32),
    postcode: z.string().min(1).max(32),
  }),
})
export type VerifyShopperBody = z.infer<typeof VerifyShopperBody>

export const supportMiddlewares: MiddlewareRoute[] = [
  {
    matcher: '/support/*',
    middlewares: [requireAgentSecret],
  },
  {
    matcher: '/support/verifications',
    method: ['POST'],
    middlewares: [validatePortBody(VerifyShopperBody)],
  },
]
