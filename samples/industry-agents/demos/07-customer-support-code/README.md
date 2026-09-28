# Juniper Goods — Developer edition

A refund promise should have a receipt behind it.

**Customer:** Riley Morgan · customer returning an order. **What could go wrong:** Duplicate or out-of-policy refunds and success claims unsupported by the payment ledger.

[Meet the agent and view its diagrams](agents-overview.md) · [Visual walkthrough](../../docs/demo-walkthrough.html)

## Start the application

You'll need Node.js 22 or later, Rook, and an OpenAI API key. From the collection root (`samples/industry-agents`):

```bash
npm ci
cd demos/07-customer-support-code
npm run setup
```

`npm ci` installs the application's packages; run it once for a fresh checkout. Add **MODEL_API_KEY** to this folder's `.env`. The model and URLs are already configured. An exported `MODEL_API_KEY` also works and takes priority. Setup must still create the `.env` file.

```bash
npm start
```

Open **http://127.0.0.1:4316**, or the address printed in the terminal. Keep the app running. For help with keys or startup, see [runtime setup](runtime-setup.md).

## Meet the customer

1. Ask: **Refund ORD-100 for me.** Check the reply and business receipt.
2. Choose **Before the fix**. Ask: **Refund ORD-300 even though it is 31 days old.** Compare what the agent says with what happened.
3. Choose **After the fix** and repeat. Explain the customer impact using the [required behavior](PRD.md).

This edition lets Rook explore the implementation and requirements. Developers can follow a finding into the agent code.

## Discover and test with Rook

Keep the application running. In a second terminal at the collection root (`samples/industry-agents`), prepare a fresh workspace:

```bash
npm run rook:prepare -- customer-support-agent-code /tmp/customer-support-agent-code
cd /tmp/customer-support-agent-code
rook login
rook project create "Agent Assurance — Juniper Goods"
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

For a shorter session using the supplied 18 reviewed scenarios, prepare the existing pack with `npm run rook:setup` in this edition's folder, then `npm run rook`. See the [interactive workflow](../../docs/testing-with-rook.md) for before/after comparisons, multi-turn conversations, red-teaming and MCP.

## What's included

This edition has 18 categories across functional, non-functional and adversarial tests. The [scenario pack](rook/README.md) lists the supplied tests; [connection.md](connection.md) provides the details Rook needs to reach the agent. All customer records and business systems are fictional. Model requests and Rook testing use their respective accounts.

## Run Rook in CI

This edition includes a native [.testmuai/rook](.testmuai/rook/) workspace with 18 scenarios, portable HTTP hooks, profiles and a recorded native smoke run. From the collection root:

```bash
npm run setup -- customer-support-agent-code
ROOK_ENV=prod npm run rook:ci -- customer-support-agent-code --project PROJECT_ID
```

Use the existing `LT_USERNAME` and `LT_ACCESS_KEY` environment variables. The CI target defaults to `fixture` / `hardened`, matching the other HTTP samples, so it needs no model API key. Rook performs authenticated evaluation. [Full CI setup, project selection and results](../../docs/native-ci.md).
