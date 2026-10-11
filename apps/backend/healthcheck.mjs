// Container health check for both roles. The server answers GET /ready, which
// asks Postgres through Medusa. A worker loads no API routes, so it checks that
// Medusa booted (/health) and runs the same `select 1` itself.
import pg from 'pg'

// Above the 3 s that /ready waits for Postgres, below the HEALTHCHECK timeout.
const TIMEOUT_MS = 4000
const baseUrl = `http://127.0.0.1:${process.env.PORT || 9000}`

const expectOk = async (path) => {
  const res = await fetch(baseUrl + path, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const body = await res.text()
  if (!res.ok || body !== 'OK') {
    throw new Error(`${path} returned ${res.status}: ${body}`)
  }
}

const selectOne = async () => {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: TIMEOUT_MS,
    query_timeout: TIMEOUT_MS,
  })
  try {
    await client.connect()
    await client.query('select 1')
  } finally {
    await client.end().catch(() => {})
  }
}

try {
  if (process.env.MEDUSA_WORKER_MODE === 'worker') {
    await expectOk('/health')
    await selectOne()
  } else {
    await expectOk('/ready')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
