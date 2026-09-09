# Headless contract, rook 0.1.1

Everything here was checked against rook 0.1.1. When rook moves, this file moves with it and
`scripts/test-skill-flags.sh` pins the version.

## Commands

Costed commands call a model and say what they spent. Free means no Rook model credits; a free command may use the network, change state or call your agent.

| Command                                                                                                                                                                                                                                                                                 | Costed                     | Purpose                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `rook login [--username <u> --access-key <k>] [--oauth]`                                                                                                                                                                                                                                | no                         | sign in; the two flags are the headless path                                     |
| `rook logout`                                                                                                                                                                                                                                                                           | no                         | revoke the stored token                                                          |
| `rook auth status` / `rook whoami`                                                                                                                                                                                                                                                      | no                         | verify the stored token (exit 1 when signed out or expired; unreachable exits 0) |
| `rook plan [--json]`                                                                                                                                                                                                                                                                    | no                         | account and credit balance                                                       |
| `rook project use <id>` / `rook project create <name>`                                                                                                                                                                                                                                  | no                         | pick or make the project everything is filed under                               |
| `rook explore [path] [instruction...] [--force] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                                                                          | yes                        | read a codebase, find the agents                                                 |
| `rook agent use <id>`                                                                                                                                                                                                                                                                   | no                         | pick the active agent                                                            |
| `rook generate [instruction...] [--total <n>] [--class <names>] [--category <names>] [--force] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                           | yes                        | write scenarios for the active agent                                             |
| `rook profile add [name] [--from <file> \| --command <argv>] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                                                             | yes                        | author how rook reaches the agent                                                |
| `rook profile test [id] [--goal <text>] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                                                                                  | no — calls your agent once | call the agent once                                                              |
| `rook profile fix [id] [--what <text>] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                                                                                   | yes                        | diagnose and repair a profile                                                    |
| `rook profile use <id>` / `rook profile show <id>`                                                                                                                                                                                                                                      | no                         | select / inspect                                                                 |
| `rook env list` / `rook env set '<json>'` / `rook env show <key>` / `rook env rm <key>`                                                                                                                                                                                                 | no                         | values profiles refer to as `${VAR}`                                             |
| `rook run [instruction...] [--only <ids>] [--class <names>] [--category <names>] [--tag <names>] [--profile <ref>] [--name <name>] [--phases <names>] [--skip <names>] [--concurrency <n>] [--test] [--run <id>] [--resume <id>] [--rca] [--yes] [--allow <rule>] [--json] [--verbose]` | yes                        | execute scenarios and judge                                                      |
| `rook report [runId] [--rca] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                                                                                             | only with `--rca`          | what a run found                                                                 |
| `rook scenarios list \| exclude \| include \| delete [<ids...>] [--json]`                                                                                                                                                                                                               | no                         | inspect and curate the set                                                       |
| `rook status [--agent <id>] [--json]`                                                                                                                                                                                                                                                   | no                         | local tree against upstream                                                      |
| `rook sync [--agent <id>] [--yes] [--allow <rule>] [--json] [--verbose]`                                                                                                                                                                                                                | no                         | record the project upstream                                                      |
| `rook runs sync [agent]`                                                                                                                                                                                                                                                                | no                         | send finished runs still owed upstream                                           |
| `rook mcp list \| get \| add \| remove \| enable \| disable \| approve …`                                                                                                                                                                                                               | no                         | see `mcp.md`                                                                     |
| `rook ui [--local] [--no-open]`                                                                                                                                                                                                                                                         | no                         | browser view                                                                     |
| `rook ask [prompt...] [--json] [--verbose]`                                                                                                                                                                                                                                             | yes                        | natural language → a command                                                     |
| `rook doctor`                                                                                                                                                                                                                                                                           | no                         | environment check, safe anywhere                                                 |
| `rook guide` / `rook help [cmd]` / `rook docs [--no-open]`                                                                                                                                                                                                                              | no                         | orientation                                                                      |
| `rook export logs [--out <path>] [--session <id>] [--all-sessions]`                                                                                                                                                                                                                     | no                         | bundle logs for a bug report                                                     |
| `rook update [auto] [--json]`                                                                                                                                                                                                                                                           | no                         | check for and potentially install a newer rook; announce the installation change first                                                        |

`--yes` supplies broad approval for that command and writes nothing to
settings; existing deny policy still applies. `--allow 'bash(npm test)'` authorises one call shape, repeatable,
and `'bash(git *)@explore'` scopes it to one phase. Prefer `--allow`.

## Exit codes

| Code | Meaning at 0.1.1                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | the command did what it said                                                                                                          |
| `1`  | anything else: signed out, refused by the admission gate, unreachable service, bad flags, no active agent, a run that could not start |

There is no separate code for unauthorized or exhausted credits at 0.1.1. Read
`remedy` when present, `reason` for a discarded run, or the stderr diagnostic
when there is no JSON document (below).

A finished `rook run` exits `0` even when scenarios failed. The verdicts are in
the run document and on disk; a pipeline gates on them, not on the exit code.

## JSON documents

Commands documented below as emitting JSON print one document on stdout.
Their prose goes to stderr. Other commands accept `--json` but still emit text;
do not pipe those outputs into `jq`. Inspect exit status AND the run document:
`ok: true` alone does not mean a run executed or finished.

Failure, as `plan` and `run` write it when the admission gate refuses, and as
`report` and `scenarios` write it for a command-level error (`no runs yet`,
`no active agent`):

