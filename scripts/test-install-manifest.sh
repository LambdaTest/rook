#!/usr/bin/env bash
# install-manifest.json: what install.sh records about its own install, so
# `rook update` can re-run this installer the same way later instead of
# guessing from the running binary's path.
#
# Runs the REAL, unmodified install.sh against a synthetic release, the same
# way scripts/test-install-fixture.sh does — a stub `curl` earlier on PATH
# serves fixture files by basename, so install.sh's actual download →
# verify → extract → symlink pipeline runs and only the network transport is
# faked. $HOME and --dir point at a scratch directory, so nothing here ever
# touches the real machine's ~/.testmuai or ~/.local/bin.
#
# Two things this harness does deliberately differently from
# test-install-fixture.sh, both because that file's conventions would hide
# the defects this one exists to catch:
#
#   1. It does NOT always pass --dir, and does NOT pre-create the install
#      directory. Every case in test-install-fixture.sh does both
#      (:168,222,308,335,379). A resolution step written to run at argument
#      -parse time passes all of those and still breaks a fresh
#      `curl ... | bash`, where ~/.local/bin does not exist yet and `cd` into
#      it fails under `set -euo pipefail`. Case A is that install.
#
#   2. Its fixture tarball carries lib/node_modules/@lambdatestincprivate/rook,
#      the scope a REAL public tarball has (the npm rename applies only to the
#      published package, not to the tarball). test-install-fixture.sh uses
#      @testmuai/rook, which is fine for what that file asserts but is the
#      wrong side of the discriminator `rook update` uses to tell a curl
#      install from an npm one.
#
# Usage: scripts/test-install-manifest.sh
# shellcheck disable=SC1090  # install.sh is sourced via a computed path below
set -uo pipefail
# (Deliberately no -e: several checks run install.sh expecting it to FAIL,
# and every check after that must still run and report on its own merits.)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SH="$REPO_ROOT/install.sh"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# install.sh records the PHYSICAL path (`pwd -P`), so every expectation below
# has to be physical too. On macOS $TMPDIR lives behind /private, and
# comparing against the unresolved form fails on macOS while passing on Linux
# — a harness that is green in CI and red on the maintainer's laptop.
WORKDIR_REAL="$(cd "$WORKDIR" && pwd -P)"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
check() {
  local ok_msg="$1" fail_msg="$2"
  shift 2
  if "$@"; then pass "$ok_msg"; else fail "$fail_msg"; fi
}

if [ ! -f "$INSTALL_SH" ]; then
  echo "FATAL: $INSTALL_SH not found" >&2
  exit 2
fi

CHECKSUM_TOOL="sha256sum"
command -v sha256sum >/dev/null 2>&1 || CHECKSUM_TOOL="shasum"
checksum_of() {
  if [ "$CHECKSUM_TOOL" = "sha256sum" ]; then sha256sum "$1"; else shasum -a 256 "$1"; fi
}

# manifest_field FILE KEY: prints one field of the manifest, parsed as real
# JSON rather than grepped. The point of case D is that the file is still
# PARSEABLE when the install path contains a quote; a grep would report the
# bytes are present while the document is malformed, which is the exact
# failure it is looking for. Prints nothing and returns 1 on unparseable
# JSON, so `check` sees a failure rather than an empty string that happens
# to compare equal to another empty string.
manifest_field() {
  python3 -c '
import json,sys
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        print(json.load(fh)[sys.argv[2]])
except Exception:
    sys.exit(1)
' "$1" "$2"
}

# manifest_parses FILE: the parseability predicate on its own, without
# printing the field. `check` takes a command and shows nothing of its stdout,
# so calling manifest_field directly leaked the value into the report.
manifest_parses() { manifest_field "$1" installDir >/dev/null; }

# --- Build the stub curl -----------------------------------------------
# Same seam as test-install-fixture.sh: serves fixture files by the
# requested URL's basename, ignoring scheme/host. Exits 22 (curl -f's real
# "HTTP error" code) with no output file on a miss, so a fixture gap fails
# the way a real 404 would rather than silently.
STUB_BIN="$WORKDIR/stub-bin"
mkdir -p "$STUB_BIN"
cat >"$STUB_BIN/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
: "${ROOK_TEST_FIXTURE_DIR:?ROOK_TEST_FIXTURE_DIR not set}"
outfile=""
url=""
next_is_outfile=0
for arg in "$@"; do
  if [ "$next_is_outfile" = "1" ]; then
    outfile="$arg"
    next_is_outfile=0
    continue
  fi
  case "$arg" in
    -o) next_is_outfile=1 ;;
    -*) : ;;
    *) url="$arg" ;;
  esac
