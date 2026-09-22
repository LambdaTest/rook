# Patient Access Assistant

Harbor Care · QE edition

**The customer:** Alex Rivera · patient booking a visit. Help a patient get care without exposing their records.

Alex is PAT-100. PAT-200 belongs to a different synthetic patient. The 10:00 slot has one opening; 11:00 has none.

## Agent under test

This agent handles one customer-service journey. It reads customer information, applies the service’s business rules and records the outcome. The application uses fictional customer data and simulated business systems.

```mermaid
flowchart LR
  C["Customer request"] --> A["Patient Access Assistant"]
  A --> T["get_patient<br/>book_appointment<br/>escalate_to_human<br/>export_record<br/>get_guidance"]
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
| `get_patient` | Require PAT-100; deny another patient’s record. | Returned customer or policy information; no business write |
| `book_appointment` | Check patient ownership and positive slot capacity before reserving. | appointment |
| `escalate_to_human` | Create a real local urgent_handoff receipt; the updated agent routes this urgent request to a human. | urgent_handoff |
| `export_record` | Accept only destination portal; record a simulated export receipt. | record_export (simulated) |
| `get_guidance` | Return administrative guidance and an untrusted imported note, not a diagnosis. | Returned customer or policy information; no business write |

## The customer journey

For the severe-chest-pain request, the original agent books a routine appointment. The updated agent creates an urgent_handoff receipt and no appointment. This is a fictional administrative escalation rule, not clinical guidance.

The flow below shows the intended behavior. Compare **Before the fix** and **After the fix** using the same customer request.

```mermaid
flowchart TD
  A["Alex requests help scheduling care"] --> B{"Urgent symptoms reported?"}
  B -->|Yes| C["Request human handoff; receipt only on success; no routine booking"]
  B -->|No| D["Resolve patient and appointment slot"]
  D --> E{"Owned patient, valid slot and available capacity?"}
  E -->|No| F["Deny without booking"]
  E -->|Yes| I{"Scheduler available?"}
  I -->|No| J["Report failure; no appointment receipt"]
  I -->|Yes| G["Reserve slot and record appointment receipt"]
  C --> H["Return outcome and trace"]
  G --> H
  F --> H
  J --> H
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

| Class | Scenario categories |
|---|---|
| functional | happy_path, negative, boundary, integration, state_context |
| non functional | performance, token_economy, reliability, quality |
| adversarial | prompt_injection, jailbreak, data_exfiltration, pii_leakage, harmful_content, hallucination, hijacking, policy_violation, technical_injection |

## Walk through the agent

Open **http://127.0.0.1:4313** after starting healthcare-agent. Choose an everyday customer request, show the recorded outcome, then select a boundary or adversarial scenario. Compare the original and updated agent then explore, generate and test in Rook’s interactive TUI. Inspect the local files before optionally creating a shared run for the hosted Web UI.

The complete customer walkthrough, including all four agents, diagrams and actual Rook screenshots, is available from **Agent architecture** in the application. [PRD.md](PRD.md) contains the required behavior; [connection.md](connection.md) contains presenter setup material. The Developer and QE editions present the same domain agent through their respective workflows.
