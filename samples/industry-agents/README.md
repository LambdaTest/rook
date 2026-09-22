# Industry agent samples

Explore an agent, generate tests, prove its connection and inspect the evidence. The applications cover banking, healthcare, insurance and customer support, with separate workflows for Developers and Quality Engineers.

| Industry | Developer: source and requirements | QE: requirements and connection |
|---|---|---|
| Banking | [banking-agent-code](demos/01-banking-code/README.md) | [banking-agent](demos/02-banking-no-code/README.md) |
| Healthcare | [healthcare-agent-code](demos/03-healthcare-code/README.md) | [healthcare-agent](demos/04-healthcare-no-code/README.md) |
| Insurance | [insurance-agent-code](demos/05-insurance-code/README.md) | [insurance-agent](demos/06-insurance-no-code/README.md) |
| Customer Support | [customer-support-agent-code](demos/07-customer-support-code/README.md) | [customer-support-agent](demos/08-customer-support-no-code/README.md) |

## Watch the recorded walkthroughs

The nine Andrew-narrated videos, captions and sales PDFs are together in the [Drive delivery folder](https://drive.google.com/drive/u/2/folders/1xdp7vr4-R-mlBWd4rY6OHAfc2qziDlnz). The [source video library](https://github.com/4DvAnCeBoY/rook-demo/tree/ea9e746fe4267cd70665aeb22ab7e4540c188178/delivery) also retains the MP4s. This sample includes diagrams, PDF handouts, captions and recording metadata; movie binaries remain in that delivery.

## Replay the saved results without credentials

From the Rook repository root:

```bash
cd samples/industry-agents
npm ci
npm run setup
npm test
npm run check
npm run rook:coverage
npm run samples:check
```

This package installs independently from the Rook workspaces and requires Node.js 22 or later. The replay checks 33 dated runs containing 50 selected results across eight editions. It preserves Pass, Fail and Unable to Verify outcomes; a successful replay means the original decisions matched. It does not run a new model evaluation. [CI details](docs/sample-runs.md).

All commands below start in this collection folder. Each edition has a README, requirements, connection details, Mermaid diagrams, an 18-category authored pack and recorded evidence.

## Execute Rook in CI

Each edition includes a checked-in `.testmuai/rook` workspace, portable profiles and hooks, and a recorded native smoke-run folder. With `LT_USERNAME` / `LT_ACCESS_KEY` already set and Rook on PATH:

```bash
ROOK_ENV=prod npm run rook:ci -- banking-agent-code --project PROJECT_ID
```

This starts the application, runs Rook headlessly against SC-101 and gates its fresh evidence. The target uses fixture mode, like the other HTTP samples, so no model API key is required. All eight recorded SC-101 smoke runs passed; a new invocation evaluates the selected edition again. [Environment, project selection, native results and GitHub Actions](docs/native-ci.md).

## Start an application

You need Node.js 22 or later, Rook and an OpenAI API key. From a fresh checkout:

```bash
npm ci
npm run setup -- insurance-agent-code
```

`npm ci` installs the saved package versions. Add `MODEL_API_KEY` to `demos/05-insurance-code/.env`; the model and URLs are already configured. An exported key also works and takes priority.

```bash
npm start -- insurance-agent-code
```

Open the printed address. Meet the customer, inspect the tools and follow the agent diagram before testing. Use any edition name from the table in place of `insurance-agent-code`.

## Discover and test in interactive Rook

Keep the application running. Prepare an empty workspace in a second terminal:

```bash
npm run rook:prepare -- insurance-agent-code /tmp/insurance-agent-code
cd /tmp/insurance-agent-code
rook login
rook project create "Agent Assurance — Insurance"
rook
```

Choose another empty directory if this one already exists. Use `rook project use PROJECT_ID` when reusing a project.

Inside Rook, review the prompts as you proceed:

```text
/explore . Read PRD.md as the required behavior and inspect the supplied agent material.
/generate --class functional,non_functional,adversarial --total 18
/scenarios list
/profile add http --from connection.md
/profile test http
/run --test --profile http
/report
```

Review the generated tests before running them. Rook writes agent definitions, features, scenarios, profiles and evidence under **.testmuai/rook/** in this workspace. Inspect those files and the local report first.

## Share a reviewed run, if needed

```text
/sync
/run --profile http
/ui
```

Sync records the project definitions. The next run creates a **new shared result** in the hosted Web UI. The earlier `--test` run remains local. Rook's optional `/ui --local` viewer reads files on this machine.

[Interactive workflow](docs/testing-with-rook.md) · [Agent architecture and walkthrough](docs/demo-walkthrough.html) · [Recorded results and limits](docs/verification.md)

Every edition includes an agent overview, connected diagrams, setup instructions and an authored pack covering 18 categories. [Coverage](docs/category-coverage.md) describes that inventory; executed results establish what passed or failed. The [prepared-pack workflow](docs/rook-integration.md) provides a shorter starting point with existing scenarios and profiles.

All customer records and business systems are fictional. Model requests and Rook judging use their respective services.

## Import provenance

Imported from [rook-demo at ea9e746](https://github.com/4DvAnCeBoY/rook-demo/tree/ea9e746fe4267cd70665aeb22ab7e4540c188178). [import-provenance.json](import-provenance.json) records the original source hashes; runtime, documentation and CI integration are adapted here. The immutable artifact list is checked byte for byte before replay. See [recorded checks and limits](docs/verification.md) for the source recordings' scope.

The prepared authored pack is for local `--test` runs. This import uses the installed CLI's native behavior and does not include the original synchronization adapter. Use newly explored/generated definitions for the optional hosted workflow.
