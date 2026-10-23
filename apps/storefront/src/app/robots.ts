import { isIndexingAllowed } from "@lib/util/env"
import { MetadataRoute } from "next"

// Otherwise Next.js renders this file once at build and every deployment of the
// image serves the same answer.
export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  if (!isIndexingAllowed()) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

  return { rules: { userAgent: "*", allow: "/" } }
}
