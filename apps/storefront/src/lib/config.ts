import { getBackendUrl, getPublishableKey } from "@lib/util/backend-env"
import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput } from "@medusajs/js-sdk"

const isServer = typeof window === "undefined"

const PUBLISHABLE_KEY = getPublishableKey()

export const sdk = new Medusa({
  baseUrl: getBackendUrl(),
  debug: process.env.NODE_ENV === "development",
  publishableKey: PUBLISHABLE_KEY,
})

let browserPublishableKey: Promise<string | undefined> | undefined

// A browser bundle built without a key asks the storefront server for it once.
const getBrowserPublishableKey = () => {
  browserPublishableKey ??= fetch("/api/store-config", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : {}))
    .then((config: { publishableKey?: string }) => {
      if (!config.publishableKey) {
        browserPublishableKey = undefined
      }
      return config.publishableKey
    })
    .catch(() => {
      browserPublishableKey = undefined
      return undefined
    })
  return browserPublishableKey
}

const originalFetch = sdk.client.fetch.bind(sdk.client)

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
  if (!isServer && !PUBLISHABLE_KEY) {
    const publishableKey = await getBrowserPublishableKey()
    if (publishableKey) {
      headers["x-publishable-api-key"] ??= publishableKey
    }
  }
  let localeHeader: Record<string, string | null> | undefined
  try {
    localeHeader = await getLocaleHeader()
    headers["x-medusa-locale"] ??= localeHeader["x-medusa-locale"]
  } catch {}

  const newHeaders = {
    ...localeHeader,
    ...headers,
  }
  init = {
    ...init,
    headers: newHeaders,
  }
  return originalFetch(input, init)
}