done
src="${ROOK_TEST_FIXTURE_DIR}/$(basename "$url")"
if [ ! -f "$src" ]; then
  echo "stub-curl: no fixture for $(basename "$url") (url=$url)" >&2
  exit 22
fi
cp "$src" "$outfile"
STUB
chmod +x "$STUB_BIN/curl"

# --- This host's platform tag, via install.sh's own detect_platform() ----
PLATFORM="$(
  os="$(uname -s)" arch="$(uname -m)"
  ( set --; source "$INSTALL_SH" >/dev/null 2>&1; detect_platform "$os" "$arch" )
)"
if [ -z "$PLATFORM" ]; then
  echo "FATAL: could not determine this host's platform tag via install.sh's own detect_platform() — is this host unsupported ($(uname -s)/$(uname -m))?" >&2
  exit 2
fi
echo "Building fixture for detected platform: $PLATFORM"

# --- Build the fixture tarball ------------------------------------------
VERSION="9.9.9-fixture"
ASSET="rook-${VERSION}-${PLATFORM}.tar.gz"
CHECKSUM_ASSET="${ASSET}.sha256"

STAGE="$WORKDIR/stage"
# The real tarball's internal scope — NOT @testmuai. See the header.
PKG_ROOT="$STAGE/package"
PAYLOAD="$PKG_ROOT/lib/node_modules/@lambdatestincprivate/rook"
mkdir -p "$PKG_ROOT/bin" "$PAYLOAD"
cat >"$PKG_ROOT/bin/rook" <<EOF
#!/usr/bin/env bash
# Fixture launcher — stands in for the real bundled-Node bin/rook.
if [ "\${1:-}" = "--version" ]; then
  echo "${VERSION}"
  exit 0
fi
echo "rook fixture launcher: unsupported arg \${1:-}" >&2
exit 1
EOF
chmod +x "$PKG_ROOT/bin/rook"
echo "{\"name\":\"@lambdatestincprivate/rook\",\"version\":\"${VERSION}\"}" \
  >"$PAYLOAD/package.json"
# The real tarball carries VERSION at its root (cli-build.yml writes it), and
# `rook update` reads that file to confirm an update actually landed. A
# fixture without it would let a confirmation step that reads the wrong path
# pass here and fail on every real install.
echo "$VERSION" >"$PKG_ROOT/VERSION"

FIXTURE_DIR="$WORKDIR/fixtures"
mkdir -p "$FIXTURE_DIR"
tar -C "$STAGE" -czf "$FIXTURE_DIR/$ASSET" "package"
( cd "$FIXTURE_DIR" && checksum_of "$ASSET" >"$CHECKSUM_ASSET" )

# --- Run the REAL install.sh against the fixture, sandboxed -------------
# Unlike test-install-fixture.sh's helper, --dir is NOT baked in: callers
# pass it (or do not) so the default path is reachable. See header, note 1.
run_install() {
  local fake_home="$1"
  shift
  env -i \
    HOME="$fake_home" \
    PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
    ROOK_TEST_FIXTURE_DIR="$FIXTURE_DIR" \
    bash "$INSTALL_SH" --version "$VERSION" "$@"
}

manifest_path() { echo "${1}/.testmuai/rook-${VERSION}/install-manifest.json"; }

# =============================================================================
# Case A: no --dir, and the default directory does not exist.
#
# This is a fresh machine running the documented `curl ... | bash`. It is the
# case every existing harness misses, because they all pass --dir and all
# mkdir it first.
# =============================================================================
HOME_A="$WORKDIR/home-a"
mkdir -p "$HOME_A"   # the HOME exists; ~/.local/bin deliberately does not

OUT_A="$(run_install "$HOME_A" 2>&1)"; RC_A=$?

check "(a) fresh install with no --dir exited 0" \
      "(a) fresh install with no --dir exited $RC_A — a default directory that does not exist yet must not fail the install. Output:
