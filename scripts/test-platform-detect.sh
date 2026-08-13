#!/usr/bin/env bash
# Unit tests for install.sh's detect_platform() — the uname-s/uname-m ->
# platform-tag mapping (darwin-arm64, darwin-x64, linux-x64, linux-arm64)
# that install.sh's asset-resolution logic is built on.
#
# detect_platform() takes OS/ARCH as arguments rather than calling `uname`
# itself specifically so it can be exercised here with fake values, without
# needing to actually run this script on each of the 4 supported platforms
# (or on Windows, to prove the rejection path).
#
# This does NOT hand-maintain a copy of the mapping. It sources the real
# install.sh (guarded by install.sh's own `BASH_SOURCE == $0` check, so
# sourcing defines functions without running main() / hitting the network)
# and calls the real detect_platform(). If someone edits the real mapping,
# this test exercises the edit.
#
# Each call runs in its own subshell ( source install.sh; detect_platform
# ... ) rather than sourcing once at top level — install.sh does `set -euo
# pipefail`, and sourcing it directly into this script's top-level shell
# would leak those options into the rest of this test harness (which,
# like its siblings test-formula-patch.sh/test-bottle-insert.sh, needs to
# keep running after a deliberately-failing case).
#
# Usage: scripts/test-platform-detect.sh
# shellcheck disable=SC1090  # install.sh is sourced via a computed path below
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SH="$REPO_ROOT/install.sh"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
check() {
  local ok_msg="$1" fail_msg="$2"
  shift 2
  if "$@"; then pass "$ok_msg"; else fail "$fail_msg"; fi
}
# mentions_ci NEEDLE HAYSTACK: case-insensitive substring predicate, for
# use with check() (which needs a command, not an inline pipeline).
mentions_ci() { printf '%s' "$2" | grep -qi -- "$1"; }
not_mentions_ci() { ! mentions_ci "$1" "$2"; }

if [ ! -f "$INSTALL_SH" ]; then
  echo "FATAL: $INSTALL_SH not found" >&2
  exit 2
fi
if ! grep -q '^detect_platform()' "$INSTALL_SH"; then
  echo "FATAL: install.sh has no detect_platform() function — did it move or get renamed?" >&2
  exit 2
fi

# All three helpers below capture OS/ARCH into locals *before* entering the
# subshell, then `set --` inside it before sourcing. install.sh's own
# top-level arg-parsing loop (`while [[ $# -gt 0 ]]; do case "$1" in
# --version) ... ; *) echo "Unknown option: $1"; exit 1 ;; esac; done`)
# reads whatever positional params the sourcing shell has — without
# clearing them first, sourcing with $1=Darwin $2=arm64 makes that loop
# treat "Darwin" as an unrecognized option and `exit 1` before
# detect_platform is ever called. `set --` (0 args) makes the loop no-op.

# detect_stdout OS ARCH: prints detect_platform's stdout (the resolved tag
# on success, nothing on failure).
detect_stdout() {
  local os="$1" arch="$2"
  ( set --; source "$INSTALL_SH" >/dev/null 2>&1; detect_platform "$os" "$arch" ) 2>/dev/null
}
# detect_rc OS ARCH: prints detect_platform's exit code.
detect_rc() {
  local os="$1" arch="$2"
  ( set --; source "$INSTALL_SH" >/dev/null 2>&1; detect_platform "$os" "$arch" ) >/dev/null 2>&1
  echo $?
}
# detect_stderr OS ARCH: prints detect_platform's stderr, discarding its
# stdout. `2>&1 >/dev/null` (not `>/dev/null 2>&1`) is intentional here,
# not the common typo shellcheck's SC2069 usually catches: order matters
# because this whole call is itself wrapped in `$(...)` by the caller,
# which is what fd1 initially points at. `2>&1` first dups fd2 to that
# capture target; only then does `>/dev/null` repoint fd1 away from it —
# fd2 already has its own copy, so it keeps going to the capture. Verified
# with `f() { ( echo out; echo err >&2 ) 2>&1 >/dev/null; }; echo "$(f)"`
# -> prints "err", not "out".
# shellcheck disable=SC2069
detect_stderr() {
  local os="$1" arch="$2"
  ( set --; source "$INSTALL_SH" >/dev/null 2>&1; detect_platform "$os" "$arch" ) 2>&1 >/dev/null
}