```json
{ "ok": false, "error": "not signed in — run `rook login`", "remedy": "login" }
```

A run refused before execution can instead exit 1 with
`{ok:true, discarded:"refused", reason:"…", halted:false, credits:0}`.
A declined plan exits 0 with `discarded:"declined"`; neither produced a run.
Read `reason` when `error` is absent. A halted run may retain a report and
exit 0; report its interruption, not a completed suite. Parser errors may
leave stdout empty, so JSON failure documents are not guaranteed on every error.

`remedy`, when present, is the admission gate's own token, one of: `login`,
`new_session`, `retry`, `request_access`, `create_project`, `pick_project`,
`agent_missing`, `explore_agents`, `pick_agent`, `topup`, `reconcile`, `update`.
It names what to do, not a sentence.

A gate refusal on `report`, `status` or `ask` writes no document at 0.1.1: the
command exits `1` with stdout empty and the gate's sentence as the last line of
stderr. When stdout is empty, take that line as the error and translate it with
the table in `references/troubleshooting.md` under "Failure documents".

| Command                                           | Document                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan --json`                                     | `{ username, user_id, org_name, org_id, subscription, credits }`. `credits` is `null` when the balance could not be fetched, never `0`.                                                                                                                  |
| `run --json`                                      | `{ ok, error?, run_id?, halted, reason?, discarded?, unrunnable?: [...], flag_problems?: [...], credits, report? }`. `report` is the run's `report.yaml` (see `verdicts.md`).                                                                            |
| `report --json`                                   | `{ run_id, name?, dir, report }` or a failure document. `dir` is the run folder. With `--rca`, no document (below).                                                                                                                                      |
| `scenarios list --json`                           | `{ agent_id, profile_id, total, runnable, scenarios: [ { scenario_id, title, feature_id, class, category?, state, excluded, unrunnable, multi_turn, repeat, criteria } ] }`                                                                              |
| `scenarios exclude \| include \| delete … --json` | `{ ok: true, verb, … }`                                                                                                                                                                                                                                  |
| `status --json`                                   | `{ project_id, offline, agents: [ { local_id, name, tree, offline, features, scenarios, profiles, unfinished_runs, owed_runs } ], runs? }`. `tree` is `unsynced \| clean \| ahead \| diverged \| behind \| unknown`; `unknown` means offline, not clean. |
| `update --json`                                   | text, including installer output; may install an update. Only `update auto --json` emits `{ ok, pinned }` and changes the notice preference                                                                                                                                                                                                                    |
| `mcp … --json`                                    | `list`: `{ errors, servers: [{ name, origin, transport, state, source, changed_since_approval, shadowed_by }] }`; `get` and mutations: `{ ok, lines: string[] }`, with configuration rendered inside `lines`                                                                                                                                                                                                                    |
| `ask --json`                                      | `{ answer, command?, blocked_by?, summary? }`; a suggested command is not executed by this headless call                                                                                                                                                                                                                                      |

**No document at 0.1.1** from `explore`, `generate`, `sync`, `profile add|fix|test`
and `report --rca`. They accept `--json` and print result lines to stdout
as text. For these, use the exit code, then read the files under
`.testmuai/rook/` (below). `report --rca` rewrites the run's `report.yaml`, so
follow it with `rook report <run-id> --json` to get the explained report as a
document. `update` without `auto` also emits text; inspect its exit code and
installation diagnostics, then check `rook --version` rather than project files.

## Streams

- stdout: the JSON document under `--json`; otherwise the human output. The
  commands that emit no document — `explore`, `generate`, `sync`, `profile`,
  `report --rca` and `update` without `auto` — keep text on stdout under `--json`.
- stderr: prose under `--json`; errors always; `--verbose` events always.
- Run progress lines (`  SC-001: …`) go to stdout normally and to stderr under `--json`.

## Events

`--verbose` renders child-agent starts/ends, tool starts, failed tool ends,
credits, permission requests and errors on stderr as text. Phase events,
`ask_user`, and scenario start/done events are not rendered by this formatter.
Scenario progress is emitted separately, even without `--verbose`. Use these
lines to narrate progress; do not parse them as an event stream.

## On disk

Project side, committable, under the folder rook was pointed at:

```
.testmuai/rook/settings.json                       active_project_id
.testmuai/rook/projects/<project-id>/
  active                                           the active agent
  agents/<agent-id>/
    agent.yaml                                       the spec: what the agent is, what it calls
    features/<feature-id>.yaml                       one file per feature
    findings.yaml                                    what rook thinks is wrong, if anything
    profiles/                                        <profile-id>.yaml, active
    agents/                                          reserved, empty at 0.1.1
    scenarios/                                       the live scenario set
    runs/<run-id>/
      run.yaml                                       manifest: what ran, timings, profile revision
      agent.yaml  features.yaml  profile.yaml        the agent, features and profile as they were, snapshotted
      report.yaml                                    the summary `report --json` returns
      scenarios/<scenario-id>/
        snapshot.yaml                              the scenario as it was for this run
        request.json  response.json  artifacts/    the exchange
        verdict.yaml                               the graded result (see verdicts.md)
```

Home side, never committed: `~/.testmuai/rook/` holds credentials, settings,
permission grants and session transcripts.

Verdicts are the record. `run` and `report` both read them back from
`verdict.yaml`; a partial run still reports the verdicts it wrote.
