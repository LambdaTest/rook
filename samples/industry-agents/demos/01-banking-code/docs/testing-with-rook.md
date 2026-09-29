# Agent Assurance — ROOK

Start the customer application using its folder's README. Introduce the agent, its tools and the business rule at risk, then open Rook in a separate terminal.

## Discover the agent

Prepare a fresh workspace as described in the README. The Developer edition supplies source and requirements. The QE edition supplies requirements and the connection contract, without agent source.

Enter these commands in the interactive Rook terminal:

```text
/explore . Read PRD.md as the required behavior and inspect the supplied agent material.
/agent
/generate --class functional,non_functional,adversarial --total 18
/scenarios list
```

Review the discovered responsibilities and each generated scenario. Check customer goals and acceptance criteria against the requirements. A requested count does not guarantee coverage of every category.

## Connect and run locally

```text
/profile add http --from connection.md
/profile show http
/profile test http
/run --test --profile http
/report
```

The profile describes how Rook reaches the agent and collects evidence. Keep one conversation across a scenario's turns, with separate conversations between scenarios. Review the run plan before proceeding. For a short presentation, select a reviewed scenario with `--only SC-ID`.

`--test` keeps the run out of the hosted project timeline. Model and judging requests still use their respective services; local storage does not mean offline inference.

## Inspect what Rook wrote

Open `.testmuai/rook/` in the workspace:

| Artifact | What to inspect |
|---|---|
| `agent.yaml` | Discovered agent, interface and tool responsibilities |
| `features/*.yaml` | Behavior derived from the supplied material |
| `scenarios/*.yaml` | Customer goals and acceptance criteria |
| `profiles/*.yaml` and `scripts/` | Connection configuration and evidence collection |
| `runs/<run-id>/run.yaml` | The scope and profile selected for this run |
| `runs/<run-id>/report.yaml` | The recorded findings |
| Per-scenario requests, responses and verdicts | What was asked, returned and judged |
| Collected evidence files | Tool calls, timing and business receipts |

These files are under the selected project's agent directory. They can be read, reviewed and compared without opening the hosted UI. `/ui --local` is an optional on-disk viewer; the recorded walkthroughs use the hosted UI for the sharing chapter.

For a finding, connect the criterion to the actual action: a tool call shows an attempt; a business receipt shows what happened. Missing evidence remains **Unable to Verify**.

## Share when ready

```text
/sync
/run --profile http
/ui
```

`/sync` records the reviewed project definitions upstream. The next run, without `--test`, records its results in the hosted timeline. It is a **new shared run**: syncing does not promote the earlier local test run. Open **agent → run → scenario** and check the matching run ID before reviewing its evidence.

## Continue with the supplied scenario pack

For repeatable customer examples, use the separate prepared workspace from `npm run rook:setup` and `npm run rook`. It includes 18 authored categories and connection profiles for these service conditions:

| Capability | Command inside the prepared Rook workspace |
|---|---|
| Everyday request | `/run --test --only SC-101 --profile demo-normal` |
| Multi-turn context | `/run --test --only SC-105 --profile demo-normal` |
| Role-play attack | `/run --test --only SC-111 --profile demo-normal` |
| Prompt injection | `/run --test --only SC-110 --profile demo-poisoned-context` |
| Dependency failure | `/run --test --only SC-104 --profile demo-dependency-error` |
| Tool timing | `/run --test --only SC-106 --profile demo-slow-tool` |
| MCP connection | `/profile test demo-mcp`, then `/run --test --only SC-105 --profile demo-mcp` |

For a before/after comparison, exit Rook and reopen the prepared workspace using `DEMO_VARIANT=hardened npm run rook`. Keep the scenario and service condition unchanged. The application's version selector controls only its own conversation.

The supplied profiles do not claim complete token usage, so cost checks remain disabled through them. See the [coverage inventory](category-coverage.md) and [recorded limits](verification.md). Present the result that actually occurs; model responses can vary.
