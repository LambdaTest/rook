# Scenarios

[Guide index](README.md) · Next: [Evidence and verdicts](evidence-and-verdicts.md)

Rook 0.1.1 derives scenarios from the selected agent's features. Each scenario
has criteria to judge and a class: `functional`, `non_functional`, or
`adversarial`. Default generation covers functional and adversarial scenarios.

## Generate and inspect

Generation spends credits. Choose a count and scope that fit your budget:

```bash
rook generate --total 5 --class functional
rook scenarios list --json
```

You can focus generation with `--category prompt_injection,jailbreak` or
instruction text after `--`. See the [category reference](../../skill-installer/skills/references/scenarios.md#classes-and-categories)
for accepted values.

Rook pins generated scenarios to their features. Later generation refreshes
stale features; `--force` re-derives everything. `generate --json` still emits
text at 0.1.1, so check its exit code and use `scenarios list --json` to inspect
the result.

## Curate the set

Exclude scenarios you want to retain without running, then include them again
when needed:

```bash
rook scenarios exclude SC-004 SC-009 --json
rook scenarios include SC-004 --json
```

Replace the example IDs with your own. These commands take separate ID
arguments. Check `changed` and `unknown` in the response: a comma-joined
string counts as one unknown ID, and `ok: true` can accompany no change.
`rook scenarios delete <id>` permanently removes a scenario.

The list recomputes `unrunnable` against the current profile. Missing
capabilities, such as file, image, or MCP access, can prevent execution.
Rook skips those scenarios and reports an assurance gap, not a Fail verdict.

## Select a run

Runs spend credits and invoke the real target. Review the
[target and permissions](authentication.md#tool-permissions) first.

```bash
rook run --only SC-001,SC-002 --concurrency 1 --json
rook run --class adversarial --name "adversarial-check" --json
```

These are alternative selections. `--only` takes one comma-separated
argument; repeating it keeps only the last occurrence. A space-separated
second ID becomes instruction text. You can also filter with `--category`
and free-form `--tag` values. Concurrency accepts 1 through 8.

Use `--test` for a local result outside the project timeline. Advanced phase
selection and continuation are described in the
[scenario reference](../../skill-installer/skills/references/scenarios.md#scoping-a-run):
`--run <id>` applies selected phases to that run, while `--resume <id>`
carries finished work into a new run.
