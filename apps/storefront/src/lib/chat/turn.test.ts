import assert from "node:assert/strict"
import { test } from "node:test"

import { describeTurnError, readTurnRequest } from "./turn.ts"

const REFERENCE = "6d1f3c2a-7b4e-4f5a-9c8d-0e1f2a3b4c5d"

test("a turn request is a message, and not a retry unless it says so", () => {
  assert.deepEqual(readTurnRequest({ message: "Where is my order?" }), {
    message: "Where is my order?",
    retry: false,
    turnstileToken: undefined,
  })
  assert.deepEqual(readTurnRequest({ message: "Order 1001", retry: true }), {
    message: "Order 1001",
    retry: true,
    turnstileToken: undefined,
  })
  assert.deepEqual(readTurnRequest({ message: "Order 1001", retry: "yes" }), {
    message: "Order 1001",
    retry: false,
    turnstileToken: undefined,
  })
})

test("a turn request carries the Turnstile token when it is a string", () => {
  assert.equal(
    readTurnRequest({ message: "Hi", turnstile_token: "token-1" })
      ?.turnstileToken,
    "token-1"
  )
  for (const token of [42, null, ""]) {
    assert.equal(
      readTurnRequest({ message: "Hi", turnstile_token: token })
        ?.turnstileToken,
      undefined
    )
  }
})

test("a turn request without a usable message is refused", () => {
  for (const body of [
    null,
    "Hi",
    {},
    { message: 42 },
    { message: "   " },
    { message: "x".repeat(4001) },
  ]) {
    assert.equal(readTurnRequest(body), null, JSON.stringify(body))
  }
})

test("a failed reply apologizes, offers a person, quotes the reference and offers a retry", () => {
  const shown = describeTurnError("chat_unavailable", REFERENCE)

  assert.match(shown.text, /sorry/i)
  assert.match(shown.text, /person/i)
  assert.equal(shown.reference, REFERENCE)
  assert.equal(shown.canRetry, true)
})

test("a chat that couldn't be reached still apologizes and offers a retry", () => {
  const shown = describeTurnError(undefined, undefined)

  assert.match(shown.text, /sorry/i)
  assert.match(shown.text, /person/i)
  assert.equal(shown.reference, undefined)
  assert.equal(shown.canRetry, true)
})

test("a message sent while the agent is answering is not an error to retry", () => {
  const shown = describeTurnError("still_answering", REFERENCE)

  assert.match(shown.text, /still answering/i)
  assert.equal(shown.canRetry, false)
})

test("a Turnstile refusal asks for the check, then a retry of the same message", () => {
  for (const error of ["turnstile_required", "turnstile_failed"]) {
    const shown = describeTurnError(error, REFERENCE)

    assert.match(shown.text, /check/i)
    assert.doesNotMatch(shown.text, /sorry, something went wrong/i)
    assert.equal(shown.needsCheck, true)
    assert.equal(shown.canRetry, true)
  }
})

test("a rate limit refusal asks the shopper to wait, then retry", () => {
  const shown = describeTurnError("rate_limited", REFERENCE)

  assert.match(shown.text, /wait a few minutes/i)
  assert.equal(shown.needsCheck, undefined)
  assert.equal(shown.canRetry, true)
})
