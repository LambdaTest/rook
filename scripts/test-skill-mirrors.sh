#!/usr/bin/env bash
# The skill has one canonical copy, skill-installer/skills/, and two mirrors
# that Claude Code (.claude/skills/rook) and Codex CLI (.agents/skills/rook)
# pick up from a clone. kane-cli keeps the same three copies in sync by hand;
# this harness makes a drifted mirror a red run instead of a silent one.
#
# It also checks the two frontmatter facts a harness can check: the skill is
# named `rook`, and the description fits Claude Code's 1024-character limit.
#
# Usage: scripts/test-skill-mirrors.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANON="$REPO_ROOT/skill-installer/skills"
MIRRORS=("$REPO_ROOT/.claude/skills/rook" "$REPO_ROOT/.agents/skills/rook")

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

if [ ! -f "$CANON/SKILL.md" ]; then
  echo "FATAL: $CANON/SKILL.md not found — the canonical skill is missing" >&2
  exit 2
fi

for m in "${MIRRORS[@]}"; do
  if [ ! -d "$m" ]; then
    fail "mirror missing: ${m#"$REPO_ROOT"/} (run scripts/sync-skill-mirrors.sh)"
    continue
  fi
  if diff -r "$CANON" "$m" >/dev/null; then
    pass "mirror identical: ${m#"$REPO_ROOT"/}"
  else
    fail "mirror differs from skill-installer/skills: ${m#"$REPO_ROOT"/} (run scripts/sync-skill-mirrors.sh)"
    diff -r "$CANON" "$m" | head -20
  fi
done

# Frontmatter: the block between the first two `---` lines.
FM="$(awk 'NR==1 && $0!="---" {exit 1} NR>1 && $0=="---" {exit} NR>1 {print}' "$CANON/SKILL.md")"
NAME="$(printf '%s\n' "$FM" | sed -n 's/^name:[[:space:]]*//p' | head -1)"
DESC="$(printf '%s\n' "$FM" | sed -n 's/^description:[[:space:]]*//p' | head -1)"

if [ "$NAME" = "rook" ]; then pass "frontmatter name is rook"; else fail "frontmatter name is '$NAME', expected rook"; fi
if [ -n "$DESC" ]; then pass "frontmatter has a description"; else fail "frontmatter description is empty"; fi
DESC_LEN=${#DESC}
if [ "$DESC_LEN" -le 1024 ]; then
  pass "description length $DESC_LEN <= 1024"
else
  fail "description length $DESC_LEN exceeds Claude Code's 1024-character limit"
fi

exit $FAIL
