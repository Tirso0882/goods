export const isServer = typeof window === "undefined"

// Server only, read at runtime, so one image fits any environment. The
// NEXT_PUBLIC_* names are inlined at build: they are the `pnpm dev` values from
// .env.local, and the production image is built without them.

export const getBackendUrl = () =>
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

export const getPublishableKey = () =>
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  undefined

export type StoreConfig = {
  backendUrl: string
  publishableKey: string | null
  stripeKey: string | null
  stripeAccount: string | null
}

// Public values the browser needs. Served by /api/store-config.
export const getStoreConfig = (): StoreConfig => ({
  backendUrl:
    process.env.PUBLIC_MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000",
  publishableKey: getPublishableKey() ?? null,
  stripeKey:
    process.env.PUBLIC_STRIPE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY ||
    null,
  stripeAccount: process.env.NEXT_PUBLIC_MEDUSA_PAYMENTS_ACCOUNT_ID || null,
})
