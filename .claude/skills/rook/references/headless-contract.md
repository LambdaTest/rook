# Headless contract, rook 0.1.1

Everything here was read from `rook help <cmd>` of rook 0.1.1 or from the
source at tag `v0.1.1`. When rook moves, this file moves with it and
`scripts/test-skill-flags.sh` pins the version.

## Commands

Costed commands call a model and say what they spent. Free commands read disk.

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
| `rook update [auto] [--json]`                                                                                                                                                                                                                                                           | no                         | is a newer rook available                                                        |

`--yes` approves every tool call for that one command and writes nothing to
settings. `--allow 'bash(npm test)'` authorises one call shape, repeatable,
and `'bash(git *)@explore'` scopes it to one phase. Prefer `--allow`.

## Exit codes

| Code | Meaning at 0.1.1                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | the command did what it said                                                                                                          |
| `1`  | anything else: signed out, refused by the admission gate, unreachable service, bad flags, no active agent, a run that could not start |

There is no separate code for unauthorized or exhausted credits at 0.1.1. Read
the failure document's `remedy` instead.

A finished `rook run` exits `0` even when scenarios failed. The verdicts are in
the run document and on disk; a pipeline gates on them, not on the exit code.

## JSON documents

`--json` prints exactly one pretty-printed JSON document on stdout, once, at
the end. Prose (progress, warnings, the human summary) goes to stderr. Parse
stdout with `jq` and ignore stderr unless the exit code is 1.

Failure, on every command that emits documents:

```json
{ "ok": false, "error": "not signed in — run `rook login`", "remedy": "login" }
```

`remedy`, when present, is the admission gate's own token, one of: `login`,
`new_session`, `retry`, `request_access`, `create_project`, `pick_project`,
`agent_missing`, `explore_agents`, `pick_agent`, `topup`, `reconcile`, `update`.
It names what to do, not a sentence.

| Command                                           | Document                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan --json`                                     | `{ username, user_id, org_name, org_id, subscription, credits }`. `credits` is `null` when the balance could not be fetched, never `0`.                                                                                                                  |
| `run --json`                                      | `{ ok, error?, run_id?, halted, reason?, discarded?, unrunnable?: [...], flag_problems?: [...], credits, report? }`. `report` is the run's `report.yaml` (see `verdicts.md`).                                                                            |
| `report --json`                                   | `{ run_id, name?, dir, report }` or a failure document. `dir` is the run folder.                                                                                                                                                                         |
| `scenarios list --json`                           | `{ agent_id, profile_id, total, runnable, scenarios: [ { scenario_id, title, feature_id, class, category?, state, excluded, unrunnable, multi_turn, repeat, criteria } ] }`                                                                              |
| `scenarios exclude \| include \| delete … --json` | `{ ok: true, verb, … }`                                                                                                                                                                                                                                  |
| `status --json`                                   | `{ project_id, offline, agents: [ { local_id, name, tree, offline, features, scenarios, profiles, unfinished_runs, owed_runs } ], runs? }`. `tree` is `unsynced \| clean \| ahead \| diverged \| behind \| unknown`; `unknown` means offline, not clean. |
| `update --json`                                   | `{ ok, pinned }` or the update notice                                                                                                                                                                                                                    |
| `mcp … --json`                                    | the server list / one server's config                                                                                                                                                                                                                    |
| `ask --json`                                      | the answer document                                                                                                                                                                                                                                      |

**No document at 0.1.1** from `explore`, `generate`, `sync`, `profile add|fix|test`.
They accept `--json` and print their result lines to stdout as text. For these,
use the exit code, then read the files under `.testmuai/rook/` (below).

## Streams

- stdout: the JSON document under `--json`; otherwise the human output. The
  four commands that emit no document — `explore`, `generate`, `sync` and
  `profile` — keep their text on stdout even under `--json`.
- stderr: prose under `--json`; errors always; `--verbose` events always.
- Run progress lines (`  SC-001: …`) go to stdout normally and to stderr under `--json`.

## Events

Under `--verbose`, one line per event on stderr, rendered by rook, not JSON: `phase_start`,
`phase_end`, `child_agent_start`, `child_agent_end`, `tool_start`, `tool_end`,
`credits` (charged, session_spent), `scenario_start`, `scenario_done`
(scenario_id, status), `permission`, `ask_user`, `error`. Use it to narrate a
long run; do not parse it.

## On disk

Project side, committable, under the folder rook was pointed at:

```
.testmuai/rook/settings.json                       active_project_id
.testmuai/rook/projects/<project-id>/
  active                                           the active agent
  agents/<agent-id>/
    manifest.yaml  discovery.yaml  features.yaml  context.md  findings.yaml
    profiles/                                       <profile-id>.yaml, active
    agents/                                         reserved, empty at 0.1.1
    scenarios/                                     the live scenario set
    runs/<run-id>/
      run.yaml                                     manifest: what ran, timings, profile revision
      scenarios.yaml                               the scenarios as they were for this run
      report.yaml                                  the summary `report --json` returns
      report.evidence                              sealed evidence bundle
      scenarios/<scenario-id>/
        request.json  response.json  artifacts/    the exchange
        verdict.yaml                               the graded result (see verdicts.md)
```

Home side, never committed: `~/.testmuai/rook/` holds credentials, settings,
permission grants and session transcripts.

Verdicts are the record. `run` and `report` both read them back from
`verdict.yaml`; a partial run still reports the verdicts it wrote.
