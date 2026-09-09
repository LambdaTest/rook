# Profiles

[Guide index](README.md) · Next: [Scenarios](scenarios.md)

In Rook 0.1.1, a profile contains scripts and declared environment-variable
names. Rook authors the scripts from your invocation instructions. The
`execute` hook receives the goal on stdin and emits one JSON object with a
nonempty `agent_reply`.

## Supply the real invocation

Choose the transport from your target's source or configuration. Supply a
curl for HTTP, a command containing `{{goal}}` for a command-line target, or
a tool on a declared MCP server. The examples below are for those specific
targets; replace them with your target's invocation.

**Profile authoring spends credits and calls the target.** `profile add`
writes a script, tests it with “Say hello and nothing else.”, and corrects it.
Review the target's declared writes and authorize its real actions first.
The headless examples use broad command-scoped approval with `--yes`; use
appropriate narrow `--allow` rules where possible. See
[tool permissions](authentication.md#tool-permissions).

For the triage sample's HTTP endpoint, put invocation material in a file:

```bash
cat > triage-profile.txt <<'EOF'
curl http://127.0.0.1:9110/v1/triage -H 'content-type: application/json' -d '{"input":"{{goal}}"}'
EOF
rook profile add triage-http --from triage-profile.txt --yes
```

For a Claude Code command-line target:

```bash
rook profile add refund-cli --command 'claude -p "{{goal}}"' --yes
```

`--from` accepts material such as a curl, specification, or notes; without
`--from` or `--command`, Rook reads that material from stdin. Inspect the
result and select the profile by its returned ID:

```bash
rook profile show <profile-id>
rook profile use <profile-id>
rook profile test --goal "Say hello and nothing else." --yes
```

`profile test` makes one real call and uses no Rook model credits. Repeat it
after changing the target URL, authentication, or command. If it fails,
inspect the exchange before trying the costed `rook profile fix <profile-id>
--what "<problem>"`. Profile repair can also call the target; without `--what`,
it runs the profile to find the problem.

Profile commands accept `--json` but produce text, not a JSON document, at
0.1.1. Use their exit status and inspect the saved profile.

## Environment values

Use references such as `${API_KEY}` in invocation material. Store values
with `rook env set '<json>'` outside the synced profile, and avoid putting
secret values in shell history, transcripts, scenarios, or commits.
`rook env list` masks values; `rook env show <key>` reveals one.

## MCP targets

Inspect the declared server with `rook mcp list --json` and `rook mcp get
<name> --json`. Project and discovered servers need approval after you review
what they run. User and local servers have no approval step. A server found
in the target's `.mcp.json` has origin `discovered`; approve it with
`rook mcp approve <name> --origin discovered` before exercising it.

See the [MCP reference](../../skill-installer/skills/references/mcp.md)
for server configuration and scope, and the
[profile reference](../../skill-installer/skills/references/profiles.md)
for the full authoring contract.
