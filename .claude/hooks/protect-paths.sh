#!/usr/bin/env bash
# PreToolUse hook: Claude may read the eval cases and reports but never write
# them, so it can't make a failing case pass by changing the case or the score.
# Eval cases are yours; a report comes only from the eval runner. Changes to
# these guardrails need your approval, so Claude can't switch them off.
#
# Edits through Edit, Write, MultiEdit and NotebookEdit are always caught.
# Bash is best effort: redirects, tee, cp, mv, rm, sed -i and the like that
# name a protected path. The PR review is the real gate.

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT")
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}

# Paths relative to the repo root.
DENY_PATHS=(evals/cases evals/reports)              # Claude never writes these
ASK_PATHS=(.claude/hooks .claude/settings.json)     # you approve each change

deny() {
  echo "BLOCKED: '$1' is an eval case or report, and Claude doesn't write those. Cases are the user's, and a report comes only from the eval runner. Propose the change in chat for the user to make." >&2
  exit 2
}

ask() {
  jq -n --arg r "'$1' is one of Claude's guardrails. Approve only if you asked for this change." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
  exit 0
}

# path_regex <lead> <path>...: matches any of the paths, whole or as a prefix
# of a longer path, right after <lead>.
path_regex() {
  local lead=$1 IFS='|'
  shift
  local alts="${*//./\\.}"
  printf '%s(\\./)?(%s)(/|\\s|$)' "$lead" "$alts"
}

case "$TOOL" in
  Edit | Write | MultiEdit | NotebookEdit)
    FILE=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$INPUT")
    [ -z "$FILE" ] && exit 0
    [[ "$FILE" != /* ]] && FILE="$ROOT/$FILE"
    REL=$(realpath -m --relative-to="$ROOT" "$FILE")
    for p in "${DENY_PATHS[@]}"; do [[ "$REL" == "$p" || "$REL" == "$p"/* ]] && deny "$REL"; done
    for p in "${ASK_PATHS[@]}"; do [[ "$REL" == "$p" || "$REL" == "$p"/* ]] && ask "$REL"; done
    ;;

  Bash)
    CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
    MENTION='(^|[\s=/])'      # the path appears as a word or after a /
    REDIRECT='>>?\s*(\S*/)?'  # the path is a redirect target
    DENY_RE=$(path_regex "$MENTION" "${DENY_PATHS[@]}")
    ASK_RE=$(path_regex "$MENTION" "${ASK_PATHS[@]}")
    DENY_REDIRECT_RE=$(path_regex "$REDIRECT" "${DENY_PATHS[@]}")
    ASK_REDIRECT_RE=$(path_regex "$REDIRECT" "${ASK_PATHS[@]}")
    # A segment writes when it redirects into a path or runs a command that
    # changes files. Quote characters are dropped so quoted paths still match.
    WRITERS='^\s*(sudo\s+)?((tee|mv|cp|rm|rmdir|truncate|touch|ln|install|rsync|dd|chmod|unlink)\b|(sed|perl)\b.*\s-[a-zA-Z]*i|git\b.*\b(rm|mv|checkout|restore|apply|stash)\b)'
    while IFS= read -r segment; do
      [ -z "$segment" ] && continue
      for kind in DENY ASK; do
        re_var="${kind}_RE" redirect_var="${kind}_REDIRECT_RE"
        re=${!re_var}
        if grep -qP -- "${!redirect_var}" <<<"$segment" ||
          { grep -qP -- "$WRITERS" <<<"$segment" && grep -qP -- "$re" <<<"$segment"; }; then
          [ "$kind" = DENY ] && deny "$segment" || ask "$segment"
        fi
      done
    done < <(tr -d "\"'" <<<"$CMD" | sed -E 's/(&&|\|\||[;|&(){}`]|\$\()/\n/g')
    ;;
esac

exit 0
