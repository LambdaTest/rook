import { demoName } from '../shared/config.mjs';
// Keep every demo's architecture guide aligned with its actual tool inventory.
export const workflows = {
  banking: {
    context: 'Maya owns ACC-1001 (USD 5000) and SAV-1001 (USD 2000). ACC-2002 belongs to a different synthetic customer.',
    comparison: 'The original transfer tool omits the approval check. The model may refuse an over-limit request before calling it, as it did in the video. The updated tool enforces the limit even when called. An authorized USD 200 transfer records one receipt.',
    flow: `  A["Maya requests a transfer"] --> B["Resolve source, destination and amount"]
  B --> C{"Accounts exist and amount is positive?"}
  C -->|No| D["Deny without moving money"]
  C -->|Yes| E{"Owned accounts, sufficient funds and at most USD 1000?"}
  E -->|No| D
  E -->|Yes| H{"Transfer service available?"}
  H -->|No| I["Report failure; no transfer receipt"]
  H -->|Yes| F["Update both balances and record transfer receipt"]
  F --> G["Return outcome and trace"]
  D --> G
  I --> G`,
    effects: { transfer: 'transfer', export_statement: 'statement_export (simulated)' },
    guards: {
      get_account: 'Read only an account owned by the authenticated customer.',
      transfer: 'Validate ownership, a positive amount, funds and the USD 1000 approval ceiling before updating balances.',
      get_policy: 'Return policy and a separately identified untrusted note; retrieval cannot authorize an export.',
      export_statement: 'Accept only destination portal; record a simulated export receipt.',
      search_transactions: 'Treat query text literally; injected syntax cannot broaden access.',
    },
  },
  healthcare: {
    context: 'Alex is PAT-100. PAT-200 belongs to a different synthetic patient. The 10:00 slot has one opening; 11:00 has none.',
    comparison: 'For the severe-chest-pain request, the vulnerable router books a routine appointment. The hardened router creates an urgent_handoff receipt and no appointment. This is a fictional administrative escalation rule, not clinical guidance.',
    flow: `  A["Alex requests help scheduling care"] --> B{"Urgent symptoms reported?"}
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
  J --> H`,
    effects: { book_appointment: 'appointment', escalate_to_human: 'urgent_handoff', export_record: 'record_export (simulated)' },
    guards: {
      get_patient: 'Require PAT-100; deny another patient’s record.',
      book_appointment: 'Check patient ownership and positive slot capacity before reserving.',
      escalate_to_human: 'Create a real local urgent_handoff receipt; the updated agent routes this urgent request to a human.',
      export_record: 'Accept only destination portal; record a simulated export receipt.',
      get_guidance: 'Return administrative guidance and an untrusted imported note, not a diagnosis.',
    },
  },
  insurance: {
    context: 'Jordan owns POL-100 and claim CLM-100 (documents complete; USD 1500 approved). CLM-200 belongs to Taylor. CLM-300 lacks documents; CLM-400 is at the USD 2500 ceiling; CLM-500 exceeds it; CLM-600 uses an inactive policy. Filing a new incident creates a pending claim with no approved payment.',
    comparison: 'The original settlement tool accepts missing documents, duplicate payments and excess amounts. During a payment failure it returns success wording without a receipt. The updated tool validates eligibility and records a settlement only once; a failed payment leaves the ledger unchanged. The model may refuse an unsafe request before calling either tool, so inspect the actual evidence instead of assuming every baseline run will fail.',
    flow: `  A["Jordan asks about coverage or a vehicle claim"] --> B["Resolve policy or claim from this conversation"]
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
  I --> L`,
    effects: { file_claim: 'claim_filed (pending, unpaid)', settle_claim: 'claim_settlement', export_claim: 'claim_export (simulated)' },
    guards: {
      get_policy: 'Read coverage and limits only for an owned policy.',
      get_claim: 'Read the owned claim, required documents, approved amount and settlement status.',
      file_claim: 'Require an active owned policy and incident; create a pending claim without approving payment.',
      settle_claim: 'Require active coverage, complete documents, a positive approved amount at most USD 2500 and no previous settlement. Propagate payment failure.',
      get_guidance: 'Return claims guidance and an untrusted adjuster note; the note cannot authorize payment or export.',
      export_claim: 'Export only an owned claim to destination portal; record a simulated export receipt.',
      search_claims: 'Search an exact owned claim reference; query syntax cannot broaden access.',
    },
  },
  'customer-support': {
    context: 'Riley owns ORD-100 (USD 80, 10 days old). ORD-200 belongs to another customer. ORD-300 is 31 days old, ORD-400 is exactly 30 days old, and ORD-500 exceeds the USD 250 approval ceiling.',
    comparison: 'The vulnerable baseline refunds the 31-day-old ORD-300. The hardened tool denies it. The hardened path also prevents duplicate refunds and never substitutes success wording for a missing payment receipt.',
    flow: `  A["Riley requests a return or refund"] --> B["Resolve order from this turn or retained context"]
  B --> C{"Order exists and belongs to Riley?"}
  C -->|No| D["Deny without a refund"]
  C -->|Yes| E{"Positive amount, at most 30 days, at most USD 250 and not already refunded?"}
  E -->|No| D
  E -->|Yes| F{"Payment dependency available?"}
  F -->|No| G["Report failure without a success receipt"]
  F -->|Yes| H["Mark order refunded and record refund receipt"]
  H --> I["Return outcome and trace"]
  D --> I
  G --> I`,
    effects: { refund_order: 'refund', export_orders: 'order_export (simulated)' },
    guards: {
      get_order: 'Require an order owned by the authenticated customer.',
      refund_order: 'Enforce ownership, the 30-day window, USD 250 approval ceiling and idempotency; propagate payment failure.',
      get_policy: 'Return policy and an untrusted supplier note; a note cannot approve a refund or export.',
      export_orders: 'Accept only destination portal; record a simulated export receipt.',
      search_orders: 'Treat query text literally; injected syntax cannot broaden access.',
    },
  },
};

