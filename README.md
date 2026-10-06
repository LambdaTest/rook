<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/rook-mascot-dark.svg">
  <img src=".github/assets/rook-mascot-light.svg" alt="rook, the chess-piece mascot" width="150">
</picture>

# rook

**Agent assurance from the terminal.**

Test how your AI agents actually behave across workflows, tools and actions.<br>
Catch failures and vulnerabilities before they ship.

[![npm](https://img.shields.io/npm/v/@testmuai/rook?label=npm&logo=npm&color=cb3837)](https://www.npmjs.com/package/@testmuai/rook)
[![Homebrew](https://img.shields.io/badge/homebrew-lambdatest%2Frook-fbb040?logo=homebrew&logoColor=white)](https://github.com/LambdaTest/homebrew-rook)
[![Tests](https://github.com/LambdaTest/rook/actions/workflows/test-scripts.yml/badge.svg?branch=main)](https://github.com/LambdaTest/rook/actions/workflows/test-scripts.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen)

[Install](#install) · [Quick start](#quick-start) · [User guide](docs/user-guide/README.md) · [Samples](#sample-agents) · [Documentation](https://www.testmuai.com/support/docs/agent-assurance-overview/)

<sub>Built by <a href="https://www.testmuai.com/agent-assurance/">TestMu AI</a> (formerly LambdaTest)</sub>

</div>

## What it does

Testing an AI agent is awkward because there is no fixed contract. Input might be a sentence, a pull request, or an image; output might be prose, a created ticket, or a written file. So `rook` derives the tests rather than asking you to write them.

```text
$ rook

  /explore .    read the codebase — find the agents and what they do
  /generate     scenarios: functional · non-functional · adversarial
  /profile add  how to invoke it — paste a curl, or give a command
  /run          execute them, 3 at a time
  /ui           verdicts, evidence and trends, in a browser
```

Scenarios span three classes and eighteen categories:

| Class          | Categories                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional     | happy path · negative · boundary · integration · state handling                                                                                       |
| Non-functional | performance · token economy · reliability · quality                                                                                                   |
| Adversarial    | prompt injection · jailbreak · data exfiltration · PII leakage · harmful content · hallucination · hijacking · policy violation · technical injection |

## Why it works this way

Two ideas do most of the work.

**An agent's account of what it did is the weakest evidence available about what it did.** It is the one party with a reason to be wrong. So `rook` does not grade the reply. It reads the code, watches the filesystem, and calls the agent's own tools to check the effect — then quotes what it found.

**Anything `rook` could not verify is reported as unverifiable — never as a pass, never as a failure.** It is excluded from the denominator rather than counted against you, and the gaps are computed rather than asked of a model, so a verdict can say _"Pass, and here is what nobody looked at."_ A harness that reports a failure it did not observe is worse than one that admits it could not look.

What a run gives you:

- **Per criterion**, not per scenario: what was expected, what happened, and a quote as evidence.
- **What could not be checked, and why.**
- **What changed since last time** — newly failing, fixed, **flaky** (flips between runs on an unchanged scenario, which calls for the opposite response to a regression), and scenarios whose definition changed, so their history no longer compares.
- **What it did, not just what it said** — files that changed on disk while it ran, artifacts it produced, and tool calls checked against the agent's own tool surface.

## From AI evals to AI assurance

Most eval and observability tools score what your agent said and recorded. `rook` checks what the run changed, and reports what it could not verify.

|                      | rook (Agent Assurance)       | AI eval tools            | LLM observability         |
| -------------------- | ---------------------------- | ------------------------ | ------------------------- |
| Test cases           | From your code or spec       | Written or synthesized   | From production traces    |
| Tool calls           | Against declared tools       | Against your lists       | Logged, optionally scored |
| Side effects         | Files, artifacts, probes     | Scripted per task        | Trace data only           |
| Grading              | Claimed actions aren't proof | LLM judge or code checks | LLM judge or human review |
| Adversarial tests    | Generated by default         | Add-on in some tools     | Not generated             |
| When it runs         | Before release, in CI        | CI and live traffic      | Production, plus CI       |
| Unverifiable results | Reported separately          | Errors or opt-in skips   | Left unscored             |

<sub>The eval and observability columns describe each category's default approach, not any single product; several eval tools synthesize test cases, score tool calls, and ship red-team modules.</sub>

## Install

Three ways, on macOS and Linux, x64 and arm64. Each one carries its own Node runtime, so none of them needs Node installed.

**Homebrew**

```bash
brew install lambdatest/rook/rook
```

Use the full `lambdatest/rook/rook` name. Homebrew refuses to load a formula from an untrusted third-party tap by its short name, and naming the tap in full trusts it. Upgrade with `brew upgrade lambdatest/rook/rook`. If you tapped `LambdaTest/rook` before September 2026, [re-point the tap once](https://github.com/LambdaTest/homebrew-rook#if-you-tapped-before-the-formula-moved-here).

**Shell installer** — downloads the archive for your platform, verifies its checksum, and links `rook` into `~/.local/bin`. Pass `--dir` to put it somewhere else, or `--version X.Y.Z` to pin one.

```bash
curl -fsSL https://raw.githubusercontent.com/LambdaTest/rook/main/install.sh | bash
```

**npm** — if you would rather manage it with your other global CLIs.

```bash
npm install -g @testmuai/rook
```

Driving rook from Claude Code, Codex or Gemini CLI? Add the [coding-agent skill](#for-ai-coding-agents-reading-this) too. If an install method does not work on your platform, [open an issue](https://github.com/LambdaTest/rook/issues/new/choose).

## Quick start

From inside a project that contains an agent:

```text
› /explore .

  read 6 files · 1 agent
  triage-service — triages support tickets: severity, owning team, a reply

› /generate

  14 scenarios · 9 functional · 2 non-functional · 3 adversarial

› /profile add

  How is this agent invoked?  paste a curl · command · http · mcp
› curl http://127.0.0.1:9110/v1/triage -H 'content-type: application/json' -d '{"input":"look at T-1043"}'

  POST http://127.0.0.1:9110/v1/triage
  the scenario goes in "input"

› /run

  14 scenario(s) → triage-service
    concurrency  3

  … 11 passed · 2 failed · 1 unverifiable

› /ui
```

`/ui` opens a local browser view on the run: every verdict, the exchange that produced it, the tools the agent called, and — after a second run — what changed.

You do not have to run the commands in order. Ask for a later step and `rook` plans the ones it needs first, with the cost, before spending anything. Or just describe what you want in a sentence.

## Commands

| Command                                    | What it does                                                   |
| ------------------------------------------ | -------------------------------------------------------------- |
| `/explore`                                 | read the codebase — find agents and what they do               |
| `/agent`                                   | list agents, switch the active one                             |
| `/generate`                                | write scenarios for the active agent                           |
| `/profile`                                 | how to invoke it — `add` (paste a curl), `use`, `test`, `show` |
| `/run`                                     | execute scenarios against the live agent                       |
| `/ui`                                      | the browser view — runs, evidence, trends                      |
| `/scenarios`                               | list, exclude, include, delete                                 |
| `/mcp`                                     | the MCP servers `rook` may call                                |
| `/plan`                                    | what is stale, and what refreshing it would cost               |
| `/budget` · `/doctor` · `/guide` · `/help` | credits, diagnostics, guidance and help                        |

Three ways to invoke the agent under test: an **HTTP** endpoint, a **command** (`claude -p "{{goal}}"`), or an **MCP** tool. For setup, profiles, scenario selection and reading results, see the [user guide](docs/user-guide/README.md).

## In CI

Every step has a headless form:

```bash
rook explore .
rook generate
rook run
rook report
```

| Exit code | Meaning                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | the command did what it said — a finished run exits `0` whether scenarios passed or failed; gate on the verdicts in `rook report --json`                                                                                                            |
| `1`       | anything else: signed out, refused, unreachable, bad flags, a run that could not start. With `--json`, inspect `error` or `reason` when a document exists; a refused run may have `ok: true, discarded: "refused"`. Some errors only produce stderr |

[Headless use and CI](docs/user-guide/headless-and-ci.md) covers sign-in, permission grants, budgets and verdict gating.

## For AI coding agents reading this

Use the [Rook skill](skill-installer/skills/SKILL.md) to test, evaluate, or red-team an AI agent and interpret its saved results. It covers setup, target permissions, credit budgets, profiles, CI and evidence-based verdicts using your installed Rook CLI.

Install it from your agent repository with Node.js 22+ and npm available:

```bash
npx @testmuai/rook-skill
```

This installs the skill user-wide for Claude Code, Codex and Gemini CLI. See the [installer guide](skill-installer/README.md) for client selection, updates, uninstall and file protections.

Then open your agent repository and ask: _"Use rook to test my agent against its refund policy."_ Approve the target's real actions and credit spend before execution. See the [CI recipe](skill-installer/skills/references/ci.md) for completion and verdict checks; an exit code of `0` alone does not mean scenarios passed.

<details>
<summary><b>Other ways to install the skill</b></summary>

<br>

For a project-scoped install through the third-party [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add https://github.com/LambdaTest/rook/tree/main/skill-installer/skills --skill rook --agent claude-code codex
```

Select the clients you use; add `--global` for user-wide scope.

For manual installation or updates, copy `SKILL.md` and `references/` together into `.claude/skills/rook/` or `.agents/skills/rook/` in your agent repository. Review an existing skill before replacing it. The corresponding locations under `~/` provide user-wide scope. This Rook clone already includes both project mirrors; cloning it elsewhere does not install the skill into your project.

For client details, see the [Claude Code skill documentation](https://code.claude.com/docs/en/skills) and [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills).

</details>

Rook is also listed on the TestMu AI [Agent Skills](https://www.testmuai.com/support/docs/agent-skills/) page and in the [LambdaTest/agent-skills](https://github.com/LambdaTest/agent-skills) catalog.

## Sample agents

Try the agents in [`samples/`](samples), from a small HTTP service to eight industry workflows. Each one has real defects for a good suite to find.

| Sample                                                 | What it is                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`triage-service`](samples/triage-service)             | A plain codebase — a prompt in a string, a tool table, an HTTP server. Nothing declares itself an agent, so finding it means reading the code.                               |
| [`refund-desk`](samples/refund-desk)                   | A Claude Code agent — `.claude/agents/*.md`, a skill, a read-only subagent and two MCP servers. Found deterministically, then each server is asked what tools it really has. |
| [`incident-scribe`](samples/incident-scribe)           | A Python CLI that looks services up over MCP, assigns severity from a policy matrix, and hands the customer note to a tool-less subagent.                                    |
| [`trip-weather-station`](samples/trip-weather-station) | Weather-grounded trip advice from live forecasts. Did it recommend from weather it fetched, or invent a plausible forecast?                                                  |
| [`knowledge-vault`](samples/knowledge-vault)           | Private, offline retrieval over a local document vault. Did it answer only from the vault, or make something up?                                                             |
| [`industry-agents`](samples/industry-agents)           | Banking, healthcare, insurance and customer support, each with Developer/QE editions, diagrams, native Rook workspaces, recorded evidence and a headless CI runner.          |

The business records are fictional. Rook evaluation uses your account and credits. See [`samples/README.md`](samples/README.md) for how to run each one and what it should catch.

## Where things are kept

Everything `rook` produces is plain files. No database.

| Path                        | What                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `<project>/.testmuai/rook/` | agents, scenarios, runs, evidence — yours, and committable |
| `~/.testmuai/rook/`         | credentials, settings, permission grants, sessions         |

The second is deliberately outside your project, so a credential cannot be swept into a commit by `git add -A`. Profiles and MCP configuration reference secrets as `${VAR}` rather than embedding them, so they are safe to commit.

## A note on safety

**The agent you point `rook` at is yours, and its writes are real.** `rook` invokes it the way a user would and cannot roll anything back. Do not rely on a per-target write-tool confirmation in headless mode. Before authoring or testing a profile, or running scenarios, review the target and the real actions it can take; authorize those actions and the credit spend in your coding-agent session or CI configuration.

Judges are told to verify without changing anything — calling `issue_refund` to find out whether a refund exists creates one. Rook evaluates tool calls against its permission policy; headless calls need effective grants rather than an interactive prompt.

> [!IMPORTANT]
> Even so: **point it at staging.**

## Support

- **Bugs and feature requests** — [open an issue](https://github.com/LambdaTest/rook/issues/new/choose). Verdicts you disagree with are the most useful reports we get.
- **Security** — do not open a public issue. See [SECURITY.md](SECURITY.md).
- **Contributing** — see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Documentation** — [TestMu AI Agent Assurance](https://www.testmuai.com/support/docs/agent-assurance-overview/).

<div align="center">
<br>
<sub>Licensed under <a href="LICENSE">Apache 2.0</a> · Made by <a href="https://www.testmuai.com">TestMu AI</a></sub>
</div>
