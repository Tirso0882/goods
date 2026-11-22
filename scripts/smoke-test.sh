#!/usr/bin/env bash
# Checks from the outside that the deployed store works: what Railway's health
# checks can't see, such as a page or the Store API erroring in a release that
# deployed fine. CI runs it after every release and after an automatic
# rollback (docs/runbooks/deploy-and-rollback.md#smoke-test).
#
#   scripts/smoke-test.sh <storefront url>
#   scripts/smoke-test.sh --compose http://localhost:8000
#
# The server's URL and the publishable key come from the storefront's
# /api/store-config, so the Store API is called the way shoppers' browsers
# call it. Every check runs, so the log shows all that's broken; any failure
# fails the script.
#
# --compose also checks the support chat's route from outside, against the
# Compose stack (docs/runbooks/compose-stack.md#smoke-test): a message without
# a Turnstile token is refused, one message makes the round trip and is still
# there after a reload, and traffic over the rate limit is refused. Its own
# traffic would lock the next run out, so it clears the chat's rate-limit
# counters in the stack's Redis before and after. Run it from a clone of the
# repo, with `docker compose` able to reach the stack.
set -euo pipefail

COMPOSE=false
if [[ ${1:-} == --compose ]]; then
  COMPOSE=true
  shift
fi
STOREFRONT=${1:-}
[[ $STOREFRONT =~ ^https?:// ]] || { echo "usage: $0 [--compose] <storefront url>" >&2; exit 2; }
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

if $COMPOSE; then
  # The stack's message limit (CHAT_MESSAGE_LIMIT in .env), 20 unless set.
  CHAT_MESSAGE_LIMIT=${SMOKE_CHAT_MESSAGE_LIMIT:-20}
  # Cloudflare's test site key hands this token out, and the test secret the
  # stack runs on passes it.
  TURNSTILE_DUMMY_TOKEN=XXXX.DUMMY.TOKEN.XXXX
  # Cookie jars, the last response's body, and a line per message sent: the
  # checks run in subshells, so the count can't be a variable.
  JARS=$(mktemp -d)
  : >"$JARS/sent"
  sent() { wc -l <"$JARS/sent" | tr -d ' '; }

  clear_chat_limits() {
    (cd "$(dirname "$0")/.." && docker compose exec -T redis sh -c \
      "redis-cli --scan --pattern 'goods:chat:rate:*' | xargs -r redis-cli del >/dev/null")
  }

  # chat_post <jar> <json body>: sends one message, prints the status and
  # leaves the body in $JARS/body.
  chat_post() {
    echo >>"$JARS/sent"
    curl -sS --max-time 70 -b "$JARS/$1" -c "$JARS/$1" -H 'content-type: application/json' \
      -d "$2" -o "$JARS/body" -w '%{http_code}' "$STOREFRONT/api/chat"
  }

  # expect <status> <error or "-"> <name> <status chat_post printed>
  expect() {
    local body
    body=$(cat "$JARS/body" 2>/dev/null)
    [[ $4 == "$1" ]] || { echo "$3: got $4, wanted $1: $body"; return 1; }
    if [[ $2 != - ]]; then
      jq -e --arg error "$2" '.error == $error' <<<"$body" >/dev/null \
        || { echo "$3: wanted error $2: $body"; return 1; }
    fi
  }

  chat_refuses_without_token() {
    expect 403 turnstile_required "first message without a token" \
      "$(chat_post no-token '{"message":"Smoke test: no token"}')"
  }

  chat_round_trip() {
    local status history
    status=$(chat_post round-trip "$(jq -nc --arg token "$TURNSTILE_DUMMY_TOKEN" \
      '{message: "Smoke test: where is my order?", turnstile_token: $token}')")
    expect 200 - "first message with a token" "$status" || return
    # A later message in the same case needs no token.
    status=$(chat_post round-trip '{"message":"Smoke test: and one more"}')
    expect 200 - "later message without a token" "$status" || return
    # A reload: the history comes back from the agent through the route.
    history=$(curl -fsS --max-time 10 -b "$JARS/round-trip" "$STOREFRONT/api/chat") || return
    jq -e '[.messages[] | select(.role == "shopper") | .content]
             == ["Smoke test: where is my order?", "Smoke test: and one more"]
           and ([.messages[] | select(.role == "agent")] | length) == 2' \
      <<<"$history" >/dev/null || { echo "history after a reload: $history"; return 1; }
  }

  # Refused messages count too, so a bot without a token can't flood the route.
  chat_refuses_over_limit() {
    local status
    while (($(sent) < CHAT_MESSAGE_LIMIT)); do
      status=$(chat_post over-limit '{"message":"Smoke test: flood"}')
      expect 403 turnstile_required "message $(sent), within the limit" "$status" || return
    done
    status=$(chat_post over-limit '{"message":"Smoke test: flood"}')
    expect 429 rate_limited "message $(sent), over the limit" "$status"
  }

  # Run once each, not retried: every message counts against the limit.
  chat_check() {
    if OUTPUT=$("$2" 2>&1); then
      echo "ok   $1"
    else
      echo "::error::Smoke test: $1 failed. $OUTPUT"
      failed=1
    fi
  }

  if clear_chat_limits; then
    chat_check "chat refuses a first message without a Turnstile token" chat_refuses_without_token
    chat_check "chat answers a message and keeps it after a reload" chat_round_trip
    chat_check "chat refuses message $((CHAT_MESSAGE_LIMIT + 1)) from one IP" chat_refuses_over_limit
    clear_chat_limits || failed=1
  else
    echo "::error::Smoke test: couldn't clear the chat's rate-limit counters with docker compose"
    failed=1
  fi
  rm -rf "$JARS"
fi

if ((failed)); then exit 1; fi
echo "The store works"
