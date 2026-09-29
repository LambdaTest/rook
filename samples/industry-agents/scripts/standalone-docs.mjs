import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeStandaloneDocs(directory, demo, taxonomy) {
  const docs = join(directory, 'docs');
  await mkdir(docs, { recursive: true });
  const write = (name, text) => writeFile(join(docs, name), text.trim() + '\n');
  await write('runtime-setup.md', '# Runtime setup\n\nUse the [setup guide](../runtime-setup.md) in this demo. All commands run inside this folder after npm ci.');
  await write('rook-integration.md', `# Connect this demo to Rook

Run all npm commands in this demo folder. Install this folder's dependencies with \`npm ci\`, run \`npm run setup\`, add MODEL_API_KEY to .env, and keep \`npm start\` running in another terminal. Exported environment variables take precedence over .env.

## Explore a new workspace

\`\`\`bash
npm run rook:prepare -- /tmp/${demo.id}-exploration
cd /tmp/${demo.id}-exploration
rook login
rook project create "${demo.title}"
rook
\`\`\`

The destination must be empty. Reopen an existing workspace with rook instead of preparing it again. ${demo.style === 'code' ? 'The Developer workspace contains the agent and its source dependencies.' : 'The QE workspace contains requirements, connection material and scenarios; it excludes the application runtime and source.'} Follow the [interactive workflow](testing-with-rook.md).

## Use the supplied scenario pack

In this demo folder, select a real project with \`rook project use PROJECT_ID\` (or create one). Then run \`npm run rook:setup\` and \`npm run rook\`. The sample-project template is not an account binding. Preparation creates a separate workspace under artifacts/local/rook-reviewed/${demo.id}; existing destinations are refused, never cleared. Set ROOK_DEMO_WORKSPACE to choose a different empty path. Reopen it using the same variable and npm run rook.

The HTTP profiles are demo-normal, demo-dependency-error, demo-slow-tool and demo-poisoned-context. The prepared pack also supplies demo-mcp. Hooks and their dependency manifest travel with the prepared workspace. If moving that workspace independently, run npm ci in its new location before using MCP.

## Settings and evidence

| Variable | Purpose |
|---|---|
| MODEL_API_KEY | Target model credential; stays with the application. |
| MODEL_BASE_URL / MODEL_NAME | Optional compatible tool-calling provider override. |
| DEMO_PORT | Alternate local port; export the same value in the application and Rook terminals. |
| DEMO_BASE_URL | Explicit target URL; overrides the port-derived URL. |
| DEMO_VARIANT | vulnerable or hardened; keep the scenario and fault unchanged when comparing. |
| DEMO_API_TOKEN | Optional API bearer token. Leave unset for the browser demo. |
| ROOK_DEMO_WORKSPACE | Prepared workspace to create or reopen. |

Run \`npm run check:llm\` for a live model connection check. For a separate MCP client, run \`node /absolute/path/to/this-demo/scripts/mcp.mjs ${demo.domain}-agent${demo.style === 'code' ? '-code' : ''} --target\`; omit --target for read-only evidence tools. Use Node directly so npm banners do not enter the MCP stream.

Keep one conversation across a scenario's turns. Read response, trace and business receipt together; collected JSON is not a native MCP-proxy observation. Missing observations remain Unable to Verify. Read local results before sharing: /sync followed by a new /run without --test creates a separate hosted result. See [CI execution](native-ci.md) and [preservation guidance](../README.md#copying-and-preserving-this-demo).
`);
  await write('native-ci.md', `# Run this demo with Rook in CI

This edition includes a native [.testmuai/rook](../.testmuai/rook/) template with 18 scenarios, HTTP profiles, portable hooks and a recorded SC-101 smoke run. [native-ci-runs.json](../native-ci-runs.json) preserves the recording's run ID, date and hashes. That historical Pass covers SC-101 only.

Install the published CLI (\`npm install -g @testmuai/rook\`) and run these commands in this demo folder:

\`\`\`bash
npm ci
npm run setup
# Export LT_USERNAME and LT_ACCESS_KEY using your existing account credentials.
ROOK_ENV=prod npm run rook:ci -- --project PROJECT_ID
\`\`\`

Use a project accessible to that account. Alternatively export ROOK_SAMPLE_PROJECT_ID. The checked-in sample-project name is a template, not a usable account project. ROOK_BIN can select a different installed Rook executable.

The target defaults to fixture / hardened and requires no model key. Rook still authenticates and uses evaluation credits. Add --engine model for a live target using the local MODEL_API_KEY, MODEL_BASE_URL and MODEL_NAME settings. Model credentials are not forwarded to Rook.

Each invocation copies definitions into a new artifacts/local/rook-ci/${demo.id}/run-*/workspace, starts the target on a free port and runs:

\`\`\`text
rook run --test --yes --json --only SC-101 --profile demo-normal --concurrency 1
\`\`\`

CI=true and --yes enable headless operation; there is no --ci flag. The command succeeds only when every selected scenario and criterion has passing evidence. Fail, Unable to Verify, missing results, cancellation and timeouts return nonzero. It stops its target and CLI processes without deleting results.

Outputs include ci-summary.json, rook-result.json, rook-stderr.log and the native workspace/.testmuai/rook/projects/<project>/agents/<agent>/runs/<run-id> evidence. The original .testmuai tree and prior outputs are preserved. Set --only SC-101,SC-104, --profile demo-dependency-error or --variant vulnerable to change the requested check; expected sample failures remain failures.

When uploading results in GitHub Actions, include hidden files (include-hidden-files: true for upload-artifact) and include the workspace/.testmuai/rook path. A shell wildcard such as workspace/* omits it. Upload only the new isolated CI output, not personal credentials or an unrelated home directory.
`);
  await write('native-scenarios.md', `# This edition's native scenario pack

There are 18 authored scenarios in [rook/scenarios](../rook/scenarios/), with the same definitions in the portable [.testmuai/rook](../.testmuai/rook/) template. Authored scenarios and retained generated drafts are inputs, not execution verdicts. The [pack provenance](../rook/provenance.json) records their origin and hashes.

| Class | Category | Scenario |
|---|---|---|
${Object.entries(taxonomy).flatMap(([cls, categories]) => categories.map(category => [cls, category])).map(([cls, cat], i) => `| ${cls} | ${cat} | SC-${101 + i} |`).join('\n')}

Use npm run rook:setup and npm run rook after selecting your project, or use [headless CI](native-ci.md). Review generated cases against PRD.md. Keep fault profiles and customer turns aligned with the scenario; missing model usage remains Unable to Verify. See [interactive steps](testing-with-rook.md).
`);
  await write('sample-runs.md', `# Recorded evidence in this demo

The [recorded sample index](../artifacts/reference/sample-runs.json) lists this edition's dated runs, hashes and expected decisions. The original requests, responses, verdicts and receipts remain under [rook/sample-runs](../rook/sample-runs/).

After npm ci, run \`npm run samples:check\` in this folder. This verifies and replays the saved evidence without credentials or new model requests. A passing replay means the expected decisions matched; recorded Fail and Unable to Verify results remain visible. It is not a fresh evaluation or overall release approval.

For fresh results use [Rook CI](native-ci.md) or the [interactive workflow](testing-with-rook.md). Preserve previous results and inspect new evidence before publishing it.
`);
  await write('verification.md', `# Evidence and limits

This demo includes dated [recorded results](sample-runs.md) and one [native SC-101 CI smoke run](../native-ci-runs.json). Their hashes and original verdicts are preserved. They establish only the selected cases recorded at that time, not that all 18 categories pass today.

Use npm run samples:check to validate saved evidence, and npm run rook:ci -- --project PROJECT_ID for a fresh authenticated evaluation. The fixture target needs no model key; judging uses your Rook account. For a live model-backed target, use --engine model and the [runtime settings](../runtime-setup.md).

Collected tool traces and business receipts are synthetic application observations, not native MCP-proxy or OpenTelemetry observations. A denied call can be correct behavior. Missing evidence or token usage remains Unable to Verify. The [interactive guide](testing-with-rook.md) explains how to inspect each result.
`);
  // A coverage reference should not advertise a collection-only executable.
  const category = join(docs, 'category-coverage.md');
  const content = await readFile(category, 'utf8');
  await writeFile(category, content.replace(/`npm run rehearse`[^\n]*/, 'Use the local scenario pack with Rook to collect requests, responses, tool calls and business receipts. Fixture execution does not establish model token usage.'));
}
