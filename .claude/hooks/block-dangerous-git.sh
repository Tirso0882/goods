#!/usr/bin/env bash
# PreToolUse hook: stops Claude running git commands that destroy work or
# rewrite shared history. A plain `git push` stays allowed; force pushes don't.
# Exit 2 blocks the call and shows stderr to Claude.

COMMAND=$(jq -r '.tool_input.command // empty')

# Each pattern is matched against one git invocation at a time, so git words
# inside a PR body, a commit message or an echo don't trip it.
DANGEROUS_PATTERNS=(
  '\bpush\b.*(--force|\s-f(\s|$)|\s\+[^ ])' # force push, incl. --force-with-lease and +refspec
  '\breset\b.*--hard'
  '\bclean\b.*\s-[a-zA-Z]*f'
  '\bbranch\b.*\s(-[a-zA-Z]*D|--delete\s+--force|--force\s+--delete)'
  '\b(checkout|restore)\b.*\s(--\s+)?\.(\s|$)'
)

# Blank out quoted strings (commit messages, PR bodies), then split on newlines
# and shell separators and keep the segments that run git.
UNQUOTED=$(perl -0pe 's/"(?:\\.|[^"\\])*"|'\''[^'\'']*'\''/""/gs' <<<"$COMMAND")
SEGMENTS=$(sed -E 's/(&&|\|\||[;|&(){}`]|\$\()/\n/g' <<<"$UNQUOTED" |
  grep -P '^\s*(sudo\s+|command\s+|env\s+(\S+=\S*\s+)*)?git\s')

while IFS= read -r segment; do
  [ -z "$segment" ] && continue
  for pattern in "${DANGEROUS_PATTERNS[@]}"; do
    if grep -qP -- "$pattern" <<<"$segment"; then
      echo "BLOCKED: '$segment' matches dangerous git pattern '$pattern'. The user has prevented you from doing this; ask them to run it." >&2
      exit 2
    fi
  done
done <<<"$SEGMENTS"

exit 0
