#!/usr/bin/env bash
# Synthetic end-to-end dry run for install.sh, standing in for the real
# dry run install.sh's own header/brief describes (download a real
# published release, strip node from PATH, confirm `rook --version` still
# runs). That real dry run is NOT possible yet: no `LambdaTest/rook`
# release exists (blocked on LambdatestIncPrivate/rook#349's fix actually
# producing one) — this script is what stands in for it until then, and
# should be re-run for real, against a real release, the first time one
# exists.
#
# It builds a fake local "release": a tarball shaped exactly like a real
# per-platform asset (bin/rook + lib/node_modules/...) plus a matching
# `.sha256` sidecar, deliberately using a top-level directory name inside
# the tarball ("package", npm's usual convention) that does NOT match
# install.sh's install-target naming ("rook-<version>") — this is an
# adversarial choice, proving install.sh's extraction logic locates
# bin/rook structurally rather than assuming a specific archive-internal
# directory name (see install.sh's own comment on this).
#
# It then runs the REAL, unmodified install.sh against that fixture,
# exercising its actual download → checksum-verify → extract → symlink
# pipeline end to end. The only thing faked is the network transport: a
# stub `curl` placed earlier on PATH serves fixture files by matching the
# requested URL's basename, so this is a network-transport substitution,
# not a hand-copy of install.sh's own logic. $HOME and --dir are pointed
# at a scratch directory so nothing here ever touches the real machine's
# ~/.testmuai or ~/.local/bin.
#
# Since the fixture's bin/rook is a fake bash script, not real Node, the
# brief's "strip node from PATH and confirm it still runs" check doesn't
# apply as literally written — verified structurally instead (per the
# task instructions): the extracted tree lands where expected, the
# symlink resolves to it and runs, and install.sh's own source never
# references `node` outside its explanatory comments.
#
# Usage: scripts/test-install-fixture.sh
# shellcheck disable=SC1090  # install.sh is sourced via a computed path below
set -uo pipefail
# (Deliberately no -e — same reasoning as scripts/test-bottle-insert.sh:
# several checks here run install.sh expecting it to FAIL, and every
# check after that must still run and report on its own merits.)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SH="$REPO_ROOT/install.sh"
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

if [ ! -f "$INSTALL_SH" ]; then
  echo "FATAL: $INSTALL_SH not found" >&2
  exit 2
fi

CHECKSUM_TOOL="sha256sum"
command -v sha256sum >/dev/null 2>&1 || CHECKSUM_TOOL="shasum"
checksum_of() {
  if [ "$CHECKSUM_TOOL" = "sha256sum" ]; then sha256sum "$1"; else shasum -a 256 "$1"; fi
}

# --- Build the stub curl -----------------------------------------------
# Serves fixture files by matching the requested URL's basename, ignoring
# scheme/host entirely — the seam that lets install.sh's real download
# code run against a local fixture instead of the network. Exits 22 (curl
# -f's real "HTTP error" code) with no output file on a miss, so a
# fixture gap fails the way a real 404 would, not silently.
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

# --- Determine the real platform tag for this host, via install.sh's own
# detect_platform() (not hand-duplicated), same subshell/set-- discipline
# as scripts/test-platform-detect.sh.
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
PKG_ROOT="$STAGE/package"   # deliberately NOT "rook-${VERSION}" — see header
mkdir -p "$PKG_ROOT/bin" "$PKG_ROOT/lib/node_modules/@testmuai/rook"
cat >"$PKG_ROOT/bin/rook" <<EOF
#!/usr/bin/env bash
# Fixture launcher — stands in for the real bundled-Node bin/rook. Not
# real Node; this test verifies install.sh's install mechanics
# (extract/symlink), not the real CLI's runtime behavior.
if [ "\${1:-}" = "--version" ]; then
  echo "${VERSION}"
  exit 0
fi
echo "rook fixture launcher: unsupported arg \${1:-}" >&2
exit 1
EOF
chmod +x "$PKG_ROOT/bin/rook"
echo '{"name":"@testmuai/rook","version":"9.9.9-fixture"}' \
  >"$PKG_ROOT/lib/node_modules/@testmuai/rook/package.json"

FIXTURE_DIR="$WORKDIR/fixtures"
mkdir -p "$FIXTURE_DIR"
tar -C "$STAGE" -czf "$FIXTURE_DIR/$ASSET" "package"
( cd "$FIXTURE_DIR" && checksum_of "$ASSET" >"$CHECKSUM_ASSET" )

# --- Run the REAL install.sh against the fixture, sandboxed -------------
run_install() {
  local fake_home="$1" install_dir="$2"
  shift 2
  env -i \
    HOME="$fake_home" \
    PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
    ROOK_TEST_FIXTURE_DIR="$FIXTURE_DIR" \
    bash "$INSTALL_SH" --version "$VERSION" --dir "$install_dir" "$@"
}

# =============================================================================
# Case A: clean install
# =============================================================================
HOME_A="$WORKDIR/home-a"
DIR_A="$WORKDIR/bin-a"
mkdir -p "$HOME_A" "$DIR_A"

INSTALL_OUT_A="$(run_install "$HOME_A" "$DIR_A" 2>&1)"
RC_A=$?

check "(a) install exited 0" \
      "(a) install exited nonzero ($RC_A) — output:
$INSTALL_OUT_A" \
      [ "$RC_A" -eq 0 ]

