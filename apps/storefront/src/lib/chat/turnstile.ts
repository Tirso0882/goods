// Cloudflare Turnstile, checked on the server. The chat route checks a token
// once per support case, on its first message.
//
// Its test runs with `node --test` and is left out of tsc, whose Node types
// predate node:test. No imports, so `node --test` runs it without Next.

export const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/**
 * Cloudflare's published test keys, for Compose, CI and `pnpm dev`. The site
 * key always shows a passing check and hands out the dummy token, and the
 * secret key passes any token that is sent, so a missing token is the only
 * Turnstile refusal they produce. No real key belongs in the repo.
 */
export const TURNSTILE_TEST_KEYS = {
  siteKey: "1x00000000000000000000AA",
  secretKey: "1x0000000000000000000000000000000AA",
  dummyToken: "XXXX.DUMMY.TOKEN.XXXX",
} as const

// Cloudflare's own limit on a token's length.
const MAX_TOKEN_LENGTH = 2048
const SITEVERIFY_TIMEOUT_MS = 5000

/** `unavailable`: the token couldn't be checked, so it doesn't pass either. */
export type TurnstileOutcome = "passed" | "failed" | "unavailable"

export async function verifyTurnstileToken(
  token: string,
  {
    secret,
    remoteIp,
    fetchImpl = fetch,
  }: { secret: string; remoteIp: string | null; fetchImpl?: typeof fetch }
): Promise<TurnstileOutcome> {
  if (!secret) return "unavailable"
  if (!token || token.length > MAX_TOKEN_LENGTH) return "failed"
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    })
    if (!response.ok) return "unavailable"
    const body: unknown = await response.json()
    if (!body || typeof body !== "object" || !("success" in body)) {
      return "unavailable"
    }
    return body.success === true ? "passed" : "failed"
  } catch {
    return "unavailable"
  }
}
