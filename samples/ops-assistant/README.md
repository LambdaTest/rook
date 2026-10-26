# Ops Assistant: a sample agent for testing Rook

A sample AI agent that returns the same answer in six different output formats.

Its only purpose is to check how **Rook** (TestMu AI's agent-testing CLI)
handles each format. There is one Rook profile and one Rook scenario per
format, and each format is checked in its own named run.

## Output formats

Every endpoint runs the same agent. Only the response format changes.

| Format | Endpoint | Rook profile | Rook scenario |
| --- | --- | --- | --- |
| JSON | `POST /v1/chat` | `json` | SC-001: status of order A-100 |
| Plain text | `POST /v1/chat/text` | `text` | SC-003: summarize incident INC-2041 |
| Async job | `POST /v1/chat/async`, then `GET /v1/jobs/{id}` | `async` | SC-004: weekly report for checkout |
| NDJSON stream | `POST /v1/chat/ndjson` | `ndjson` | SC-007: recent logs for payments |
| SSE stream | `POST /v1/chat/sse` | `sse` | SC-006: live status of all services |
| WebSocket | `WS /v1/chat/ws` | `ws` | SC-008: is order A-300 still active |

The HTTP endpoints take `POST {"input": "..."}`. The WebSocket endpoint takes
`{"input": "..."}` as its first message.

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **A Z.ai GLM API key.** The agent uses the model `GLM-5.3-Flash`.
- **Rook CLI**, signed in: `npm install -g @testmuai/rook`, then `rook login`
- **Ports 9110 and 9200 free.** The agent uses 9110 and the mock backend uses 9200.

The commands below are for Windows PowerShell, run from the project folder.

## Setup (once)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r agent\requirements.txt
npm install
Copy-Item .env.example .env
```

Open `.env` and set `GLM_API_KEY` to your own key. Leave the other values as they are:

```
LLM_PROVIDER=glm
GLM_BASE_URL=https://api.z.ai/api/anthropic
GLM_API_KEY=<your key>
GLM_MODEL=GLM-5.3-Flash
```

## Start the servers

> **Important:** the agent only answers while **both** servers are running.
> Rook calls the live agent, so start them before any `rook profile add`,
> `rook profile test` or `rook run`.

Use two terminals and leave both open.

```powershell
# Terminal 1: mock backend (127.0.0.1:9200)
npm run start:mock
```

```powershell
# Terminal 2: the agent (127.0.0.1:9110). It also starts its MCP tool servers.
.\.venv\Scripts\python -m uvicorn --app-dir agent server:app --host 127.0.0.1 --port 9110
```

Wait for `Ops Assistant ready: provider=glm model=GLM-5.3-Flash, 5 tools`, then check both:

```powershell
Invoke-RestMethod http://127.0.0.1:9200/health
Invoke-RestMethod http://127.0.0.1:9110/health
```

Try a request:

```powershell
$body = @{ input = "What's the status of order A-100?" } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:9110/v1/chat -Method Post -ContentType application/json -Body $body
```

Stop either server with Ctrl+C. **Restart the agent after changing `.env`**,
because it reads `.env` only when it starts.

## How the Rook profiles were created

A Rook profile tells Rook how to call the agent. From the material you give it,
Rook writes a small Node script. The script sends each scenario's goal to the
endpoint and turns whatever comes back into one object:
`{"agent_reply": "...", "calls": [...]}`. Rook's judge only ever sees that
object, never the raw HTTP response.

Each format has an input file in `rook/`: a curl command, or, for WebSocket, a
short note with a `wscat` example, because curl can't do WebSocket. With both
servers running, each profile was created with:

```powershell
rook profile add json   --from rook/json.txt   --yes
rook profile add text   --from rook/text.txt   --yes
rook profile add async  --from rook/async.txt  --yes
rook profile add ndjson --from rook/ndjson.txt --yes
rook profile add sse    --from rook/sse.txt    --yes
rook profile add ws     --from rook/ws.txt     --yes
```

`profile add` writes the script, calls the live agent once to test it, and
corrects the script if needed. It costs Rook credits.

What Rook built for each format:

| Profile | Given to Rook | What the generated script does | Reports tool calls |
| --- | --- | --- | --- |
| `json` | curl | POSTs, reads `output` and `tool_calls` from the JSON | yes |
| `text` | curl | POSTs, reads the whole body as the answer | yes, from the `X-Tool-Calls` header (manual edit, below) |
| `async` | curl | POSTs, gets `job_id`, polls `GET /v1/jobs/{id}` until `done` | yes |
| `ndjson` | curl with `-N` | Waits for the whole stream, reads the final `done` event | yes |
| `sse` | curl with `-N` | Waits for the whole stream, parses `data:` lines, reads the `done` event | yes |
| `ws` | wscat note | Opens a WebSocket, sends the goal, reads the `done` event when the server closes | yes |

### Manual edit to the `text` profile

> **Important:** this profile was edited by hand after Rook created it.

The text endpoint returns only the answer, so Rook had no way to see which
tools ran. Every "tool X was called" check came back **Unable
to Verify**. The fix:

1. **Agent:** `/v1/chat/text` sends the tool calls in an `X-Tool-Calls`
   response header, for example
   `[{"name":"summarize_incident","args":{"incident_id":"INC-2041"},"ok":true}]`.
   The body is unchanged.
2. **Script:** `scripts/text.mjs` reads that header and returns it as `calls`.
3. **Profile:** `profiles/text.yaml` declares `capabilities: calls: true`.

### Where the Rook files are

The Rook workspace is not committed with this sample. Rook writes it under
`.testmuai/rook/projects/<project>/agents/ops-assistant/` as you run the
commands above:

```
profiles/    one .yaml per profile
scripts/     the script Rook wrote for each profile
scenarios/   one scenario per format
runs/        evidence from every run (verdict.yaml per scenario)
```

The scenario IDs used below (SC-001 … SC-008) and the hand edits in the notes
come from the workspace this sample was tested with. Rook numbers the
scenarios it generates for you on its own, so match them by format.

## Run the checks

With both servers running, select the project once, then run one format at a
time. Each run uses that format's profile, its matching scenario only, and its
own name.

SC-003 also needs Rook's judge to reach the agent's `data-server` MCP server
(see the notes below). It is declared in this folder's `.mcp.json`; approve it
once, after reading what it runs:

```powershell
rook mcp approve data-server
```

```powershell
rook project use <project-id>

rook run --profile json   --only SC-001 --name "v1 - json output check"      --yes
rook run --profile text   --only SC-003 --name "v1 - text output check"      --yes
rook run --profile async  --only SC-004 --name "v1 - async output check"     --yes
rook run --profile ndjson --only SC-007 --name "v1 - ndjson output check"    --yes
rook run --profile sse    --only SC-006 --name "v1 - sse output check"       --yes
rook run --profile ws     --only SC-008 --name "v1 - websocket output check" --yes
```

Change the `v1` prefix for each new round of runs. Read a run's results with:

```powershell
rook report <run-id> --json
```

## Important notes

> **Streams are judged on the final answer only.** For NDJSON, SSE and
> WebSocket, Rook's scripts wait for the stream to finish and pass only the
> final answer to the judge. Streaming behaviour is not tested: chunk order,
> chunks arriving gradually, time to first chunk. The raw stream is not saved.

> **Scenarios were cleaned up by hand. Don't run `rook generate --force`**, or
> these fixes will be overwritten:
> - **SC-006:** Rook wrote regex checks starting with `(?i)`, which its own
>   checker rejects ("Invalid regular expression … Invalid group"). The `(?i)`
>   was removed.
> - **SC-008:** Rook wrote `arguments: {}` on an `expect: called` tool check,
>   which its grader refuses to grade. That line was removed.
> - **SC-007:** the goal was reworded so it doesn't contain the expected answer.
> - **SC-003:** the text endpoint reports which tools ran but not what they
>   returned, so the judge often marked "doesn't invent incident details"
>   **Unable to Verify**. The scenario now declares
>   `verification_requires: [{type: mcp, server: data-server, op: summarize_incident}]`,
>   so the judge calls `summarize_incident` itself and compares. Without the
>   `rook mcp approve data-server` step above, that check goes back to Unable
>   to Verify.

> **`LT_USERNAME` / `LT_ACCESS_KEY` override `rook login`.** If these environment
> variables are set, Rook uses that account instead of the one you logged in
> with. Clear them in the terminal you run Rook from, then confirm the account
> with `rook doctor`:
>
> ```powershell
> Remove-Item Env:LT_USERNAME, Env:LT_ACCESS_KEY -ErrorAction SilentlyContinue
> rook doctor
> ```

> **On Windows, Rook can't renew its sign-in.** When the session expires (about
> hourly), commands fail with an `EPERM` "OAuth refresh blocked" error. Run
> `rook login` again. Logging in again also clears the selected project, so
> run `rook project use <project-id>` afterwards.

> **One Rook session per folder.** An open interactive `rook` session in this
> folder blocks every other Rook command with `workspace_busy`. Close it first.

> **Credits.** `rook profile add` cost 65–193 credits per profile. Each run cost
> 12–31 credits. `rook profile test` is free.
