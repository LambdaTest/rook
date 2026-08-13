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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --dir)     INSTALL_DIR="$2"; shift 2 ;;
    --help)
      echo "Usage: install.sh [--version X.Y.Z] [--dir /path/to/bin]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

resolve_version() {
  if [[ -n "$VERSION" ]]; then
    echo "$VERSION"
    return
  fi
  local latest
  latest=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
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

# verify_checksum DIR FILE: runs FILE (a `sha256sum -c`-format checksum
# file) against the files in DIR. Picks the tool by presence (`command
# -v`), not by "try sha256sum and fall back to shasum on any nonzero exit"
# — that pattern (a) trips shellcheck SC2015 and (b) can't tell "tool
# missing" apart from "checksum genuinely failed", which matters less here
# only because either cause already aborts the install either way, but the
# presence-check version says so unambiguously.
verify_checksum() {
  local dir="$1" file="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$dir" && sha256sum -c "$file" )
  else
    ( cd "$dir" && shasum -a 256 -c "$file" )
  fi
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
  verify_checksum "$tmp_dir" "$checksum_asset"

  mkdir -p "$INSTALL_DIR"

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

  echo ""
  echo "Installed rook v${version} (${platform}) to ${INSTALL_DIR}/rook"
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo "Add to your PATH: export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
  echo "Run 'rook --version' to verify."
}

# Only run main when executed directly (`bash install.sh` / `./install.sh`)
# — not when sourced, e.g. by a test harness that wants to call
# detect_platform() directly without triggering a real network install.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
