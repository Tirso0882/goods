import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { GET } from '../route'

const call = async (raw: () => Promise<unknown>) => {
  const res = { statusCode: 0, body: undefined as unknown }
  const response = {
    status(code: number) {
      res.statusCode = code
      return response
    },
    json(body: unknown) {
      res.body = body
    },
    send(body: unknown) {
      res.body = body
    },
  }
  const req = { scope: { resolve: () => ({ raw }) } }
  await GET(req as unknown as MedusaRequest, response as unknown as MedusaResponse)
  return res
}

describe('GET /ready', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns OK when Postgres answers', async () => {
    expect(await call(() => Promise.resolve({ rows: [{ '?column?': 1 }] }))).toEqual({
      statusCode: 200,
      body: 'OK',
    })
  })

  it('returns 503 when the query fails', async () => {
    expect(await call(() => Promise.reject(new Error('connect ECONNREFUSED')))).toEqual({
      statusCode: 503,
      body: { status: 'unavailable', reason: 'postgres: connect ECONNREFUSED' },
    })
  })

  it('returns 503 when Postgres does not answer in time', async () => {
    jest.useFakeTimers()
    const pending = call(() => new Promise(() => {}))
    await jest.advanceTimersByTimeAsync(3000)
    expect(await pending).toEqual({
      statusCode: 503,
      body: { status: 'unavailable', reason: 'postgres: no answer within 3000 ms' },
    })
  })
})
