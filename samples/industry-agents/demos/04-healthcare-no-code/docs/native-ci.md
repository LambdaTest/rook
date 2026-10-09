# Run this demo with Rook in CI

This edition includes a native [.testmuai/rook](../.testmuai/rook/) template with 18 scenarios, HTTP profiles, portable hooks and a recorded SC-101 smoke run. [native-ci-runs.json](../native-ci-runs.json) preserves the recording's run ID, date and hashes. That historical Pass covers SC-101 only. The separate [full-category model recording](full-coverage.md) covers all 18 categories and retains failures and verification gaps.

Install the published CLI (`npm install -g @testmuai/rook@latest`) and run these commands in this demo folder:

```bash
npm ci
npm run setup
# Export LT_USERNAME and LT_ACCESS_KEY using your existing account credentials.
ROOK_ENV=prod npm run rook:ci -- --project PROJECT_ID
```

Use a project accessible to that account. Alternatively export ROOK_SAMPLE_PROJECT_ID. The checked-in sample-project name is a template, not a usable account project. ROOK_BIN can select a different installed Rook executable.

The target defaults to fixture / hardened and requires no model key. Rook still authenticates and uses evaluation credits. Add --engine model for a live target using the local MODEL_API_KEY, MODEL_BASE_URL and MODEL_NAME settings. Model credentials are not forwarded to Rook.

Each invocation copies definitions into a new artifacts/local/rook-ci/04-healthcare-no-code/run-*/workspace, starts the target on a free port and runs:

```text
rook run --test --yes --json --only SC-101 --profile demo-normal --concurrency 1
```

CI=true and --yes enable headless operation; there is no --ci flag. The command succeeds only when every selected scenario and criterion has passing evidence. Fail, Unable to Verify, missing results, cancellation and timeouts return nonzero. It stops its target and CLI processes without deleting results.

Outputs include ci-summary.json, rook-result.json, rook-stderr.log and the native workspace/.testmuai/rook/projects/<project>/agents/<agent>/runs/<run-id> evidence. The original .testmuai tree and prior outputs are preserved. Set --only SC-101,SC-104, --profile demo-dependency-error or --variant vulnerable to change the requested check; expected sample failures remain failures.

When uploading results in GitHub Actions, include hidden files (include-hidden-files: true for upload-artifact) and include the workspace/.testmuai/rook path. A shell wildcard such as workspace/* omits it. Upload only the new isolated CI output, not personal credentials or an unrelated home directory.
