import { getBackendUrl, getPublishableKey } from "@lib/util/backend-env"
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
    const res = await fetch(`${getBackendUrl()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    })
    if (!res.ok) {
      return unavailable(`backend /health returned ${res.status}`)
    }
  } catch (error) {
    return unavailable(
      `backend unreachable: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    )
  }

  return new NextResponse("OK", {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
  })
}
