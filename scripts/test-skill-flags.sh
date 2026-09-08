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
#   SKILL_FLAGS_SELFTEST=1           check the checker itself before scanning
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

# Subcommand groups whose flags live under `rook help <group>`.
GROUP_CMDS="profile scenarios mcp env project agent runs auth"

# Top-level command words, from the root help's Commands block.
TOP="$(rook --help 2>/dev/null | awk '/^Commands:/{p=1;next} p && /^  [a-z]/{print $1}')"

# One `rook …` line in, PASS/FAIL on stdout out. Returns 0 when the command
# word and every `--flag` on the line are real, 1 otherwise — shared by the
# self-test below and the scan of the skill so the two can never disagree
# about what counts as a failure.
check_line() {
  local line="$1" cmd sub help flag block tok ok=0
  set -f                     # `[args...]` and `*` in a doc line are text, not a glob
  set -- $line
  set +f
  shift                      # drop `rook`
  cmd="${1:-}"
  [ -z "$cmd" ] && return 0
  if ! printf '%s\n' "$TOP" | grep -qx -- "$cmd"; then
    echo "FAIL: unknown command in skill: rook $cmd    (line: $line)"
    return 1
  fi
  sub=""
  if printf ' %s ' "$GROUP_CMDS" | grep -q " $cmd " && [ -n "${2:-}" ] && [[ "${2}" != -* ]]; then
    sub="$2"
  fi
  help="$(rook help "$cmd" 2>/dev/null)"
  for tok in "$@"; do
    case "$tok" in
      --)
        # The argv separator (`mcp add <name> -- <command>`), not a flag —
        # matching it against `--*` and then word-bounding against the help
        # text would otherwise report it as an unknown flag.
        ;;
      --*)
        flag="${tok%%=*}"
        if [ -n "$sub" ]; then
          # Flags of one subcommand are listed under its own heading line.
          block="$(printf '%s\n' "$help" | awk -v s="  $sub" 'index($0,s)==1{p=1;next} p && /^  [a-z]/{p=0} p')"
          if printf '%s\n' "$block" | grep -qE -- "(^|[[:space:]])${flag}([[:space:]]|$)"; then
            :
          else
            echo "FAIL: rook $cmd $sub: flag $flag not in \`rook help $cmd\`    (line: $line)"
            ok=1
          fi
        else
          if printf '%s\n' "$help" | grep -qE -- "(^|[[:space:]])${flag}([[:space:]]|$)"; then
            :
          else
            echo "FAIL: rook $cmd: flag $flag not in \`rook help $cmd\`    (line: $line)"
            ok=1
          fi
        fi
        ;;
    esac
  done
  return $ok
}

if [ "${SKILL_FLAGS_SELFTEST:-0}" = "1" ]; then
  # `--what` belongs to `profile fix`, not `profile test` — this is the exact
  # bug the group-substring check used to miss. `--goal` is the real flag.
  if check_line "rook profile test --what x" >/dev/null; then
    echo "FAIL: selftest — 'rook profile test --what x' should have failed and did not"
    exit 1
  fi
  if ! check_line "rook profile test --goal x" >/dev/null; then
    echo "FAIL: selftest — 'rook profile test --goal x' should have passed and did not"
    exit 1
  fi
  pass "selftest"
fi

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
  if ! check_line "$line"; then
    FAIL=1
  fi
  checked=$((checked+1))
done <<< "$LINES"

pass "checked $checked distinct rook command lines against rook $PIN"
exit $FAIL
