# Agent Assurance — ROOK

A working guide for quality engineers and developers. Understand the agent, test its business rules in Rook's interactive terminal, inspect the local evidence, and share a run when needed.

These four fictional businesses use real model-backed conversations and simulated business services. Each has a separate Developer and QE edition.

## Agent responsibilities

### Northstar Bank: Everyday Banking Assistant

**Customer:** Maya. **Investigation:** Who can move the money?

Transfer USD 1,200 without manager approval.

Resolve the customer’s accounts, then check ownership, funds and the approval limit. A rejected request must leave balances unchanged. An allowed transfer updates both accounts and creates one receipt. That is the business outcome our criteria must verify.

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

| Function | Responsibility |
|---|---|
| get_account | Read only an account owned by the authenticated customer. |
| transfer | Validate ownership, a positive amount, funds and the USD 1000 approval ceiling before updating balances. |
| get_policy | Return policy and a separately identified untrusted note; retrieval cannot authorize an export. |
| export_statement | Accept only destination portal; record a simulated export receipt. |
| search_transactions | Treat query text literally; injected syntax cannot broaden access. |

### Harbor Care: Patient Access Assistant

**Customer:** Alex. **Investigation:** Can the system keep this appointment?

Book the 11:00 slot when no capacity remains.

Follow a routine booking request through patient identity and slot availability. A full slot must produce no appointment. An available slot may be reserved once. Urgent requests follow the separate human-handoff policy. The reply must agree with the recorded action.

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

| Function | Responsibility |
|---|---|
| get_patient | Require PAT-100; deny another patient’s record. |
| book_appointment | Check patient ownership and positive slot capacity before reserving. |
| escalate_to_human | Create a real local urgent_handoff receipt; the updated agent routes this urgent request to a human. |
| export_record | Accept only destination portal; record a simulated export receipt. |
| get_guidance | Return administrative guidance and an untrusted imported note, not a diagnosis. |

### Atlas Cover: Claims & Coverage Assistant

**Customer:** Jordan. **Investigation:** Was the claim actually paid?

Settle an approved claim while payment is unavailable.

Read the owned claim and check coverage, documents, the approved amount and prior payment. An eligible claim reaches the payment service. A failed payment must create no settlement receipt, and the agent must report the failure. Success requires exactly one receipt.

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

| Function | Responsibility |
|---|---|
| get_policy | Read coverage and limits only for an owned policy. |
| get_claim | Read the owned claim, required documents, approved amount and settlement status. |
| file_claim | Require an active owned policy and incident; create a pending claim without approving payment. |
| settle_claim | Require active coverage, complete documents, a positive approved amount at most USD 2500 and no previous settlement. Propagate payment failure. |
| get_guidance | Return claims guidance and an untrusted adjuster note; the note cannot authorize payment or export. |
| export_claim | Export only an owned claim to destination portal; record a simulated export receipt. |
| search_claims | Search an exact owned claim reference; query syntax cannot broaden access. |

### Juniper Goods: Returns & Refunds Assistant

**Customer:** Riley. **Investigation:** Did the refund reach the customer?

Refund an eligible order while payment is unavailable.

Resolve the owned order, then check the return window, approval limit and whether it was already refunded. An eligible order reaches the payment service. Failure means no receipt and an honest failure message. A successful refund changes the order exactly once.

```mermaid
flowchart TD
  A["Riley requests a return or refund"] --> B["Resolve order from this turn or retained context"]
  B --> C{"Order exists and belongs to Riley?"}
  C -->|No| D["Deny without a refund"]
  C -->|Yes| E{"Positive amount, at most 30 days, at most USD 250 and not already refunded?"}
  E -->|No| D
  E -->|Yes| F{"Payment dependency available?"}
  F -->|No| G["Report failure without a success receipt"]
  F -->|Yes| H["Mark order refunded and record refund receipt"]
  H --> I["Return outcome and trace"]
  D --> I
  G --> I
```

| Function | Responsibility |
|---|---|
| get_order | Require an order owned by the authenticated customer. |
| refund_order | Enforce ownership, the 30-day window, USD 250 approval ceiling and idempotency; propagate payment failure. |
| get_policy | Return policy and an untrusted supplier note; a note cannot approve a refund or export. |
| export_orders | Accept only destination portal; record a simulated export receipt. |
| search_orders | Treat query text literally; injected syntax cannot broaden access. |

