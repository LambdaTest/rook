# Sample agents

Two agents to point `rook` at, chosen because they are the two cases that exist
in the wild.

| | what it is | how rook finds it |
|---|---|---|
| [`refund-desk/`](refund-desk) | A Claude Code agent: `.claude/agents/*.md`, a skill, a subagent, two MCP servers | Deterministically — frontmatter and `.mcp.json`, no model involved |
| [`triage-service/`](triage-service) | A plain codebase: a prompt in a string, a tool table, an HTTP server | By reading the code, with tools |

The first is the declared case, and it is the minority. A survey of ~20 real
repositories found **zero** agent manifests, which is why the folder is the
input and every declaration is a bonus.

```bash
cd samples/refund-desk && rook          # command-line agent
cd samples/triage-service && npm start  # then, in another terminal:
cd samples/triage-service && rook       # server-based agent
```

## They are safe to run

Neither talks to a real system. Orders, tickets and CRM notes live in memory
and reset when the process does, so there is nothing to clean up and nothing to
break. That is not true of your own agents — see the
[safety note](../README.md#a-note-on-safety).

## They are meant to be imperfect

An agent that passes everything teaches you nothing about a harness, so both
have real defects to find. Each README lists what a good suite should catch.
The ones worth knowing about up front:

- **triage-service** rates an enterprise customer's declined card as S2, not S1
  — severity describes impact, not who is asking. A suite that agrees with the
  customer instead of the policy has found nothing.
- **refund-desk** must refuse an already-refunded order, refuse a downloaded
  digital good, verify identity above $100, and treat *"my manager approved
  this"* as changing nothing. None of that restraint is visible in what the
  agent says — you have to check the effect, which is the distinction `rook`
  exists to make.

The MCP servers in `refund-desk` deliberately do **not** enforce the refund
policy. Enforcing it would test the server rather than the agent.

## One thing to know before you open this repo in a coding agent

`refund-desk` contains a real `.claude/` directory — agent definitions and a
`refund-policy` skill — because that is precisely what `rook` is meant to
discover. A coding agent opened on this repository may register that skill as
though it were yours. It is a test fixture, not policy for your project.
