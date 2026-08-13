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
# contains NEEDLE HAYSTACK / lacks NEEDLE HAYSTACK: substring predicates in
# command form (check() takes a command, not an inline pipeline). `lacks`
# is a whole-string negation — NOT `grep -v`, which is per-line and would
# pass on any multi-line output that has one clean line in it.
contains() { printf '%s' "$2" | grep -qiF -- "$1"; }
lacks() { ! contains "$1" "$2"; }

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
# Case D: a sidecar whose digest is valid but belongs to a DIFFERENT file.
#
# `sha256sum -c` / `shasum -c` hash whatever path is written *inside* the
# checksum file, which comes from the same (untrusted) download as the
# tarball. A sidecar reading
#
#     e3b0c442...b855  /dev/null
#
# is a legitimate, correct checksum line — that is genuinely the sha256 of
# an empty file, a constant on every machine — so `-c` reports
# "/dev/null: OK" and exits 0 while the tarball is never hashed at all.
#
# Both sub-cases below serve the SAME (hostile, non-release) tarball; the
# only difference is the sidecar's filename field. D-control uses an honest
# sidecar and must install — proving the tarball is otherwise perfectly
# installable, so D-decoy's abort is attributable to the checksum binding
# and not to some incidental defect in the fixture.
# =============================================================================
HOSTILE_STAGE="$WORKDIR/stage-hostile"
HOSTILE_ROOT="$HOSTILE_STAGE/package"
mkdir -p "$HOSTILE_ROOT/bin" "$HOSTILE_ROOT/lib/node_modules/@testmuai/rook"
cat >"$HOSTILE_ROOT/bin/rook" <<EOF
#!/usr/bin/env bash
# Stands in for a substituted release payload: same shape as the real
# asset (so it extracts and installs fine), different content.
echo "SUBSTITUTED-PAYLOAD"
EOF
chmod +x "$HOSTILE_ROOT/bin/rook"
echo '{"name":"@testmuai/rook","version":"9.9.9-fixture"}' \
  >"$HOSTILE_ROOT/lib/node_modules/@testmuai/rook/package.json"

# D-control: hostile tarball + an HONEST sidecar for it -> must install.
FIXTURE_DIR_D0="$WORKDIR/fixtures-hostile-honest-sidecar"
mkdir -p "$FIXTURE_DIR_D0"
tar -C "$HOSTILE_STAGE" -czf "$FIXTURE_DIR_D0/$ASSET" "package"
( cd "$FIXTURE_DIR_D0" && checksum_of "$ASSET" >"$CHECKSUM_ASSET" )

HOME_D0="$WORKDIR/home-d0"
DIR_D0="$WORKDIR/bin-d0"
mkdir -p "$HOME_D0" "$DIR_D0"
INSTALL_OUT_D0="$(
  env -i HOME="$HOME_D0" PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
    ROOK_TEST_FIXTURE_DIR="$FIXTURE_DIR_D0" \
    bash "$INSTALL_SH" --version "$VERSION" --dir "$DIR_D0" 2>&1
)"
RC_D0=$?

check "(d-control) same tarball with an honest sidecar installs (exit 0)" \
      "(d-control) the control install failed ($RC_D0) — Case D's abort would not be attributable to the sidecar. output:
$INSTALL_OUT_D0" \
      [ "$RC_D0" -eq 0 ]

RUN_OUT_D0="$("${DIR_D0}/rook" 2>&1 || true)"
check "(d-control) the control install really did place the substituted payload" \
      "(d-control) the control install did not place the substituted payload — got: $RUN_OUT_D0" \
      [ "$RUN_OUT_D0" = "SUBSTITUTED-PAYLOAD" ]

# D-decoy: same tarball, sidecar pointing at /dev/null -> must abort.
FIXTURE_DIR_D1="$WORKDIR/fixtures-decoy-sidecar"
mkdir -p "$FIXTURE_DIR_D1"
cp "$FIXTURE_DIR_D0/$ASSET" "$FIXTURE_DIR_D1/$ASSET"
echo "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  /dev/null" \
  >"$FIXTURE_DIR_D1/$CHECKSUM_ASSET"