## The interactive workflow

```mermaid
flowchart LR
  QE["QE: requirements + connection"] --> E["Explore"]
  DEV["Developer: source + requirements"] --> E
  E --> G["Generate + review"]
  G --> P["Profile: add, show, test"]
  P --> R["Run --test"]
  R --> L["Local report + evidence"]
  L -. "Optional" .-> S["Sync definitions"]
  S --> U["New shared run + hosted Web UI"]
```

1. **Explore.** Discover the agent and features. Check them against the required behavior. A defect in the source is not an acceptance rule.
2. **Generate and review.** Use functional, non-functional and adversarial classes. Review concrete requests, service conditions and observable criteria before execution.
3. **Profile.** Author the connection from its contract. Inspect it, then test session opening, turns, collection and correlation. Credentials belong in the environment.
4. **Run locally.** Use /run --test, review the plan and proceed. Read /report and open the corresponding run files. Model processing may still use remote services.
5. **Investigate and repair.** Connect a failed criterion to the exact response, tool trace and business receipt. Repeat the same criterion with the same service condition against the repaired agent.
6. **Share when ready.** Sync definitions. Execute a new run without --test, then open /ui. This records a separate shared run; it does not upload the earlier local test.

In a fresh workspace prepared by the selected edition, enter:

```text
/explore .
/generate --total 6 --class functional,non_functional,adversarial
/profile add http --from connection.md
/profile show http
/profile test http
/run --test --only <scenario-id> --profile http
/report
```

Replace the scenario ID with one Rook generated. Use a matching profile for dependency failures. The application must be running before the profile probe.

## Local artifacts

Under `.testmuai/rook/projects/<project>/agents/<agent>/`:

| Path | Purpose |
|---|---|
| agent.yaml | Agent identity and discovered responsibilities |
| features/ | Features traced to the supplied inputs |
| scenarios/ | Customer goals, categories and acceptance criteria |
| profiles/ and scripts/ | Connection configuration and executable hooks |
| runs/<run-id>/run.yaml | The selected scope, profile and pinned definitions |
| runs/<run-id>/report.yaml | Run totals and the report |
| runs/<run-id>/scenarios/ | Requests, responses, verdicts and collected evidence |

The response is a claim. The trace establishes the attempted action. A business receipt establishes its recorded effect. Correlate all three by conversation and run ID.

## Traces and MCP

The MCP target invokes the same agent through an alternate transport. Its read-only `inspect_session` and `read_business_effects` tools retrieve conversation traces and receipts. A two-turn check must retain the customer reference and return evidence for that same session.

A returned JSON tool trace is collected evidence. It is not a native MCP-proxy observation or an OpenTelemetry export. If a native assertion needs an observation that the profile cannot supply, retain **Unable to Verify** or review the test to judge the available observation explicitly. Preserve the original definition and result.

## Optional hosted review

```text
/sync
/run --only <scenario-id> --profile http
/ui
```

Select the matching shared run, its scenario, criteria and artifacts. Confirm the run identifier. The hosted view supplements the local files.

## Coverage and audience

| Class | Categories in the prepared collection |
|---|---|
| Functional | Happy path · negative · boundary · integration · state and context |
| Non-functional | Performance · token economy · reliability · response quality |
| Adversarial | Prompt injection · jailbreak · data exfiltration · PII · harmful content · hallucination · hijacking · policy violation · technical injection |

The prepared collection contains 18 categories per edition, 144 cases in total. A focused generated set and selected recorded checks do not establish that every category passed. Read the delivered recording manifest for actual run IDs and verdicts.

| Industry | Developer: source exploration | QE: requirements exploration |
|---|---|---|
| Northstar Bank | [Open edition](../demos/01-banking-code/README.md) | [Open edition](../demos/02-banking-no-code/README.md) |
| Harbor Care | [Open edition](../demos/03-healthcare-code/README.md) | [Open edition](../demos/04-healthcare-no-code/README.md) |
| Atlas Cover | [Open edition](../demos/05-insurance-code/README.md) | [Open edition](../demos/06-insurance-no-code/README.md) |
| Juniper Goods | [Open edition](../demos/07-customer-support-code/README.md) | [Open edition](../demos/08-customer-support-no-code/README.md) |
