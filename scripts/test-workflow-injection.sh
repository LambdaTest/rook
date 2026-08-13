#!/usr/bin/env bash
# Regression test for shell injection through the version inputs of the
# three release workflows — .github/workflows/update-formula.yml,
# build-bottles.yml and brew-smoke.yml — and for what those steps do with
# a version value once it is safely inert data.
#
# Why this exists. GitHub Actions expands `${{ ... }}` into the run: script
# BEFORE bash ever parses it. A value spliced straight into a run: body
# therefore arrives as shell *syntax*, not as a string: quotes end the
# surrounding quoting, `$(...)` and backticks execute, `;` starts a new
# command. Every one of these workflows' version inputs is attacker-shaped:
# update-formula.yml takes one over a repo_dispatch trust boundary and
# holds contents:write + actions:write on the tap's main branch;
# build-bottles.yml takes one from workflow_dispatch and splices it into
# its guard job BEFORE the guard's own drift comparison can run;
# brew-smoke.yml puts one inside a `case` pattern, which a payload can
# close early. The fix, uniformly, is to route the value through the step's
# `env:` block and reference "$VAR" in the body.
#
# What this harness checks, in the same "extract the real thing, never
# hand-copy it" discipline as its three sibling scripts:
#
#   1. A structural invariant over ALL of the run: bodies in ALL three
#      files: not one of them may contain a `${{ ... }}` expression. This
#      is the check that catches a re-introduced splice at a site nobody
#      thought to write a case for.
#   2. Per-site behaviour: the real step body, extracted live, is executed
#      with a hostile value in the env var it now reads, and must neither
#      execute anything nor accept the value.
#   3. A positive control for each of those: the same extracted body with
#      the env var's *reference* textually replaced by the payload — which
#      is precisely what Actions used to do — must execute the payload. A
#      test that cannot fail proves nothing, and this one demonstrates the
#      vulnerability it is guarding against on every run.
#   4. The ordinary data path still works: valid versions resolve, drifted
#      and malformed ones are rejected with the intended message, and a
#      prerelease root_url is not misread as stale.
#
# Usage: scripts/test-workflow-injection.sh
set -uo pipefail
# (No -e: several cases run a step expecting it to FAIL, and every later
# check must still run on its own merits — same reasoning as
# scripts/test-bottle-insert.sh.)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WF="$REPO_ROOT/.github/workflows"
FIXTURES="$REPO_ROOT/scripts/fixtures"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
check() {
  local ok_msg="$1" fail_msg="$2"
  shift 2
  if "$@"; then pass "$ok_msg"; else fail "$fail_msg"; fi
}
contains() { printf '%s' "$2" | grep -qF -- "$1"; }

for f in update-formula.yml build-bottles.yml brew-smoke.yml; do
  if [ ! -f "$WF/$f" ]; then
    echo "FATAL: $WF/$f not found" >&2
    exit 2
  fi
done

# =============================================================================
# Helpers
# =============================================================================

# run_body_lines FILE: print every line that lives inside a `run:` block
# scalar, prefixed with its line number. Handles both `run: |` under a
# named step and the bare `- run: |` form brew-smoke.yml uses. A block ends
# at the first non-blank line indented less than the block's first line.
run_body_lines() {
  awk '
    function is_block_run(l) { return l ~ /^[[:space:]]*(- )?run:[[:space:]]*[|>][-+]?[[:space:]]*$/ }
    {
      if (inrun) {
        if ($0 ~ /^[[:space:]]*$/) next
        match($0, /^ */); ind = RLENGTH
        if (base == 0) base = ind
        if (ind >= base) { print FILENAME ":" NR ":" $0; next }
        inrun = 0
      }
      if (is_block_run($0)) { inrun = 1; base = 0; next }
      # A single-line `run: something` is just as injectable as a block.
      if ($0 ~ /^[[:space:]]*(- )?run:[[:space:]]*[^|>[:space:]]/) print FILENAME ":" NR ":" $0
    }
  ' "$1"
}

