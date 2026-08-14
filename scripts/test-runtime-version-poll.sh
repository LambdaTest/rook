#!/usr/bin/env bash
# Regression test for update-formula.yml's "Wait for npm package
# availability" step's runtime-version derivation.
#
# The bug this guards against: @testmuai/rook publishes at $VERSION (the
# CLI's own semver, e.g. "0.1.0"). The @testmuai/rook-node-* runtime
# packages do NOT — they version independently, pinned to a Node.js
# release via scripts/ci/node-runtime.json in the private repo (e.g.
# "24.19.0"). A prior version of this step polled all three packages under
# the same $VERSION; on every real release (where the two never match),
# the two rook-node-* checks would 404 forever and the job would fail
# after a silent 2-minute timeout, long after npm/curl/changelog already
# shipped — Homebrew would never actually get updated.
#
# The fix: wait for @testmuai/rook@$VERSION first, then read the real
# runtime version out of ITS OWN published package.json
# (optionalDependencies["@testmuai/rook-node-<tag>"]), then poll the
# runtime packages under THAT version instead.
#
# Same "extract the real thing, never hand-copy it" discipline as its
# siblings: this test pulls the step body live out of the committed
# workflow file and runs it, with a stub `curl` on PATH standing in for
# the npm registry.
#
# Usage: scripts/test-runtime-version-poll.sh
set -uo pipefail
# (No -e: several cases run the step expecting it to FAIL, and every later
# check must still run on its own merits.)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WF_FILE="$REPO_ROOT/.github/workflows/update-formula.yml"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

if [ ! -f "$WF_FILE" ]; then
  echo "FATAL: $WF_FILE not found" >&2
  exit 2
fi

# step_body FILE STEPNAME: print the run: block belonging to the step
# called STEPNAME, dedented by its own first line's indent, stopped at the
# first line indented less than that.
step_body() {
  awk -v step="- name: $2" '
    index($0, step) { instep = 1; next }
    instep && !inrun && /run:[[:space:]]*[|>]/ { inrun = 1; next }
    inrun {
      if ($0 ~ /^[[:space:]]*$/) { print ""; next }
      match($0, /^ */); ind = RLENGTH
      if (base == 0) base = ind
      if (ind < base) exit
      print substr($0, base + 1)
    }
  ' "$1"
}

BODY="$(step_body "$WF_FILE" "Wait for npm package availability")"
if [ -z "$BODY" ]; then
  echo "FATAL: could not extract 'Wait for npm package availability' step body from $WF_FILE — has the step name changed?" >&2
  exit 2
fi
if ! printf '%s' "$BODY" | grep -q 'optionalDependencies'; then
  echo "FATAL: extracted step body does not reference optionalDependencies — extraction markers are stale, or the fix regressed" >&2
  exit 2
fi

# --- Stub curl -----------------------------------------------------------
# Two call shapes to distinguish:
#   1. Availability check:  curl -s --max-time 10 -o /dev/null -w "%{http_code}" URL
#      -> print a status code to stdout, nothing else (matches real curl -w).
#   2. Metadata fetch:      curl -fsSL URL
#      -> print a fixture JSON body to stdout; exit nonzero on a configured miss.
#
# STATUS_MAP ($WORKDIR/status_map): lines of "pkg|version|code". A pkg/version
# pair not listed defaults to 404 (matches a real unpublished package).
# META_BODY ($WORKDIR/meta_body.json): the package.json to hand back for the
# metadata fetch.
STUB_BIN="$WORKDIR/stub-bin"
mkdir -p "$STUB_BIN"
STATUS_MAP="$WORKDIR/status_map"
META_BODY="$WORKDIR/meta_body.json"
: >"$STATUS_MAP"
: >"$META_BODY"
cat >"$STUB_BIN/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
: "${ROOK_TEST_STATUS_MAP:?}"
: "${ROOK_TEST_META_BODY:?}"

has_w=0
url=""
for arg in "$@"; do
  case "$arg" in
    "%{http_code}") has_w=1 ;;
    https://*) url="$arg" ;;
  esac
done

if [ "$has_w" = "1" ]; then
  # Availability check: last path segment is the version, the rest
  # (after the host) is the package name — correct even though scoped
  # package names contain their own "/", since only the LAST slash
  # separates the version.
  path="${url#https://registry.npmjs.org/}"
  ver="${path##*/}"
  pkg="${path%/*}"
  code=$(awk -F'|' -v p="$pkg" -v v="$ver" '$1==p && $2==v {print $3; found=1} END{if(!found) print "404"}' "$ROOK_TEST_STATUS_MAP")
  printf '%s' "$code"
  exit 0
fi

# Metadata fetch (-fsSL, no -w): fail like a real 404 if the map says so
# for this exact package/version, else hand back the fixture body.
path="${url#https://registry.npmjs.org/}"
ver="${path##*/}"
pkg="${path%/*}"
code=$(awk -F'|' -v p="$pkg" -v v="$ver" '$1==p && $2==v {print $3; found=1} END{if(!found) print "200"}' "$ROOK_TEST_STATUS_MAP")
if [ "$code" != "200" ]; then
  echo "stub-curl: simulated ${code} fetching ${url}" >&2
  exit 22
fi
cat "$ROOK_TEST_META_BODY"
STUB
chmod +x "$STUB_BIN/curl"

