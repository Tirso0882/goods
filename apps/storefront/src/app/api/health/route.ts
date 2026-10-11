import { sdk } from "@lib/config"
import { getPublishableKey } from "@lib/util/backend-env"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_TIMEOUT_MS = 3000

// Ready means a page can render: the key is configured and the backend answers.
// The middleware serves 503 for every page when the backend is unreachable.
export async function GET() {
  const unavailable = (reason: string) =>
    NextResponse.json(
      { status: "unavailable", reason },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )

  if (!getPublishableKey()) {
    return unavailable("MEDUSA_PUBLISHABLE_KEY is not set")
  }

  try {
    // Not JSON: the SDK returns the raw response, and throws on non-2xx.
    await sdk.client.fetch<Response>("/health", {
      headers: { accept: "text/plain" },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    })
  } catch (error) {
    return unavailable(
      `backend /health failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    )
  }

  return new NextResponse("OK", {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
  })
}
