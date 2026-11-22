import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer, type Server } from "node:http"
import { createRequire } from "node:module"
import { test } from "node:test"

import { clientIp, readTrustedProxies } from "./client-ip.ts"

// The preload the storefront's server starts with (see the Dockerfile).
createRequire(import.meta.url)("../../../client-ip.cjs")

test("without a proxy, the client is the address the server saw", () => {
  assert.equal(clientIp("203.0.113.7", 0), "203.0.113.7")
  assert.equal(clientIp("198.51.100.1, 203.0.113.7", 0), "203.0.113.7")
})

test("behind trusted proxies, the client is the address the outermost one saw", () => {
  assert.equal(
    clientIp("198.51.100.1, 203.0.113.7, 10.0.0.2", 1),
    "203.0.113.7"
  )
  assert.equal(clientIp("203.0.113.7, 10.0.0.2", 1), "203.0.113.7")
})

test("no usable address is no client IP", () => {
  assert.equal(clientIp(null, 0), null)
  assert.equal(clientIp(" , ", 0), null)
  assert.equal(clientIp("10.0.0.2", 1), null)
})

test("the number of trusted proxies is a whole number, 0 unless set", () => {
  assert.equal(readTrustedProxies(undefined), 0)
  assert.equal(readTrustedProxies(""), 0)
  assert.equal(readTrustedProxies("2"), 2)
  assert.throws(() => readTrustedProxies("-1"))
  assert.throws(() => readTrustedProxies("one"))
})

async function forwardedForSeenBy(headers: Record<string, string>) {
  let seen: string | undefined
  const server: Server = createServer((request, response) => {
    seen = request.headers["x-forwarded-for"] as string | undefined
    response.end()
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert.ok(address && typeof address === "object")
  try {
    await fetch(`http://127.0.0.1:${address.port}/api/chat`, { headers })
  } finally {
    server.close()
  }
  return seen ?? null
}

test("a client can't pick its own IP: the server adds the address it saw", async () => {
  const forged = await forwardedForSeenBy({ "x-forwarded-for": "198.51.100.1" })
  assert.equal(forged, "198.51.100.1, 127.0.0.1")
  assert.equal(clientIp(forged, 0), "127.0.0.1")

  const plain = await forwardedForSeenBy({})
  assert.equal(clientIp(plain, 0), "127.0.0.1")
})
