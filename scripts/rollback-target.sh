#!/usr/bin/env bash
# Prints the release to roll back to when the release at <sha> fails its smoke
# test: the release tag before it. Fails instead when there is none, or when
# rolling back isn't safe because the release accepted a migration that breaks
# rollback (docs/runbooks/deploy-and-rollback.md#automatic-rollback).
#
#   scripts/rollback-target.sh <full commit sha>
#
# Reads git, so it needs the history and tags (actions/checkout with
# fetch-depth: 0).
set -euo pipefail

SHA=${1:-}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "usage: $0 <full 40-character commit sha>" >&2; exit 2; }
REVIEWED=apps/backend/migrations-reviewed.txt

# The nearest release tag behind this commit. Releases are only tagged on main.
previous=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "$SHA^" 2>/dev/null) || {
  echo "::error::No release before $SHA to roll back to. Fix forward." >&2
  exit 1
}

# A migration accepted since then drops, renames or tightens something the
# previous release may still use. Only grep finding nothing is fine: a git
# failure must stop the rollback.
accepted=$(git diff --unified=0 "$previous" "$SHA" -- "$REVIEWED" | { grep -E '^\+[^+#]' || true; } | cut -c2-)
if [[ -n $accepted ]]; then
  echo "::error::Not rolling back to $previous: this release accepted migrations that break rollback:" >&2
  echo "$accepted" >&2
  echo "Fix forward, or restore the backup taken before the release and deploy $previous by hand (docs/runbooks/deploy-and-rollback.md#releasing-a-migration-that-breaks-rollback)." >&2
  exit 1
fi

echo "$previous"
