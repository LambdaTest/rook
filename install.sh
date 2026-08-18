#!/usr/bin/env bash
# rook installer — downloads the platform-matched release tarball from
# GitHub Releases (each one bundles a matching Node runtime), so this does
# not require system Node (unlike the internal-only tarball
# cli-stage-release.yml produces).
#
# Each release publishes one tarball + `.sha256` sidecar per platform tag:
#   rook-<version>-darwin-arm64.tar.gz  (+ .tar.gz.sha256)
#   rook-<version>-darwin-x64.tar.gz    (+ .tar.gz.sha256)
#   rook-<version>-linux-x64.tar.gz     (+ .tar.gz.sha256)
#   rook-<version>-linux-arm64.tar.gz   (+ .tar.gz.sha256)
#   rook-<version>-win-x64.tar.gz       (+ .tar.gz.sha256)
# win-x64 is uploaded for build-matrix completeness only — there is no
# Windows-native rook launcher anywhere in this codebase (the bundled
# bin/rook is a POSIX shell script), and this installer is itself a bash
# script that only ever runs in a POSIX-ish shell. So only the 4 Unix-ish
# tags are ever real download targets here; see detect_platform() below.
set -euo pipefail

REPO="LambdaTest/rook"
INSTALL_DIR="${HOME}/.local/bin"
VERSION=""

usage() { echo "Usage: install.sh [--version X.Y.Z] [--dir /path/to/bin]"; }

# missing_value FLAG: called when a value-taking flag is the last argument.
# Without this, `$2` under `set -u` aborts with a raw "line N: $2: unbound
# variable" — correct (fails closed) but a bash-internals leak rather than
# an error a user can act on.
missing_value() {
  echo "Error: $1 requires a value." >&2
  usage >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || missing_value "$1"
      VERSION="$2"; shift 2 ;;
    --dir)
      [[ $# -ge 2 ]] || missing_value "$1"
      INSTALL_DIR="$2"; shift 2 ;;
    --help)
      usage
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# The install directory ends up inside install-manifest.json, which is JSON
# written by a bash script with no JSON encoder. Backslash and double-quote
# are escaped on the way out (see json_escape); control characters are refused
# here instead, because escaping them correctly is more machinery than a real
# install path ever justifies, and a directory containing one is far more
# likely to be a mistake than an intention. Checked before any work happens,
# and covering the default as well as --dir.
if printf '%s' "$INSTALL_DIR" | LC_ALL=C grep -q '[[:cntrl:]]'; then
  echo "Error: --dir must not contain control characters." >&2
  exit 1
fi

resolve_version() {
  if [[ -n "$VERSION" ]]; then
    echo "$VERSION"
    return
  fi
  local latest
  # `sed -n ... p` (print only on a match), NOT a bare `s///`: a plain
  # substitution passes a non-matching line through UNCHANGED, so a
  # `tag_name` that isn't a `v<version>` tag — e.g. the `rook-<version>`
  # tag build-bottles.yml publishes bottles under — would make $latest the
  # whole raw JSON line, sail past the `-z` guard below, and fail much
  # later as a confusing 404 on a garbage download URL. With `-n`+`p` a
  # non-match produces empty output and the guard does its job.
  latest=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | sed -n -E 's/.*"tag_name": *"v([^"]+)".*/\1/p')
  if [[ -z "$latest" ]]; then
    echo "Error: Could not determine latest version" >&2
    exit 1
  fi
  echo "$latest"
}

# detect_platform OS ARCH: maps `uname -s` / `uname -m` output to one of
# the 4 platform tags this installer actually supports — darwin-arm64,
# darwin-x64, linux-x64, linux-arm64 — the Unix-ish subset of the 5 tags
# each release publishes (win-x64 is real but unusable here, see header).
#
# Takes OS/ARCH as arguments rather than calling `uname` itself so it's a
# pure function that can be unit-tested directly with fake values, without
# needing to actually run on each platform.
#
# Prints the resolved tag to stdout and returns 0 on success. On anything
# else — an unrecognized OS/arch, or a Windows shell (MINGW/MSYS/CYGWIN,
# what `uname -s` reports under Git-Bash/WSL-adjacent environments) —
# prints a clear error to stderr and returns 1 rather than guessing or
# silently downloading a tarball that would never run.
detect_platform() {
  local os="$1" arch="$2" os_tag arch_tag

  case "$os" in
    Darwin) os_tag="darwin" ;;
    Linux) os_tag="linux" ;;
    MINGW* | MSYS* | CYGWIN*)
      echo "Error: install.sh does not support Windows shells (uname -s reported '${os}')." >&2
      echo "rook's bundled launcher (bin/rook) is a POSIX shell script — there is no" >&2
      echo "Windows-native rook build to install. Run this from WSL, or from a real" >&2
      echo "Linux/macOS host." >&2
      return 1
      ;;
    *)
      echo "Error: unsupported OS '${os}' (uname -s). install.sh supports Darwin and Linux only." >&2
      return 1
      ;;
  esac

  case "$arch" in
    arm64 | aarch64) arch_tag="arm64" ;;
    x86_64 | amd64) arch_tag="x64" ;;
    *)
      echo "Error: unsupported architecture '${arch}' (uname -m) for ${os_tag}." >&2
      return 1
      ;;
  esac

  echo "${os_tag}-${arch_tag}"
}

