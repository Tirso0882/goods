import assert from "node:assert/strict"
import { test } from "node:test"

import { readCaseCookie, signCaseCookie } from "./case-cookie.ts"

const SECRET = "chat-cookie-secret-0123456789abcdef"
const CASE_ID = "3f0c5b1e-8a2d-4c6e-9b7a-1d2e3f4a5b6c"

test("a signed cookie reads back as its case ID", () => {
  assert.equal(readCaseCookie(signCaseCookie(CASE_ID, SECRET), SECRET), CASE_ID)
})

test("a cookie with a bad signature is not a case", () => {
  const [, signature] = signCaseCookie(CASE_ID, SECRET).split(".")
  const otherCase = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"

  assert.equal(readCaseCookie(`${otherCase}.${signature}`, SECRET), null)
  assert.equal(readCaseCookie(`${CASE_ID}.${"A".repeat(43)}`, SECRET), null)
  assert.equal(readCaseCookie(`${CASE_ID}.`, SECRET), null)
  assert.equal(readCaseCookie(CASE_ID, SECRET), null)
})

test("a cookie signed with another secret is not a case", () => {
  const forged = signCaseCookie(CASE_ID, "another-secret-0123456789abcdefgh")

  assert.equal(readCaseCookie(forged, SECRET), null)
})

test("a signed value that is not a case ID is not a case", () => {
  assert.equal(readCaseCookie(signCaseCookie("../admin", SECRET), SECRET), null)
})

test("no cookie is no case", () => {
  assert.equal(readCaseCookie(undefined, SECRET), null)
})
