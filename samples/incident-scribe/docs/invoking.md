# Invoking incident-scribe

**This file is the integration contract — how to reach the desk — not a
description of what it does.** `README.md` is where the desk's behaviour is
written down.

That distinction matters if you are deriving tests from these documents. Three
of the four commands below are **plumbing a caller drives**: `open` makes a
session, `close` ends it, `logs` hands back what was recorded. They take no
task and produce no judgement, so there is nothing about them a test of the
DESK could assert — a test that sends a goal cannot invoke them, because the
caller decides when they run, not the goal.

**`execute` is the only command that does any work**, and everything worth
testing about incident-scribe is in what `execute` returns: the severity it
assigned, the matrix row it cited, whether it looked the service up before
claiming a tier, what it kept out of the customer note. Test that.

Four commands. Run them from this directory with `python3 -m incident_scribe`.

```bash
python3 -m incident_scribe open    --token "$SCRIBE_API_TOKEN" --session-id S-1
echo "<the incident report>" | \
python3 -m incident_scribe execute --token "$SCRIBE_API_TOKEN" --session-id S-1
python3 -m incident_scribe close   --token "$SCRIBE_API_TOKEN" --session-id S-1
python3 -m incident_scribe logs    --token "$SCRIBE_API_TOKEN" --session-id S-1
```

