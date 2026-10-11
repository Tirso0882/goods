import { getPublishableKey } from "@lib/util/backend-env"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// The publishable key is public by design. Serving it here lets the browser
// use the key the container was started with instead of one baked into the build.
export function GET() {
  return NextResponse.json(
    { publishableKey: getPublishableKey() ?? null },
    { headers: { "Cache-Control": "no-store" } }
  )
}
