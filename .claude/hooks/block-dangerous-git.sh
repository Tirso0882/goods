#!/usr/bin/env bash
# PreToolUse hook: stops Claude running git commands that destroy work or
# rewrite shared history. A plain `git push` stays allowed; force pushes don't.
# Exit 2 blocks the call and shows stderr to Claude.

COMMAND=$(jq -r '.tool_input.command // empty')

DANGEROUS_PATTERNS=(
  'git\b.*\bpush\b.*(--force|\s-f(\s|$)|\s\+[^ ])' # force push, incl. --force-with-lease and +refspec
  'git\b.*\breset\b.*--hard'
  'git\b.*\bclean\b.*\s-[a-zA-Z]*f'
  'git\b.*\bbranch\b.*\s(-[a-zA-Z]*D|--delete\s+--force|--force\s+--delete)'
  'git\b.*\b(checkout|restore)\b.*\s(--\s+)?\.(\s|$)'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if grep -qP -- "$pattern" <<<"$COMMAND"; then
    echo "BLOCKED: '$COMMAND' matches dangerous git pattern '$pattern'. The user has prevented you from doing this; ask them to run it." >&2
    exit 2
  fi
done

exit 0
