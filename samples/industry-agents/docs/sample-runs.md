# Show a Rook result in CI

The demos include recorded Rook runs with their original verdicts, requests, responses and business evidence. Each demo has a `rook/sample-runs` directory covering a normal journey, multi-turn context, a role-play challenge, a before/after check and MCP.

The [sample index](../artifacts/reference/sample-runs.json) records their dates and file hashes. A separate historical banking example retains an **Unable to Verify** result.

From `samples/industry-agents`, after `npm ci`, run the example:

```bash
npm run samples:check
```

This checks the saved evidence and writes a summary to `artifacts/local/sample-replay`. It needs no model key and does not call an agent again.

The GitHub Actions workflow runs the application checks, validates the scenario inventory and checks these saved results. Open **Actions → ci → industry-samples** to see the summary and download the evidence.

A green workflow means the saved results matched their expected decisions. A recorded **Fail** stays a failure. **Unable to Verify** blocks the selected-scenario gate. An **Allow** decision covers only the selected cases; it is not a release approval or a claim that all categories passed.

To demonstrate a blocking exit status, run:

```bash
node scripts/sample-runs.mjs gate banking-agent-code/recorded-unverified
```

That example exits with status 1 because its observation is incomplete. Missing files, changed hashes, missing scenarios and mismatched run identities also stop the check.

For new agent results, follow the [interactive guide](testing-with-rook.md). New model responses may change the outcome. Review the evidence before replacing a recorded example.