On Windows (PowerShell), use `python` — `python3` there is often the Microsoft
Store stub — and pipe the report the same way:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)  # pipe non-ASCII intact (PowerShell 5.1)
python -m incident_scribe open    --token $env:SCRIBE_API_TOKEN --session-id S-1
"<the incident report>" | python -m incident_scribe execute --token $env:SCRIBE_API_TOKEN --session-id S-1
python -m incident_scribe close   --token $env:SCRIBE_API_TOKEN --session-id S-1
python -m incident_scribe logs    --token $env:SCRIBE_API_TOKEN --session-id S-1
```

`$env:SCRIBE_API_TOKEN` must be set in that shell: a token that only lives in
`.env` expands to an empty `--token`, which is refused as `unauthorized`. For a
multi-line report, pipe a file: `Get-Content report.txt -Raw | python -m …`.

**There is no login step.** The token is issued out of band and lives in
`SCRIBE_API_TOKEN`. Every one of the four commands takes `--token`, and it is
checked before anything else happens — `logs` and `close` exactly as much as
`execute`. A missing or wrong token is refused with
`{"ok": false, "error": "unauthorized"}`.

**The task text arrives on stdin, and only on `execute`.** Nothing is read
from stdin at any other command. It is on stdin rather than in an argument
because an incident report is arbitrary text — quotes, newlines, dollar signs —
and argv quoting is where that breaks.

`--session-id` is yours to choose. Use a different one per task unless you are
deliberately continuing a conversation; a second `execute` against the same id
continues the same session.

## What the caller must supply

| variable | why |
| --- | --- |
| `SCRIBE_API_TOKEN` | the session credential, presented on every command |

The default provider remains the existing Responses API. To use GLM through
Z.AI's Anthropic-compatible endpoint, set `LLM_PROVIDER=glm`,
`ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`, `GLM_API_KEY`, and
`GLM_MODEL` (for example `glm-5.3`). The adapter also accepts the names from
Z.AI's Claude guide: `ANTHROPIC_AUTH_TOKEN` and
`ANTHROPIC_DEFAULT_SONNET_MODEL` (or the Opus/Haiku equivalents). A model
suffix such as `[1m]` is removed before the API request. The adapter adds
`/v1/messages` to the base URL and sends Anthropic tool-use blocks.

Other supported providers use the same multi-turn agent loop:

| `LLM_PROVIDER` | required variables |
| --- | --- |
| `responses` | `OPENAI_ENDPOINT`, `OPENAI_INDIA_API_KEY`, `OPENAI_MODEL` |
| `glm` / `anthropic` | `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL` |
| `openai` / `chat` | `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`; optional `OPENAI_CHAT_ENDPOINT` |
| `gemini` | `GEMINI_API_KEY`, `GEMINI_MODEL`; optional `GEMINI_ENDPOINT` |

If `LLM_PROVIDER` is omitted, the adapter selects Anthropic/GLM, Gemini,
Responses, or Chat Completions from the variables that are present, in that
order.

**That is the whole list.** The desk's model endpoint, key and deployment are
its OWN configuration — it reads them from its `.env` and they are nobody
else's business. A caller does not choose which model the desk runs on any
more than it chooses which database the desk uses; supplying them would be
configuring the agent rather than invoking it.

**Nothing else, and nothing to start.** The desk reaches `ops-directory` over
MCP and spawns its own copy per session — there is no port and no daemon.
`./scripts/preflight.sh` (on Windows, `scripts\preflight.ps1`) proves the door opens before you spend a run on
finding out it does not.

## Verifying against ops-directory

The desk's own copy of `ops-directory` is private to its process. A grader
that wants to check the desk's claims — who really owns `checkout-api`, what
tier it really is, whether a service is registered at all — **starts its own
copy of the same server and asks it directly.** It is the same code and the
same data the desk reads, so the grader's answer and the desk's answer come
from one source of truth.

It is a stdio MCP server (JSON-RPC 2.0, one frame per line). The command is
relative to where you start it:

| started from | command |
| --- | --- |
| this directory | `node services/ops-directory.mjs mcp` |
| the directory above it (the rook workspace root) | `node incident-scribe-agent/services/ops-directory.mjs mcp` |

`.mcp.json` in this directory uses the first form. rook starts MCP servers
from its workspace root, so rook needs the second form, declared as its own
project server in `.testmuai/rook/mcp.json` and approved with
`rook mcp approve ops-directory`. Once `rook mcp list` shows it as enabled,
rook can call it.

The server is named **`ops-directory`**. It has four operations, and the
first three are read-only and safe for a grader to call as often as it likes:

| op | arguments | answers |
| --- | --- | --- |
| `lookup_service` | `{"name": "checkout-api"}` | `found`, `owning_team`, `tier`, `on_call`, `runbook_url`, `status_board_image`, `severity_matrix_image` — or `found: false` for an unregistered service |
| `recent_incidents` | `{"service": "checkout-api", "limit": 5}` | past incidents for that service, newest first |
| `search_incidents` | `{"query": "card authorisation timeouts", "service": "checkout-api", "limit": 5}` | the most similar past incidents, in relevance order, with a `mode` saying how they were ranked |
| `index_incident` | `{"record": {…}}` | **writes** a learned incident. The desk calls it on `close`; a grader must not |

The registered services are `checkout-api` (team `payments`, tier 1),
`notify-worker` (team `platform`, tier 2) and `search-indexer` (team
`discovery`, tier 3). Any other name — `billing-api`, `payments-api`,
`auth-service` — comes back `found: false`, and the correct desk behaviour is
to say so rather than invent an owner or tier.

**When a check depends on the directory, name the operation.** A verification
requirement against this server must say which op answers it and which field
is checked:

```yaml
verification_requires:
  - type: mcp
    server: ops-directory
    op: lookup_service      # the call that answers it — required
    field: tier             # the value being compared with the desk's answer
