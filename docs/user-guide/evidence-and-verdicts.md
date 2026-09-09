# Evidence and verdicts

[Guide index](README.md) · Next: [Headless use and CI](headless-and-ci.md)

Rook 0.1.1 records **Pass**, **Fail**, and **Unable to Verify**. Keep all three
separate. Unable to Verify means Rook could not establish the result; it is
neither a pass nor a failure.

## Read a specific run

Use the ID returned by the run you want to inspect:

```bash
rook report <run-id> --json
rook ui --local
```

A saved report is enough to start reviewing. You do not need to run setup or
another paid test to interpret it. `rook report` is free without `--rca`;
adding `--rca` spends credits on explanations and updates the report. After
that paid command, request `rook report <run-id> --json` separately to obtain
a JSON document.

The report includes totals, failure and unverifiable clusters, and an evidence
directory in `dir`. Under that directory, inspect `run.yaml`, `report.yaml`,
and `scenarios/<scenario-id>/verdict.yaml`. Each scenario also has a snapshot
and request/response evidence. See the [on-disk layout](../../skill-installer/skills/references/headless-contract.md#on-disk).

## Explain the result

Report the agent, run ID, executed count, separate Pass/Fail/Unable to Verify
counts, and evidence location. Call out compromised adversarial scenarios.
For a failure, quote the criterion evidence and explain expected versus
achieved. Do not supply a quote if the evidence is missing.

Each verdict includes per-criterion status, evidence, and confidence. There
is no partial-pass status. A scenario that did not run has no verdict;
`not_run`, `unjudged`, and `unrunnable` counts describe gaps rather than passes.
Use the [verdict field reference](../../skill-installer/skills/references/verdicts.md)
when you need exact report fields.

| Unverifiable reason | What it tells you |
| --- | --- |
| `agent_never_ran` | Transport, provider, or empty-reply problems prevented a usable invocation; inspect the profile and exchange |
| `not_observable` | Rook could not observe what the criterion required |
| `undecidable` | The judge could not decide from the available evidence |

Group unknowns by reason and state what would make each check possible. Judges
verify without mutating state: calling a refund-creation tool cannot prove
that a refund already exists. A separate read-only status tool may verify it.
An agent's write capability alone does not make its effects unverifiable.

Inspect saved raw responses and hook records before claiming the target
omitted evidence. At 0.1.1, an empty execute `calls` array can disappear from
the hook record, and `json_path` checks do not decode a JSON string inside
`raw_response` before traversal. Retain the verdict and explain these limits;
do not invent calls or weaken criteria to force a pass.

## Completion, comparisons, and cost

A finished run exits `0` even with failed scenarios. A declined or halted run
can also exit `0`; describe it as declined or incomplete and retain any evidence.
Do not infer completion from `ok: true`, or use an old report as evidence that
a failed invocation ran. Read the [headless checks](headless-and-ci.md).

Compare scenario snapshots across runs before calling a change a regression
or a flaky result. A changed scenario is redefined, so its history no longer
compares on the same terms. Missing optional summary fields do not establish
which flags ran or why a field is absent. No compromised cluster does not
establish that no adversarial scenarios ran.

For a fresh run, top-level `credits` in `run --json` includes its report.
For a saved report, present `report.metrics.credits` for execution/judging and
`report.credits` for report generation separately. A later RCA can rewrite
report spend; the saved report is not a cumulative billing history.
