/**
 * How long the storefront trusts its copy of the region list. Regions change
 * when the store is seeded or edited in Admin, and a page for a country the
 * copy doesn't know is a 404, so the copy must not outlive a seed for long.
 */
export const REGIONS_REVALIDATE_SECONDS = 60