$OUT_A" \
      [ "$RC_A" -eq 0 ]

check "(a) symlink created in the default ~/.local/bin" \
      "(a) no symlink at ${HOME_A}/.local/bin/rook" \
      [ -L "${HOME_A}/.local/bin/rook" ]

MAN_A="$(manifest_path "$HOME_A")"
check "(a) manifest written" \
      "(a) no manifest at $MAN_A" \
      [ -f "$MAN_A" ]

check "(a) manifest records the absolute default install dir" \
      "(a) manifest installDir is '$(manifest_field "$MAN_A" installDir 2>/dev/null)', expected '${WORKDIR_REAL}/home-a/.local/bin'" \
      [ "$(manifest_field "$MAN_A" installDir)" = "${WORKDIR_REAL}/home-a/.local/bin" ]

check "(a) manifest records channel=curl" \
      "(a) manifest channel is '$(manifest_field "$MAN_A" channel 2>/dev/null)', expected 'curl'" \
      [ "$(manifest_field "$MAN_A" channel)" = "curl" ]

check "(a) manifest records the installed version" \
      "(a) manifest version is '$(manifest_field "$MAN_A" version 2>/dev/null)', expected '${VERSION}'" \
      [ "$(manifest_field "$MAN_A" version)" = "$VERSION" ]

check "(a) manifest records schema v1" \
      "(a) manifest v is '$(manifest_field "$MAN_A" v 2>/dev/null)', expected '1'" \
      [ "$(manifest_field "$MAN_A" v)" = "1" ]

# =============================================================================
# Case B: explicit --dir, also not pre-created.
# =============================================================================
HOME_B="$WORKDIR/home-b"
DIR_B="$WORKDIR/bin-b"       # deliberately NOT created
mkdir -p "$HOME_B"

OUT_B="$(run_install "$HOME_B" --dir "$DIR_B" 2>&1)"; RC_B=$?

check "(b) --dir pointing at a directory that does not exist yet exited 0" \
      "(b) exited $RC_B. Output:
$OUT_B" \
      [ "$RC_B" -eq 0 ]

MAN_B="$(manifest_path "$HOME_B")"
check "(b) manifest records the --dir that was used" \
      "(b) manifest installDir is '$(manifest_field "$MAN_B" installDir 2>/dev/null)', expected '${WORKDIR_REAL}/bin-b'" \
      [ "$(manifest_field "$MAN_B" installDir)" = "${WORKDIR_REAL}/bin-b" ]

# =============================================================================
# Case C: a RELATIVE --dir must be recorded as an absolute path.
#
# `rook update` reads this from a different process with a different working
# directory, where "mybin" names nothing. Recorded relative, the reader
# discards the manifest as invalid and that install silently never updates.
# =============================================================================
HOME_C="$WORKDIR/home-c"
mkdir -p "$HOME_C"
CWD_C="$WORKDIR/cwd-c"
mkdir -p "$CWD_C"

OUT_C="$(cd "$CWD_C" && run_install "$HOME_C" --dir "mybin" 2>&1)"; RC_C=$?

check "(c) relative --dir exited 0" \
      "(c) exited $RC_C. Output:
$OUT_C" \
      [ "$RC_C" -eq 0 ]

MAN_C="$(manifest_path "$HOME_C")"
INSTALLDIR_C="$(manifest_field "$MAN_C" installDir 2>/dev/null || true)"

check "(c) a relative --dir is recorded as an absolute path" \
      "(c) manifest installDir is '$INSTALLDIR_C' — a relative path is unusable to the process that reads it later" \
      [ "${INSTALLDIR_C:0:1}" = "/" ]

# Positive control for the check above: assert it resolved to the RIGHT
# absolute path, not merely to something starting with a slash. `pwd -P` on
# the temp dir because macOS puts $TMPDIR behind /private.
CWD_C_REAL="$(cd "$CWD_C" && pwd -P)"
check "(c) the recorded absolute path is the one that was actually used" \
      "(c) manifest installDir is '$INSTALLDIR_C', expected '${CWD_C_REAL}/mybin'" \
      [ "$INSTALLDIR_C" = "${CWD_C_REAL}/mybin" ]

