// The support case's ID in a signed cookie (ADR 0020). The ID is a bearer
// secret: the cookie is httpOnly, and a value whose signature does not match
// is treated as no case at all.
//
// Its test runs with `node --test` and is left out of tsc, whose Node types
// predate node:test.
//
// No imports beyond node:crypto, so `node --test` runs it without Next.

import { createHmac, timingSafeEqual } from "node:crypto"

export const CASE_COOKIE = "goods_support_case"

// Long enough for an HMAC-SHA256 key that can't be guessed.
export const MIN_COOKIE_SECRET_LENGTH = 32

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const signature = (caseId: string, secret: string) =>
  createHmac("sha256", secret).update(caseId).digest("base64url")

const bytes = (text: string) => new TextEncoder().encode(text)

/** The cookie value for a case: `<case ID>.<signature>`. */
export function signCaseCookie(caseId: string, secret: string): string {
  return `${caseId}.${signature(caseId, secret)}`
}

/** The case ID in a cookie value, or null unless it was signed with this secret. */
export function readCaseCookie(
  value: string | undefined,
  secret: string
): string | null {
  if (!value) return null
  const dot = value.lastIndexOf(".")
  if (dot <= 0) return null
  const caseId = value.slice(0, dot)
  const given = bytes(value.slice(dot + 1))
  const expected = bytes(signature(caseId, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null
  }
  return UUID.test(caseId) ? caseId : null
}
