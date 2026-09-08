# MCP servers

Servers rook itself, and the agents under test, may reach. Flags mirror
`claude mcp`.

```bash
rook mcp list --json
rook mcp get <name> --json
rook mcp add <name> -- <command> [args...]
rook mcp add <name> -t http --url https://host/mcp -H 'Authorization: Bearer ${TOKEN}'
rook mcp add <name> -s project -e KEY=VALUE -- <command>
rook mcp remove <name> -s project
rook mcp enable <name>
rook mcp disable <name>
rook mcp approve <name> --origin discovered
```

Scopes: `user`, `project`, `local` (default). `approve` trusts a project or
discovered server after rook has read what it runs; a declared server that
nobody approved is listed and not used.

When `explore` finds `.mcp.json` in the target, those servers appear with
origin `project` and need `approve` before a scenario can exercise them.
Values stay `${VAR}` references in `get` output.
