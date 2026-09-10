#!/usr/bin/env bash
# Red-team the RBAC surface — no rook, no credits. Fires privilege-escalation
# attacks at the good build (RBAC on) and the KV_RBAC_OFF twin, side by side, so
# you can see the exact cases rook's `--class adversarial` generation would run.
# 403 = refused (hardened), 200 = allowed (compromised). Node builtins only.
set -euo pipefail
cd "$(dirname "$0")"
export VAULT_BACKEND=memory   # stateless demo — don't touch the persistent DB file

node src/server.mjs >/dev/null 2>&1 &                          # good :9600 (RBAC on)
KV_RBAC_OFF=1 PORT=9603 node src/server.mjs >/dev/null 2>&1 &  # twin :9603 (RBAC off)
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
for p in 9600 9603; do until curl -sf "http://127.0.0.1:$p/healthz" >/dev/null; do sleep 0.2; done; done

fire(){ if [ -n "${3:-}" ]; then curl -s -o /dev/null -w "%{http_code}" -X "$1" "$2" -H 'content-type: application/json' -d "$3"; else curl -s -o /dev/null -w "%{http_code}" -X "$1" "$2"; fi; }
attack(){ # label  method  path  body
  local g t; g=$(fire "$2" "http://127.0.0.1:9600$3" "${4:-}"); t=$(fire "$2" "http://127.0.0.1:9603$3" "${4:-}")
  printf "  %-44s good: %s   twin: %s %s\n" "$1" "$g" "$t" "$([ "$t" = 200 ] && echo '<- COMPROMISED' || echo)"
}

echo "Privilege-escalation attacks on the DB (403 refused · 200 allowed):"
attack "guest deletes confidential HR-COMP"      DELETE "/v1/documents/HR-COMP?user=guest"
attack "member carol grants herself Banking"     POST   "/v1/acl?caller=carol"    '{"user":"carol","domain":"Banking"}'
attack "member carol creates an admin user"      POST   "/v1/users?caller=carol"  '{"id":"evil","role":"admin"}'
attack "anonymous (no user) creates a document"  POST   "/v1/documents"           '{"id":"X","domain":"IT","text":"y"}'
attack "guest poisons retrieval (add synonym)"   POST   "/v1/synonyms?user=guest" '{"term":"z","canonical":"vacation"}'
echo
echo "Effect — was confidential HR-COMP actually deleted? (200 present · 404 gone)"
printf "  good: %s   twin: %s\n" "$(fire GET http://127.0.0.1:9600/v1/documents/HR-COMP)" "$(fire GET http://127.0.0.1:9603/v1/documents/HR-COMP)"
echo
echo "For the real thing:  rook explore .  ·  rook generate --class adversarial  ·  rook run"
echo "Point rook at :9600 then :9603 over the same suite — the twin comes back compromised."
