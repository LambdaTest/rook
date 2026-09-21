# Agent Assurance — ROOK

Start with the customer's business problem. Name the agent and the action it can perform. Explain the connected decision diagram and the tools that enforce each rule. Show one customer conversation and its recorded action.

For a Developer audience, explore source and requirements. For a QE audience, explore requirements and the connection contract. Explain the different starting material before entering Rook.

1. Enter `/explore .`. Review the discovered agent and features.
2. Enter `/generate` with the intended classes and categories. Review requests, acceptance criteria, multi-turn setup and service conditions.
3. Enter `/profile add http --from connection.md`, `/profile show http` and `/profile test http`. Establish that the connection reaches the right agent and collects correlated evidence.
4. Enter `/run --test --only <scenario-id> --profile <profile>`. Explain the plan before confirming it. Skip processing waits in the recording.
5. Enter `/report`. Open the corresponding local `run.yaml`, `report.yaml`, scenario response, verdict and collected evidence. Follow one run ID throughout.
6. Explain the finding from the response, trace and business receipt. A denied tool attempt may be correct behavior. Keep missing observations visible.
7. Show a selected adversarial test and a multi-turn MCP check. Distinguish the MCP target, read-only verification tools and native proxy observations.
8. Repeat the criterion against the updated agent with the same service condition. State the actual result, including an unchanged Pass or an Unable to Verify.
9. If team review is useful, `/sync`, execute a new shared `/run`, then `/ui`. Open that exact shared run in the hosted Web UI. Sync does not promote the earlier local test.

Use the [agent guide](demo-walkthrough.md) for responsibilities, diagrams and artifact paths. The finished local video manifest identifies the checks and evidence used in each recording.

Keep the narration specific to the visible evidence. Remove idle time, repeated introductions and decorative interludes. Let speech determine the running time. Use readable close-ups for commands and records, and preserve the original captures separately from the edit.
