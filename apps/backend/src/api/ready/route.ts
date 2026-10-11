import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

const POSTGRES_TIMEOUT_MS = 3000

// /health only says the process booted. Ready also needs Postgres to answer,
// and a query against a stopped database hangs instead of failing.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  let timer: NodeJS.Timeout | undefined

  try {
    await Promise.race([
      pg.raw('select 1'),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer within ${POSTGRES_TIMEOUT_MS} ms`)),
          POSTGRES_TIMEOUT_MS
        )
      }),
    ])
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      reason: `postgres: ${error instanceof Error ? error.message : 'unknown error'}`,
    })
    return
  } finally {
    clearTimeout(timer)
  }

  res.status(200).send('OK')
}
