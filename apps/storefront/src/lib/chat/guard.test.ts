import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, test } from "node:test"

import { ChatGuard, DEFAULT_CHAT_LIMITS, readChatLimits } from "./guard.ts"
import { RedisRateLimiter } from "./rate-limit.ts"
import type { TurnstileOutcome } from "./turnstile.ts"

// The Redis CI and the sandbox run. Each run counts under its own prefix.
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"
const limiter = new RedisRateLimiter(redisUrl, `test:${randomUUID()}:`)
after(() => limiter.close())

// Each test is its own client.
const anIp = () => `203.0.113.${Math.floor(Math.random() * 1e6)}`

function guardWith(outcome: TurnstileOutcome = "passed") {
  const checked: { token: string; ip: string | null }[] = []
  const guard = new ChatGuard({
    limiter,
    limits: DEFAULT_CHAT_LIMITS,
    verifyTurnstile: async (token, ip) => {
      checked.push({ token, ip })
      return outcome
    },
  })
  return { guard, checked }
}

test("the limits start at 20 messages per 5 minutes and 5 new cases per hour", () => {
  assert.deepEqual(DEFAULT_CHAT_LIMITS, {
    messages: { limit: 20, windowSeconds: 300 },
    newCases: { limit: 5, windowSeconds: 3600 },
  })
  assert.deepEqual(readChatLimits({}), DEFAULT_CHAT_LIMITS)
})

test("the limits are settings", () => {
  assert.deepEqual(
    readChatLimits({
      CHAT_MESSAGE_LIMIT: "40",
      CHAT_MESSAGE_WINDOW_SECONDS: "60",
      CHAT_NEW_CASE_LIMIT: "2",
      CHAT_NEW_CASE_WINDOW_SECONDS: "600",
    }),
    {
      messages: { limit: 40, windowSeconds: 60 },
      newCases: { limit: 2, windowSeconds: 600 },
    }
  )
  assert.throws(() => readChatLimits({ CHAT_MESSAGE_LIMIT: "0" }))
  assert.throws(() => readChatLimits({ CHAT_NEW_CASE_WINDOW_SECONDS: "soon" }))
})

test("the 21st message from one IP within 5 minutes is refused", async () => {
  const { guard } = guardWith()
  const ip = anIp()

  for (let i = 1; i <= 20; i++) {
    assert.equal(await guard.admitMessage(ip), null, `message ${i}`)
  }
  assert.equal(await guard.admitMessage(ip), "rate_limited")
  // Another IP is still let through.
  assert.equal(await guard.admitMessage(anIp()), null)
})

test("the 6th new case from one IP within an hour is refused", async () => {
  const { guard } = guardWith()
  const ip = anIp()

  for (let i = 1; i <= 5; i++) {
    assert.equal(await guard.admitNewCase(ip, "token"), null, `case ${i}`)
  }
  assert.equal(await guard.admitNewCase(ip, "token"), "rate_limited")
})

test("a new case without a token is refused without asking Cloudflare", async () => {
  const { guard, checked } = guardWith()

  assert.equal(
    await guard.admitNewCase(anIp(), undefined),
    "turnstile_required"
  )
  assert.equal(await guard.admitNewCase(anIp(), ""), "turnstile_required")
  assert.deepEqual(checked, [])
})

test("a new case with a failing token is refused", async () => {
  const { guard, checked } = guardWith("failed")
  const ip = anIp()

  assert.equal(await guard.admitNewCase(ip, "bad-token"), "turnstile_failed")
  assert.deepEqual(checked, [{ token: "bad-token", ip }])
})

test("a token that couldn't be checked doesn't open a case", async () => {
  const { guard } = guardWith("unavailable")

  assert.equal(await guard.admitNewCase(anIp(), "token"), "chat_unavailable")
})

test("a refused token doesn't use up the IP's new cases", async () => {
  const ip = anIp()
  const failing = guardWith("failed").guard
  for (let i = 0; i < 10; i++) {
    assert.equal(
      await failing.admitNewCase(ip, "bad-token"),
      "turnstile_failed"
    )
  }

  assert.equal(await guardWith("passed").guard.admitNewCase(ip, "token"), null)
})

test("when the limit can't be checked, the message is refused", async () => {
  const guard = new ChatGuard({
    limiter: {
      take: () => Promise.reject(new Error("Redis is down")),
    },
    limits: DEFAULT_CHAT_LIMITS,
    verifyTurnstile: async () => "passed",
  })

  assert.equal(await guard.admitMessage(anIp()), "chat_unavailable")
  assert.equal(await guard.admitNewCase(anIp(), "token"), "chat_unavailable")
})