# step_body FILE STEPNAME [OCCURRENCE]: print the run: block belonging to
# the OCCURRENCE'th step called STEPNAME, dedented by its own first line's
# indent and stopped at the first line indented less than that (so a
# following step, or a YAML comment above it, cannot leak in).
step_body() {
  awk -v step="- name: $2" -v want="${3:-1}" '
    index($0, step) { n++; if (n == want) instep = 1; next }
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

# splice BODY VAR VALUE: rebuild the pre-fix, vulnerable form of a step by
# replacing the env var's *reference* with VALUE, exactly as the Actions
# runner replaced `${{ ... }}` with it. Used only for positive controls.
splice() {
  local body="$1" var="$2" value="$3"
  body="${body//\$\{$var\}/$value}"
  body="${body//\$$var/$value}"
  printf '%s' "$body"
}

# GitHub runs `run:` bodies with `bash --noprofile --norc -eo pipefail`.
# Reproduce that exactly — `-e` and `pipefail` change which failures abort.
run_step() { # run_step CWD SCRIPT [VAR=VAL ...]
  local cwd="$1" script="$2"
  shift 2
  ( cd "$cwd" && env "$@" GITHUB_OUTPUT="$WORKDIR/github_output" \
      bash --noprofile --norc -eo pipefail -c "$script" ) 2>&1
}

MARK="$WORKDIR/PWNED"
marker_absent() { [ ! -e "$MARK" ]; }
reset_marker() { rm -f "$MARK"; }

# The payload corpus. `a`/`b` are the two shapes that reach a command in
# any double-quoted context; `c` escapes a `case` pattern list; `d`/`e` are
# the plain metacharacter and newline shapes; the last two are the empty
# and blank inputs from the standing hostile-input corpus, which are not
# injections but are the other way a version field goes wrong.
declare -a PAYLOAD_KEYS=(cmdsub backtick quotebreak caseescape semicolon andand newline empty blank)
# shellcheck disable=SC2016  # the un-expanded shell syntax IS the payload
payload() {
  case "$1" in
    cmdsub)     printf '$(touch %s)' "$MARK" ;;
    backtick)   printf '`touch %s`' "$MARK" ;;
    quotebreak) printf '"; touch %s; [ -n "x' "$MARK" ;;
    caseescape) printf 'x"*) ;; *) touch %s ;; esac #' "$MARK" ;;
    semicolon)  printf '0.1.0; touch %s' "$MARK" ;;
    andand)     printf '0.1.0 && touch %s' "$MARK" ;;
    newline)    printf '0.1.0\ntouch %s' "$MARK" ;;
    empty)      printf '' ;;
    blank)      printf '   ' ;;
  esac
}

# =============================================================================
# 1. Structural invariant: no ${{ }} anywhere inside any run: body
# =============================================================================
SPLICES=""
for f in update-formula.yml build-bottles.yml brew-smoke.yml; do
  # shellcheck disable=SC2016  # the literal Actions sigil is what we hunt for
  hits="$(run_body_lines "$WF/$f" | grep -F -- '${{' || true)"
  if [ -n "$hits" ]; then
    SPLICES="${SPLICES}${hits}"$'\n'
  fi
done
if [ -n "$SPLICES" ]; then
  fail "(1) a run: body contains a \${{ ... }} expression — Actions expands those before bash parses the script, so the value becomes live shell syntax. Route it through the step's env: block:
$SPLICES"
else
  pass "(1) no run: body in any of the 3 workflows contains a \${{ ... }} expression"
fi

# Sanity-check the scanner itself against a synthetic offender: a scanner
# that matches nothing is a green light that checks nothing.
cat >"$WORKDIR/offender.yml" <<'YML'
jobs:
  a:
    steps:
      - name: block form
        run: |
          echo "${{ inputs.version }}"
      - run: echo "${{ inputs.version }}"
