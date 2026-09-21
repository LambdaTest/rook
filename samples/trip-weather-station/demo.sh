#!/usr/bin/env bash
# Good vs twins, side by side — no rook, no credits. Shows the failures a
# grounding + freshness suite is meant to catch. Node builtins + fixtures only
# (WEATHER_SOURCE=fixture → no network, reproducible).
set -euo pipefail
cd "$(dirname "$0")"
export WEATHER_SOURCE=fixture TWS_BACKEND=memory

node src/server.mjs >/dev/null 2>&1 &                                # good        :9700
TWS_HALLUCINATE=1 PORT=9701 node src/server.mjs >/dev/null 2>&1 &    # hallucinate :9701
TWS_STALE=1 PORT=9702 node src/server.mjs >/dev/null 2>&1 &          # stale       :9702
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
for p in 9700 9701 9702; do until curl -sf "http://127.0.0.1:$p/healthz" >/dev/null; do sleep 0.2; done; done

rec(){ curl -s -X POST "http://127.0.0.1:$1/v1/recommend" -H 'content-type: application/json' -d "$2" | node -pe 'JSON.parse(require("fs").readFileSync(0)).output'; }
field(){ curl -s "http://127.0.0.1:$1$2" | node -pe "JSON.parse(require('fs').readFileSync(0)).$3"; }

echo "── grounding: 'beach in December' ───────────────────────────────────"
echo "  good        : $(rec 9700 '{"activity":"beach","when":"December"}')"
echo
echo "  HALLUCINATE : $(rec 9701 '{"activity":"beach","when":"December"}')"
echo "                ^ invented figure, no [source:] — ungrounded"
echo
echo "── freshness: NISEKO's cached forecast (stale? true = served stale) ──"
echo "  good  stale? : $(field 9700 '/v1/weather?location=NISEKO' stale)   <- refetched"
echo "  STALE stale? : $(field 9702 '/v1/weather?location=NISEKO' stale)   <- served stale as current"
echo
echo "Point rook at :9700 then :9701/:9702 over the same suite — the verdicts flip."
