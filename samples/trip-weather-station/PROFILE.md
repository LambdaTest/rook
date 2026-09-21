# trip-weather-station — Rook profiles

Three Rook profiles wire the same trip-weather-station agent for testing, each
exercising a different transport / input path. All target the same agent and the
same `/v1/recommend` contract (except the MCP one, which goes over stdio JSON-RPC).

Point the script's `TWS_URL` at a twin to watch the same suite flip verdicts:
`:9701` (hallucinate), `:9702` (stale), `:9703` (unsafe / obeys injection),
`:9704` (RBAC off). See the sample [`README.md`](./README.md) for the full case
study.

The agent's decision logic is a **deterministic policy** by default — a rules
engine, not a model (see [`agent-arch.html`](./agent-arch.html)) — so a given
input in fixture mode always yields the same trajectory, citations, and outcome.
That reproducibility is what makes the twin verdict-flips reliable to test
against. (Weather defaults to live Open-Meteo; set `WEATHER_SOURCE=fixture` for a
deterministic run, as the profiles' reset and the test suite do.)

| Profile | Transport | What it exercises |
|---|---|---|
| `trip-weather-station` | HTTP, sync | Base recommend + multi-turn, usage grounding |
| `trip-weather-station-attach` | HTTP, sync | File attachment (`text+file`) — reads an itinerary and answers from it |
| `trip-weather-station-mcp` | MCP (stdio) | The `recommend` tool on the `weather` MCP server declared in [`.mcp.json`](./.mcp.json) |

## Shared wiring

- **Endpoint / server** — HTTP profiles POST to
  `http://127.0.0.1:9700/v1/recommend` with `content-type: application/json` and
  body `{ input: "{{goal}}" }`; the MCP profile invokes the `recommend` tool on
  the `weather` server.
- **Mode** — `sync`, `timeout_seconds: 30`, `response.kind: json`.
- **Result** — HTTP profiles read the answer from `$.output`; the MCP profile
  reads it `from: text`.
- Each profile names a runner script under `scripts/` (`hooks.execute`) that reads
  the goal on stdin, invokes the agent, and prints the Rook envelope
  (`{ agent_reply, conversation, calls[], usage }`) on stdout.

## Per-profile detail

### `trip-weather-station` (base + multi-turn)

The grounding story. `scripts/ask.mjs` POSTs `/v1/recommend`; `steps[]` shows
whether it called `geocode` → `get_climate` / `get_forecast` before advising, and
the read-only `GET /v1/last` and `GET /v1/weather?location=` endpoints let a judge
re-run the fetch and confirm the cited figure. `GET /v1/audit` is the
effect-verification surface — **admin-only** (`?user=alice`), paginated + filterable
(`outcome` / `activity` / `session_id` / `unsafe_hit` / `since` / `until`).

- **Conversation** — the prior session id arrives as `ROOK_CONVERSATION` and is
  echoed back as `conversation`, so Rook can play the user across a follow-up.
- **Reset** — `["node", "scripts/reset.mjs"]` (admin-authenticated) re-seeds
  between runs.
- Point `TWS_URL` at `:9701` for the hallucinating twin.

### `trip-weather-station-attach` (file attachment)

The `text+file` input kind. `scripts/ask-attachment.mjs` hands the agent an
itinerary path (default `docs/sample-itinerary.md`, override `TWS_ATTACHMENT`); the
agent reads it and answers from it. Path traversal outside `docs/` is refused.

### `trip-weather-station-mcp` (MCP transport)

`scripts/mcp-recommend.mjs` drives the `weather` MCP server declared in
[`.mcp.json`](./.mcp.json) (through the recording proxy) and calls the `recommend`
tool with the goal. The server also exposes `geocode`, `get_forecast`,
`get_climate`, `get_air_quality`, `list_activities`, and the admin-only
`read_audit`, plus the RBAC-gated write tools — so a judge can call
`get_forecast` / `get_climate` read-only to verify a recommendation was grounded,
and `.mcp.json` lets Rook **discover** all of them without a model. The recording
proxy logs each `tools/call` to `data/tool-trace.jsonl` — wire-level evidence a
tool actually ran, independent of the agent's self-reported `steps`.

> **Note:** MCP invocation in `/run` is newer than the HTTP path. Verify it runs
> end-to-end in your build before relying on it for a full suite; discovery and
> judge-verification are the always-available parts.
