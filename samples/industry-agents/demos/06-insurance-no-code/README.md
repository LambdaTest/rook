# Atlas Cover — QE edition

Turn a claim conversation into a verified settlement.

**Customer:** Jordan Ellis · policyholder reporting vehicle damage. **What could go wrong:** Unapproved or duplicate settlements, cross-policyholder disclosure, or a payment confirmation without a receipt.

[Meet the agent and view its diagrams](agents-overview.md) · [Visual walkthrough](docs/demo-walkthrough.html)

## Start the application

You'll need Node.js 22 or later, Rook, and an OpenAI API key. From this demo folder:

```bash
npm ci
npm run setup
```

`npm ci` installs the application's packages; run it once for a fresh checkout. Add **MODEL_API_KEY** to this folder's `.env`. The model and URLs are already configured. An exported `MODEL_API_KEY` also works and takes priority. Setup must still create the `.env` file.

```bash
npm start
```

Open **http://127.0.0.1:4315**, or the address printed in the terminal. Keep the app running. For help with keys or startup, see [runtime setup](runtime-setup.md).

## Meet the customer

1. Ask: **Settle claim CLM-100 for USD 1500.** Check the reply and business receipt.
2. Choose **Before the fix**. Select **Report a failed settlement payment**, then send the same request. The payment provider is unavailable in this scenario. Compare what the agent says with what happened.
3. Choose **After the fix** and repeat. Explain the customer impact using the [required behavior](PRD.md).

This edition lets Rook explore requirements and connect to the running agent. QEs do not need application source code.

## Discover and test with Rook

Keep the application running. In a second terminal in this demo folder, prepare a fresh workspace:

```bash
npm run rook:prepare -- /tmp/insurance-agent
cd /tmp/insurance-agent
rook login
rook project create "Agent Assurance — Atlas Cover"
rook
```

Choose another empty directory if that workspace already exists. Existing evidence is preserved. If you already have a project, use `rook project use PROJECT_ID`.

Type these **inside Rook**, one at a time, and review its prompts:

```text
/explore . Read PRD.md as the required behavior and inspect the supplied agent material.
/agent
/generate --class functional,non_functional,adversarial --total 18
/scenarios list
/profile add http --from connection.md
/profile show http
/profile test http
/run --test --profile http
/report
```

Rook writes agent definitions, features, scenarios, profiles and run evidence under **.testmuai/rook/** in this workspace. Read and review these files before sharing. Generated tests need review; 18 generated scenarios do not automatically cover every category.

The `--test` run stays out of the hosted project timeline. For an optional shared run, enter:

```text
/sync
/run --profile http
/ui
```

This executes a new run and records its results in the hosted Web UI. It does not upload the earlier `--test` run. Open **agent → run → scenario** to inspect criteria, the conversation and collected evidence. Use `/guide` for help and `/exit` to leave Rook.

For a shorter session using the supplied 18 reviewed scenarios, prepare the existing pack with `npm run rook:setup` in this edition's folder, then `npm run rook`. See the [interactive workflow](docs/testing-with-rook.md) for before/after comparisons, multi-turn conversations, red-teaming and MCP.

## What's included

This edition has 18 categories across functional, non-functional and adversarial tests. The [scenario pack](rook/README.md) lists the supplied tests; [connection.md](connection.md) provides the details Rook needs to reach the agent. All customer records and business systems are fictional. Model requests and Rook testing use their respective accounts.

## Run Rook in CI

This folder includes a portable [.testmuai/rook](.testmuai/rook/) template with 18 scenarios, HTTP profiles, hooks and a recorded native smoke run. After npm ci and npm run setup in this folder, provide your existing LT_USERNAME, LT_ACCESS_KEY and accessible Rook project:

```bash
ROOK_ENV=prod npm run rook:ci -- --project PROJECT_ID
```

The CI target defaults to fixture / hardened, so it needs no model API key. Rook evaluation uses your account. Each invocation writes to a new artifacts/local/rook-ci directory and preserves the supplied native workspace and earlier results. See [CI setup and evidence](docs/native-ci.md).

The [full-category model recording](docs/full-coverage.md) contains real Rook results for all 18 categories. Run `npm run evidence:check` to verify those saved files and coverage without making new model calls.

## Copying and preserving this demo

Copy this entire directory, including hidden files (for example, `cp -R /path/to/this-demo /path/to/new-demo`; avoid `this-demo/*`, which omits dotfiles). Then run `npm ci` and `npm run setup` inside the copy. No parent checkout, sibling demo, shared runtime directory or symlink is required.

Keep `.testmuai/rook/`: it contains the reusable sample project and its recorded run. `sample-settings.json` selects the CI template independently of your personal `settings.json`. Setup and regeneration preserve existing settings, definitions and evidence. New exploration/prepared workspaces must be empty; attempts to reuse a nonempty destination fail without deleting it. The QE runtime is included for the facilitator, while `rook:prepare` exports only requirements and connection material to the QE workspace.

The sample project and reviewed runs are versioned. Private project folders, account selection, credentials, caches and fresh CI output remain local. Before sharing a complete local copy, review its .env and private project data separately.