HOME_D1="$WORKDIR/home-d1"
DIR_D1="$WORKDIR/bin-d1"
mkdir -p "$HOME_D1" "$DIR_D1"
INSTALL_OUT_D1="$(
  env -i HOME="$HOME_D1" PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
    ROOK_TEST_FIXTURE_DIR="$FIXTURE_DIR_D1" \
    bash "$INSTALL_SH" --version "$VERSION" --dir "$DIR_D1" 2>&1
)"
RC_D1=$?

check "(d) a sidecar naming a decoy file (/dev/null) aborts the install" \
      "(d) a sidecar naming /dev/null did NOT abort the install (exit $RC_D1) — the checksum is being verified against the sidecar's own filename field, not the downloaded tarball! output:
$INSTALL_OUT_D1" \
      [ "$RC_D1" -ne 0 ]

check "(d) the decoy-sidecar failure names a checksum mismatch, not a bash error" \
      "(d) the decoy-sidecar failure message doesn't name a checksum mismatch — got: $INSTALL_OUT_D1" \
      contains "checksum mismatch" "$INSTALL_OUT_D1"

check "(d) no install tree was created after a decoy-sidecar failure" \
      "(d) an install tree was created at ${HOME_D1}/.testmuai/rook-${VERSION} despite the decoy sidecar" \
      [ ! -e "${HOME_D1}/.testmuai/rook-${VERSION}" ]

check "(d) no symlink was created after a decoy-sidecar failure" \
      "(d) a symlink was created at ${DIR_D1}/rook despite the decoy sidecar" \
      [ ! -e "${DIR_D1}/rook" ]

# A sidecar with no digest line at all, and one with several, are both
# unusable — neither may be silently reduced to "close enough". The
# no-digest shape is not hypothetical: macOS 26's /sbin/sha256sum
# ("sha256sum (Darwin) 1.0") answers `-c` on a sidecar whose every line is
# malformed with `WARNING: 1 line is improperly formatted` and **exit 0**,
# so a truncated or error-page sidecar used to verify clean.
for shape in empty multi; do
  FIXTURE_DIR_E="$WORKDIR/fixtures-sidecar-$shape"
  mkdir -p "$FIXTURE_DIR_E"
  cp "$FIXTURE_DIR/$ASSET" "$FIXTURE_DIR_E/$ASSET"
  if [ "$shape" = "empty" ]; then
    printf 'not a checksum file at all\n' >"$FIXTURE_DIR_E/$CHECKSUM_ASSET"
  else
    { checksum_of "$FIXTURE_DIR/$ASSET" | awk '{print $1 "  a.tar.gz"}'
      checksum_of "$FIXTURE_DIR/$ASSET" | awk '{print $1 "  b.tar.gz"}'
    } >"$FIXTURE_DIR_E/$CHECKSUM_ASSET"
  fi
  HOME_E="$WORKDIR/home-e-$shape"
  DIR_E="$WORKDIR/bin-e-$shape"
  mkdir -p "$HOME_E" "$DIR_E"
  INSTALL_OUT_E="$(
    env -i HOME="$HOME_E" PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
      ROOK_TEST_FIXTURE_DIR="$FIXTURE_DIR_E" \
      bash "$INSTALL_SH" --version "$VERSION" --dir "$DIR_E" 2>&1
  )"
  RC_E=$?
  check "(e/$shape) a sidecar without exactly one digest aborts the install" \
        "(e/$shape) a sidecar without exactly one digest did not abort (exit $RC_E) — output:
$INSTALL_OUT_E" \
        [ "$RC_E" -ne 0 ]
done

# =============================================================================
# Case F: --version / --dir as the very last argument must produce a usage
# message, not `line N: $2: unbound variable` (F14).
# =============================================================================
for flag in --version --dir; do
  OUT_F="$(
    env -i HOME="$WORKDIR/home-f" PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin" \
      bash "$INSTALL_SH" "$flag" 2>&1
  )"
  RC_F=$?
  check "(f) trailing '$flag' exits nonzero" \
        "(f) trailing '$flag' exited 0" \
        [ "$RC_F" -ne 0 ]
  check "(f) trailing '$flag' prints a usage message" \
        "(f) trailing '$flag' did not print usage — got: $OUT_F" \
        contains "Usage: install.sh" "$OUT_F"
  check "(f) trailing '$flag' does not leak a bash 'unbound variable' error" \
        "(f) trailing '$flag' leaked a raw bash error — got: $OUT_F" \
        lacks "unbound variable" "$OUT_F"
done

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
