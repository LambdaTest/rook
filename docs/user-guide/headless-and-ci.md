# Headless use and CI

[Guide index](README.md) · Next: [Troubleshooting](troubleshooting.md)

Rook 0.1.1 uses headless mode when stdin is not a TTY or a supported CI
environment variable is set. Use the complete
[canonical CI recipe](../../skill-installer/skills/references/ci.md) for an
executable pipeline. This page explains the checks that recipe performs.

## Prepare the job

Install Rook 0.1.1, bash, and jq. Prepare a committed project `.testmuai/rook/`
tree with the intended agent and a selected, configured profile. Supply
`LT_USERNAME`, `LT_ACCESS_KEY`, `ROOK_PROJECT_ID`, `ROOK_AGENT_ID`, and the
profile's declared environment variables through CI configuration and secrets.
Outside GitHub Actions, set `GITHUB_RUN_ID` to a job label.

Before enabling the job, review the target's real writes, credit spend, and
tool grants. The recipe uses broad `--yes` approval; deny policy still applies.
There is no aggregate task-credit-limit flag or per-target headless write
confirmation at 0.1.1. See [Authentication and access](authentication.md).

The recipe syncs scenarios and the profile upstream before running. For a
local result, omit sync and use `run --test` with the same result checks.
Choose that policy explicitly. Retain the project tree for run history;
never cache or commit the credential directory `~/.testmuai/rook/`.

## Handle output by command

| Output at 0.1.1 | Commands |
| --- | --- |
| JSON documents with `--json` | `run`, ordinary `report`, `plan`, `status`, and `scenarios list` |
| Text despite `--json` | `explore`, `generate`, `sync`, profile commands, `report --rca`, and ordinary `update` |
| Possibly empty stdout on failure | Parser errors and admission refusals on `report`, `status`, or `ask` |

Keep stderr alongside stdout. Do not pipe text-only commands into `jq` or
assume an error must contain JSON. Read `error`, `reason`, and `remedy` when
present; otherwise use the stderr diagnostic. `credits: null` in a plan means
the balance could not be fetched. See the
[full output contract](../../skill-installer/skills/references/headless-contract.md#json-documents)
for other commands and document fields.

## Gate on completion and verdicts

Exit `0` means command completion, including runs with Fail verdicts. Exit
`1` covers command errors and refusals; there are no separate unauthorized or
credit-exhaustion exit codes at this version.

A refused run can exit `1` with `ok: true, discarded: "refused"`; its reason
explains why nothing ran. A declined plan can exit `0` with
`discarded: "declined"`. A halted run can retain a report and exit `0`.
None establishes a completed suite.

The canonical recipe checks the run exit status, `ok`, `discarded`, `halted`,
and a nonempty run ID before reading that exact run's report. It validates
report identity and counts, so missing or malformed data cannot produce a
green build. Do not use the default latest report after a failed invocation.

It fails on command errors, incomplete runs, Fail or compromised scenarios,
unjudged or not-run scenarios, and zero executed scenarios. It prints Unable
to Verify separately without failing on that count alone. It also prints
unrunnable scenarios as an assurance gap without failing on that gap alone.
Keep those gaps visible when interpreting a passing job.
