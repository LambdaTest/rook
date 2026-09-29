# Connect this demo to Rook

Run all npm commands in this demo folder. Install this folder's dependencies with `npm ci`, run `npm run setup`, add MODEL_API_KEY to .env, and keep `npm start` running in another terminal. Exported environment variables take precedence over .env.

## Explore a new workspace

```bash
npm run rook:prepare -- /tmp/07-customer-support-code-exploration
cd /tmp/07-customer-support-code-exploration
rook login
rook project create "Juniper Goods / Developer"
rook
```

The destination must be empty. Reopen an existing workspace with rook instead of preparing it again. The Developer workspace contains the agent and its source dependencies. Follow the [interactive workflow](testing-with-rook.md).

## Use the supplied scenario pack

In this demo folder, select a real project with `rook project use PROJECT_ID` (or create one). Then run `npm run rook:setup` and `npm run rook`. The sample-project template is not an account binding. Preparation creates a separate workspace under artifacts/local/rook-reviewed/07-customer-support-code; existing destinations are refused, never cleared. Set ROOK_DEMO_WORKSPACE to choose a different empty path. Reopen it using the same variable and npm run rook.

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

Run `npm run check:llm` for a live model connection check. For a separate MCP client, run `node /absolute/path/to/this-demo/scripts/mcp.mjs customer-support-agent-code --target`; omit --target for read-only evidence tools. Use Node directly so npm banners do not enter the MCP stream.

Keep one conversation across a scenario's turns. Read response, trace and business receipt together; collected JSON is not a native MCP-proxy observation. Missing observations remain Unable to Verify. Read local results before sharing: /sync followed by a new /run without --test creates a separate hosted result. See [CI execution](native-ci.md) and [preservation guidance](../README.md#copying-and-preserving-this-demo).
