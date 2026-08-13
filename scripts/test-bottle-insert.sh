#!/usr/bin/env bash
# Regression test for the "Compute sha256s and patch formula" step in
# .github/workflows/build-bottles.yml — the Python logic that hashes the
# built bottle artifacts and inserts a `bottle do...end` block into
# Formula/rook.rb immediately after the `version "..."` line.
#
# Sibling to scripts/test-formula-patch.sh (same extraction discipline,
# same fixtures), kept as a separate file because it targets a different
# workflow file and a different step shape: a Python heredoc that reads
# real files from disk (fake bottle artifacts, not just a formula file),
# rather than a run of sed one-liners. Reuses test-formula-patch.sh's two
# existing fixtures — scripts/fixtures/rook-formula-no-bottle.rb and
# rook-formula-with-bottle.rb — since they already cover exactly the two
# shapes this insertion logic has to handle: no bottle block yet, and a
# stale bottle block left over from a previous version.
#
# This does NOT hand-maintain a copy of the sort_key/insertion logic. It
# extracts the real "Compute sha256s and patch formula" step body live
# from build-bottles.yml (stripping the YAML block indentation the same
# way GitHub Actions does) and runs the untouched `python3 - <<'PY' ... PY`
# heredoc as-is against fixture formulas plus fake bottle artifacts. If
# someone edits the real transform, this test exercises the edit.
#
# Usage: scripts/test-bottle-insert.sh
set -uo pipefail
# (deliberately no -e, anywhere in this script: run_transform's whole job
# is to sometimes fail — including under deliberate corruption of the real
# workflow, applied by hand outside this script, see task-10-report.md —
# and every check after it (bottle-block count, sha256 line count, etc.)
# must still run and report FAIL on its own merits rather than the script
# silently aborting on the first non-zero exit status it meets.)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$REPO_ROOT/.github/workflows/build-bottles.yml"
FIXTURES="$REPO_ROOT/scripts/fixtures"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
# Same explicit if/else as test-formula-patch.sh (shellcheck SC2015: `cmd
# && pass || fail` would also run fail if pass itself ever failed).
check() {
  local ok_msg="$1" fail_msg="$2"
  shift 2
  if "$@"; then pass "$ok_msg"; else fail "$fail_msg"; fi
}

if [ ! -f "$WORKFLOW" ]; then
  echo "FATAL: $WORKFLOW not found" >&2
  exit 2
fi

# --- Extract the exact "Compute sha256s and patch formula" step body -------
extract_transform() {
  awk '
    /- name: Compute sha256s and patch formula/ { capture=1; next }
    capture && /run: \|/ { inrun=1; next }
    capture && inrun && /^      - name:/ { exit }
    capture && inrun { print }
  ' "$WORKFLOW" | sed 's/^          //'
}

TRANSFORM="$(extract_transform)"

if [ -z "$TRANSFORM" ]; then
  echo "FATAL: could not extract the 'Compute sha256s and patch formula' step from $WORKFLOW — did the step name or run block move?" >&2
  exit 2
fi
if ! echo "$TRANSFORM" | grep -q 'import hashlib'; then
  echo "FATAL: extraction did not capture the python hashing logic" >&2
  exit 2
fi
if ! echo "$TRANSFORM" | grep -q 'sort_key'; then
  echo "FATAL: extraction did not capture the sort_key ordering logic" >&2
  exit 2
fi
if echo "$TRANSFORM" | grep -qF -- "\${{"; then
  echo "FATAL: extraction captured a GitHub Actions template expression (\${{ ... }}) — the step's env: block leaked into the run: body; extraction markers need updating" >&2
  exit 2
fi

# run_transform DIR VERSION: run the extracted heredoc with cwd=DIR and
# VERSION=VERSION in its environment (matches how the real step gets
# VERSION — via `env:`, not a bash assignment inside the script body).
# Does NOT abort on a non-zero exit; callers capture and assert on RC.
run_transform() {
  local dir="$1" version="$2"
  ( cd "$dir" && VERSION="$version" bash -c "$TRANSFORM" )
}

sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }
# absent PATTERN FILE: succeeds (exit 0) iff PATTERN is NOT present in FILE
# (fixed-string match) — used with check() to assert something was cleaned
# up, since check() treats a 0 exit as PASS.
absent() { ! grep -qF -- "$1" "$2"; }

# label_order_in FORMULA: prints the bottle-block label names in the order
# they appear in the sha256 lines, one per line.
label_order_in() {
  grep -E '^    sha256 cellar:' "$1" | sed -E 's/^    sha256 cellar: :any_skip_relocation, ([A-Za-z0-9_]+):.*/\1/'
}

