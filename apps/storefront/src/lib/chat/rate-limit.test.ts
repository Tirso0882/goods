import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"

import { RedisRateLimiter } from "./rate-limit.ts"

// The Redis CI and the sandbox run. Each run counts under its own prefix.
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"
const limiter = new RedisRateLimiter(redisUrl, `test:${randomUUID()}:`)
after(() => limiter.close())

const MINUTE = 60_000

test("a key is let through up to its limit within the window, then refused", async () => {
  const start = Date.now()
  for (let i = 0; i < 3; i++) {
    assert.equal(await limiter.take("ip-a", 3, 5 * MINUTE, start + i), true)
  }
  assert.equal(await limiter.take("ip-a", 3, 5 * MINUTE, start + 3), false)
  // Another key has its own count.
  assert.equal(await limiter.take("ip-b", 3, 5 * MINUTE, start + 3), true)
})

test("the window slides: a use counts until the window has passed since it", async () => {
  const start = Date.now()
  assert.equal(await limiter.take("ip-c", 2, 5 * MINUTE, start), true)
  assert.equal(
    await limiter.take("ip-c", 2, 5 * MINUTE, start + 4 * MINUTE),
    true
  )
  assert.equal(
    await limiter.take("ip-c", 2, 5 * MINUTE, start + 5 * MINUTE - 1),
    false
  )
  // The first use has left the window; the second still counts.
  assert.equal(
    await limiter.take("ip-c", 2, 5 * MINUTE, start + 5 * MINUTE),
    true
  )
  assert.equal(
    await limiter.take("ip-c", 2, 5 * MINUTE, start + 6 * MINUTE),
    false
  )
})

test("a refused use doesn't count against the next window", async () => {
  const start = Date.now()
  assert.equal(await limiter.take("ip-d", 1, MINUTE, start), true)
  for (let i = 1; i < 10; i++) {
    assert.equal(await limiter.take("ip-d", 1, MINUTE, start + i), false)
  }
  assert.equal(await limiter.take("ip-d", 1, MINUTE, start + MINUTE), true)
})
