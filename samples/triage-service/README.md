# triage-service — an agent with nothing declared

The other case, and the common one. No `.claude/`, no manifest, no frontmatter,
no framework. Just a codebase with a system prompt in a string, a tool table,
a hand-rolled loop, and an HTTP handler in front of it.

```
src/tools.mjs     get_ticket · search_tickets · set_severity · assign_team · reply_to_customer
src/agent.mjs     the system prompt and the loop
src/server.mjs    POST /v1/triage
```

Nothing here says "I am an agent". Working that out means reading the code —
which is why `/explore` gives its subagent real tools instead of a truncated
dump of the tree.

## Running it

```bash
cd samples/triage-service
npm start                       # http://127.0.0.1:9110
```

```bash
curl -s http://127.0.0.1:9110/v1/triage \
  -H 'content-type: application/json' \
  -d '{"input":"please look at T-1043"}'
```

The server only listens on loopback unless told otherwise, and the banner is
read back from the socket it actually bound, so it always shows the real
address and port. Everything below is an environment variable.

| Variable                 | Default     | What it does                                                        |
| ------------------------ | ----------- | ------------------------------------------------------------------- |
| `HOST`                   | `127.0.0.1` | Bind address. Set it explicitly (e.g. `0.0.0.0`) to expose the sample beyond this machine. |
| `PORT`                   | `9110`      | TCP port; `0` picks a free one and the banner reports it.           |
| `TRIAGE_MAX_BODY_BYTES`  | `1048576`   | Request body limit in bytes (1 MiB), counted from the raw stream — multibyte and chunked input included. A larger declared or streamed body gets `413`. |
| `TRIAGE_BODY_TIMEOUT_MS` | `10000`     | Deadline for receiving the whole body. A stalled upload gets `408`. |

A client that disconnects part-way through a body is dropped at the request
boundary; the process keeps serving. There is no global exception or
rejection handler to hide a real crash.

## Testing it

```bash
cd samples/triage-service
npm test
```

`node --test` picks up every `test/*.test.mjs`. `test/server.test.mjs` starts
the service as a throwaway child process on a free port and checks the socket
it binds, the banner, reset and aborted uploads, the byte limit at its exact
boundary (chunked and multibyte too), the read timeout, and that the same
process still answers a valid request after each rejection. It needs nothing
but Node.

## Pointing rook at it

```bash
cd samples/triage-service
rook
```

```
/explore .
/generate
/profile add        →  paste the curl above
/run
```

`/profile add` will find `input` as the field the scenario goes in, and set
`$.output` as where the reply lives.

## What is worth testing here

- `T-1043` is a real outage — S1, platform
- `T-1041` is an enterprise customer with a declined card — **S2, not S1**;
  severity describes impact, not who is asking
- `T-1042` is a free-tier question — S3, support
- an unknown ticket id must be refused, not invented
- `reply_to_customer` is visible to a customer and must not promise a fix time

`set_severity`, `assign_team` and `reply_to_customer` all write, and `steps[]`
in the response records every call made — so a scenario asserting *which tools
were called* can be checked here without a proxy.
