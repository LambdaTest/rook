# Native Rook runs in CI

Every edition includes `.testmuai/rook/settings.json` and a project folder containing an active agent, features, 18 authored scenarios, four HTTP profiles, portable hooks and a recorded native `runs/<run-id>/` example. [native-ci-runs.json](../native-ci-runs.json) records eight smoke runs captured on 18 September 2026 and their file hashes. Each executed **SC-101 only** against a hardened fixture target, with authenticated Rook evaluation; all eight passed. The remaining categories are outside this smoke result.

## Environment and keys

Like the [triage-service sample](../../triage-service/README.md), this collection's CI targets use deterministic fixtures without a model API key.

| Variable | CI value / purpose |
|---|---|
| `LT_USERNAME` | Existing LambdaTest username; supplied through the environment or a GitHub secret. |
| `LT_ACCESS_KEY` | Existing LambdaTest access key; supplied through the environment or a GitHub secret. |
| `ROOK_ENV` | `prod`, matching the credentials used to verify these samples. |
| `DEMO_ENGINE` | Defaults to `fixture` for `rook:ci`. |
| `DEMO_VARIANT` | Defaults to `hardened` for `rook:ci`. |
| `ROOK_SAMPLE_PROJECT_ID` | Required accessible Rook project ID; alternatively pass `--project PROJECT_ID`. The template ID is not a real project. |
| `ROOK_BIN` | Optional path to a Rook executable; defaults to `rook` on PATH. |
| `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME` | Only needed for optional `--engine model`, using the edition's existing provider configuration. Never forwarded to the Rook subprocess. |

Keep credentials in environment variables or secret storage. The checked-in `sample-project` folder is a template, not an account binding. Run `rook project` to list your projects, or `rook project create "Industry agent samples"` to create one, then set `ROOK_SAMPLE_PROJECT_ID` to the returned ID. The runner retargets an isolated workspace consistently; it refuses to start without your project selection.

## Run from a checkout

Install the published CLI, then install the sample package. This public repository distributes Rook; it does not contain CLI source to build:

```bash
npm install -g @testmuai/rook
export ROOK_ENV=prod
cd samples/industry-agents
npm ci
npm run setup
# Set LT_USERNAME, LT_ACCESS_KEY and ROOK_SAMPLE_PROJECT_ID in your environment.
npm run rook:ci -- banking-agent-code
npm run rook:ci -- healthcare-agent --only SC-101
```

Use any edition name from the [collection index](../README.md). From an edition directory, `npm run rook:ci -- --project PROJECT_ID` selects that edition automatically. No separately started HTTP server is required.

The runner copies the native inputs to a unique `artifacts/local/rook-ci/<edition>/run-*/workspace`, starts the fixture on a free local port, and executes:

```text
rook run --test --yes --json --only SC-101 --profile demo-normal --concurrency 1
```

`CI=true` and `--yes` select headless operation; Rook has no `--ci` flag. `--test` writes local native results without publishing the run to the hosted timeline. Rook still requires authentication and uses evaluation credits. The runner returns success only when Rook completes and every selected scenario and criterion passes with evidence. Fail, Unable to Verify, missing results, cancellation and timeouts return nonzero. It stops the application and Rook's process tree when cancelled. Windows uses `taskkill`; automated lifecycle verification covers macOS/Linux.

Fresh outputs include `ci-summary.json`, `rook-result.json`, `rook-stderr.log`, and native `workspace/.testmuai/rook/projects/<project>/agents/<agent>/runs/<run-id>/` evidence. Checked-in inputs and example runs are preserved. New outputs, cache, jobs, environment files and server state remain ignored.

Choose other authored scenarios with `--only SC-101,SC-104`, another profile with `--profile demo-dependency-error`, or a live target model with `--engine model`. These choices can expose expected sample failures; the runner preserves those outcomes.

## GitHub Actions

The [industry-rook-ci workflow](../../../.github/workflows/industry-rook-ci.yml) installs the published CLI and runs all eight editions on Ubuntu. Configure repository secrets **LT_USERNAME** and **LT_ACCESS_KEY**, and repository variable **ROOK_SAMPLE_PROJECT_ID** for a project accessible to that account. These are supplied only to the manual run step; pull-request validation uses no service credentials.

After the workflow is present on the default branch, dispatch **industry-rook-ci** from Actions. It uploads available result files even after a failed smoke run. Target model keys are unnecessary. The separate `industry-samples` PR job validates the fixture runtime and historical evidence without service credentials; that job does not certify a fresh Rook evaluation.

## Recorded evidence portability

The eight checked-in native runs retain their original run IDs, reports, verdicts, scenario snapshots and synthetic business observations. Project path components use `sample-project`, and machine-specific recording-workspace prefixes have been removed. [native-ci-runs.json](../native-ci-runs.json) lists the original and published hashes for every normalized file. Profile/tree pins describe the original recording inputs. These portable records are dated evidence; a new `rook:ci` invocation produces its own unmodified native run under ignored local output.
