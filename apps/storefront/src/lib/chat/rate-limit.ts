// The chat's rate limit, in Redis: a sliding window per key. Each use let
// through is logged with its time, and a key is refused while it has `limit`
// uses within the last `windowMs`. A refused use is not logged, so an IP that
// keeps knocking is let in again once its window has passed.
//
// Its test runs with `node --test` against REDIS_URL and is left out of tsc,
// whose Node types predate node:test.

import { Redis } from "ioredis"

// Atomic, so two requests at once can't both take the last place.
// KEYS[1]: the key's log. ARGV: now (ms), window (ms), limit, a unique member.
const TAKE = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", tonumber(ARGV[1]) - tonumber(ARGV[2]))
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[3]) then
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return 1
`

export interface RateLimiter {
  /** Takes one use of `key`, or returns false if it is at its limit. */
  take(
    key: string,
    limit: number,
    windowMs: number,
    now?: number
  ): Promise<boolean>
}

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: Redis
  private readonly prefix: string

  constructor(url: string, prefix: string) {
    this.prefix = prefix
    this.redis = new Redis(url, {
      // Fail fast: a chat whose limit can't be checked is refused, not held.
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    })
    // Errors surface on the calls; this keeps ioredis from logging each retry
    // as unhandled.
    this.redis.on("error", () => {})
  }

  async take(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now()
  ): Promise<boolean> {
    const member = `${now}:${Math.random().toString(36).slice(2)}`
    const taken = await this.redis.eval(
      TAKE,
      1,
      `${this.prefix}${key}`,
      now,
      windowMs,
      limit,
      member
    )
    return taken === 1
  }

  async close() {
    await this.redis.quit()
  }
}
