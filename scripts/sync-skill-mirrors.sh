#!/usr/bin/env bash
# Regenerate the two skill mirrors from the canonical copy. Wipe-then-copy,
# so a file removed from the canonical skill does not linger in a mirror.
#
# Usage: scripts/sync-skill-mirrors.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANON="$REPO_ROOT/skill-installer/skills"

for m in "$REPO_ROOT/.claude/skills/rook" "$REPO_ROOT/.agents/skills/rook"; do
  rm -rf "$m"
  mkdir -p "$(dirname "$m")"
  cp -R "$CANON" "$m"
  echo "synced ${m#"$REPO_ROOT"/}"
done
