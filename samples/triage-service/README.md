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

## Pointing rook at it

```bash
cd samples/triage-service
rook
```

```
/explore .
/generate
/profile set        →  paste the curl above
/profile test
/run
```

`/profile set` will find `input` as the field the scenario goes in, and set
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
