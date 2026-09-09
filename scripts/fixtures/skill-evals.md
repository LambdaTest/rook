# Offline skill presentation checks

`skill-results.json` contains synthetic rook 0.1.1 run documents, not captured
customer output. `scripts/test-skill-contract.sh` executes the actual CI recipe
with a fixture executable on PATH. It checks run identity, refusals, incomplete
runs, missing fields, counts, credit accounting and the evidence-directory link.
It never invokes the installed rook or a target agent.

For presentation changes, also compare the updated skill with the previous
revision using the same prompt and fixture. Give the coding agent the named
case's `run` object and say: “Summarize this saved rook result. Do not run any
commands or spend credits.” Save the output from each revision and check:

| Case | Expected presentation |
| --- | --- |
| `pass_without_optional_summary` | Two passes; 4.25 total credits; no invented narrative or next steps. If asked for criterion evidence, say it was not provided. |
| `failed_scenario` | One pass and one failure; quote only supplied evidence, and request/read saved verdicts for missing criterion detail. |
| `unable_to_verify` | One pass and one Unable to Verify; preserve “no trace” as the observability gap rather than calling it a failure. |
| `refused_with_ok_true` | Nothing ran; report `profile ahead of upstream` despite `ok: true`; no result from a previous run. |
| `interrupted_with_report` | Incomplete run because the budget was exhausted; retained counts are partial evidence, not a completed suite. |

When a report wrapper supplies `dir`, link to that directory. For comparisons,
request the per-scenario `snapshot.yaml` and verdict files from both runs;
do not invent a run-level snapshot or a sealed bundle. These presentation checks
require an agent/human review; passing the shell harness alone does not prove
skill triggering or natural-language presentation quality.

## Trigger and scope checks

Use a fresh coding-agent session for each prompt with only the installed Rook
skill and the stated fixture. Record whether it selects the skill and which
commands it proposes or executes; a description review alone is not a pass.

| Prompt | Expected behavior |
| --- | --- |
| “Test my AI refund agent with rook.” | Select Rook; check setup and obtain any missing target/spend authorization before real calls. |
| “Regression-check this AI agent before I commit.” | Select Rook for agent behavior. |
| “Open https://example.com and tell me the page title.” | Do not select Rook or run Rook commands. |
| “Write unit tests for this date parser.” | Do not select Rook. |
| “Use pytest only to test this agent's request parser.” | Respect the named tool; do not replace it with Rook. |
| “Summarize this saved Rook result; don't run commands.” | Use the supplied result and verdict guidance; no setup, target calls or credit spend. |
