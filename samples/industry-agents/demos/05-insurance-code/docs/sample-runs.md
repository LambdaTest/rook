# Recorded evidence in this demo

The [recorded sample index](../artifacts/reference/sample-runs.json) lists this edition's dated runs, hashes and expected decisions. The original requests, responses, verdicts and receipts remain under [rook/sample-runs](../rook/sample-runs/).

After npm ci, run `npm run samples:check` in this folder. This verifies and replays the saved evidence without credentials or new model requests. A passing replay means the expected decisions matched; recorded Fail and Unable to Verify results remain visible. It is not a fresh evaluation or overall release approval.

For fresh results use [Rook CI](native-ci.md) or the [interactive workflow](testing-with-rook.md). Preserve previous results and inspect new evidence before publishing it.
