# Rook user guide

Rook tests an AI agent you own: it discovers the agent's features, generates
scenarios, invokes the target, and records verdicts with evidence. Use this
guide to set up your first run or understand results you already have.

This guide describes **Rook 0.1.1**. Check `rook --version` and `rook help
<command>` before using examples with another version. Skill installation and
CLI installation are separate; the skill teaches your coding agent how to
use the CLI.

| Start here | What you will learn |
| --- | --- |
| [Install](install.md) | Install the CLI and, optionally, the coding-agent skill |
| [Getting started](getting-started.md) | Discover an agent and complete a first run |
| [Authentication and access](authentication.md) | Sign in, select a project, grant permissions, and track credits |
| [Profiles](profiles.md) | Connect an HTTP, command-line, or MCP target |
| [Scenarios](scenarios.md) | Generate, curate, and select tests |
| [Evidence and verdicts](evidence-and-verdicts.md) | Read results, unknowns, and changes between runs |
| [Headless use and CI](headless-and-ci.md) | Handle command outputs and gate a pipeline |
| [Troubleshooting](troubleshooting.md) | Diagnose setup failures and evidence gaps |

A **project** groups your work. An **agent** is Rook's record of the target
you want to test. A **profile** supplies the scripts used to reach it. A
**scenario** tests a feature; a **run** executes selected scenarios and saves
their **verdicts**.

Before a live call, review the target's actions and choose a staging target.
Profile authoring and testing also reach the target. Rook cannot undo its
writes. Exploration, generation, profile authoring, and runs spend credits;
0.1.1 has no aggregate task-credit-limit flag.

For the full command and output contract, see the
[canonical reference](../../skill-installer/skills/references/headless-contract.md).
To try a sample target, see [sample agents](../../samples/README.md).
