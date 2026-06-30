#!/usr/bin/env bash
# Stop hook — nudge Claude to refresh README.md when tracked source files
# changed during the session but the README itself was not touched.
#
# Reads the Stop hook JSON on stdin. Emits {"decision":"block", ...} to make
# Claude continue and review the README; emits nothing (exit 0) otherwise.
set -uo pipefail

input=$(cat)

# Loop guard: if we're already continuing because of this same hook, stop.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# All tracked files changed relative to the last commit (staged + unstaged).
changed=$(git diff --name-only HEAD 2>/dev/null)
[ -z "$changed" ] && exit 0

# Which of those are source/docs-affecting files worth reflecting in the README.
src=$(printf '%s\n' "$changed" | grep -E '^(backend/app/|backend/tests/|backend/requirements\.txt|frontend/src/|frontend/package\.json|Dockerfile|[^/]*\.sh|\.github/)' || true)
[ -z "$src" ] && exit 0

# README already updated this session → assume it's been handled.
if printf '%s\n' "$changed" | grep -q '^README\.md$'; then
  exit 0
fi

reason=$(printf 'Source files changed this session but README.md was not updated. Review the changed files below and update README.md if they affect documented behavior (features, API endpoints, local setup, deployment, env vars). If no documentation change is warranted, say so in one line and stop.\n\nChanged source files:\n%s' "$src")

jq -cn --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
