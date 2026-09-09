# Troubleshooting

[Guide index](README.md)

These checks describe Rook 0.1.1. Start with setup diagnostics; they spend no
Rook model credits:

```bash
rook --version
rook doctor
rook auth status
rook plan --json
rook status --json
```

`doctor` reports environment, endpoints, authentication, project, and mode.
Read the text as well as the exit code: an unreachable `auth status` can
exit `0`, and an unavailable balance appears as `credits: null`.

## The command could not start

Inspect stdout if it contains JSON. A refused run may have `ok: true` and a
`reason` instead of `error`. Gate refusals on `report`, `status`, and `ask`
can leave stdout empty; use stderr. Do not interpret an old report as a new run.

| Diagnostic or remedy | Next action |
| --- | --- |
| `login` | Sign in with `rook login`; use secret-backed credentials in CI |
| `create_project` or `pick_project` | Create or select the intended project |
| `pick_agent` or `agent_missing` | Inspect local state and select an existing agent |
| `explore_agents` | Discover the target after approving exploration credits |
| `request_access` | Ask your organization administrator for project access |
| `topup` | Check `rook plan` and arrange credits |
| `retry` | Check reachability with `doctor`, then retry |
| `new_session` | Run the command again |
| `reconcile` | Review local/upstream state and use `rook sync` |
| `update` | `rook update` may install a newer version; recheck guide compatibility afterward |

Only use a remedy token if Rook supplied one. The
[failure reference](../../skill-installer/skills/references/troubleshooting.md#failure-documents)
lists the command equivalents.

## Exploration found no agents

An exit-zero exploration with `0 analysed` does not establish readiness for
generation. Inspect `status` and the saved agent tree. Check whether you
selected the source containing the agent, rather than only a deterministic
simulator. If the source supports it, retry on the relevant file or directory
with a truthful description and an approved credit budget. `--force` re-derives
cached analysis. Repeating paid discovery without new evidence is unlikely
to explain the gap.

## The profile fails or results are unverifiable

Inspect the saved request, response, and hook records. `agent_never_ran`
points to the invocation, such as transport failure or an empty reply.
After reviewing real-call permissions, use `rook profile test --goal "Say
hello and nothing else."` to inspect one exchange. Repair with `profile fix`
only after approving its credits and target calls.

For `not_observable` or `undecidable`, identify the missing observation or
reasoning limit. At 0.1.1, empty execute `calls` arrays and JSON strings inside
`raw_response` have known evidence-checking limits. See
[Evidence and verdicts](evidence-and-verdicts.md). Preserve the result and
explain what would make it checkable; do not change criteria just to get a pass.

## Report a problem

For a disputed verdict, include the criterion, expected outcome, and the
evidence Rook quoted using the repository's
[issue templates](https://github.com/LambdaTest/rook/issues/new/choose).
Include the command, Rook version, OS/architecture, target transport, scenario
ID, and run ID when available. You can prepare a local log bundle with:

```bash
rook export logs --out ./rook-logs
```

Review it before sharing. Do not paste transcripts, credentials, customer
data, or the contents of `~/.testmuai/rook/` into a public issue. Follow
[CONTRIBUTING.md](../../CONTRIBUTING.md) for reports and
[SECURITY.md](../../SECURITY.md) for security issues.
