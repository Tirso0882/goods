// The client's IP for the chat's rate limit.
//
// The route trusts one header, X-Forwarded-For, and only its right end. The
// storefront's server appends the address its own socket saw to every request
// (client-ip.cjs, preloaded by the Dockerfile's command), so the last entry is
// one the client can't pick. Each proxy of ours in front of the server appends
// the address it saw in the same way: with CHAT_TRUSTED_PROXIES set to how many
// there are, the client is the entry that many places from the right.
// Anything further left was written by the client and is ignored.
//
// Its test runs with `node --test` and is left out of tsc, whose Node types
// predate node:test. No imports, so `node --test` runs it without Next.

export const CLIENT_IP_HEADER = "x-forwarded-for"

/** The client's IP in an X-Forwarded-For value, or null if it has none. */
export function clientIp(
  forwardedFor: string | null,
  trustedProxies: number
): string | null {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean)
  const index = hops.length - 1 - trustedProxies
  return index >= 0 ? hops[index] : null
}

/** CHAT_TRUSTED_PROXIES: how many proxies of ours stand in front, 0 unless set. */
export function readTrustedProxies(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 0
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(
      `CHAT_TRUSTED_PROXIES must be a whole number, not "${value}"`
    )
  }
  return Number(value.trim())
}
