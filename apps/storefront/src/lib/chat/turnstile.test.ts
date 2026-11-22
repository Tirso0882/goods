import assert from "node:assert/strict"
import { test } from "node:test"

import {
  SITEVERIFY_URL,
  TURNSTILE_TEST_KEYS,
  verifyTurnstileToken,
} from "./turnstile.ts"

type Call = { url: string; body: unknown }

function fakeSiteverify(answer: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return answer()
  }
  return { calls, fetchImpl: fetchImpl as typeof fetch }
}

const secret = TURNSTILE_TEST_KEYS.secretKey

test("a token Cloudflare accepts passes, checked with the secret and the client's IP", async () => {
  const cloudflare = fakeSiteverify(() => Response.json({ success: true }))

  const outcome = await verifyTurnstileToken("token-1", {
    secret,
    remoteIp: "203.0.113.7",
    fetchImpl: cloudflare.fetchImpl,
  })

  assert.equal(outcome, "passed")
  assert.deepEqual(cloudflare.calls, [
    {
      url: SITEVERIFY_URL,
      body: { secret, response: "token-1", remoteip: "203.0.113.7" },
    },
  ])
})

test("a token Cloudflare rejects fails", async () => {
  const cloudflare = fakeSiteverify(() =>
    Response.json({ success: false, "error-codes": ["invalid-input-response"] })
  )

  const outcome = await verifyTurnstileToken("token-1", {
    secret,
    remoteIp: null,
    fetchImpl: cloudflare.fetchImpl,
  })

  assert.equal(outcome, "failed")
})

test("an empty or oversized token fails without asking Cloudflare", async () => {
  const cloudflare = fakeSiteverify(() => Response.json({ success: true }))

  for (const token of ["", "x".repeat(2049)]) {
    const outcome = await verifyTurnstileToken(token, {
      secret,
      remoteIp: null,
      fetchImpl: cloudflare.fetchImpl,
    })
    assert.equal(outcome, "failed")
  }
  assert.equal(cloudflare.calls.length, 0)
})

test("when Cloudflare can't be asked, the check is unavailable, never passed", async () => {
  for (const answer of [
    () => new Response("upstream error", { status: 500 }),
    () => new Response("not json"),
    () => Promise.reject(new TypeError("fetch failed")),
  ]) {
    const cloudflare = fakeSiteverify(answer)
    const outcome = await verifyTurnstileToken("token-1", {
      secret,
      remoteIp: null,
      fetchImpl: cloudflare.fetchImpl,
    })
    assert.equal(outcome, "unavailable")
  }
})

test("without a secret, no token passes", async () => {
  const cloudflare = fakeSiteverify(() => Response.json({ success: true }))

  const outcome = await verifyTurnstileToken("token-1", {
    secret: "",
    remoteIp: null,
    fetchImpl: cloudflare.fetchImpl,
  })

  assert.equal(outcome, "unavailable")
  assert.equal(cloudflare.calls.length, 0)
})