YML
# shellcheck disable=SC2016  # the literal Actions sigil is what we hunt for
OFFENDER_HITS="$(run_body_lines "$WORKDIR/offender.yml" | grep -cF -- '${{' || true)"
check "(1) the scanner finds both splice shapes in a synthetic offender (block and single-line)" \
      "(1) the scanner missed a splice in the synthetic offender (found $OFFENDER_HITS of 2) — it would not catch a real one either" \
      [ "$OFFENDER_HITS" -eq 2 ]

# =============================================================================
# 2/3. update-formula.yml — "Determine version"
# =============================================================================
UF_BODY="$(step_body "$WF/update-formula.yml" "Determine version")"
if ! contains "INPUT_VERSION" "$UF_BODY"; then
  echo "FATAL: could not extract 'Determine version' from update-formula.yml (or it no longer reads INPUT_VERSION)" >&2
  exit 2
fi

for key in "${PAYLOAD_KEYS[@]}"; do
  p="$(payload "$key")"
  reset_marker
  OUT="$(run_step "$WORKDIR" "$UF_BODY" INPUT_VERSION="$p" DISPATCH_VERSION="")"
  RC=$?
  check "(2/uf/$key) hostile value executed nothing" \
        "(2/uf/$key) THE PAYLOAD RAN — update-formula.yml's Determine version step executed an injected command. output:
$OUT" \
        marker_absent
  check "(2/uf/$key) hostile value rejected (exit $RC)" \
        "(2/uf/$key) hostile value was accepted (exit $RC) — output:
$OUT" \
        [ "$RC" -ne 0 ]
  check "(2/uf/$key) rejection names the version as the problem" \
        "(2/uf/$key) rejection message doesn't name the version — got: $OUT" \
        contains "not a valid semver-ish string" "$OUT"
done

# Positive control: the pre-fix shape must execute the payload.
for key in cmdsub quotebreak; do
  p="$(payload "$key")"
  reset_marker
  VULN="$(splice "$UF_BODY" INPUT_VERSION "$p")"
  run_step "$WORKDIR" "$VULN" DISPATCH_VERSION="" >/dev/null 2>&1
  check "(3/uf/$key) positive control: the pre-fix spliced form DOES execute the payload" \
        "(3/uf/$key) positive control failed — the payload did not run even when spliced, so case (2/uf/$key) proves nothing" \
        [ -e "$MARK" ]
done
reset_marker

# Data path: a valid version from either source resolves.
OUT="$(run_step "$WORKDIR" "$UF_BODY" INPUT_VERSION="0.1.0" DISPATCH_VERSION="")"
check "(4/uf) a valid workflow_dispatch version is accepted" \
      "(4/uf) a valid workflow_dispatch version was rejected — $OUT" \
      contains "version=0.1.0" "$(cat "$WORKDIR/github_output")"
: >"$WORKDIR/github_output"
OUT="$(run_step "$WORKDIR" "$UF_BODY" INPUT_VERSION="" DISPATCH_VERSION="1.2.3-beta.1")"
check "(4/uf) a valid prerelease from repository_dispatch is accepted" \
      "(4/uf) a valid prerelease from repository_dispatch was rejected — $OUT" \
      contains "version=1.2.3-beta.1" "$(cat "$WORKDIR/github_output")"

# =============================================================================
# 2/3. build-bottles.yml — guard / "Resolve version"
# =============================================================================
BB_BODY="$(step_body "$WF/build-bottles.yml" "Resolve version")"
if ! contains "INPUT_VERSION" "$BB_BODY"; then
  echo "FATAL: could not extract 'Resolve version' from build-bottles.yml (or it no longer reads INPUT_VERSION)" >&2
  exit 2
fi

# A checkout stand-in: the guard reads Formula/rook.rb out of the workspace.
GUARD="$WORKDIR/guard"
mkdir -p "$GUARD/Formula"
cp "$FIXTURES/rook-formula-with-bottle.rb" "$GUARD/Formula/rook.rb"