run_step() { # run_step VERSION [ENV_OVERRIDE...]
  # "$@" (the optional RETRY_COUNT=/RETRY_SLEEP= overrides) is expanded at
  # runtime, so bash's parse-time prefix-assignment recognition never
  # applies to it — routing it through `env` instead is what actually
  # sets those variables, rather than bash trying to execute
  # "RETRY_COUNT=2" as a program name.
  local version="$1"
  shift
  ( PATH="$STUB_BIN:$PATH" \
    env ROOK_TEST_STATUS_MAP="$STATUS_MAP" \
        ROOK_TEST_META_BODY="$META_BODY" \
        VERSION="$version" \
        "$@" \
        bash --noprofile --norc -e -c "$BODY" ) 2>&1
}

# =============================================================================
# (a) Happy path: CLI version and runtime version genuinely differ
# =============================================================================
cat >"$STATUS_MAP" <<'MAP'
@testmuai/rook|0.1.0|200
@testmuai/rook-node-darwin-arm64|24.19.0|200
@testmuai/rook-node-linux-x64|24.19.0|200
MAP
cat >"$META_BODY" <<'JSON'
{"name":"@testmuai/rook","version":"0.1.0","optionalDependencies":{"@testmuai/rook-node-darwin-arm64":"24.19.0","@testmuai/rook-node-darwin-x64":"24.19.0","@testmuai/rook-node-linux-x64":"24.19.0","@testmuai/rook-node-linux-arm64":"24.19.0","@testmuai/rook-node-win-x64":"24.19.0"}}
JSON
OUT="$(run_step "0.1.0")"
RC=$?
if [ "$RC" = "0" ] && echo "$OUT" | grep -q "Resolved runtime version: 24.19.0"; then
  pass "(a) resolves the real runtime version (24.19.0) when it differs from the CLI version (0.1.0)"
else
  fail "(a) did not resolve the runtime version correctly — output:
$OUT"
fi

# =============================================================================
# (b) Regression: polling the runtime packages under the CLI's own version
# (the original bug) must NOT be what this step does — prove the fixture
# above would have failed under the old, wrong query.
# =============================================================================
if awk -F'|' '$1=="@testmuai/rook-node-darwin-arm64" && $2=="0.1.0"' "$STATUS_MAP" | grep -q .; then
  fail "(b) fixture setup itself is wrong — rook-node-darwin-arm64 must NOT be registered under the CLI version"
else
  pass "(b) fixture is honest: rook-node-darwin-arm64 is only registered under the real runtime version (24.19.0), not the CLI version (0.1.0) — case (a) passing on this fixture is a genuine test of the fix, not an accident of the map matching everything"
fi

# =============================================================================
# (c) optionalDependencies missing the runtime-package key entirely
# =============================================================================
cat >"$STATUS_MAP" <<'MAP'
@testmuai/rook|0.1.0|200
MAP
cat >"$META_BODY" <<'JSON'
{"name":"@testmuai/rook","version":"0.1.0","optionalDependencies":{}}
JSON
OUT="$(run_step "0.1.0")"
RC=$?
if [ "$RC" != "0" ] && echo "$OUT" | grep -q "could not resolve a valid runtime version"; then
  pass "(c) missing optionalDependencies entry is rejected with a clear error, not silently skipped"
else
  fail "(c) missing optionalDependencies entry was not rejected as expected — exit=$RC, output:
$OUT"
fi

# =============================================================================
# (d) optionalDependencies present but malformed (not a plain X.Y.Z)
# =============================================================================
cat >"$META_BODY" <<'JSON'
{"name":"@testmuai/rook","version":"0.1.0","optionalDependencies":{"@testmuai/rook-node-darwin-arm64":"latest"}}
JSON
OUT="$(run_step "0.1.0")"
RC=$?
if [ "$RC" != "0" ] && echo "$OUT" | grep -q "could not resolve a valid runtime version"; then
  pass "(d) a non-semver-ish runtime version ('latest') is rejected, not passed through to the next poll"
else
  fail "(d) malformed runtime version was not rejected as expected — exit=$RC, output:
$OUT"
fi

# =============================================================================
# (e) @testmuai/rook itself never becomes available — must fail closed,
# fast (RETRY_COUNT/RETRY_SLEEP overrides), without ever reaching the
# metadata fetch.
# =============================================================================
: >"$STATUS_MAP"
OUT="$(run_step "0.1.0" RETRY_COUNT=2 RETRY_SLEEP=0)"
RC=$?
if [ "$RC" != "0" ] && echo "$OUT" | grep -q "@testmuai/rook@0.1.0 not visible"; then
  pass "(e) @testmuai/rook never becoming available fails closed with the right message"
else
  fail "(e) unavailable @testmuai/rook did not fail as expected — exit=$RC, output:
$OUT"
fi

# =============================================================================
# (f) @testmuai/rook available, runtime resolves, but a runtime package
# never becomes available — must fail closed, fast.
# =============================================================================
cat >"$STATUS_MAP" <<'MAP'
@testmuai/rook|0.1.0|200
MAP
cat >"$META_BODY" <<'JSON'
{"name":"@testmuai/rook","version":"0.1.0","optionalDependencies":{"@testmuai/rook-node-darwin-arm64":"24.19.0"}}
JSON
OUT="$(run_step "0.1.0" RETRY_COUNT=2 RETRY_SLEEP=0)"
RC=$?
if [ "$RC" != "0" ] && echo "$OUT" | grep -q "@testmuai/rook-node-darwin-arm64@24.19.0 not visible"; then
  pass "(f) a runtime package never publishing fails closed with the right message"
else
  fail "(f) unavailable runtime package did not fail as expected — exit=$RC, output:
$OUT"
fi

echo ""
if [ "$FAIL" = "0" ]; then
  echo "=== runtime-version-poll transform test: PASSED ==="
  exit 0
else
  echo "=== runtime-version-poll transform test: FAILED ==="
  exit 1
fi
