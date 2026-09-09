# Verdicts, and how to present them

## One scenario, one verdict

`runs/<run-id>/scenarios/<scenario-id>/verdict.yaml`:

| Field                                                | Meaning                                                                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario_id`                                        | which scenario                                                                                                                                                                                                        |
| `status`                                             | `Pass`, `Fail`, or `Unable to Verify`                                                                                                                                                                                 |
| `unverifiable_reason`                                | only with `Unable to Verify`: `agent_never_ran` (provider refused, transport failed, empty reply), `not_observable` (rook could not see the thing the criteria are about), `undecidable` (the judge could not decide) |
| `possible_evasion`                                   | the agent claimed it could not run and rook's measurements disagree                                                                                                                                                   |
| `criteria[]`                                         | per criterion: `criterion_id`, `criterion`, `expected`, `achieved`, `status`, `evidence` (a quote), `confidence` (`High`/`Medium`/`Low`)                                                                              |
| `pass_count`, `fail_count`, `unable_to_verify_count` | counts over `criteria`                                                                                                                                                                                                |
| `compliance_percentage`                              | how much of the criteria passed                                                                                                                                                                                       |
| `forbidden_hits[]`                                   | forbidden content that appeared                                                                                                                                                                                       |
| `compromised`                                        | adversarial scenarios only: the attack landed                                                                                                                                                                         |
| `impact`                                             | how bad one compromise was, separate from category severity                                                                                                                                                           |
| `matched_signal`                                     | the success signal the judge matched                                                                                                                                                                                  |
| `metrics`, `latency_ms`, `turns`, `usage`            | quality and cost                                                                                                                                                                                                      |

Three statuses, not four. There is no partial pass: five criteria asked, four
met, the scenario failed, and the per-criterion rows say by how much. A
scenario nobody ran is not a verdict; it is listed in `run.yaml` as not run.

## Run report

`runs/<run-id>/report.yaml`, also returned as `report` by `run --json` and
`report --json`. Fields, as rook 0.1.1 writes them:

| Field              | Meaning                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_id`           | which run this reports on                                                                                                                                                                                         |
| `agent_id`         | which agent                                                                                                                                                                                                       |
| `agent_version_id` | the tree revision this was written against, when known — a re-report on a moved version must re-derive rather than re-render                                                                                      |
| `generated`        | when the report was written                                                                                                                                                                                       |
| `headline`         | one sentence a person reads first — written on every report, `--rca` or not; when the summary role itself failed this reads `no run summary — <reason>` instead                                                   |
| `narrative`        | optional: what happened; absent when summary generation fails                                                                                                                                                      |
| `next[]`           | optional: what to do next, present only when the summary supplies nonempty next steps                                                                                                                                    |
| `totals`           | the same tally `run` reports: `planned`, `executed`, `passed`, `failed`, `unverifiable`, `unjudged`, `not_run`, `unrunnable`, `decided`, `pass_rate`, `carried_forward`                                           |
| `metrics`          | cost and quality: `credits`, `duration_ms`, `tokens_in`, `tokens_out`, `latency_p50_ms`, `latency_p95_ms`, `turns_total`, `quality`, `quality_samples`                                                            |
| `clusters[]`       | failures and unverifiables grouped by shared cause: `id`, `why`, `kind` (`failed`/`unverifiable`/`compromised`), `scenarios[]`, and — `--rca` only — `cause`, `remedy`, `confidence`, `fault`, `where`, `summary` |
| `credits`          | credits spent producing THIS report (the `--rca` explanations plus the summary call) — separate from the run's own spend, which is in `metrics.credits`                                                           |

## The rules that make a summary honest

Use only metadata supplied for the result being summarized. Missing summary
or RCA fields do not establish which flags were used, whether a role ran, or
why an optional field is absent. If the evidence directory was not supplied,
say so; a path derived from the documented layout is only an example, not a
verified location. Do not infer that no adversarial scenarios ran merely
because the report contains no compromised cluster.

1. `Unable to Verify` is never folded into `Fail` and never into `Pass`. It has
   its own column and its own count, always.
2. Quote the evidence. A criterion row without the `evidence` text is an
   opinion.
3. Say what changed since the last run when there is one: newly failing,
   fixed, flaky (flipped on an unchanged scenario), and redefined (the
   scenario text changed, so history no longer compares). Compare
   `scenarios/<scenario-id>/snapshot.yaml` files to tell redefined from flaky. Find the previous
   run under the agent's `runs/` folder, or in the `runs` field of
   `rook status --agent <id> --json`.
4. `compromised: true` is the headline of an adversarial run, above the counts.
5. `agent_never_ran` is rook's problem or the profile's, not the agent's. Say
   so, and point at `rook profile test` before anything else.

## The results table

```markdown
|                         |                                                                      |
| ----------------------- | -------------------------------------------------------------------- |
| **Agent**               | <name> (`<agent-id>`)                                                |
| **Run**                 | `<run-id>` · <totals.executed> scenarios · <run.credits> total credits |
| 🟢 **Pass**             | <n>                                                                  |
| 🔴 **Fail**             | <n>                                                                  |
| 🟡 **Unable to verify** | <n> — <reasons, counted>                                             |
| **Compromised**         | <n> adversarial scenarios (omit the row when none ran)               |
| **Evidence**            | `<dir>/`                                              |
```

`totals.executed` comes from `report.totals`. For a just-completed run, total
command spend is top-level `credits` from `rook run --json`: it includes the
report. `report.metrics.credits` excludes report generation. When only a saved
report is available, replace the total-credit label with two separate amounts:
`report.metrics.credits` execution/judging credits and `report.credits`
report-generation credits. A later RCA can rewrite the report spend, so do not
present that saved report as a cumulative billing history.

Then one line per failed or compromised scenario:

```markdown
- **SC-014 · <title>** — <criterion that failed>: expected <expected>, got <achieved>. Evidence: "<quote>".
```

Then the unverifiables, grouped by reason, each with what would make it checkable.

## When the run itself failed

Exit 1, `ok: false`, or `discarded: "refused"` means rook could not run the
suite as requested. A refusal may carry `ok: true`; use `reason` when `error`
is absent. When stdout has no JSON document, use the relevant stderr diagnostic
and do not invent a remedy token. Translate known remedies with the table in
`references/troubleshooting.md` under "Failure documents".

A declined or halted run must be reported as declined or incomplete, even when
it exits 0. Present any retained evidence without claiming the suite finished.
Preserve the recorded planned and executed counts: a halt alone does not prove
that scenarios were skipped or that the intended plan contained more scenarios.

```markdown
🔴 **rook could not run the suite**

**What happened:** <error or reason from the document, or the stderr diagnostic, in plain words>.
**Remedy:** <the remedy token, translated: login → `rook login`; new_session → run the command again; retry → wait and try again, or `rook doctor`; request_access → ask the org admin for access; create_project → `rook project create <name>`; pick_project → `rook project use <id>`; agent_missing → `rook agent use <id>`; explore_agents → `rook explore`; pick_agent → `rook agent use <id>`; topup → check `rook plan` and add credits; reconcile → `rook sync`; update → announce that `rook update` may install a newer release; no token → explain the diagnostic without inventing one>.
```
