#!/usr/bin/env bash
# Points the test store's Railway services at the images built from one commit
# and deploys them: the server first, so its pre-deploy migration runs before
# anything else changes, then the worker and the storefront. A deploy that
# doesn't reach SUCCESS stops the release, and the services not yet reached
# keep the release they had. Deploying an older SHA is the rollback
# (docs/runbooks/deploy-and-rollback.md).
#
#   RAILWAY_TOKEN=<project token> scripts/railway-deploy.sh <full commit sha>
#
# Uses Railway's public API because the CLI can't set an image tag. The project
# token is scoped to one environment, so the script asks the token which.
set -euo pipefail

SHA=${1:-}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "usage: $0 <full 40-character commit sha>" >&2; exit 2; }
[[ -n ${RAILWAY_TOKEN:-} ]] || { echo "RAILWAY_TOKEN is not set" >&2; exit 2; }

API=https://backboard.railway.com/graphql/v2
REGISTRY=ghcr.io/tirso0882
# Service name, then image. Order matters: the server migrates first.
SERVICES=(
  "medusa-server goods-backend"
  "medusa-worker goods-backend"
  "storefront goods-storefront"
)
# Set on the server with every release, so it lives here and not only in the
# dashboard. The placeholders are explained in docs/runbooks/railway.md. The
# --execute-safe-* flags answer Medusa's link and search sync without a prompt
# (there is no terminal in pre-deploy): create what's new, never drop or change
# what the image doesn't know, which is what a rollback finds.
# shellcheck disable=SC2016 # expanded by sh -c in the container, not here
MIGRATE='sh -c '\''S3_BUCKET="" JWT_SECRET="${JWT_SECRET:-migrate-only}" COOKIE_SECRET="${COOKIE_SECRET:-migrate-only}" exec ./node_modules/.bin/medusa db:migrate --execute-safe-links --execute-safe-search'\'
# Pre-deploy is capped at 600 seconds, plus pulling and the health check.
DEPLOY_TIMEOUT_SECONDS=${DEPLOY_TIMEOUT_SECONDS:-1200}

# gql <query> [variables json] -> the response's data, or exit on any error.
gql() {
  local body response
  body=$(jq -n --arg q "$1" --argjson v "${2:-{\}}" '{query: $q, variables: $v}')
  response=$(curl -sS --fail-with-body --retry 3 "$API" \
    -H "Project-Access-Token: $RAILWAY_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body") || { echo "Railway API request failed: $response" >&2; exit 1; }
  if jq -e '.errors' <<<"$response" >/dev/null; then
    echo "Railway API error: $(jq -c '.errors' <<<"$response")" >&2
    exit 1
  fi
  jq -c '.data' <<<"$response"
}

# Fail before touching anything if an image is missing, so a typo in a
# rollback SHA can't leave the server on one release and the rest on another.
for image in goods-backend goods-storefront; do
  docker manifest inspect "$REGISTRY/$image:$SHA" >/dev/null \
    || { echo "$REGISTRY/$image:$SHA not found on GHCR" >&2; exit 1; }
done

ENVIRONMENT_ID=$(gql '{ projectToken { environmentId } }' | jq -r '.projectToken.environmentId')
INSTANCES=$(gql 'query ($id: String!) {
  environment(id: $id) { name serviceInstances { edges { node { serviceId serviceName } } } }
}' "$(jq -n --arg id "$ENVIRONMENT_ID" '{id: $id}')")
echo "Deploying $SHA to Railway environment $(jq -r '.environment.name' <<<"$INSTANCES")"

deploy() {
  local name=$1 image="$REGISTRY/$2:$SHA" service_id ids input deployment_id status deadline
  service_id=$(jq -r --arg n "$name" \
    '.environment.serviceInstances.edges[].node | select(.serviceName == $n) | .serviceId' <<<"$INSTANCES")
  [[ -n $service_id ]] || { echo "No service named $name in this environment" >&2; exit 1; }
  ids=$(jq -n --arg s "$service_id" --arg e "$ENVIRONMENT_ID" '{serviceId: $s, environmentId: $e}')
  # Only the server migrates, so two migrations never race.
  input=$(jq -n --arg i "$image" --arg m "$MIGRATE" --arg n "$name" \
    '{source: {image: $i}} + if $n == "medusa-server" then {preDeployCommand: [$m]} else {} end')

  echo "::group::$name -> $image"
  gql 'mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
    serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
  }' "$(jq --argjson input "$input" '. + {input: $input}' <<<"$ids")" >/dev/null
  # Railway can stage a settings change instead of applying it. Deploying then
  # would quietly ship the old settings, so check what the service now has.
  local current
  current=$(gql 'query ($serviceId: String!, $environmentId: String!) {
    serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { source { image } preDeployCommand }
  }' "$ids" | jq -c '.serviceInstance | {source: {image: .source.image}} + if (.preDeployCommand // []) | length > 0 then {preDeployCommand} else {} end')
  if ! jq -e --argjson want "$input" '. == $want' <<<"$current" >/dev/null; then
    echo "$name settings after the update: $current, wanted $input" >&2
    exit 1
  fi

  deployment_id=$(gql 'mutation ($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
  }' "$ids" | jq -r '.serviceInstanceDeployV2')
  echo "deployment $deployment_id"

  deadline=$((SECONDS + DEPLOY_TIMEOUT_SECONDS))
  while :; do
    status=$(gql 'query ($id: String!) { deployment(id: $id) { status } }' \
      "$(jq -n --arg id "$deployment_id" '{id: $id}')" | jq -r '.deployment.status')
    echo "$(date -u +%H:%M:%S) $status"
    case $status in
      SUCCESS) break ;;
      FAILED | CRASHED | REMOVED | SKIPPED)
        echo "::endgroup::"
        echo "::error::$name deployment $deployment_id ended $status; services after it were not changed"
        exit 1 ;;
    esac
    if ((SECONDS > deadline)); then
      echo "::endgroup::"
      echo "::error::$name deployment $deployment_id still $status after ${DEPLOY_TIMEOUT_SECONDS}s"
      exit 1
    fi
    sleep 10
  done
  echo "::endgroup::"
}

for entry in "${SERVICES[@]}"; do
  read -r name image <<<"$entry"
  deploy "$name" "$image"
done
echo "All services run $SHA"