# =============================================================================
# Case A: no existing bottle block (scripts/fixtures/rook-formula-no-bottle.rb)
# — 5 labels chosen so the correct macos_rank order is NOT the same as plain
# alphabetical order of the label strings. This matters: because arm64_*
# labels all start with "a" and x86_64_linux starts with "x", the *group*
# boundaries (arm64 macOS < bare/intel macOS < linux) happen to fall out of
# plain alphabetical sorting too, for any label set — that part alone can't
# tell sort_key apart from `sorted(shas.keys())` with no key at all. What
# CAN tell them apart is the order *within* a group, where macos_rank and
# alphabetical order of the codename disagree:
#   - arm64_sequoia (rank 1), arm64_monterey (rank 4), arm64_bigsur (not in
#     macos_rank -> falls to the `.get(name, 99)` fallback, so it must sort
#     LAST within the arm64 group despite "bigsur" being alphabetically
#     FIRST of the three) — this also exercises the unrecognized-codename
#     fallback branch, not just the known ranks.
#   - tahoe (rank 0, bare/intel-group) and x86_64_linux (always last).
# Correct order: arm64_sequoia, arm64_monterey, arm64_bigsur, tahoe,
# x86_64_linux. Plain alphabetical order of these exact 5 strings is
# arm64_bigsur, arm64_monterey, arm64_sequoia, tahoe, x86_64_linux — a
# different order (first and third swapped) — so a test that only checked
# "does the output order match X" with an alphabetically-coincident X could
# pass even with sort_key's key= dropped entirely. This label set can't.
# =============================================================================
CASE_A="$WORKDIR/case-a"
mkdir -p "$CASE_A/Formula" "$CASE_A/bottles"
cp "$FIXTURES/rook-formula-no-bottle.rb" "$CASE_A/Formula/rook.rb"

VERSION_A="0.1.0"
declare -a LABELS_A=(arm64_sequoia arm64_monterey arm64_bigsur tahoe x86_64_linux)
declare -a EXPECTED_ORDER_A=(arm64_sequoia arm64_monterey arm64_bigsur tahoe x86_64_linux)
for label in "${LABELS_A[@]}"; do
  printf 'bottle-content-%s\n' "$label" > "$CASE_A/bottles/rook-${VERSION_A}.${label}.bottle.tar.gz"
done

run_transform "$CASE_A" "$VERSION_A"
RC_A=$?

check "(a) transform exited 0" "(a) transform exited nonzero ($RC_A)" [ "$RC_A" -eq 0 ]

check "(a) exactly one bottle block inserted" \
      "(a) bottle block count is not exactly 1" \
      [ "$(grep -c '^  bottle do$' "$CASE_A/Formula/rook.rb")" -eq 1 ]

check "(a) root_url set correctly" \
      "(a) root_url missing or wrong" \
      grep -qF "    root_url \"https://github.com/LambdaTest/rook/releases/download/rook-${VERSION_A}\"" \
      "$CASE_A/Formula/rook.rb"

SHA_LINE_COUNT_A="$(grep -c '^    sha256 cellar:' "$CASE_A/Formula/rook.rb")"
check "(a) one sha256 line per label (${#LABELS_A[@]})" \
      "(a) sha256 line count ($SHA_LINE_COUNT_A) != label count (${#LABELS_A[@]})" \
      [ "$SHA_LINE_COUNT_A" -eq "${#LABELS_A[@]}" ]

ACTUAL_ORDER_A="$(label_order_in "$CASE_A/Formula/rook.rb" | tr '\n' ',' )"
EXPECTED_ORDER_A_STR="$(IFS=,; echo "${EXPECTED_ORDER_A[*]}"),"
check "(a) sort order matches macos_rank, not plain alphabetical (sequoia, monterey, then fallback-ranked bigsur; then intel tahoe; then linux last): $ACTUAL_ORDER_A" \
      "(a) sort order wrong: got [$ACTUAL_ORDER_A], expected [$EXPECTED_ORDER_A_STR]" \
      [ "$ACTUAL_ORDER_A" = "$EXPECTED_ORDER_A_STR" ]

SHA_OK_A=1
for label in "${LABELS_A[@]}"; do
  EXPECTED_SHA="$(sha_of "$CASE_A/bottles/rook-${VERSION_A}.${label}.bottle.tar.gz")"
  if ! grep -E "^    sha256 cellar: :any_skip_relocation, ${label}:[[:space:]]+\"${EXPECTED_SHA}\"$" "$CASE_A/Formula/rook.rb" >/dev/null; then
    SHA_OK_A=0
    echo "  -- sha mismatch for $label: expected $EXPECTED_SHA"
  fi
done
check "(a) every sha256 value matches an independent shasum of its bottle file" \
      "(a) at least one sha256 value did not match an independent shasum of its bottle file" \
      [ "$SHA_OK_A" -eq 1 ]

