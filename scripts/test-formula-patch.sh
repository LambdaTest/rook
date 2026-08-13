#!/usr/bin/env bash
# Regression test for the "Update formula" step in
# .github/workflows/update-formula.yml — the sed/python logic that patches
# url/sha256/version in Formula/rook.rb and strips any stale
# `bottle do...end` block on every version bump.
#
# This does NOT hand-maintain a copy of that logic. It extracts the real
# step's shell body live from the workflow file (stripping the YAML block
# indentation the same way GitHub Actions does, then dropping only the
# `FORMULA=` assignment so the fixture path can be injected) and runs the
# untouched remainder — the 3 sed substitutions plus the python heredoc —
# against fixture formulas. If someone edits the real transform, this test
# exercises the edit; there is nothing here to fall out of sync.
#
# VERSION/TARBALL_URL/SHA256 are supplied to the extracted body through the
# environment, which is exactly how the real step receives them: they are
# `env:` entries, not `${{ }}` spliced into the shell body. The extraction
# asserts that below — a re-introduced splice is a shell-injection
# regression, not a cosmetic one, and must fail this harness loudly.
#
# macOS ships BSD sed, whose `-i` needs a backup-suffix argument the real
# workflow's `-i` invocations don't pass (GNU sed, as used by the
# ubuntu-latest runner, doesn't need one). Rather than changing the
# extracted `sed -i` calls to fit BSD sed, this script swaps in `gsed`
# (`brew install gnu-sed`) on macOS so the dialect under test matches CI.
#
# Usage: scripts/test-formula-patch.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$REPO_ROOT/.github/workflows/update-formula.yml"
FIXTURES="$REPO_ROOT/scripts/fixtures"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
# check <ok-message> <fail-message> <command...>: explicit if/else rather
# than `cmd && pass || fail`, which shellcheck (rightly, SC2015) flags —
# `fail` would also run if `pass` itself ever failed, since A && B || C is
# not if-then-else.
check() {
  local ok_msg="$1" fail_msg="$2"
  shift 2
  if "$@"; then pass "$ok_msg"; else fail "$fail_msg"; fi
}

if [ ! -f "$WORKFLOW" ]; then
  echo "FATAL: $WORKFLOW not found" >&2
  exit 2
fi

# --- Extract the exact "Update formula" step body from the real workflow ---
# Dedents by the run: block's own first-line indent and stops at the first
# line indented less than that, so trailing YAML (the next step, or a
# comment above it) can't leak into the extracted script.
extract_transform() {
  awk '
    /- name: Update formula/ { instep=1; next }
    instep && /run: \|/ { inrun=1; next }
    inrun {
      if ($0 ~ /^[[:space:]]*$/) { print ""; next }
      match($0, /^ */); ind = RLENGTH
      if (base == 0) base = ind
      if (ind < base) exit
      print substr($0, base + 1)
    }
  ' "$WORKFLOW" | grep -vE '^FORMULA="'
}

TRANSFORM="$(extract_transform)"

if [ -z "$TRANSFORM" ]; then
  echo "FATAL: could not extract the 'Update formula' step from $WORKFLOW — did the step name or run block move?" >&2
  exit 2
fi
# shellcheck disable=SC2016  # the literal two-brace Actions sigil is the point
if echo "$TRANSFORM" | grep -qF -- '${{'; then
  echo "FATAL: the 'Update formula' run: body contains a \${{ ... }} expression. Actions expands those before bash parses the script, so the value's quotes/\$()/backticks become live shell syntax — route it through the step's env: block and reference \"\$VAR\" instead." >&2
  exit 2
fi
if ! echo "$TRANSFORM" | grep -q 'sed -i.*url'; then
  echo "FATAL: extraction did not capture the url sed line — check the step name/marker still matches" >&2
  exit 2
fi
if ! echo "$TRANSFORM" | grep -q 'bottle do'; then
  echo "FATAL: extraction did not capture the python bottle-strip regex" >&2
  exit 2
fi

# Pick the sed binary that matches CI's GNU sed.
SED_BIN="sed"
if ! sed --version >/dev/null 2>&1; then
  if command -v gsed >/dev/null 2>&1; then
    SED_BIN="gsed"
  else
    echo "FATAL: this platform's sed is not GNU sed and gsed is not installed (brew install gnu-sed)" >&2
    exit 2
  fi