check "(c) the symlink really is at that relative-turned-absolute path" \
      "(c) no symlink at ${CWD_C_REAL}/mybin/rook" \
      [ -L "${CWD_C_REAL}/mybin/rook" ]

# =============================================================================
# Case D: a double quote in the install path must not corrupt the record.
#
# install.sh is bash with no JSON encoder. Unescaped, this writes a document
# that will not parse, the reader treats it as absent, and that install prints
# forever with no error anywhere.
# =============================================================================
HOME_D="$WORKDIR/home-d"
mkdir -p "$HOME_D"
DIR_D="$WORKDIR/bin-d\"quote"

OUT_D="$(run_install "$HOME_D" --dir "$DIR_D" 2>&1)"; RC_D=$?

check "(d) a quote in --dir did not break the install" \
      "(d) exited $RC_D. Output:
$OUT_D" \
      [ "$RC_D" -eq 0 ]

MAN_D="$(manifest_path "$HOME_D")"
check "(d) the manifest is still parseable JSON with a quote in the path" \
      "(d) manifest at $MAN_D does not parse as JSON — the install path was interpolated unescaped" \
      manifest_parses "$MAN_D"

check "(d) the quoted path round-trips through the manifest exactly" \
      "(d) manifest installDir is '$(manifest_field "$MAN_D" installDir 2>/dev/null)', expected '${WORKDIR_REAL}/bin-d\"quote'" \
      [ "$(manifest_field "$MAN_D" installDir)" = "${WORKDIR_REAL}/bin-d\"quote" ]

# =============================================================================
# Case E: a control character in --dir is refused, before anything is written.
#
# Escaping these correctly is more machinery than a real install path
# justifies; refusing is the stated contract. The positive control is cases
# B/C — the same shape of path without the control character installs fine —
# so this asserts a refusal, not merely that install.sh can fail.
# =============================================================================
HOME_E="$WORKDIR/home-e"
mkdir -p "$HOME_E"
DIR_E="$(printf '%s/bin-e\ttab' "$WORKDIR")"

OUT_E="$(run_install "$HOME_E" --dir "$DIR_E" 2>&1)"; RC_E=$?

check "(e) a control character in --dir is refused" \
      "(e) exited 0 — a path containing a tab must be refused, not recorded. Output:
$OUT_E" \
      [ "$RC_E" -ne 0 ]

check "(e) the refusal names what is wrong" \
      "(e) refusal message did not mention control characters. Output:
$OUT_E" \
      grep -qi 'control character' <<<"$OUT_E"

check "(e) nothing was installed for the refused path" \
      "(e) an install tree exists under ${HOME_E}/.testmuai despite the refusal" \
      [ ! -d "${HOME_E}/.testmuai" ]

# =============================================================================
# Case F: the manifest is written after the symlink, not before.
#
# Ordering matters in one direction: written first, a manifest survives a
# failed `ln` and describes an install nothing can run. Asserted structurally
# — install.sh's own source order — because provoking a real `ln` failure
# needs a directory that is writable enough to mkdir and not enough to
# symlink into, which is not portable across the platforms this runs on.
# =============================================================================
LN_LINE="$(grep -n 'ln -sf' "$INSTALL_SH" | head -1 | cut -d: -f1)"
# The manifest becomes visible at the atomic rename into place (install.sh
# writes to a temp file first, then `mv`s it — see its own comment on why),
# not at the temp-file write that precedes it. A bare 'install-manifest.json'
# substring match would also hit the header comment and the warning-echo
# line, so match the rename statement specifically instead.
# shellcheck disable=SC2016  # the literal '$manifest_tmp' is the grep target, not meant to expand
MANIFEST_LINE="$(grep -Fn 'mv "$manifest_tmp"' "$INSTALL_SH" | head -1 | cut -d: -f1)"

check "(f) the manifest write comes after the symlink in install.sh (ln:${LN_LINE}, manifest:${MANIFEST_LINE})" \
      "(f) install.sh writes install-manifest.json at line ${MANIFEST_LINE}, before the ln -sf at line ${LN_LINE} — a manifest must not outlive a failed symlink" \
      [ "$MANIFEST_LINE" -gt "$LN_LINE" ]

