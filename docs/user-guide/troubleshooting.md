# Troubleshooting

[User guide](README.md) · [Headless use and CI](headless-and-ci.md)

For Rook 0.1.1, start with these free setup checks:

```bash
rook doctor
rook auth status
rook plan --json
rook status --json
```

Read diagnostics as well as exit codes: an unreachable `auth status` can exit
`0`, and `credits: null` means the balance could not be fetched.

| Problem | Next action |
| --- | --- |
| Signed out | `rook login`; supply credentials through secrets in CI |
| Missing project or agent | Select the intended ID with `project use` or `agent use` |
| Access denied or no credits | Ask your organization admin for access or check `rook plan` |
| Exploration found no agents | Check the source path and saved state before another paid attempt |
| Profile failed or `agent_never_ran` | Inspect the exchange; test or repair the profile after approving target calls and any credits |
| Unable to Verify | Inspect the criterion and saved evidence to identify what Rook could not observe |

For a refused command, read `error`, `reason`, or `remedy` when present.
If stdout is empty, use stderr. The [troubleshooting reference](../../skill-installer/skills/references/troubleshooting.md)
explains remedies and known 0.1.1 evidence limits, including empty call arrays
and JSON-string responses. Preserve unknowns rather than changing criteria to
obtain a pass. [Profile instructions](../../skill-installer/skills/references/profiles.md)
cover connection tests and repair.

For a bug or disputed verdict, follow [CONTRIBUTING.md](../../CONTRIBUTING.md).
Include the command, Rook version, OS, run/scenario IDs, and the relevant
criterion and evidence. You can prepare logs with
`rook export logs --out ./rook-logs`; review them before sharing. Keep
credentials, customer data, and transcripts out of public issues. Follow
[SECURITY.md](../../SECURITY.md) for security reports.
