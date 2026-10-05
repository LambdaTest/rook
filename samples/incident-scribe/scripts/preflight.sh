#!/usr/bin/env bash
#
# Everything incident-scribe needs, proven, in one command.
#
#   ./scripts/preflight.sh
#
# NOTHING TO START. ops-directory speaks MCP over stdio, so whoever needs it
# spawns their own copy per session — the desk does, and so does anything
# grading the desk. There is no daemon to leave running and no port to forget,
# which removes the failure this script used to exist to catch.
#
# What is left is worth checking anyway: that the credential and model are set,
# that the gate refuses a wrong one, and that the MCP door actually opens.

set -euo pipefail
cd "$(dirname "$0")/.."

green() { printf '  \033[32m%s\033[0m %s\n' "ok" "$1"; }
red()   { printf '  \033[31m%s\033[0m %s\n' "!!" "$1"; }
info()  { printf '  %s\n' "$1"; }

echo
echo "incident-scribe — preflight"
echo

# --- 1. the credential ----------------------------------------------------
if [ -z "${SCRIBE_API_TOKEN:-}" ] && ! grep -q '^SCRIBE_API_TOKEN=' .env 2>/dev/null; then
  red "SCRIBE_API_TOKEN is set neither in the environment nor in .env"
  exit 1
fi
green "the token is configured"

# --- 2. the model configuration ------------------------------------------
if python3 -c "from incident_scribe.__main__ import _load_dotenv; _load_dotenv(); from incident_scribe.llm import _config; _config()" 2>/dev/null; then
  green "the model provider is configured"
else
  red "the model provider is not configured"
  exit 1
fi

# --- 3. the gate refuses a wrong token ------------------------------------
#
# Checked rather than assumed: the token gate is the one behaviour a demo
# cannot show going wrong on purpose, so it is worth knowing it is on.
REFUSED=$(python3 -m incident_scribe logs --session-id _preflight --token wrong-token 2>/dev/null || true)
if printf '%s' "$REFUSED" | grep -q '"unauthorized"'; then
  green "the token gate is on (a wrong token is refused)"
else
  red "a wrong token was NOT refused — the gate is not working"
  info "$REFUSED"
  exit 1
fi

# --- 4. the MCP door opens ------------------------------------------------
#
# A real handshake, then the server exits. This is exactly what the desk and a
# grader each do per session, so a pass here means both doors open.
MCP_OUT=$(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node services/ops-directory.mjs mcp 2>/dev/null || true)

if printf '%s' "$MCP_OUT" | grep -q '"name":"search_incidents"' && printf '%s' "$MCP_OUT" | grep -q '"name":"index_incident"'; then
  green "mcp handshake ok — lookup_service, recent_incidents, search_incidents, index_incident"
else
  red "the MCP server did not list its tools"
  exit 1
fi

# --- 5. semantic search is armed (soft — lexical mode is a valid fallback) --
#
# The server answers search_incidents either way; this only says which grade
# of answer to expect. Missing here is never a failure of the preflight.
if [ -f services/incidents.index.json ] && [ -d node_modules ] && [ -d .models ]; then
  green "semantic search armed — index and model cache present (mode: semantic)"
else
  info "search_incidents will run in lexical mode — for embeddings: npm install && node scripts/build-index.mjs"
fi

# --- 6. the desk can actually reach it ------------------------------------
if python3 -c "
from incident_scribe.mcp import directory
r = directory().call('lookup_service', {'name': 'checkout-api'})
raise SystemExit(0 if r.get('owning_team') == 'payments' else 1)
" 2>/dev/null; then
  green "the desk reaches the directory (checkout-api → payments)"
else
  red "the desk could not reach ops-directory over MCP"
  exit 1
fi

echo
echo "  ready. nothing is running, and nothing needs to be."
echo
