import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isApiTrouble, isAuthFailure } from "./failures.mts"

describe("isApiTrouble", () => {
  for (const message of [
    "API Error: 529 Overloaded",
    "Error: rate limit exceeded",
    "You've hit your limit · resets 5pm",
    "Claude usage limit reached",
    "request failed: 503 Service Unavailable",
    "read ECONNRESET",
    "getaddrinfo EAI_AGAIN api.anthropic.com",
    "socket hang up",
  ]) {
    it(`counts "${message}"`, () => {
      assert.equal(isApiTrouble(new Error(message)), true)
    })
  }

  it("doesn't count a ticket's own failure", () => {
    assert.equal(isApiTrouble(new Error("Tests failed: 3 of 120")), false)
  })

  it("reads only the start of the error, not the agent output after it", () => {
    const error = new Error(`Agent exited 1.\n${"x".repeat(600)} returns 429`)
    assert.equal(isApiTrouble(error), false)
  })
})

describe("isAuthFailure", () => {
  for (const message of [
    "Failed to authenticate. API Error: 401",
    "invalid x-api-key",
    "OAuth token has expired",
  ]) {
    it(`counts "${message}"`, () => {
      assert.equal(isAuthFailure(new Error(message)), true)
    })
  }

  it("doesn't count API trouble", () => {
    assert.equal(isAuthFailure(new Error("API Error: 529 Overloaded")), false)
  })
})
