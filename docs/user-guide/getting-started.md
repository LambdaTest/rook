# Getting started

[Guide index](README.md) · Next: [Authentication and access](authentication.md)

This walkthrough uses Rook 0.1.1 from inside a project containing an AI agent.
If you need a target, start with the [sample agents](../../samples/README.md)
and follow the chosen sample's setup instructions.

## Check setup

```bash
rook --version
rook doctor
rook status --json
```

Use [authentication and access](authentication.md) to sign in and select or
create a project. Skip setup you have already completed. `doctor` is safe
anywhere; `status` shows the local agents and their state.

## Discover the agent and generate scenarios

The next commands spend Rook credits. Decide how much you will spend before
starting and track usage across commands; Rook 0.1.1 has no aggregate task cap.

```bash
rook explore .
rook status --json
rook agent use <agent-id>
rook generate --total 5 --class functional
rook scenarios list --json
```

Replace `<agent-id>` with the discovered agent you intend to test. If
exploration registers no agent, stop and inspect the result before generation.
Review the generated criteria and any `unrunnable` reasons in the scenario list.

## Connect and test the profile

Follow [Profiles](profiles.md) to supply the target's actual invocation. Profile
authoring spends credits and calls the target. Before authoring, testing, or
running it, review `agent.yaml`, including `calls[]` entries with `write: true`,
and authorize the target's real actions. Choose staging: Rook cannot undo writes.

Test the selected profile with a reply-only goal and the required tool grants:

```bash
rook profile test --goal "Say hello and nothing else."
```

This calls your target once, even though it uses no Rook model credits. In
headless mode, provide effective permission grants as described in
[Authentication and access](authentication.md#tool-permissions).

## Run and inspect

Record the reviewed scenarios and profile upstream, then run a small selection
using IDs from your scenario list. The run spends credits and invokes the target.

```bash
rook sync --yes
rook run --only SC-001 --concurrency 1 --json
```

`--yes` supplies broad tool approval for that sync command. Review the
authorization needed for the run; omitting `--yes` does not guarantee read-only
behavior, and headless mode has no per-target write confirmation.

Check the exit code and the run document's `discarded`, `halted`, and `run_id`.
A completed run exits `0` even when scenarios fail. Read that run by its returned
ID, replacing the placeholder below, and open the evidence view:

```bash
rook report <run-id> --json
rook ui --local
```

If you want a local result outside the project timeline, omit sync and use
`rook run --test` with your chosen filters instead. Read
[Evidence and verdicts](evidence-and-verdicts.md) before interpreting the counts.
Use the complete [CI recipe](headless-and-ci.md) for automated result checks.
