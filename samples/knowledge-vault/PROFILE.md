# knowledge-vault — Rook profiles

Three Rook profiles wire the same knowledge-vault agent for testing, each
exercising a different transport / input path. A profile is small: it names the
**runner script** (`hooks.execute`) Rook invokes and declares the capabilities
that script supports. The script does the work — read the goal on stdin, call the
agent, print one JSON envelope on stdout.

The agent's decision logic is a **deterministic policy** — a rules engine, not an
LLM (see [`agent-arch.html`](./agent-arch.html)) — so a given input always yields
the same trajectory, citations, and outcome. That reproducibility is what makes
the twin verdict-flips reliable to test against. Point a runner's `KV_URL` at a
twin to watch the same suite flip: `:9601` (buggy, hallucinates), `:9602` (leaky,
obeys injection), `:9603` (RBAC off).

| Profile | Runner | What it exercises |
|---|---|---|
| [`rook/profile.yaml`](./rook/profile.yaml) | [`scripts/ask.mjs`](./scripts/ask.mjs) | Base ask + multi-turn + usage + call trajectory |
| [`rook/profile-attachment.yaml`](./rook/profile-attachment.yaml) | [`scripts/ask-attachment.mjs`](./scripts/ask-attachment.mjs) | File attachment (`text+file`) — agent reads a local doc and answers from it |
| [`rook/profile-mcp.yaml`](./rook/profile-mcp.yaml) | [`scripts/mcp-search.mjs`](./scripts/mcp-search.mjs) | The `search` tool on the `vault` MCP server (stdio JSON-RPC) |

## The profile schema

A profile points at the script Rook runs and declares its capabilities:

```yaml
id: knowledge-vault
name: knowledge-vault
hooks:
  execute: scripts/ask.mjs   # the runner Rook invokes
env: []
capabilities:
  multi_turn: true           # continue a conversation across turns
  calls: true                # the runner reports the agent's tool calls
  usage: true                # the runner reports token usage
hook_env: null
concurrency: null
```

## The runner (hook) contract

Rook runs the `hooks.execute` script once per turn. The contract is minimal:

- **The goal arrives on stdin.**
- **The prior session id arrives as `ROOK_CONVERSATION`** (for `multi_turn`).
- **The script prints one JSON object on stdout:**
  - `agent_reply` — the answer (a string; required).
  - `conversation` — the session id to carry into the next turn.
  - `calls` — `[{ name, arguments }]`, the agent's tool trajectory (for `calls`).
  - `usage` — `{ input, output }` token counts (for `usage`).

`scripts/ask.mjs` is the reference: it reads stdin, POSTs `/v1/ask` with the goal
(and `ROOK_CONVERSATION` as `session_id`), then maps the response
(`output` / `session_id` / `steps` / `usage`) onto that envelope. `GET /v1/last`
and the admin-only `GET /v1/audit` remain the out-of-band surfaces a judge uses to
confirm the answer was grounded in a document that actually contains it, and that
the agent logged what it did.

## Per-profile detail

### `rook/profile.yaml` → `scripts/ask.mjs` (base + multi-turn)

The grounding story. `usage` and `calls` are on, so a judge sees token counts and
the `search` → `read_document` trajectory behind an answer. `multi_turn` lets Rook
play the user across a follow-up turn — the agent mints the session id, the runner
returns it as `conversation`, and Rook passes it back as `ROOK_CONVERSATION`.
Re-seed between scenarios with [`scripts/reset.mjs`](./scripts/reset.mjs)
(admin-authenticated). Set `KV_URL=http://127.0.0.1:9601` for the buggy twin.

### `rook/profile-attachment.yaml` → `scripts/ask-attachment.mjs` (file attachment)

The `text+file` input kind. The runner sends `document_path` alongside the goal;
the agent reads the file (under `docs/`) and answers from it. The path defaults to
the shipped `docs/handbook-excerpt.md`; override with `KV_ATTACHMENT`.

### `rook/profile-mcp.yaml` → `scripts/mcp-search.mjs` (MCP transport)

Drives the `vault` MCP server over stdio JSON-RPC — the same server `.mcp.json`
declares, through the recording proxy — and calls `search` with the goal. That
server exposes `search`, `read_document` (refuses confidential docs),
`list_domains`, the admin-only `read_audit`, and the RBAC-gated write tools;
`tools/list` discovers them all without a model, and a judge can `read_document` /
`read_audit` to verify grounding and recorded outcomes. `.mcp.json` launches these
through a thin recording proxy that logs every `tools/call` to
`data/tool-trace.jsonl` — wire-level evidence a tool actually ran.

> Run a runner by hand to see the envelope:
> `echo "how many vacation days" | node scripts/ask.mjs`
