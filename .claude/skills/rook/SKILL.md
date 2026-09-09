---
name: rook
license: Apache-2.0
compatibility: Requires rook 0.1.1, network access and a TestMu AI account; CI examples also require bash and jq.
description: Use rook to test, evaluate, red-team or regression-check an AI agent the user owns, or to interpret saved Rook results. Applies to agent behavior and effects, including checks before a commit. Does not apply to ordinary unit tests, browser automation or web UI checks without an AI agent under test.
---

# rook — agent assurance from the terminal

Use `rook` whenever the user wants to know whether an AI agent they own
behaves: test it, red-team it, check a change, compare two runs. Respect an
explicit request to use another tool or to inspect saved evidence only. For
Rook runs, derive scenarios and verdicts through the CLI; do not substitute
your own judgment of the agent's reply for a Rook verdict. rook invokes the
agent, checks the effect, and quotes what it found.

When interpreting saved results, read the supplied report and verdict files.
Do not start setup commands, a new run or paid analysis unless requested. If
criterion evidence is missing, say what is missing; do not invent a quote.

Three verdicts exist and they are not interchangeable: **Pass**, **Fail**, and
**Unable to Verify**. The third is never a pass and never a failure. Keeping it
separate is the whole point of the tool; keep it separate in everything you
say.

---

## 1. Presenting results — read this first

A one-line "the agent passed" is a bug. After a run, present:

1. The results table from `references/verdicts.md`, filled from the run
   document (`rook run --json`) or `rook report --json`, and the verdict
   files on disk when you need per-criterion detail.
2. One line per failed or compromised scenario, with the criterion, expected
   vs achieved, and the quoted evidence.
3. The unverifiables, grouped by reason, each with what would make it
   checkable.
4. What changed since the previous run, when there is one.

Before a costed command, say what you are about to run and that it spends
credits. `explore`, `generate`, `run`, `profile add|fix`, `ask`, and
`report --rca` are costed. `profile test` calls your agent once and no model.
Everything else is free. Never add `--rca` without asking.

On exit 1, parse stdout when it contains JSON. Read `error`, or `reason`
for a discarded run, and translate `remedy` when present. A run can exit 1
with `ok: true, discarded: "refused"`: nothing ran. Never treat `ok: true`
alone as evidence that scenarios executed. If stdout has no JSON document,
quote the relevant stderr diagnostic. Gate refusals on `report`, `status`
and `ask` leave stdout empty. Use the failure template in `references/verdicts.md`.
For a partial run, present its evidence and explicitly say it did not finish.

## 2. Decision tree

Run `rook --version` first. This skill describes 0.1.1. If rook is absent,
follow the installation instructions in https://github.com/LambdaTest/rook.
If its version differs, verify command help and output contracts before using
these examples; do not automatically update or downgrade the user's installation.

```bash
rook doctor
rook status --json
```

`doctor` is safe anywhere and shows auth, project, endpoints and mode.
`status` says which agents exist locally and where they stand.

| Missing         | Command                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| signed in       | `rook login` (a person: browser flow) · `rook login --username <u> --access-key <k>` (headless)           |
| project         | `rook project use <id>` or `rook project create <name>`                                                   |
| agents          | `rook explore . --json`                                                                                   |
| active agent    | `rook agent use <id>`                                                                                     |
| scenarios       | `rook generate --json`                                                                                    |
| profile         | `rook profile add <name> --from <file>` or `--command '<argv>'`, then `rook profile test --goal "<text>"` |
| results         | `rook sync --yes` to record the scenarios/profile upstream, then `rook run --json` (or `rook run --test --json` for a local result)                                                                                         |
| upstream record | `rook sync`                                                                                               |

That is the order `rook guide` gives. You do not have to run every step; ask
for a later one and rook says what is missing rather than guessing.

## 3. Headless contract, in brief

Full detail: `references/headless-contract.md`.

- Add `--json` where supported, but check the command-specific contract:
  commands that emit a document keep prose on stderr; the exceptions below
  still emit text.
- Exit `0` means the command did what it said; `1` means anything else. A
  finished run exits `0` even with failures. Gate on verdicts.