# =============================================================================
# The 4 supported tags — one real-world uname pair each, plus a second arch
# spelling per OS (aarch64 on macOS-shaped input is nonsensical in reality,
# so those aliases are only exercised on the OS where uname actually emits
# them: aarch64 on Linux, amd64 nowhere real but accepted defensively).
# =============================================================================
declare -a CASES=(
  "Darwin|arm64|darwin-arm64"
  "Darwin|x86_64|darwin-x64"
  "Linux|x86_64|linux-x64"
  "Linux|aarch64|linux-arm64"
  # arch-alias coverage, still real combinations uname could plausibly emit
  "Linux|amd64|linux-x64"
)

for case_spec in "${CASES[@]}"; do
  IFS='|' read -r os arch expected <<<"$case_spec"
  actual="$(detect_stdout "$os" "$arch")"
  rc="$(detect_rc "$os" "$arch")"
  check "  -> ('$os','$arch') exit code is 0" \
        "  -> ('$os','$arch') exit code is $rc, not 0" \
        [ "$rc" -eq 0 ]
  check "  -> ('$os','$arch') resolved tag is '$expected'" \
        "  -> ('$os','$arch') resolved tag is '$actual', expected '$expected'" \
        [ "$actual" = "$expected" ]
done

# =============================================================================
# Rejection cases — must fail (nonzero rc, empty stdout, non-empty stderr)
# =============================================================================
declare -a REJECT_CASES=(
  "SunOS|x86_64|unrecognized OS"
  "Linux|riscv64|unrecognized arch"
  "Darwin|i386|unrecognized arch (32-bit, never shipped)"
  "MINGW64_NT-10.0-19045|x86_64|Windows shell (Git-Bash/MSYS2 MinGW)"
  "MSYS_NT-10.0-19045|x86_64|Windows shell (MSYS)"
  "CYGWIN_NT-10.0|x86_64|Windows shell (Cygwin)"
)

for case_spec in "${REJECT_CASES[@]}"; do
  IFS='|' read -r os arch label <<<"$case_spec"
  actual="$(detect_stdout "$os" "$arch")"
  rc="$(detect_rc "$os" "$arch")"
  stderr_out="$(detect_stderr "$os" "$arch")"
  check "reject '$os'/'$arch' ($label): nonzero exit" \
        "reject '$os'/'$arch' ($label): exited 0 (should have failed)" \
        [ "$rc" -ne 0 ]
  check "reject '$os'/'$arch' ($label): no tag printed to stdout" \
        "reject '$os'/'$arch' ($label): printed a tag anyway ('$actual')" \
        [ -z "$actual" ]
  check "reject '$os'/'$arch' ($label): an error message went to stderr" \
        "reject '$os'/'$arch' ($label): stderr was empty — silent failure" \
        [ -n "$stderr_out" ]
done

# The 3 Windows-shell cases specifically must name the Windows situation,
# not just generically say "unsupported OS" — this is the one rejection
# path the task brief called out by name, distinct from a plain unknown
# platform, and its message tells the user WHY (no Windows-native rook
# build) rather than just that detection failed.
for win_os in "MINGW64_NT-10.0-19045" "MSYS_NT-10.0-19045" "CYGWIN_NT-10.0"; do
  stderr_out="$(detect_stderr "$win_os" "x86_64")"
  check "Windows rejection ('$win_os') message mentions Windows explicitly" \
        "Windows rejection ('$win_os') message does not mention Windows — got: $stderr_out" \
        mentions_ci windows "$stderr_out"
done

# A genuinely unrecognized platform must NOT get the Windows-specific
# message (that would be misleading) — confirms the two rejection branches
# are actually distinct code paths, not one falling through to the other.
sunos_stderr="$(detect_stderr "SunOS" "x86_64")"
check "unrecognized-OS rejection (SunOS) does NOT mention Windows" \
      "unrecognized-OS rejection (SunOS) incorrectly mentions Windows — got: $sunos_stderr" \
      not_mentions_ci windows "$sunos_stderr"

echo
if [ "$FAIL" -ne 0 ]; then
  echo "=== platform-detect test: FAILED ==="
  exit 1
fi
echo "=== platform-detect test: PASSED ==="
