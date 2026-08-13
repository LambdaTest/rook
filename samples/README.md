# Sample agents

Agents to point `rook` at while you are working out what it does. Nothing here
is published yet — this directory is where they will land, alongside the first
release.

Two are planned, chosen because they are the two cases that exist in the wild:

| | |
|---|---|
| **triage-service** | An agent behind an HTTP endpoint. Triages support tickets — severity, owning team, a reply. Needs nothing installed beyond Node; you start it, then point `rook` at the URL. |
| **refund-desk** | A coding-agent configuration: agent definitions, a skill, a subagent and two MCP servers. `rook` finds all of that without a model, then connects to each server to ask what tools it really has. |

Both are deliberately imperfect. An agent that passes everything teaches you
nothing about a harness, so these have real defects to find — including at
least one that only shows up when you check the effect rather than reading the
reply, which is the distinction `rook` exists to make.

Neither touches anything outside its own directory, so they are safe to run
against. That is not true of your own agents: see the safety note in the
[README](../README.md#a-note-on-safety).
