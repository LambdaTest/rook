# Connection material for Rook

Target: Returns & Refunds Assistant. Base URL: http://127.0.0.1:4317. Configure this application as described in README.md, using MODEL_API_KEY through .env or the OS environment, then start the Node 22+ service with `npm run demo -- customer-support-agent` from the collection root (`samples/industry-agents`).

The vulnerable variant deliberately omits the documented business checks. The hardened variant implements the demonstrated repair: Apply ownership, return-window, approval, and idempotency checks inside the refund tool. Propagate payment-provider errors. PRD.md remains the intended behavior for both variants; do not derive expected success from baseline defects.

Use an optional DEMO_API_TOKEN as a bearer token; reference the variable rather than embedding its value.

1. prepare: GET /health.
2. open: POST /api/sessions with JSON {"variant":"vulnerable","fault":"none"}; retain returned conversation UUID in ROOK_STATE_DIR. Change variant to hardened for the repaired run. Omit engine to use the server’s configured model runtime. The Rook launcher loads this demo’s .env and passes DEMO_ENGINE=model. Provider credentials stay with the agent service.
3. execute: read the complete goal verbatim from stdin; POST /api/sessions/{conversation}/chat with {"goal":"..."}. Return output and agent_reply with the same exact answer string, plus conversation, calls and usage if actually present. The installed internal Rook build reads agent_reply; public docs describe output, so provide both. Reuse the same conversation for all scenario turns.
4. close: POST /api/sessions/{conversation}/close with {}.
5. collect: GET /api/sessions/{conversation}/evidence; retain effects, traces, calls, observed usage and verification gaps. Save the collected JSON locally and return its absolute path as evidence_file so Rook captures it for the judge. Label it collected evidence, not an agent-produced business artifact. This read still works after close.

Profile probes may not supply ROOK_STATE_DIR. Use a stable, profile-specific temporary directory only for those probes; always honor ROOK_STATE_DIR for scenario execution.

Every open creates fresh synthetic customer state. No global reset is needed; concurrency is safe across separate sessions. Never create a new conversation during execute, close or collect.

The target's traces are structured local span records, not automatically ingested OpenTelemetry traces. The hook attaches them as evidence. A live Rook run is required to verify how the installed Rook version presents them.

The sample scenarios list service conditions; Rook does not automatically translate that field into hook environment variables. Create separate profiles for dependency_error, slow_tool and poisoned_context and use those profiles only for the corresponding scenario group.

Example connectivity request:

```bash
curl -sS http://127.0.0.1:4317/api/sessions -H 'Content-Type: application/json' -d '{"variant":"vulnerable","fault":"none"}'
```
