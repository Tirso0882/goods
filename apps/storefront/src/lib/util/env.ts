// PUBLIC_BASE_URL is read at runtime by the production image. NEXT_PUBLIC_BASE_URL
// is the `pnpm dev` value, inlined at build.
export const getBaseURL = () => {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://localhost:8000"
  )
}

// Read at runtime, so the same image hides the test store and opens the real
// one. Anything but "true" keeps crawlers out: forgetting the variable must not
// leak synthetic products into search and AI answers (ADR 0007).
export const isIndexingAllowed = () => process.env.ALLOW_INDEXING === "true"