# =============================================================================
# Case G: a control character introduced BY resolving --dir (not present in
# the raw --dir argument itself) must still be refused — defense in depth
# for the pre-resolution guard Case E already covers, which only ever sees
# the raw value.
#
# A relative --dir with no control character of its own, run from a working
# directory whose OWN name contains one, folds the control character in at
# `pwd -P` resolution time. The pre-resolution guard cannot see this; only a
# guard run AFTER resolution can.
# =============================================================================
HOME_G="$WORKDIR/home-g"
mkdir -p "$HOME_G"
CWD_G="$(printf '%s/cwd-g\ttab' "$WORKDIR")"
mkdir -p "$CWD_G"

OUT_G="$(cd "$CWD_G" && run_install "$HOME_G" --dir "mybin" 2>&1)"; RC_G=$?

check "(g) a control character introduced by resolving a relative --dir is refused" \
      "(g) exited 0 — a resolved path containing a tab (from the CWD) must be refused, not recorded. Output:
$OUT_G" \
      [ "$RC_G" -ne 0 ]

check "(g) the refusal names what is wrong" \
      "(g) refusal message did not mention control characters. Output:
$OUT_G" \
      grep -qi 'control character' <<<"$OUT_G"

check "(g) nothing was installed for the refused resolved path" \
      "(g) an install tree exists under ${HOME_G}/.testmuai despite the refusal" \
      [ ! -d "${HOME_G}/.testmuai" ]

# =============================================================================
# Case H: a control character in --version is refused, before anything is
# written — the same contract Case E enforces for --dir, extended to the
# version string that flows into the same hand-rolled JSON.
# =============================================================================
HOME_H="$WORKDIR/home-h"
mkdir -p "$HOME_H"
VERSION_H="$(printf '9.9.9\tfixture')"

OUT_H="$(run_install "$HOME_H" --version "$VERSION_H" 2>&1)"; RC_H=$?

check "(h) a control character in --version is refused" \
      "(h) exited 0 — a version containing a tab must be refused, not recorded. Output:
$OUT_H" \
      [ "$RC_H" -ne 0 ]

check "(h) the refusal names what is wrong" \
      "(h) refusal message did not mention control characters. Output:
$OUT_H" \
      grep -qi 'control character' <<<"$OUT_H"

check "(h) nothing was installed for the refused version" \
      "(h) an install tree exists under ${HOME_H}/.testmuai despite the refusal" \
      [ ! -d "${HOME_H}/.testmuai" ]

# =============================================================================
# Case I: a --dir containing a byte sequence that is not valid UTF-8 is
# refused, before anything is written. RFC 8259 requires the manifest's JSON
# text be valid UTF-8; this catches what the control-character guard alone
# does not — 0xFF is not an ASCII control byte, so Case E's guard would let
# it through, but iconv rejects it as invalid UTF-8. Refused before the
# install directory is ever created (see install.sh's own ordering), so no
# filesystem support for storing the bad byte sequence in a real filename is
# needed for this test.
# =============================================================================
if command -v iconv >/dev/null 2>&1; then
  HOME_I="$WORKDIR/home-i"
  mkdir -p "$HOME_I"
  DIR_I="$(printf '%s/bin-i\xffinvalid' "$WORKDIR")"

  OUT_I="$(run_install "$HOME_I" --dir "$DIR_I" 2>&1)"; RC_I=$?

  check "(i) a --dir with an invalid UTF-8 byte is refused" \
        "(i) exited 0 — a --dir containing an invalid UTF-8 byte must be refused, not recorded. Output:
$OUT_I" \
        [ "$RC_I" -ne 0 ]

  check "(i) the refusal names what is wrong" \
        "(i) refusal message did not mention UTF-8. Output:
$OUT_I" \
        grep -qi 'utf-8' <<<"$OUT_I"

  check "(i) nothing was installed for the refused path" \
        "(i) an install tree exists under ${HOME_I}/.testmuai despite the refusal" \
        [ ! -d "${HOME_I}/.testmuai" ]
else
  echo "SKIP: (i) iconv not on PATH — install.sh's UTF-8 guard is a no-op here too, nothing to assert"
fi

# =============================================================================
if [ "$FAIL" -ne 0 ]; then
  echo
  echo "install-manifest harness FAILED"
  exit 1
fi
echo
echo "install-manifest harness passed"
