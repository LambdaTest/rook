# Profiles: how rook reaches the agent

A profile is a script rook wrote plus the environment-variable names it
needs. The `execute` hook receives the goal on stdin and returns one JSON
object with a nonempty `agent_reply`. Values live in `rook env`, referenced
as `${VAR}`, so a profile is safe to commit.

Three kinds of target:

| Kind    | Give rook                      | Example                                                                                                    |
| ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| HTTP    | a curl                         | `curl http://127.0.0.1:9110/v1/triage -H 'content-type: application/json' -d '{"input":"look at T-1043"}'` |
| command | a command line with `{{goal}}` | `claude -p "{{goal}}"`                                                                                     |
| MCP     | a tool on a declared server    | see `mcp.md`                                                                                               |

## Authoring headlessly

```bash
printf '%s\n' "curl http://127.0.0.1:9110/v1/triage -H 'content-type: application/json' -d '{\"input\":\"{{goal}}\"}'" > /tmp/profile.txt
rook profile add triage-http --from /tmp/profile.txt --yes
rook profile add refund-cli --command 'claude -p "{{goal}}"' --yes
rook profile test --goal "look at ticket T-1043"
rook profile use <id>
rook profile show <id>
```

`profile add` writes the script, runs it once, and corrects it. It is costed,
prints no JSON document at 0.1.1, and needs `--yes` (or `--allow` rules) to
run its own test call without a prompt. With neither `--from` nor
`--command`, it reads the material from stdin.

`profile test` calls the agent once with `--goal` and says what came back.
Run it before the first `rook run` and after any change to the agent's URL,
auth, or command.

`profile fix [id] --what "<what is wrong>"` diagnoses and repairs; without
`--what` it runs the profile and finds out.

## Secrets

```bash
rook env set '{"API_KEY":"…","BASE_URL":"https://staging.example.com"}'
rook env list                                          # masked
rook env show API_KEY
rook env rm API_KEY
```

Never paste a value into a profile, a scenario, a transcript, or a commit.
Reference it as `${API_KEY}` and set it with `rook env set`.
