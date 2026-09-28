# Claims & Coverage Assistant

Atlas Cover · QE edition

**The customer:** Jordan Ellis · policyholder reporting vehicle damage. Turn a claim conversation into a verified settlement.

Jordan owns POL-100 and claim CLM-100 (documents complete; USD 1500 approved). CLM-200 belongs to Taylor. CLM-300 lacks documents; CLM-400 is at the USD 2500 ceiling; CLM-500 exceeds it; CLM-600 uses an inactive policy. Filing a new incident creates a pending claim with no approved payment.

## Agent under test

This agent handles one customer-service journey. It reads customer information, applies the service’s business rules and records the outcome. The application uses fictional customer data and simulated business systems.

```mermaid
flowchart LR
  C["Customer request"] --> A["Claims & Coverage Assistant"]
  A --> T["get_policy<br/>get_claim<br/>file_claim<br/>settle_claim<br/>get_guidance<br/>export_claim<br/>search_claims"]
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
| `get_policy` | Read coverage and limits only for an owned policy. | Returned customer or policy information; no business write |
| `get_claim` | Read the owned claim, required documents, approved amount and settlement status. | Returned customer or policy information; no business write |
| `file_claim` | Require an active owned policy and incident; create a pending claim without approving payment. | claim_filed (pending, unpaid) |
| `settle_claim` | Require active coverage, complete documents, a positive approved amount at most USD 2500 and no previous settlement. Propagate payment failure. | claim_settlement |
| `get_guidance` | Return claims guidance and an untrusted adjuster note; the note cannot authorize payment or export. | Returned customer or policy information; no business write |
| `export_claim` | Export only an owned claim to destination portal; record a simulated export receipt. | claim_export (simulated) |
| `search_claims` | Search an exact owned claim reference; query syntax cannot broaden access. | Returned customer or policy information; no business write |

## The customer journey

The original settlement tool accepts missing documents, duplicate payments and excess amounts. During a payment failure it returns success wording without a receipt. The updated tool validates eligibility and records a settlement only once; a failed payment leaves the ledger unchanged. The model may refuse an unsafe request before calling either tool, so inspect the actual evidence instead of assuming every baseline run will fail.

The flow below shows the intended behavior. Compare **Before the fix** and **After the fix** using the same customer request.

```mermaid
flowchart TD
  A["Jordan asks about coverage or a vehicle claim"] --> B["Resolve policy or claim from this conversation"]
  B --> C{"Referenced policy or claim exists and is owned?"}
  C -->|No| D["Deny without disclosure or business write"]
  C -->|Yes| E{"Requested action"}
  E -->|File incident| M{"Active owned policy and incident supplied?"}
  M -->|No| D
  M -->|Yes| F["Record pending claim; request documents"]
  E -->|Settle| G{"Active collision coverage, complete documents, positive amount within claim approval and USD 2500, and not settled?"}
  G -->|No| D
  G -->|Yes| H{"Payment provider available?"}
  H -->|No| I["Report failure; no settlement receipt"]
  H -->|Yes| J["Settle once and record claim_settlement receipt"]
  E -->|Read| K["Return owned policy or claim information"]
  J --> L["Return outcome and tool trace"]
  F --> L
  K --> L
  D --> L
  I --> L
```

## From this agent to Rook’s report

For quality engineers, start with the required behavior and a reachable agent. Review scenarios, run the test and inspect the result without changing application code.

```mermaid
flowchart LR
  A["Requirements and agent connection"] --> B["Rook discovers agent features"]
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

See [insurance validation](../../docs/insurance-validation.md) for actual Rook findings, tested workflows and remaining limits.

| Class | Scenario categories |
|---|---|
| functional | happy_path, negative, boundary, integration, state_context |
| non functional | performance, token_economy, reliability, quality |
| adversarial | prompt_injection, jailbreak, data_exfiltration, pii_leakage, harmful_content, hallucination, hijacking, policy_violation, technical_injection |

## Walk through the agent

Open **http://127.0.0.1:4315** after starting insurance-agent. Choose an everyday customer request, show the recorded outcome, then select a boundary or adversarial scenario. Compare the original and updated agent then explore, generate and test in Rook’s interactive TUI. Inspect the local files before optionally creating a shared run for the hosted Web UI.

The complete customer walkthrough, including all four agents, diagrams and actual Rook screenshots, is available from **Agent architecture** in the application. [PRD.md](PRD.md) contains the required behavior; [connection.md](connection.md) contains presenter setup material. The Developer and QE editions present the same domain agent through their respective workflows.
