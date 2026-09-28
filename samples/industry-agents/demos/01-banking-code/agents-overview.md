# Everyday Banking Assistant

Northstar Bank · Developer edition

**The customer:** Maya Chen · retail banking customer. Move money with the same care as your customer.

Maya owns ACC-1001 (USD 5000) and SAV-1001 (USD 2000). ACC-2002 belongs to a different synthetic customer.

## Agent under test

This agent handles one customer-service journey. It reads customer information, applies the service’s business rules and records the outcome. The application uses fictional customer data and simulated business systems.

```mermaid
flowchart LR
  C["Customer request"] --> A["Everyday Banking Assistant"]
  A --> T["get_account<br/>transfer<br/>get_policy<br/>export_statement<br/>search_transactions"]
  T --> B["Customer records and business receipts"]
  A --> E["Conversation and tool trace"]
  B --> R["Rook verification"]
  E --> R
  R --> L["Local report and evidence files"]
  L -.-> U["Optional sync and shared Web UI run"]
```

## High-level functions

| Function | What the agent does | Evidence to inspect |
|---|---|---|
| `get_account` | Read only an account owned by the authenticated customer. | Returned customer or policy information; no business write |
| `transfer` | Validate ownership, a positive amount, funds and the USD 1000 approval ceiling before updating balances. | transfer |
| `get_policy` | Return policy and a separately identified untrusted note; retrieval cannot authorize an export. | Returned customer or policy information; no business write |
| `export_statement` | Accept only destination portal; record a simulated export receipt. | statement_export (simulated) |
| `search_transactions` | Treat query text literally; injected syntax cannot broaden access. | Returned customer or policy information; no business write |

## The customer journey

The original transfer tool omits the approval check. The model may refuse an over-limit request before calling it, as it did in the video. The updated tool enforces the limit even when called. An authorized USD 200 transfer records one receipt.

The flow below shows the intended behavior. Compare **Before the fix** and **After the fix** using the same customer request.

```mermaid
flowchart TD
  A["Maya requests a transfer"] --> B["Resolve source, destination and amount"]
  B --> C{"Accounts exist and amount is positive?"}
  C -->|No| D["Deny without moving money"]
  C -->|Yes| E{"Owned accounts, sufficient funds and at most USD 1000?"}
  E -->|No| D
  E -->|Yes| H{"Transfer service available?"}
  H -->|No| I["Report failure; no transfer receipt"]
  H -->|Yes| F["Update both balances and record transfer receipt"]
  F --> G["Return outcome and trace"]
  D --> G
  I --> G
```

## From this agent to Rook’s report

For developers, start with the agent’s implementation and required behavior. Follow the failing request into the tool call, inspect its arguments and receipt, then show the corrected business check.

```mermaid
flowchart LR
  A["Agent code and requirements"] --> B["Rook discovers agent features"]
  B --> G["Generate and review scenarios"]
  G --> P["Create and test a connection profile"]
  P --> C["Run locally in Rook TUI"]
  C --> D["Inspect criteria, conversation and trace"]
  D --> E["Verify business receipts through MCP"]
  E --> F["Read local report and rerun after the fix"]
  F -.-> S["Optional sync and hosted Web UI"]
```

Use **/explore**, **/generate**, **/profile add** and **/profile test** in Rook’s interactive TUI. Then run **/run --test** and read **/report**. Agent definitions, features, scenarios, profiles, requests, responses, verdicts and collected evidence remain inspectable under **.testmuai/rook/**. The local viewer is available with **/ui --local** when wanted.

Sharing is optional: **/sync** records the project definition upstream. A subsequent run without **--test** records its results in the hosted timeline; **/ui** opens that Web UI. This is a new shared run, not an upload of the earlier local run. Select a scenario to see its criteria, customer request, reply and evidence. Keep Pass, Fail and Unable to Verify distinct.

| Class | Scenario categories |
|---|---|
| functional | happy_path, negative, boundary, integration, state_context |
| non functional | performance, token_economy, reliability, quality |
| adversarial | prompt_injection, jailbreak, data_exfiltration, pii_leakage, harmful_content, hallucination, hijacking, policy_violation, technical_injection |

## Walk through the agent

Open **http://127.0.0.1:4310** after starting banking-agent-code. Choose an everyday customer request, show the recorded outcome, then select a boundary or adversarial scenario. Compare the original and updated agent then explore, generate and test in Rook’s interactive TUI. Inspect the local files before optionally creating a shared run for the hosted Web UI.

The complete customer walkthrough, including all four agents, diagrams and actual Rook screenshots, is available from **Agent architecture** in the application. [PRD.md](PRD.md) contains the required behavior; [connection.md](connection.md) contains presenter setup material. The Developer and QE editions present the same domain agent through their respective workflows.
