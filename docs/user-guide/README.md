# Rook user guide

Rook discovers an AI agent's features, generates scenarios, invokes the target,
and records verdicts with evidence. This guide covers **Rook 0.1.1**.

[Headless use and CI](headless-and-ci.md) · [Troubleshooting](troubleshooting.md)

## Install and sign in

Follow the [CLI installation instructions](../../README.md#install), then run
these commands from your agent repository:

```bash
rook --version
rook doctor
rook login
rook project use <project-id>
```

Replace placeholders with your IDs. Use `rook project create <name>` if you
need a project. For another CLI version, check `rook help <command>` before
using these examples.

The optional [coding-agent skill](../../README.md#for-ai-coding-agents-reading-this)
teaches your coding agent to use Rook; install the CLI separately. That page
covers current skill installation routes. `@testmuai/rook-skill` is forthcoming.

## Before spending credits or calling the target

Use a staging target you own. Review its actions and authorize real writes;
Rook cannot undo them. Profile authoring, repair, and testing also call the
agent. Headless Rook has no per-target write confirmation at 0.1.1.

`explore`, `generate`, profile authoring/repair, and `run` spend credits.
`profile test` calls the target once without Rook model credits. Check
`rook plan --json` and track your budget across commands: **there is no
aggregate task-credit-limit flag**. `credits: null` means the balance is
unavailable; a missing cost line does not mean a command was free.

The examples use `--yes` for broad approval for that command; deny policy still
applies. Prefer suitable narrow `--allow` rules when possible. Existing grants
can authorize calls even without these flags.

## Discover and connect

```bash
rook explore . --yes
rook status --json
rook agent use <agent-id>
rook generate --total 5 --class functional --yes
rook scenarios list --json
```

Select the discovered agent you intend to test. If none appears, inspect the
source and diagnostics before generating. Review scenario criteria and any
`unrunnable` reasons. See [scenario selection](../../skill-installer/skills/references/scenarios.md)
for curation and filters.

A profile supplies scripts that reach your target. Put its actual curl,
command, or invocation notes in `invocation.txt`, then:

```bash
rook profile add staging --from invocation.txt --yes
rook profile use <profile-id>
rook profile test --goal "Say hello and nothing else." --yes
```

Select the ID returned by profile creation. Keep secrets as `${VAR}` references
and supply their values through `rook env`. See
[profiles](../../skill-installer/skills/references/profiles.md) for command-line
and HTTP examples, or [MCP setup](../../skill-installer/skills/references/mcp.md).

## Run and read the result

Sync the reviewed profile and scenarios, then run one ID from your scenario list:

```bash
rook sync --yes
rook run --only SC-001 --concurrency 1 --yes --json
```

Check the exit status, `discarded`, `halted`, and returned `run_id`. A completed
run exits `0` even with failed scenarios. A declined or halted run can also
exit `0`; do not describe it as a completed suite. Read the specific run ID:

```bash
rook report <run-id> --json
rook ui --local
```

Keep **Pass**, **Fail**, and **Unable to Verify** separate. Unable to Verify
means Rook could not establish the result. Also check compromised scenarios
and unjudged, not-run, or unrunnable counts. The report's `dir` points to the
saved evidence; [verdicts](../../skill-installer/skills/references/verdicts.md)
explain criterion details. Ordinary reports are free; `--rca` adds paid analysis.

For a local result outside the project timeline, omit sync and use `run --test`
with the same filters and result checks. Keep project `.testmuai/rook/` for
history, but never commit or cache `~/.testmuai/rook/`, which holds credentials.
Try the [sample agents](../../samples/README.md) if you need a starting target.
