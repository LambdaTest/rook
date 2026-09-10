# knowledge-vault — Rook profiles

Three Rook profiles wire the same knowledge-vault agent for testing, each
exercising a different transport / input path. All target the same agent and the
same `/v1/ask` contract (except the MCP one, which goes over stdio JSON-RPC).

Point the `url` at a twin to watch the same suite flip verdicts: `:9601` (buggy,
hallucinates), `:9602` (leaky, obeys injection), `:9603` (RBAC off). See the
sample [`README.md`](./README.md) for the full case study.

The agent's decision logic is a **deterministic policy** — a rules engine, not an
LLM (see [`agent-arch.html`](./agent-arch.html)) — so a given input always yields
the same trajectory, citations, and outcome. That reproducibility is what makes
the twin verdict-flips reliable to test against.

| Profile | Transport | What it exercises |
|---|---|---|
| `knowledge-vault` | HTTP, sync | Base ask + multi-turn (`conversation.kind: field`), usage grounding |
| `knowledge-vault-attach` | HTTP, sync | File attachment (`text+file`) — agent reads a local doc and answers from it |
| `knowledge-vault-mcp` | MCP (stdio) | The `search` tool on the `vault` MCP server declared in [`.mcp.json`](./.mcp.json) |

## Shared wiring

All three share the same target and behaviour:

- **Endpoint / server** — HTTP profiles POST to `http://127.0.0.1:9600/v1/ask`
  with `content-type: application/json` and body `{ input: "{{goal}}" }`; the MCP
  profile invokes the `search` tool on the `vault` server.
- **Mode** — `sync`, `timeout_seconds: 15`, `response.kind: json`.
- **Result** — HTTP profiles read the answer from `$.output` (`from: json_path`);
  the MCP profile reads it `from: text`.
- **`verified: false`** on all three — none has been run-verified yet.

## Per-profile detail

### `knowledge-vault` (base + multi-turn)

The grounding story. `observe.usage: true` is on, and the read-only `/v1/last`
endpoint lets a judge check the answer was cited from a doc that actually
contains it. `GET /v1/audit` is the second effect-verification surface — a judge
can confirm the row the agent logged (its citations + `outcome`) matches what it
actually did. It is **admin-only** (pass `?user=alice`), paginated (`limit` /
`offset`, with `count` the unpaged total), and filterable by `outcome` /
`session_id` / `confidential_hit` / `since` / `until`.

- **Conversation** — `kind: field`; session id read from `$.session_id` and sent
  back as `body.session_id`, so Rook can play the user across a follow-up turn.
- **Reset** — `["node", "scripts/reset.mjs"]` (cwd `.`) re-seeds between runs.
- Point `url` at `:9601` for the buggy (hallucinating) twin.

```yaml
id: knowledge-vault
name: knowledge-vault
kind: http
mode: sync
timeout_seconds: 15
invoke:
  method: POST
  url: http://127.0.0.1:9600/v1/ask
  headers:
    content-type: application/json
  body:
    input: "{{goal}}"
result:
  from: json_path
  path: $.output
conversation:
  kind: field
  id_path: $.session_id
  send_as: body.session_id
response:
  kind: json
observe:
  usage: true
reset:
  argv: ["node", "scripts/reset.mjs"]
  cwd: "."
verified: false
```

### `knowledge-vault-attach` (file attachment)

The `text+file` input kind. The agent reads a local document and answers from it.

- **Attachments** — `via: field`, `field: body.document_path`; Rook writes the
  file path there and the agent reads that path (`docs/handbook-excerpt.md` ships
  as an example).
- `observe.usage: true`. Use a scenario with `input.kind: text+file` and an
  attachment to exercise this path.

```yaml
id: knowledge-vault-attach
name: knowledge-vault-attach
kind: http
mode: sync
timeout_seconds: 15
invoke:
  method: POST
  url: http://127.0.0.1:9600/v1/ask
  headers:
    content-type: application/json
  body:
    input: "{{goal}}"
result:
  from: json_path
  path: $.output
attachments:
  via: field
  field: body.document_path
response:
  kind: json
observe:
  usage: true
verified: false
```

### `knowledge-vault-mcp` (MCP transport)

The `kind: mcp` transport. Rook invokes the `search` tool on the `vault` MCP
server. That server exposes four read tools — `search`, `read_document` (refuses
confidential docs), `list_domains`, and the admin-only `read_audit` (paginated +
filterable over the audit trail, same filters as `GET /v1/audit`) — plus the
RBAC-gated write tools `add_document` / `update_document` / `delete_document`.
The same `.mcp.json` lets Rook **discover** all of them without a model
(`/explore` reads it, connects, calls `tools/list`), and lets a judge call
`search` / `read_document` read-only to verify an answer was grounded, or
`read_audit` (with an admin `user` argument) to verify the recorded outcome
(`mcp_call`) — all independent of the transport under test.

> **Note:** MCP invocation in `/run` is newer than the HTTP path. Verify it runs
> end-to-end in your build before relying on it for a full suite; discovery and
> judge-verification are the always-available parts.

```yaml
id: knowledge-vault-mcp
name: knowledge-vault-mcp
kind: mcp
mode: sync
timeout_seconds: 15
invoke:
  server: vault
  tool: search
  arguments:
    query: "{{goal}}"
result:
  from: text
response:
  kind: json
verified: false
```
