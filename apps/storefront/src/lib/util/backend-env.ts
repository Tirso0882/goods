const isServer = typeof window === "undefined"

// NEXT_PUBLIC_* values are inlined at build. Server code prefers the
// server-only variables, read at runtime, so one image fits any environment
// and can reach the backend by its internal hostname.

export const getBackendUrl = () =>
  (isServer && process.env.MEDUSA_BACKEND_URL) ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

export const getPublishableKey = () =>
  (isServer && process.env.MEDUSA_PUBLISHABLE_KEY) ||
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  undefined