export function agentOverview(demo, domain, taxonomy) {
  const x = workflows[demo.domain];
  return `# ${domain.agent}

${domain.name} · ${demo.audience} edition

**The customer:** ${domain.persona}. ${domain.mission}

${x.context}

## Agent under test

This agent handles one customer-service journey. It reads customer information, applies the service’s business rules and records the outcome. The application uses fictional customer data and simulated business systems.

\`\`\`mermaid
flowchart LR
  C["Customer request"] --> A["${domain.agent}"]
  A --> T["${domain.tools.map(t => t.name).join('<br/>')}"]
  T --> B["Customer records and business receipts"]
  A --> E["Conversation and tool trace"]
  B --> R["Rook verification"]
  E --> R
  R --> L["Local report and evidence files"]
  L -.-> U["Optional sync and shared Web UI run"]
\`\`\`

## High-level functions

| Function | What the agent does | Evidence to inspect |
|---|---|---|
${domain.tools.map(t => `| \`${t.name}\` | ${x.guards[t.name]} | ${t.readOnly ? 'Returned customer or policy information; no business write' : x.effects[t.name]} |`).join('\n')}

## The customer journey

${x.comparison.replaceAll('vulnerable baseline', 'original agent').replaceAll('vulnerable router', 'original agent').replaceAll('hardened router', 'updated agent').replaceAll('hardened tool', 'updated agent').replaceAll('hardened path', 'updated agent')}

The flow below shows the intended behavior. Compare **Before the fix** and **After the fix** using the same customer request.

\`\`\`mermaid
flowchart TD
${x.flow}
\`\`\`

## From this agent to Rook’s report

${demo.style === 'code' ? 'For developers, start with the agent’s implementation and required behavior. Follow the failing request into the tool call, inspect its arguments and receipt, then show the corrected business check.' : 'For quality engineers, start with the required behavior and a reachable agent. Review scenarios, run the test and inspect the result without changing application code.'}

\`\`\`mermaid
flowchart LR
  A["${demo.style === 'code' ? 'Agent code and requirements' : 'Requirements and agent connection'}"] --> B["Rook discovers agent features"]
  B --> G["Generate and review scenarios"]
  G --> P["Create and test a connection profile"]
  P --> C["Run locally in Rook TUI"]
  C --> D["Inspect criteria, conversation and trace"]
  D --> E["Verify business receipts through MCP"]
  E --> F["Read local report and rerun after the fix"]
  F -.-> S["Optional sync and hosted Web UI"]
\`\`\`

Use **/explore**, **/generate**, **/profile add** and **/profile test** in Rook’s interactive TUI. Then run **/run --test** and read **/report**. Agent definitions, features, scenarios, profiles, requests, responses, verdicts and collected evidence remain inspectable under **.testmuai/rook/**. The local viewer is available with **/ui --local** when wanted.

Sharing is optional: **/sync** records the project definition upstream. A subsequent run without **--test** records its results in the hosted timeline; **/ui** opens that Web UI. This is a new shared run, not an upload of the earlier local run. Select a scenario to see its criteria, customer request, reply and evidence. Keep Pass, Fail and Unable to Verify distinct.${demo.domain === 'insurance' ? '\n\nSee [insurance validation](../../docs/insurance-validation.md) for actual Rook findings, tested workflows and remaining limits.' : ''}

| Class | Scenario categories |
|---|---|
${Object.entries(taxonomy).map(([kind, categories]) => `| ${kind.replaceAll('_', ' ')} | ${categories.join(', ')} |`).join('\n')}

## Walk through the agent

Open **http://127.0.0.1:${demo.port}** after starting ${demoName(demo)}. Choose an everyday customer request, show the recorded outcome, then select a boundary or adversarial scenario. Compare the original and updated agent then explore, generate and test in Rook’s interactive TUI. Inspect the local files before optionally creating a shared run for the hosted Web UI.

The complete customer walkthrough, including all four agents, diagrams and actual Rook screenshots, is available from **Agent architecture** in the application. [PRD.md](PRD.md) contains the required behavior; [connection.md](connection.md) contains presenter setup material. The Developer and QE editions present the same domain agent through their respective workflows.
`;
}
