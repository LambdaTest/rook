# Evidence and limits

This demo includes dated [recorded results](sample-runs.md) and one [native SC-101 CI smoke run](../native-ci-runs.json). Their hashes and original verdicts are preserved. They establish only the selected cases recorded at that time, not that all 18 categories pass today.

Use npm run samples:check to validate saved evidence, and npm run rook:ci -- --project PROJECT_ID for a fresh authenticated evaluation. The fixture target needs no model key; judging uses your Rook account. For a live model-backed target, use --engine model and the [runtime settings](../runtime-setup.md).

Collected tool traces and business receipts are synthetic application observations, not native MCP-proxy or OpenTelemetry observations. A denied call can be correct behavior. Missing evidence or token usage remains Unable to Verify. The [interactive guide](testing-with-rook.md) explains how to inspect each result.