- `explore`, `generate`, `sync`, `profile` and `report --rca` accept `--json`
  but print no document at 0.1.1: use the exit code, then read
  `.testmuai/rook/projects/<project>/agents/<agent>/`. After `--rca`, run
  `rook report <run-id> --json` for the explained report as a document.
- Prefer `--allow 'bash(npm test)'` (one call shape, repeatable, scoped with
  `@<phase>`) over `--yes` (broad approval, this command only; deny policy still applies).
- Headless rook refuses permission requests without effective authorization.
  Existing policy or session grants may authorize calls without `--yes` or
  `--allow`; omitting those flags is not a read-only guarantee. Read tools
  need no grant.
- `rook update` may install a newer release and emits text even with `--json`.
  Announce that installation change before invoking it; this skill's contract
  must be rechecked afterward.
- Check `rook plan --json` before a long run; `credits: null` means the balance
  could not be read, not that it is zero.
- `--concurrency 1-8`, `--only SC-001,SC-002`, `--class`, `--category`, `--tag`
  scope a run; `--test` keeps it out of the timeline; `--name` labels it.

## 4. Profiles

A profile is how rook reaches the agent: an HTTP endpoint (paste a curl), a
command line with `{{goal}}` such as `claude -p "{{goal}}"`, or an MCP tool.
Secrets are `${VAR}` references set with `rook env set '{"KEY":"…"}'`; never
inline a value. Prove a profile with `rook profile test --goal "…"` before
the first run; the call reaches the real agent, so make the goal one that asks
for nothing but a reply. Detail: `references/profiles.md`.

## 5. Safety

The agent under test is the user's, and its writes are real. rook invokes it
the way a user would and cannot roll anything back.

- Point it at staging. rook 0.1.1 does not pause for a per-target write-tool
  confirmation in headless mode, so before the first command that reaches the
  agent — `profile add`, `profile fix` and `profile test` all call it, not
  only `run` — read what the agent declares: `agent.yaml` under the agent's
  folder, whose `calls[]` entries carry `write: true` for the ones that mutate
  something outside the agent. Get the user's consent then, and give
  `profile test` a goal that asks for nothing but a reply.
- Do not pass `--yes` to `profile add` or to a run against an agent with write
  tools without telling the user what it declares.
- Judges verify without changing anything; calling `issue_refund` to find out
  whether a refund exists creates one, so rook reports such checks as
  unverifiable instead. Do not "help" by making the call yourself.
- `.testmuai/rook/` in the project is committable. `~/.testmuai/rook/` holds
  credentials and never is.

## 6. Where things live

Everything rook produces is plain files. Agents, scenarios, runs and evidence
sit under `.testmuai/rook/projects/<project-id>/agents/<agent-id>/`; each run
has `run.yaml`, `report.yaml`, and a scenario directory containing
`snapshot.yaml`, request/response files and `verdict.yaml` for each judged result.
The evidence location is the run directory itself. Layout: `references/headless-contract.md#on-disk`.

## 7. CI

Use the complete recipe in `references/ci.md`. It requires a selected,
configured profile and its environment variables, records generated scenarios
and the profile with `rook sync`, captures the run exit code, and reads the
report by that run's ID. It fails on command errors, incomplete runs, Fail or
compromised scenarios; Unable to Verify alone stays separate and is printed.

## 8. Troubleshooting

`rook doctor`, then `references/troubleshooting.md`. `rook export logs --out <dir>` bundles logs for a bug report. A verdict the user disagrees with is worth an issue with the repo's verdict-dispute template.

## 9. Which reference when

| Need                                                     | Read                              |
| -------------------------------------------------------- | --------------------------------- |
| every command, flag, exit code, JSON document, file path | `references/headless-contract.md` |
| verdict fields, the results table, the failure template  | `references/verdicts.md`          |
| classes, categories, curation, run scoping               | `references/scenarios.md`         |
| creating or fixing a profile, secrets                    | `references/profiles.md`          |
| a pipeline                                               | `references/ci.md`                |
| MCP servers the agent or rook needs                      | `references/mcp.md`               |
| something went wrong                                     | `references/troubleshooting.md`   |

Sample agents to try against: `samples/refund-desk` (a Claude Code agent
with a skill and two MCP servers) and `samples/triage-service` (a plain HTTP
service) in https://github.com/LambdaTest/rook. Both keep state in memory and
are safe to run.