for key in "${PAYLOAD_KEYS[@]}"; do
  [ "$key" = "empty" ] && continue   # blank input is the documented "use the formula's own version" path
  p="$(payload "$key")"
  reset_marker
  OUT="$(run_step "$GUARD" "$BB_BODY" INPUT_VERSION="$p")"
  RC=$?
  check "(2/bb/$key) hostile value executed nothing" \
        "(2/bb/$key) THE PAYLOAD RAN — build-bottles.yml's guard executed an injected command BEFORE its own drift check could matter. output:
$OUT" \
        marker_absent
  check "(2/bb/$key) hostile value rejected (exit $RC)" \
        "(2/bb/$key) hostile value was accepted (exit $RC) — output:
$OUT" \
        [ "$RC" -ne 0 ]
done

# cmdsub/backtick rather than quotebreak here: the quote-break shape has to
# re-satisfy whatever syntax surrounds the splice point, and this step's
# first use of the value is inside `[[ ... =~ ... ]]`, where an unbalanced
# quote is a parse error before anything runs. The command-substitution
# shapes need no such tailoring — they execute in any double-quoted
# context, which is what makes them the realistic payload.
for key in cmdsub backtick; do
  p="$(payload "$key")"
  reset_marker
  VULN="$(splice "$BB_BODY" INPUT_VERSION "$p")"
  run_step "$GUARD" "$VULN" >/dev/null 2>&1
  check "(3/bb/$key) positive control: the pre-fix spliced form DOES execute the payload" \
        "(3/bb/$key) positive control failed — the payload did not run even when spliced, so case (2/bb/$key) proves nothing" \
        [ -e "$MARK" ]
done
reset_marker

# Data path.
: >"$WORKDIR/github_output"
OUT="$(run_step "$GUARD" "$BB_BODY" INPUT_VERSION="")"
check "(4/bb) blank input falls back to the formula's own version" \
      "(4/bb) blank input did not resolve to the formula's version — $OUT" \
      contains "version=0.1.0" "$(cat "$WORKDIR/github_output")"

OUT="$(run_step "$GUARD" "$BB_BODY" INPUT_VERSION="0.2.0")"
RC=$?
check "(4/bb) an input that disagrees with the formula is rejected" \
      "(4/bb) version drift was not rejected (exit $RC) — $OUT" \
      [ "$RC" -ne 0 ]
check "(4/bb) the drift rejection says so" \
      "(4/bb) the drift rejection didn't name the formula version — $OUT" \
      contains "but Formula/rook.rb on main is" "$OUT"

# F12: a prerelease re-run. The stale-root guard used to match only
# `rook-<x.y.z>`, so a root_url of rook-0.2.0-beta.1 was read as
# "rook-0.2.0", compared against the correct current version, and reported
# as a stale bottle block on a perfectly legitimate re-run.
PRE="$WORKDIR/guard-prerelease"
mkdir -p "$PRE/Formula"
sed -e 's/version "0\.1\.0"/version "0.2.0-beta.1"/' \
    -e 's|download/rook-0\.1\.0|download/rook-0.2.0-beta.1|' \
    "$FIXTURES/rook-formula-with-bottle.rb" >"$PRE/Formula/rook.rb"
: >"$WORKDIR/github_output"
OUT="$(run_step "$PRE" "$BB_BODY" INPUT_VERSION="0.2.0-beta.1")"
RC=$?
check "(4/bb) a prerelease re-run is not misread as a stale bottle block" \
      "(4/bb) a prerelease root_url was reported stale (exit $RC) — $OUT" \
      [ "$RC" -eq 0 ]
check "(4/bb) the prerelease version is what gets published" \
      "(4/bb) the prerelease version did not reach GITHUB_OUTPUT — $(cat "$WORKDIR/github_output")" \
      contains "version=0.2.0-beta.1" "$(cat "$WORKDIR/github_output")"

# ... and a genuinely stale block is still caught (positive control for the
# widened regex: it must not have widened into matching everything).
STALE="$WORKDIR/guard-stale"
mkdir -p "$STALE/Formula"
sed -e 's/version "0\.1\.0"/version "0.2.0"/' \
    "$FIXTURES/rook-formula-with-bottle.rb" >"$STALE/Formula/rook.rb"