```

A requirement with only `server` and `field` and no `op` cannot be run.
Comparing the desk's claim with the directory is how you tell whether it
looked a fact up or made it up, and `calls` in the `execute` reply shows
whether the lookup happened. Both are needed.

## What comes back

Every command prints **one JSON object on stdout**. Diagnostics go to stderr.

### `open`

```json
{"ok": true, "session_id": "S-1", "state_dir": ".scribe-sessions/S-1"}
```

### `execute`

```json
{
  "ok": true,
  "status": "completed",
  "answer": "- **Service:** checkout-api\n- **Severity:** S2 …\n\nCustomer note:\n…",
  "assessment": "the severity and the matrix row it matched",
  "customer_note": "the paragraph the subagent wrote",
  "note_file": "/abs/path/.scribe-sessions/S-1/artifacts/status-note-S-1-001.md",
  "incident_record_file": "/abs/path/.scribe-sessions/S-1/artifacts/incident-record-S-1-001.json",
  "status_board_image": "https://upload.wikimedia.org/…/PNG_transparency_demonstration_1.png",
  "severity_matrix_image": "https://upload.wikimedia.org/…/No_Image_Available.jpg",
  "calls": [
    {"name": "lookup_service", "arguments": {"name": "checkout-api"}},
    {"name": "recent_incidents", "arguments": {"service": "checkout-api"}},
    {"name": "comms_writer_subagent", "arguments": {"role": "comms-writer"}}
  ],
  "usage": {"input": 1415, "output": 682},
  "metrics": {"latency_ms": 1200, "model_calls": 2, "tool_calls": 2},
  "service": "checkout-api", "owning_team": "payments", "tier": 1
}
```

An incomplete report returns `"status": "needs_input"` and a question. It
does not call the comms writer or create artifacts. A completed turn returns
`"status": "completed"`; repeated turns use the same session transcript and
write uniquely numbered artifact files.

- **`answer` is what the desk said** — the assessment followed by the customer
  note. This is the text a person would read.
- **`calls` is what it actually did.** `lookup_service` and `recent_incidents`
  are real calls against ops-directory; `comms_writer_subagent` is the hand-off
  to the subagent. Whether the desk looked a fact up or invented it is exactly
  what is worth checking, so these are reported rather than left implicit.
- **`note_file` and `incident_record_file` are real files on disk**, by
  absolute path. The first is prose for a customer, the second is JSON for
  whatever picks the incident up next. Open them.
- **`status_board_image` and `severity_matrix_image` are real URLs.** The board
  differs per service; the matrix is the same document for all of them. Fetch
  them.
- **`usage`** carries `input` and `output` token counts.
- **`metrics`** carries turn latency, model-call count, tool-call count, and
  token totals for measuring later optimizations.

### `close`

Plumbing. Ends the session; no task, no judgement.

```json
{"ok": true, "session_id": "S-1", "closed": true}
```

### `logs`

Plumbing. Hands back what the session already recorded — the evidence trail
for a task `execute` has already done, not a new result.

```json
{
  "ok": true,
  "session_id": "S-1",
  "entries": [
    {"ts": "2026-09-01T09:14:02Z", "event": "session_opened"},
    {"ts": "…", "event": "tool_call", "tool": "lookup_service", "arguments": {"name": "checkout-api"}},
    {"ts": "…", "event": "subagent_start", "role": "comms-writer"},
    {"ts": "…", "event": "file_written", "path": "/abs/path/…md"},
    {"ts": "…", "event": "image_attached", "url": "https://…"},
    {"ts": "…", "event": "task_completed"}
  ],
  "artifacts": ["/abs/path/.scribe-sessions/S-1/artifacts/status-note-S-1-001.md"],
  "log_file": "/abs/path/.scribe-sessions/S-1/session.jsonl"
}
```

`logs` is the evidence trail: what the desk did, in order, with the artifact
paths. It is written as the session runs, not at the end, so a session that
died still says how far it got.

## Failure

Exit code is non-zero and the object says why:

```json
{"ok": false, "error": "unauthorized", "message": "no --token supplied; every command needs one"}
```

Error codes: `unauthorized`, `not_configured`, `no_such_session`,
`invalid_session_id`, `already_open`, `session_closed`, `empty_task`,
`model_error`.

## How long it takes

An `execute` makes two model calls (the desk, then the subagent) plus two tool
round-trips: **15–40 seconds**. `open`, `close` and `logs` are local file
operations and return immediately. Anything past 120 seconds on a **single**
`execute` is stuck, not slow.

That limit is per turn. A caller that gives one timeout to a whole
conversation (rook uses the profile's `execute` timeout as the budget for
every turn of a scenario) must allow for all of its turns together, and for
running several at once: a model under load answers more slowly. Budget
**600 seconds** for a multi-turn scenario, not 120.
