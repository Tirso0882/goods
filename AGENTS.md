## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## GitHub publication

When the user explicitly requests commit by category/subject, push, publish, or PR creation, skip HTTPS `git push` and invoke the Git Data API publisher (`scripts/publish-via-github-api.sh`) immediately. Never publish automatically at the beginning of unrelated work.