OUT="$(run_step "$STALE" "$BB_BODY" INPUT_VERSION="0.2.0")"
RC=$?
check "(4/bb) a genuinely stale bottle block is still caught" \
      "(4/bb) a stale bottle block was NOT caught (exit $RC) — the widened regex matches too much. output:
$OUT" \
      [ "$RC" -ne 0 ]
check "(4/bb) the stale-block rejection names the stale tag" \
      "(4/bb) the stale-block rejection didn't name the stale tag — $OUT" \
      contains "stale bottle block referencing rook-0.1.0" "$OUT"

# =============================================================================
# 2/3. brew-smoke.yml — "Check installed version", both jobs
# =============================================================================
BS_BODY="$(step_body "$WF/brew-smoke.yml" "Check installed version" 1)"
BS_BODY2="$(step_body "$WF/brew-smoke.yml" "Check installed version" 2)"
if ! contains "EXPECTED_VERSION" "$BS_BODY"; then
  echo "FATAL: could not extract 'Check installed version' from brew-smoke.yml (or it no longer reads EXPECTED_VERSION)" >&2
  exit 2
fi
check "(2/bs) both jobs' version checks are byte-identical" \
      "(2/bs) the macos-arm and linux-x64 version checks have drifted apart — only the first is covered below" \
      [ "$BS_BODY" = "$BS_BODY2" ]

# `rook` stands in for the installed CLI: the step under test is the
# comparison, not the install.
SMOKE_BIN="$WORKDIR/smoke-bin"
mkdir -p "$SMOKE_BIN"
printf '#!/usr/bin/env bash\necho "rook 0.1.0"\n' >"$SMOKE_BIN/rook"
chmod +x "$SMOKE_BIN/rook"

for key in "${PAYLOAD_KEYS[@]}"; do
  p="$(payload "$key")"
  reset_marker
  OUT="$(run_step "$WORKDIR" "$BS_BODY" PATH="$SMOKE_BIN:$PATH" EXPECTED_VERSION="$p")"
  RC=$?
  check "(2/bs/$key) hostile value executed nothing" \
        "(2/bs/$key) THE PAYLOAD RAN — brew-smoke.yml's case pattern executed an injected command. output:
$OUT" \
        marker_absent
  # empty/blank legitimately substring-match anything, so they are the one
  # pair that may pass the comparison; every other payload must not.
  if [ "$key" != "empty" ] && [ "$key" != "blank" ]; then
    check "(2/bs/$key) hostile value did not satisfy the version check (exit $RC)" \
          "(2/bs/$key) hostile value satisfied the version check (exit $RC) — $OUT" \
          [ "$RC" -ne 0 ]
  fi
done

for key in cmdsub caseescape; do
  p="$(payload "$key")"
  reset_marker
  VULN="$(splice "$BS_BODY" EXPECTED_VERSION "$p")"
  run_step "$WORKDIR" "$VULN" PATH="$SMOKE_BIN:$PATH" >/dev/null 2>&1
  check "(3/bs/$key) positive control: the pre-fix spliced form DOES execute the payload" \
        "(3/bs/$key) positive control failed — the payload did not run even when spliced, so case (2/bs/$key) proves nothing" \
        [ -e "$MARK" ]
done
reset_marker

OUT="$(run_step "$WORKDIR" "$BS_BODY" PATH="$SMOKE_BIN:$PATH" EXPECTED_VERSION="0.1.0")"
RC=$?
check "(4/bs) the matching version passes the check" \
      "(4/bs) the matching version failed the check (exit $RC) — $OUT" \
      [ "$RC" -eq 0 ]

echo
if [ "$FAIL" -ne 0 ]; then
  echo "=== workflow-injection test: FAILED ==="
  exit 1
fi
echo "=== workflow-injection test: PASSED ==="
