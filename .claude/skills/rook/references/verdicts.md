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
`report --json`. Fields, from `Report` at tag v0.1.1:

| Field              | Meaning                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_id`           | which run this reports on                                                                                                                                                                                         |
| `agent_id`         | which agent                                                                                                                                                                                                       |
| `agent_version_id` | the tree revision this was written against, when known — a re-report on a moved version must re-derive rather than re-render                                                                                      |
| `generated`        | when the report was written                                                                                                                                                                                       |
| `headline`         | one sentence a person reads first — written on every report, `--rca` or not; when the summary role itself failed this reads `no run summary — <reason>` instead                                                   |
| `narrative`        | what happened, in a few paragraphs — written on every report                                                                                                                                                      |
| `next[]`           | what to do next, in order — never more than a handful; written on every report                                                                                                                                    |
| `totals`           | the same tally `run` reports: `planned`, `executed`, `passed`, `failed`, `unverifiable`, `unjudged`, `not_run`, `unrunnable`, `decided`, `pass_rate`, `carried_forward`                                           |
| `metrics`          | cost and quality: `credits`, `duration_ms`, `tokens_in`, `tokens_out`, `latency_p50_ms`, `latency_p95_ms`, `turns_total`, `quality`, `quality_samples`                                                            |
| `clusters[]`       | failures and unverifiables grouped by shared cause: `id`, `why`, `kind` (`failed`/`unverifiable`/`compromised`), `scenarios[]`, and — `--rca` only — `cause`, `remedy`, `confidence`, `fault`, `where`, `summary` |
| `credits`          | credits spent producing THIS report (the `--rca` explanations plus the summary call) — separate from the run's own spend, which is in `metrics.credits`                                                           |

## The rules that make a summary honest

1. `Unable to Verify` is never folded into `Fail` and never into `Pass`. It has
   its own column and its own count, always.
2. Quote the evidence. A criterion row without the `evidence` text is an
   opinion.
3. Say what changed since the last run when there is one: newly failing,
   fixed, flaky (flipped on an unchanged scenario), and redefined (the
   scenario text changed, so history no longer compares). Compare
   `scenarios.yaml` snapshots to tell redefined from flaky. Find the previous
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
| **Run**                 | `<run-id>` · <totals.executed> scenarios · <metrics.credits> credits |
| 🟢 **Pass**             | <n>                                                                  |
| 🔴 **Fail**             | <n>                                                                  |
| 🟡 **Unable to verify** | <n> — <reasons, counted>                                             |
| **Compromised**         | <n> adversarial scenarios (omit the row when none ran)               |
| **Evidence**            | `<dir>/report.evidence`                                              |
```

`totals.executed` and `metrics.credits` both come from the run's `report.yaml`
(the `report` field of `run --json`, or `report --json`).

Then one line per failed or compromised scenario:

```markdown
- **SC-014 · <title>** — <criterion that failed>: expected <expected>, got <achieved>. Evidence: "<quote>".
```

Then the unverifiables, grouped by reason, each with what would make it checkable.

## When the run itself failed

Exit 1, or a run document with `ok: false`:

```markdown
🔴 **rook could not run the suite**

**What happened:** <error from the document, in plain words>.
**Remedy:** <the remedy token, translated: login → `rook login`; new_session → run the command again; retry → wait and try again, or `rook doctor`; request_access → ask the org admin for access; create_project → `rook project create <name>`; pick_project → `rook project use <id>`; agent_missing → `rook agent use <id>`; explore_agents → `rook explore`; pick_agent → `rook agent use <id>`; topup → check `rook plan` and add credits; reconcile → `rook sync`; update → `rook update`>.
```
