#!/usr/bin/env bash
# Every `rook …` command line inside a fenced code block of the skill is
# checked against the CLI it describes: the command word must be one that
# `rook help` lists, and every `--flag` on the line must appear in
# `rook help <cmd> [<sub>]` for that command. The skill is prose about a
# moving target; this is the one part of it a machine can keep honest.
#
# Pinned to one release. Bump ROOK_SKILL_PIN when the skill catches up to a
# newer rook, in the same PR.
#
# Usage: scripts/test-skill-flags.sh
#   ROOK_SKILL_PIN=0.1.1             version the skill describes (default)
#   SKILL_FLAGS_SKIP_IF_MISSING=1    exit 0 with SKIP when rook is absent
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$REPO_ROOT/skill-installer/skills"
PIN="${ROOK_SKILL_PIN:-0.1.1}"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

if ! command -v rook >/dev/null 2>&1; then
  if [ "${SKILL_FLAGS_SKIP_IF_MISSING:-0}" = "1" ]; then
    echo "SKIP: rook is not installed; set it up with: npm install -g @testmuai/rook@$PIN"
    exit 0
  fi
  echo "FATAL: rook is not on PATH — npm install -g @testmuai/rook@$PIN" >&2
  exit 2
fi
HAVE="$(rook --version 2>/dev/null | tr -d '[:space:]')"
if [ "$HAVE" != "$PIN" ]; then
  echo "FATAL: installed rook is $HAVE, the skill is pinned to $PIN" >&2
  exit 2
fi

# Subcommand groups whose flags live under `rook help <group>` (0.1.1 quirk:
# `rook <group> <sub> --help` prints the root help, `rook help <group>` does not).
GROUPS="profile scenarios mcp env project agent runs auth"

# Top-level command words, from the root help's Commands block.
TOP="$(rook --help 2>/dev/null | awk '/^Commands:/{p=1;next} p && /^  [a-z]/{print $1}')"

# Collect `rook …` lines from fenced blocks in SKILL.md and references/*.md.
# Lines starting with `$ rook`, `rook`, or `  rook` count; prose does not.
LINES="$(cat "$SKILL_DIR/SKILL.md" "$SKILL_DIR"/references/*.md 2>/dev/null \
  | awk '/^```/{f=!f;next} f && /^[[:space:]]*(\$ )?rook( |$)/{sub(/^[[:space:]]*(\$ )?/,""); print}' \
  | sed 's/[[:space:]]*\\$//' | sort -u)"

if [ -z "$LINES" ]; then
  fail "no rook command lines found in fenced code blocks — is the skill written?"
  exit 1
fi

checked=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  set -- $line
  shift                      # drop `rook`
  cmd="${1:-}"
  [ -z "$cmd" ] && continue
  if ! printf '%s\n' "$TOP" | grep -qx -- "$cmd"; then
    fail "unknown command in skill: rook $cmd    (line: $line)"
    continue
  fi
  sub=""
  if printf ' %s ' "$GROUPS" | grep -q " $cmd " && [ -n "${2:-}" ] && [[ "${2}" != -* ]]; then
    sub="$2"
  fi
  help="$(rook help "$cmd" 2>/dev/null)"
  for tok in "$@"; do
    case "$tok" in
      --*)
        flag="${tok%%=*}"
        if [ -n "$sub" ]; then
          # Flags of one subcommand are listed under its own heading line.
          block="$(printf '%s\n' "$help" | awk -v s="  $sub" 'index($0,s)==1{p=1;next} p && /^  [a-z]/{p=0} p')"
          if printf '%s\n' "$block" | grep -q -- "$flag"; then :; else fail "rook $cmd $sub: flag $flag not in \`rook help $cmd\`    (line: $line)"; fi
        else
          if printf '%s\n' "$help" | grep -q -- "$flag"; then :; else fail "rook $cmd: flag $flag not in \`rook help $cmd\`    (line: $line)"; fi
        fi
        ;;
    esac
  done
  checked=$((checked+1))
done <<< "$LINES"

pass "checked $checked distinct rook command lines against rook $PIN"
exit $FAIL
