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
  local name=$1 image="$REGISTRY/$2:$SHA" service_id vars deployment_id status deadline
  service_id=$(jq -r --arg n "$name" \
    '.environment.serviceInstances.edges[].node | select(.serviceName == $n) | .serviceId' <<<"$INSTANCES")
  [[ -n $service_id ]] || { echo "No service named $name in this environment" >&2; exit 1; }
  vars=$(jq -n --arg s "$service_id" --arg e "$ENVIRONMENT_ID" --arg i "$image" \
    '{serviceId: $s, environmentId: $e, image: $i}')

  echo "::group::$name -> $image"
  gql 'mutation ($serviceId: String!, $environmentId: String!, $image: String!) {
    serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: {source: {image: $image}})
  }' "$vars" >/dev/null
  # Railway can stage a settings change instead of applying it. Deploying then
  # would quietly ship the old image, so check what the service now points at.
  local current
  current=$(gql 'query ($serviceId: String!, $environmentId: String!) {
    serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { source { image } }
  }' "$(jq 'del(.image)' <<<"$vars")" | jq -r '.serviceInstance.source.image')
  [[ $current == "$image" ]] || { echo "$name still points at $current after the update" >&2; exit 1; }

  deployment_id=$(gql 'mutation ($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
  }' "$(jq 'del(.image)' <<<"$vars")" | jq -r '.serviceInstanceDeployV2')
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
