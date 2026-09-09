#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null || { echo 'FATAL: Node.js 22+ is required' >&2; exit 2; }
command -v npm >/dev/null || { echo 'FATAL: npm is required' >&2; exit 2; }
cd "$REPO_ROOT"
node --test skill-installer/test/*.test.mjs