VERSION_LINE_NUM_A="$(grep -n '^  version "' "$CASE_A/Formula/rook.rb" | head -1 | cut -d: -f1)"
# -1 sentinel (rather than empty) if no "  bottle do" line exists at all —
# keeps the arithmetic comparison below well-formed (a clean numeric
# mismatch) instead of a bash "[: integer expected" warning when this
# fires under a corrupted transform that never inserted anything.
BOTTLE_LINE_NUM_A="$(grep -n '^  bottle do$' "$CASE_A/Formula/rook.rb" | head -1 | cut -d: -f1)"
BOTTLE_LINE_NUM_A="${BOTTLE_LINE_NUM_A:--1}"
check "(a) bottle block placed immediately after the version line (blank line between, per the insertion regex)" \
      "(a) bottle block not placed immediately after the version line (version at line $VERSION_LINE_NUM_A, bottle do at line $BOTTLE_LINE_NUM_A)" \
      [ "$BOTTLE_LINE_NUM_A" -eq "$((VERSION_LINE_NUM_A + 2))" ]

check "(a) content after the bottle block survived the insertion" \
      "(a) content after the bottle block was lost or corrupted" \
      grep -qF 'depends_on "node"' "$CASE_A/Formula/rook.rb"

# =============================================================================
# Case B: fixture that ALREADY has a stale bottle block (a re-run, or a
# version bump: scripts/fixtures/rook-formula-with-bottle.rb, version
# bumped 0.1.0 -> 0.2.0 the same way update-formula.yml would have already
# done it before build-bottles.yml ever runs) — must end up with exactly
# ONE clean bottle block, not two, and the stale fake shas/root_url from
# the old version must be gone.
# =============================================================================
CASE_B="$WORKDIR/case-b"
mkdir -p "$CASE_B/Formula" "$CASE_B/bottles"
cp "$FIXTURES/rook-formula-with-bottle.rb" "$CASE_B/Formula/rook.rb"

VERSION_B="0.2.0"
sed -i.bak "s/version \"0.1.0\"/version \"${VERSION_B}\"/" "$CASE_B/Formula/rook.rb"
rm -f "$CASE_B/Formula/rook.rb.bak"

declare -a LABELS_B=(arm64_sequoia x86_64_linux)
for label in "${LABELS_B[@]}"; do
  printf 'bottle-content-v2-%s\n' "$label" > "$CASE_B/bottles/rook-${VERSION_B}.${label}.bottle.tar.gz"
done

run_transform "$CASE_B" "$VERSION_B"
RC_B=$?

check "(b) transform exited 0" "(b) transform exited nonzero ($RC_B)" [ "$RC_B" -eq 0 ]

check "(b) exactly one bottle block present after re-run (not two)" \
      "(b) bottle block count is not exactly 1 — strip-then-reinsert left duplicates" \
      [ "$(grep -c '^  bottle do$' "$CASE_B/Formula/rook.rb")" -eq 1 ]

check "(b) sha256 line count matches only the new labels (${#LABELS_B[@]}) — old block's lines did not survive alongside the new ones" \
      "(b) sha256 line count doesn't match the new label count — old block's lines may have leaked through alongside the new ones" \
      [ "$(grep -c '^    sha256 cellar:' "$CASE_B/Formula/rook.rb")" -eq "${#LABELS_B[@]}" ]

check "(b) new root_url reflects the bumped version" \
      "(b) root_url does not reflect the bumped version" \
      grep -qF "    root_url \"https://github.com/LambdaTest/rook/releases/download/rook-${VERSION_B}\"" \
      "$CASE_B/Formula/rook.rb"

check "(b) stale root_url from the old version is gone" \
      "(b) stale root_url from the old version is still present" \
      absent "download/v0.1.0" "$CASE_B/Formula/rook.rb"

check "(b) stale fake sha256 (arm64_sequoia, old '1111...') is gone" \
      "(b) stale fake sha256 (arm64_sequoia, old '1111...') survived" \
      absent "1111111111111111111111111111111111111111111111111111111111111111" "$CASE_B/Formula/rook.rb"

check "(b) stale fake sha256 (x86_64_linux, old '2222...') is gone" \
      "(b) stale fake sha256 (x86_64_linux, old '2222...') survived" \
      absent "2222222222222222222222222222222222222222222222222222222222222222" "$CASE_B/Formula/rook.rb"

SHA_OK_B=1
for label in "${LABELS_B[@]}"; do
  EXPECTED_SHA="$(sha_of "$CASE_B/bottles/rook-${VERSION_B}.${label}.bottle.tar.gz")"
  if ! grep -E "^    sha256 cellar: :any_skip_relocation, ${label}:[[:space:]]+\"${EXPECTED_SHA}\"$" "$CASE_B/Formula/rook.rb" >/dev/null; then
    SHA_OK_B=0
    echo "  -- sha mismatch for $label: expected $EXPECTED_SHA"
  fi
done
check "(b) every new sha256 value matches an independent shasum of its bottle file" \
      "(b) at least one new sha256 value did not match an independent shasum of its bottle file" \
      [ "$SHA_OK_B" -eq 1 ]

check "(b) content after the bottle block survived the re-insertion" \
      "(b) content after the bottle block was lost or corrupted" \
      grep -qF 'depends_on "node"' "$CASE_B/Formula/rook.rb"

echo
if [ "$FAIL" -ne 0 ]; then
  echo "=== bottle-insert transform test: FAILED ==="
  exit 1
fi
echo "=== bottle-insert transform test: PASSED ==="