fi
RUN_SCRIPT="$(echo "$TRANSFORM" | sed "s/^sed -i/${SED_BIN} -i/")"

run_transform() {
  # $1 = FORMULA path, $2 = VERSION, $3 = TARBALL_URL, $4 = SHA256
  FORMULA="$1" VERSION="$2" TARBALL_URL="$3" SHA256="$4" bash -c "$RUN_SCRIPT"
}

VERSION="9.9.9"
TARBALL_URL="https://registry.npmjs.org/@testmuai/rook/-/rook-9.9.9.tgz"
SHA256="deadbeef00112233445566778899aabbccddeeff00112233445566778899aa"

# --- Case A: fixture WITH a stale bottle block ------------------------------
WITH_BOTTLE="$WORKDIR/with-bottle.rb"
cp "$FIXTURES/rook-formula-with-bottle.rb" "$WITH_BOTTLE"
run_transform "$WITH_BOTTLE" "$VERSION" "$TARBALL_URL" "$SHA256"

check "(a) url replaced (with-bottle fixture)" \
      "(a) url NOT replaced (with-bottle fixture)" \
      grep -qF "url \"$TARBALL_URL\"" "$WITH_BOTTLE"
check "(a) sha256 replaced (with-bottle fixture)" \
      "(a) sha256 NOT replaced (with-bottle fixture)" \
      grep -qF "sha256 \"$SHA256\"" "$WITH_BOTTLE"
check "(a) version replaced (with-bottle fixture)" \
      "(a) version NOT replaced (with-bottle fixture)" \
      grep -qF "version \"$VERSION\"" "$WITH_BOTTLE"
# Anchored to match exactly what the python regex targets (a line that is
# precisely "  bottle do") — a loose substring check would also match the
# words "bottle do" inside this fixture's own descriptive comments above,
# producing a false FAIL even when the real Ruby block was stripped fine.
if grep -qE '^  bottle do$' "$WITH_BOTTLE"; then
  fail "(b) stale bottle block NOT stripped"
else
  pass "(b) stale bottle block stripped"
fi
check "(b) content after the bottle block survived the strip" \
      "(b) the strip regex ate content past the bottle block's 'end'" \
      grep -qF 'depends_on "node"' "$WITH_BOTTLE"

# --- Case B: fixture with NO bottle block — must come out otherwise identical
NO_BOTTLE="$WORKDIR/no-bottle.rb"
cp "$FIXTURES/rook-formula-no-bottle.rb" "$WORKDIR/no-bottle.orig.rb"
cp "$FIXTURES/rook-formula-no-bottle.rb" "$NO_BOTTLE"
run_transform "$NO_BOTTLE" "$VERSION" "$TARBALL_URL" "$SHA256"

check "(c) url replaced (no-bottle fixture)" \
      "(c) url NOT replaced (no-bottle fixture)" \
      grep -qF "url \"$TARBALL_URL\"" "$NO_BOTTLE"
check "(c) sha256 replaced (no-bottle fixture)" \
      "(c) sha256 NOT replaced (no-bottle fixture)" \
      grep -qF "sha256 \"$SHA256\"" "$NO_BOTTLE"
check "(c) version replaced (no-bottle fixture)" \
      "(c) version NOT replaced (no-bottle fixture)" \
      grep -qF "version \"$VERSION\"" "$NO_BOTTLE"

# Diff against the pre-patch original, excluding nothing: only the 3 patched
# lines may differ. 3 changed lines => 6 diff lines (3 "<" + 3 ">"). Any
# other count means the bottle-strip regex touched something it shouldn't
# have even though there was no bottle block present.
DIFF_LINES=$(diff "$WORKDIR/no-bottle.orig.rb" "$NO_BOTTLE" | grep -c '^[<>]' || true)
if [ "$DIFF_LINES" -eq 6 ]; then
  pass "(c) no-bottle fixture unchanged apart from the 3 patched lines"
else
  fail "(c) no-bottle fixture changed more than expected ($DIFF_LINES diff lines, expected 6) — the strip regex may be eating something with no bottle block present"
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "=== formula-patch transform test: FAILED ==="
  exit 1
fi
echo "=== formula-patch transform test: PASSED ==="