TARGET_DIR_A="${HOME_A}/.testmuai/rook-${VERSION}"
check "(a) extracted tree landed at the expected ~/.testmuai path" \
      "(a) extracted tree missing at ${TARGET_DIR_A}" \
      [ -d "$TARGET_DIR_A" ]

check "(a) bin/rook exists in the extracted tree" \
      "(a) bin/rook missing from the extracted tree" \
      [ -f "${TARGET_DIR_A}/bin/rook" ]

check "(a) bin/rook is executable" \
      "(a) bin/rook is not executable — chmod/permissions lost somewhere" \
      [ -x "${TARGET_DIR_A}/bin/rook" ]

check "(a) lib/node_modules/... payload survived extraction" \
      "(a) lib/node_modules/@testmuai/rook/package.json missing — extraction dropped content" \
      [ -f "${TARGET_DIR_A}/lib/node_modules/@testmuai/rook/package.json" ]

check "(a) symlink created at --dir" \
      "(a) no symlink at ${DIR_A}/rook" \
      [ -L "${DIR_A}/rook" ]

RESOLVED_A="$(readlink "${DIR_A}/rook" 2>/dev/null || true)"
check "(a) symlink points at the extracted bin/rook (got: $RESOLVED_A)" \
      "(a) symlink points at the wrong place: '$RESOLVED_A', expected '${TARGET_DIR_A}/bin/rook'" \
      [ "$RESOLVED_A" = "${TARGET_DIR_A}/bin/rook" ]

RUN_OUT_A="$("${DIR_A}/rook" --version 2>&1)"
check "(a) running the installed symlink prints the fixture version ($RUN_OUT_A)" \
      "(a) running the installed symlink did not print the expected version — got: $RUN_OUT_A" \
      [ "$RUN_OUT_A" = "$VERSION" ]

# =============================================================================
# Case B: checksum mismatch must abort the install — proves verify_checksum
# actually gates it rather than being a no-op (a positive control for the
# happy-path checksum success in Case A).
# =============================================================================
FIXTURE_DIR_BAD="$WORKDIR/fixtures-bad-checksum"
mkdir -p "$FIXTURE_DIR_BAD"
cp "$FIXTURE_DIR/$ASSET" "$FIXTURE_DIR_BAD/$ASSET"
echo "0000000000000000000000000000000000000000000000000000000000000000  ${ASSET}" \
  >"$FIXTURE_DIR_BAD/$CHECKSUM_ASSET"

HOME_B="$WORKDIR/home-b"
DIR_B="$WORKDIR/bin-b"
mkdir -p "$HOME_B" "$DIR_B"

INSTALL_OUT_B="$(
  env -i \
    HOME="$HOME_B" \
    PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
    ROOK_TEST_FIXTURE_DIR="$FIXTURE_DIR_BAD" \
    bash "$INSTALL_SH" --version "$VERSION" --dir "$DIR_B" 2>&1
)"
RC_B=$?

check "(b) install with a tampered checksum exits nonzero" \
      "(b) install with a tampered checksum exited 0 — checksum verification did not gate the install! output:
$INSTALL_OUT_B" \
      [ "$RC_B" -ne 0 ]

check "(b) no install tree was created after a checksum failure" \
      "(b) an install tree was created at ${HOME_B}/.testmuai/rook-${VERSION} despite the checksum failure" \
      [ ! -e "${HOME_B}/.testmuai/rook-${VERSION}" ]

check "(b) no symlink was created after a checksum failure" \
      "(b) a symlink was created at ${DIR_B}/rook despite the checksum failure" \
      [ ! -e "${DIR_B}/rook" ]

# =============================================================================
# Case C: re-running the installer for the SAME version must succeed again
# (not collide/nest via `cp -R` into an already-existing target directory)
# — regression coverage for the `rm -rf "$target_dir"` addition over the
# brief's draft, which had no such guard.
# =============================================================================
INSTALL_OUT_C="$(run_install "$HOME_A" "$DIR_A" 2>&1)"
RC_C=$?

check "(c) re-running install for the same version exits 0" \
      "(c) re-running install for the same version exited nonzero ($RC_C) — output:
$INSTALL_OUT_C" \
      [ "$RC_C" -eq 0 ]

check "(c) bin/rook still resolves correctly after a re-install" \
      "(c) bin/rook missing or broken after a re-install" \
      [ -x "${TARGET_DIR_A}/bin/rook" ]

check "(c) re-install did not nest a copy inside itself (cp -R into an existing dir)" \
      "(c) re-install nested a copy inside the target dir — found ${TARGET_DIR_A}/package (the tarball's internal dir name leaking through, meaning cp -R copied INTO the existing target instead of replacing it)" \
      [ ! -e "${TARGET_DIR_A}/package" ]

# =============================================================================
# Structural check: install.sh's actual logic never references `node`
# anywhere outside its own explanatory comments — the whole point of the
# bundled-runtime tarball is that this script has no dependency on a
# system `node` being present. Strips full-line comments before grepping
# so the header's own prose about "matching Node runtime" doesn't count.
# =============================================================================
NODE_REFS="$(grep -vE '^\s*#' "$INSTALL_SH" | grep -ow 'node' || true)"
check "install.sh's executable code never references 'node'" \
      "install.sh's executable code references 'node' outside comments — found $(echo "$NODE_REFS" | wc -l | tr -d ' ') occurrence(s)" \
      [ -z "$NODE_REFS" ]

echo
if [ "$FAIL" -ne 0 ]; then
  echo "=== install.sh synthetic-fixture test: FAILED ==="
  exit 1
fi
echo "=== install.sh synthetic-fixture test: PASSED ==="
