import { getStoreConfig } from "@lib/util/backend-env"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Every value here is public by design. Serving them at runtime keeps them out
// of the browser bundle, so the same image runs in any environment.
export function GET() {
  return NextResponse.json(getStoreConfig(), {
    headers: { "Cache-Control": "no-store" },
  })
}
