#!/usr/bin/env bash
# Checks from the outside that the deployed store works: what Railway's health
# checks can't see, such as a page or the Store API erroring in a release that
# deployed fine. CI runs it after every release and after an automatic
# rollback (docs/runbooks/deploy-and-rollback.md#smoke-test).
#
#   scripts/smoke-test.sh <storefront url>
#
# The server's URL and the publishable key come from the storefront's
# /api/store-config, so the Store API is called the way shoppers' browsers
# call it. Every check runs, so the log shows all that's broken; any failure
# fails the script.
set -euo pipefail

STOREFRONT=${1:-}
[[ $STOREFRONT =~ ^https?:// ]] || { echo "usage: $0 <storefront url>" >&2; exit 2; }
STOREFRONT=${STOREFRONT%/}
# Renders its products on the server; /store fetches them in the browser.
PRODUCT_PAGE=/pl/categories/rings
# A fresh deployment may need a few seconds to warm up, not minutes.
ATTEMPTS=${SMOKE_ATTEMPTS:-5}
DELAY_SECONDS=${SMOKE_DELAY_SECONDS:-3}

get() { curl -fsS --max-time 10 "$@"; }

# check <name> <command...>: retries the command, then reports it. Leaves the
# command's output in OUTPUT.
check() {
  local name=$1 i
  shift
  for ((i = 1; i <= ATTEMPTS; i++)); do
    if OUTPUT=$("$@" 2>&1); then
      echo "ok   $name"
      return 0
    fi
    if ((i < ATTEMPTS)); then sleep "$DELAY_SECONDS"; fi
  done
  echo "::error::Smoke test: $name failed $ATTEMPTS times. Last: $OUTPUT"
  return 1
}

# The checks below run inside check, where set -e is off, so each returns on a
# failed request itself.
store_config() {
  local config
  config=$(get "$STOREFRONT/api/store-config") || return
  jq -e '.backendUrl and .publishableKey' <<<"$config" >/dev/null \
    || { echo "backendUrl or publishableKey missing: $config"; return 1; }
  echo "$config"
}

page_lists_products() {
  local html
  html=$(get "$STOREFRONT$PRODUCT_PAGE") || return
  grep -q 'href="/pl/products/' <<<"$html" || { echo "no product links on $PRODUCT_PAGE"; return 1; }
}

store_api_lists_products() {
  local body
  body=$(get "$SERVER/store/products?limit=1&fields=id" -H "x-publishable-api-key: $PUBLISHABLE_KEY") || return
  jq -e '.products | length > 0' <<<"$body" >/dev/null || { echo "no products: $body"; return 1; }
}

echo "Smoke test of $STOREFRONT"
# The other server checks need what it returns.
check "storefront /api/store-config" store_config || exit 1
SERVER=$(jq -r '.backendUrl | rtrimstr("/")' <<<"$OUTPUT")
PUBLISHABLE_KEY=$(jq -r .publishableKey <<<"$OUTPUT")

failed=0
check "server $SERVER/ready" get -o /dev/null "$SERVER/ready" || failed=1
check "storefront /api/health" get -o /dev/null "$STOREFRONT/api/health" || failed=1
check "storefront $PRODUCT_PAGE lists products" page_lists_products || failed=1
check "Store API /store/products with the publishable key" store_api_lists_products || failed=1

if ((failed)); then exit 1; fi
echo "The store works"
