import {
  getBackendUrl,
  getPublishableKey,
  isServer,
  type StoreConfig,
} from "@lib/util/backend-env"
import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput } from "@medusajs/js-sdk"

const debug = process.env.NODE_ENV === "development"

// In the browser these stay unset: requests go through a client built from
// /api/store-config, so the bundle holds no environment-specific values.
export const sdk = new Medusa({
  baseUrl: isServer ? getBackendUrl() : "/",
  debug,
  publishableKey: isServer ? getPublishableKey() : undefined,
})

let browserClient: Promise<Medusa["client"]> | undefined

const getBrowserClient = () => {
  if (!browserClient) {
    browserClient = fetch("/api/store-config", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`/api/store-config returned ${res.status}`)
        }
        return res.json() as Promise<StoreConfig>
      })
      .then(({ backendUrl, publishableKey }) => {
        if (!publishableKey) {
          throw new Error("The storefront server has no publishable key")
        }
        return new Medusa({ baseUrl: backendUrl, debug, publishableKey }).client
      })
    browserClient.catch(() => {
      browserClient = undefined
    })
  }
  return browserClient
}

const originalFetch = sdk.client.fetch.bind(sdk.client)

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
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
  if (isServer) {
    return originalFetch(input, init)
  }
  const client = await getBrowserClient()
  return client.fetch<T>(input, init)
}