# sha256_of FILE: prints FILE's sha256 as a bare lowercase hex digest.
# Picks the tool by presence (`command -v`), not by "try sha256sum and fall
# back to shasum on any nonzero exit" — that pattern (a) trips shellcheck
# SC2015 and (b) can't tell "tool missing" apart from "hashing genuinely
# failed".
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# json_escape STRING: escapes a string for embedding in a JSON string literal.
# Only backslash and double-quote, and that is the complete set here rather
# than a shortcut: control characters are refused up front (see the check
# above), and every other byte is legal unescaped inside a JSON string.
# Order matters — backslash first, or the backslashes this function itself
# introduces get escaped a second time.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# verify_checksum FILE SIDECAR: verifies that FILE — the artifact actually
# downloaded, at its known local path — hashes to the digest published in
# SIDECAR.
#
# Deliberately NOT `sha256sum -c SIDECAR`: that delegates the choice of
# what gets hashed to the *filename recorded inside the sidecar*, which is
# attacker-controlled content from the same download. A sidecar reading
# `e3b0c442...b855  /dev/null` verifies clean under `-c` (that IS the
# sha256 of an empty file) while the tarball is never hashed at all — the
# check passes and the payload is unverified. So the digest is parsed out
# of the sidecar and compared against a digest this script computes itself,
# for the path it chose; the sidecar's filename field is ignored entirely.
#
# The sidecar must contain exactly one line of the `sha256sum` output shape
# (64 hex chars, then end-of-line or whitespace + a filename). Zero or
# several is a corrupt/unexpected file and aborts rather than picking one.
verify_checksum() {
  local file="$1" sidecar="$2" expected actual digest_count

  expected=$(sed -n -E 's/^([0-9a-fA-F]{64})([[:space:]].*)?$/\1/p' "$sidecar" \
    | tr '[:upper:]' '[:lower:]')
  digest_count=$(printf '%s' "$expected" | grep -c . || true)
  if [[ "$digest_count" -ne 1 ]]; then
    echo "Error: ${sidecar##*/} does not contain exactly one sha256 digest (found ${digest_count})." >&2
    echo "Refusing to install from an unverifiable download." >&2
    return 1
  fi

  actual=$(sha256_of "$file")
  if [[ "$expected" != "$actual" ]]; then
    echo "Error: checksum mismatch for ${file##*/}" >&2
    echo "  published: ${expected}" >&2
    echo "  actual:    ${actual}" >&2
    return 1
  fi

  echo "${file##*/}: OK (sha256 ${actual})"
}

