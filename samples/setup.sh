#!/usr/bin/env bash
#
# One-command setup for the sample agents (macOS, Linux, WSL). The Windows twin
# is setup.ps1.
#
#   ./setup.sh                        set up EVERYTHING (the one command; run it from anywhere)
#   ./setup.sh incident-scribe        or just the samples you name
#   ./setup.sh --no-semantic          skip the embeddings download for incident-scribe
#   ./setup.sh --help
#
# Safe to re-run: an existing .env is kept, and a token is only generated where
# the file has none.
#
# What each sample needs:
#   incident-scribe       Python 3.9+, Node, a .env with a token and a model provider
#   industry-agents       Node 22+, npm install, one .env per demo
#   refund-desk, triage-service, knowledge-vault, trip-weather-station
#                         Node only — nothing to install

set -euo pipefail
cd "$(dirname "$0")"

ALL="incident-scribe industry-agents refund-desk triage-service knowledge-vault trip-weather-station"
SEMANTIC=1
SELECTED=""

green() { printf '  \033[32m%s\033[0m %s\n' "ok" "$1"; }
red()   { printf '  \033[31m%s\033[0m %s\n' "!!" "$1"; }
info()  { printf '  %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

for arg in "$@"; do
  case "$arg" in
    --semantic)    SEMANTIC=1 ;;
    --no-semantic) SEMANTIC=0 ;;
    -h|--help)  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)         red "unknown option: $arg"; exit 2 ;;
    *)
      case " $ALL " in
        *" $arg "*) SELECTED="$SELECTED $arg" ;;
        *)          red "unknown sample: $arg (choose from: $ALL)"; exit 2 ;;
      esac ;;
  esac
done
SELECTED="${SELECTED:-$ALL}"

wants() { case " $SELECTED " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

# --- prerequisites ---------------------------------------------------------
FAILED=""

PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 \
     && "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    PY="$candidate"; break
  fi
done

NODE_MAJOR=""
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
fi

head_ "sample agents — setup"

if [ -n "$NODE_MAJOR" ]; then green "node $(node --version)"; else red "node is not on PATH (https://nodejs.org)"; exit 1; fi

# --- incident-scribe -------------------------------------------------------
setup_incident_scribe() {
  head_ "incident-scribe"
  if [ -z "$PY" ]; then red "Python 3.9+ is not on PATH (python3 / python)"; FAILED="$FAILED incident-scribe"; return; fi
  green "$($PY --version)"

  cd incident-scribe
  if [ ! -f .env ]; then
    cp .env.example .env
    green "created .env from .env.example"
  else
    green "kept existing .env"
  fi

  if grep -Eq '^SCRIBE_API_TOKEN=[[:space:]]*$' .env; then
    local token
    token="$($PY -c 'import secrets; print(secrets.token_urlsafe(24))')"
    "$PY" - .env "$token" <<'EOF'
import re, sys
path, token = sys.argv[1:3]
text = open(path).read()
open(path, "w").write(re.sub(r"(?m)^SCRIBE_API_TOKEN=[ \t]*$", "SCRIBE_API_TOKEN=" + token, text, count=1))
EOF
    green "generated SCRIBE_API_TOKEN in .env"
  else
    green "SCRIBE_API_TOKEN already set"
  fi

  if [ "$SEMANTIC" = 1 ]; then
    info "installing embeddings (downloads a model, a few minutes)..."
    if npm install --no-audit --no-fund >/dev/null && node scripts/build-index.mjs >/dev/null; then
      green "semantic search armed"
    else
      red "embedding install failed — search_incidents will fall back to lexical mode"
    fi
  else
    info "search_incidents will run in lexical mode (--no-semantic was given; re-run without it for embeddings)"
  fi

  # keys present -> endpoint up -> credentials accepted (exit 1 / 3 / 2 when not)
  local status=0
  "$PY" scripts/check_llm.py || status=$?
  case "$status" in
    0) bash scripts/preflight.sh || FAILED="$FAILED incident-scribe" ;;
    1)
      info "next: open incident-scribe/.env and fill in LT_USERNAME and LT_ACCESS_KEY"
      info "      (GATEWAY_URL is already https://rook-samples.lambdatest.com; to use GLM or Gemini instead, swap the provider block)."
      info "      then re-run ./setup.sh incident-scribe" ;;
    *) red "the model provider is configured but did not pass — fix .env and re-run"; FAILED="$FAILED incident-scribe" ;;
  esac
  cd ..
}

# --- industry-agents -------------------------------------------------------
setup_industry_agents() {
  head_ "industry-agents"
  if [ "$NODE_MAJOR" -lt 22 ]; then red "needs Node 22+, found $(node --version)"; FAILED="$FAILED industry-agents"; return; fi
  cd industry-agents
  if npm install --no-audit --no-fund >/dev/null; then
    green "dependencies installed"
  else
    red "npm install failed"; FAILED="$FAILED industry-agents"; cd ..; return
  fi
  npm run setup --silent | while IFS= read -r line; do info "$line"; done
  info "next: add MODEL_API_KEY to the demo .env you want to run (demos/*/.env)"
  cd ..
}

# --- node-only samples -----------------------------------------------------
setup_node_only() {
  head_ "$1"
  green "nothing to install"
}

for sample in $SELECTED; do
  case "$sample" in
    incident-scribe) setup_incident_scribe ;;
    industry-agents) setup_industry_agents ;;
    *)               setup_node_only "$sample" ;;
  esac
done

echo
if [ -n "$FAILED" ]; then
  red "needs attention:$FAILED"
  exit 1
fi
info "done."
echo
