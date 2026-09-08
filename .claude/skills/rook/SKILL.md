---
name: rook
description: Test, red-team, evaluate or regression-check an AI agent with rook (TestMu AI agent assurance). rook reads a codebase to find the agents, writes functional and adversarial scenarios, calls the agent for real through a profile, and grades what came back with quoted evidence and an explicit account of what it could not verify. Use for any request to test, evaluate, red-team, assure, or regression-check an AI agent, or to check an agent change before commit. Drive rook headlessly with --json and never grade an agent by reading its reply yourself.
---

# rook — agent assurance from the terminal

Use `rook` whenever the user wants to know whether an AI agent they own
behaves: test it, red-team it, check a change, compare two runs. Do not write
test cases by hand and do not grade the agent's reply yourself. rook derives
the scenarios from the code, invokes the agent, checks the effect, and quotes
what it found.

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

When the command exits 1, read the failure document on stdout
(`{"ok": false, "error": …, "remedy": …}`) and use the template in
`references/verdicts.md` under "When the run itself failed". `plan` and `run`
always write one; `report`, `status` and `ask` refused by the admission gate
exit 1 with an empty stdout, and the reason is the last line of stderr. Quote
that line as the error. Do not paste the rest of stderr.

## 2. Decision tree

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
| results         | `rook run --json`                                                                                         |
| upstream record | `rook sync`                                                                                               |

That is the order `rook guide` gives. You do not have to run every step; ask
for a later one and rook says what is missing rather than guessing.

## 3. Headless contract, in brief

Full detail: `references/headless-contract.md`.

- Add `--json` to every command that has it. stdout then carries one JSON
  document, once; prose goes to stderr.
- Exit `0` means the command did what it said; `1` means anything else. A
  finished run exits `0` even with failures. Gate on verdicts.
- `explore`, `generate`, `sync`, `profile` and `report --rca` accept `--json`
  but print no document at 0.1.1: use the exit code, then read
  `.testmuai/rook/projects/<project>/agents/<agent>/`. After `--rca`, run
  `rook report <run-id> --json` for the explained report as a document.
- Prefer `--allow 'bash(npm test)'` (one call shape, repeatable, scoped with
  `@<phase>`) over `--yes` (every tool call, this command only).
- Without `--yes` or an `--allow` rule, headless rook refuses any bash, fetch
  or MCP call the model asks for and prints the rule you can pass; read tools
  need no grant.
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
has `run.yaml`, `report.yaml`, `report.evidence`, and one `verdict.yaml` per
scenario. Layout: `references/headless-contract.md#on-disk`.

## 7. CI

```bash
rook login --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
rook explore . --yes
rook generate --yes --json
rook run --yes --json > run.json
rook report --json > report.json
```

This assumes `.testmuai/rook/` is committed with the project and agent already
selected; on a fresh runner add `rook project use <id>` and
`rook agent use <id>` before `explore`.

Fail the job on any `Fail` or `compromised` scenario in the report; print
`Unable to Verify` with reasons. Recipe and caveats: `references/ci.md`.

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
