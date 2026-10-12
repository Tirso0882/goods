// PUBLIC_BASE_URL is read at runtime by the production image. NEXT_PUBLIC_BASE_URL
// is the `pnpm dev` value, inlined at build.
export const getBaseURL = () => {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://localhost:8000"
  )
}