main() {
  # tmp_dir is deliberately NOT declared `local`: the `trap ... EXIT`
  # below fires when the whole script process exits, which happens after
  # main() has already returned. A `local tmp_dir` would have gone out of
  # scope by then, and under `set -u` the trap body's `$tmp_dir` reference
  # would itself throw "unbound variable" — the trap fails without ever
  # running `rm -rf`, so the temp dir silently leaks on every run. Kept
  # global (like REPO/INSTALL_DIR/VERSION above) so it's still bound when
  # the trap actually fires. Confirmed by direct repro: a `local` var
  # referenced by a same-function `trap EXIT` throws "unbound variable" at
  # trap time once the function has returned; a non-local one doesn't.
  local version platform asset checksum_asset download_url checksum_url
  local extract_dir extracted_root target_dir entries

  version="$(resolve_version)"

  if ! platform="$(detect_platform "$(uname -s)" "$(uname -m)")"; then
    exit 1
  fi

  asset="rook-${version}-${platform}.tar.gz"
  checksum_asset="${asset}.sha256"
  download_url="https://github.com/${REPO}/releases/download/v${version}/${asset}"
  checksum_url="${download_url}.sha256"

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  echo "Detected platform: ${platform}"
  echo "Downloading ${download_url}..."
  curl -fsSL -o "${tmp_dir}/${asset}" "$download_url"

  echo "Verifying checksum..."
  curl -fsSL -o "${tmp_dir}/${checksum_asset}" "$checksum_url"
  verify_checksum "${tmp_dir}/${asset}" "${tmp_dir}/${checksum_asset}"

  mkdir -p "$INSTALL_DIR"
  # Resolve to an absolute, physical path — but only AFTER mkdir, never at
  # parse time. The directory need not exist when --dir is parsed, and the
  # default (~/.local/bin) does not exist on a fresh machine, so `cd`,
  # `realpath` and `readlink -f` would all fail there and `set -e` would turn
  # a working install into a non-zero exit that installs nothing.
  #
  # It has to be absolute because install-manifest.json records it for
  # `rook update` to reuse later, from a different working directory: a
  # recorded "mybin" means nothing to the next process. `pwd -P` over `pwd`
  # so the recorded path survives a later change to an intermediate symlink.
  INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd -P)"

  extract_dir="${tmp_dir}/extract"
  mkdir -p "$extract_dir"
  tar -xzf "${tmp_dir}/${asset}" -C "$extract_dir"

  # The tarball's internal top-level directory name isn't part of this
  # script's contract — only the bin/rook + lib/node_modules/... shape is
  # (Task 1/6). Find the extracted root structurally instead of hardcoding
  # a directory name the per-platform packaging change could have altered.
  extracted_root="$extract_dir"
  entries=("$extract_dir"/*)
  if [[ ${#entries[@]} -eq 1 && -d "${entries[0]}" ]]; then
    extracted_root="${entries[0]}"
  fi

  if [[ ! -x "${extracted_root}/bin/rook" ]]; then
    echo "Error: ${asset} did not contain an executable bin/rook — corrupt download or unexpected release layout." >&2
    exit 1
  fi

  target_dir="${HOME}/.testmuai/rook-${version}"
  rm -rf "$target_dir"
  mkdir -p "$(dirname "$target_dir")"
  cp -R "$extracted_root" "$target_dir"
  ln -sf "${target_dir}/bin/rook" "${INSTALL_DIR}/rook"

  # install-manifest.json — how this copy was installed, recorded by the only
  # thing that knows. `rook update` reads it to re-run this installer with the
  # same --dir; without it, an update would write a second symlink into the
  # default directory while the one on the user's PATH still pointed at the
  # old version, and report success.
  #
  # Written LAST, after the symlink: its presence means an install that
  # actually reached PATH. Written before, it would survive a failed `ln` and
  # describe an install nobody can run.
  #
  # A failure here is not a failed install — the tree and the symlink are
  # already in place and working — so it warns rather than aborting. `rook
  # update` treats an absent manifest as "print the command instead of running
  # it", which is the safe direction.
  if ! cat >"${target_dir}/install-manifest.json" <<MANIFEST
{"v":1,"channel":"curl","installDir":"$(json_escape "$INSTALL_DIR")","version":"$(json_escape "$version")"}
MANIFEST
  then
    echo "Warning: could not record ${target_dir}/install-manifest.json." >&2
    echo "The install is complete and usable; 'rook update' will print the" >&2
    echo "upgrade command rather than running it." >&2
  fi

  echo ""
  echo "Installed rook v${version} (${platform}) to ${INSTALL_DIR}/rook"
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo "Add to your PATH: export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
  echo "Run 'rook --version' to verify."
}

# Only run main when executed directly (`bash install.sh`, `./install.sh`,
# or the public `curl ... | bash` pipe) — not when sourced, e.g. by a test
# harness calling detect_platform() directly.
#
# `${BASH_SOURCE[0]:-$0}`: under `set -u`, a piped script has no
# BASH_SOURCE entry, so indexing it directly is an unbound-variable error
# that broke `curl ... | bash` on every run. Falling back to `$0` (which
# bash sets to "bash" when piped) keeps the comparison true for that case;
# an empty-string fallback would stop the crash but then silently skip
# main too, since "" never equals "bash".
if [[ "${BASH_SOURCE[0]:-$0}" == "${0}" ]]; then
  main "$@"
fi
