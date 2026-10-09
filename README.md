<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/rook-mascot-dark.gif">
  <img src=".github/assets/rook-mascot-light.gif" alt="rook, the chess-piece mascot" width="200">
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

  /explore .           read the codebase — find the agents and what they do
  /generate            scenarios: functional · non-functional · adversarial
  /profile add <name>  how to invoke it — paste a curl, or give a command
  /sync                record the agent, its scenarios and profile upstream
  /run                 execute them against the live agent
  /ui                  verdicts, evidence and trends, in a browser
```

Scenarios span three classes and eighteen categories:

| Class          | Categories                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional     | happy path · negative · boundary · integration · state & context                                                                                      |
| Non-functional | performance · token economy · reliability · quality                                                                                                   |
| Adversarial    | prompt injection · jailbreak · data exfiltration · PII leakage · harmful content · hallucination · hijacking · policy violation · technical injection |

## Why it works this way

Two ideas do most of the work.

**An agent's account of what it did is the weakest evidence available about what it did.** It is the one party with a reason to be wrong. So `rook` does not grade the reply. It reads the code, watches the filesystem, and calls the agent's own tools to check the effect — then quotes what it found.

**Anything `rook` could not verify is reported as unverifiable — never as a pass, never as a failure.** It gets its own count and is never folded into Fail, and the gaps are computed rather than asked of a model, so a verdict can say _"Pass, and here is what nobody looked at."_ A harness that reports a failure it did not observe is worse than one that admits it could not look.

What a run gives you:

- **Per criterion**, not per scenario: what was expected, what happened, and a quote as evidence.
- **What could not be checked, and why.**
- **What changed since last time** — the pass-rate change between your last two runs, and which scenarios newly fail or were fixed.
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

You need a TestMu AI (formerly LambdaTest) account. Exploring, generating, writing profiles and running spend Agent Assurance credits.

Homebrew and the shell installer cover macOS and Linux on x64 and arm64, and bring their own runtime, so they need no Node. npm also covers Windows x64; it needs Node.js 20 or newer to install and launch, then runs `rook` on its bundled runtime.

**Homebrew**

```bash
brew install lambdatest/rook/rook
```

Use the full `lambdatest/rook/rook` name. Homebrew refuses to load a formula from an untrusted third-party tap by its short name, and naming the tap in full trusts it. Upgrade with `brew upgrade lambdatest/rook/rook`. If you tapped `LambdaTest/rook` before September 2026, [re-point the tap once](https://github.com/LambdaTest/homebrew-rook#if-you-tapped-before-the-formula-moved-here).

**Shell installer** — downloads the archive for your platform, verifies its checksum, unpacks it into `~/.testmuai/rook-<version>/`, and links `rook` into `~/.local/bin`. Pass `--dir` to put it somewhere else, or `--version X.Y.Z` to pin one.

```bash
curl -fsSL https://raw.githubusercontent.com/LambdaTest/rook/main/install.sh | bash
```

**npm** — if you would rather manage it with your other global CLIs.

```bash
npm install -g @testmuai/rook@latest
```

**Upgrade and uninstall** — `rook update` checks for a newer release and prints the upgrade command.

| Installed with  | Upgrade                                | Uninstall                                        |
| --------------- | -------------------------------------- | ------------------------------------------------ |
| Homebrew        | `brew upgrade lambdatest/rook/rook`    | `brew uninstall lambdatest/rook/rook`            |
| Shell installer | re-run the install command             | `rm ~/.local/bin/rook` and `~/.testmuai/rook-*/` |
| npm             | `npm install -g @testmuai/rook@latest` | `npm uninstall -g @testmuai/rook`                |

Uninstalling leaves your sign-in and settings in `~/.testmuai/rook/`; delete that directory too to remove them.

Driving rook from Claude Code, Codex or Gemini CLI? Add the [coding-agent skill](#for-ai-coding-agents-reading-this) too. If an install method does not work on your platform, [open an issue](https://github.com/LambdaTest/rook/issues/new/choose).

## Quick start

From inside a project that contains an agent, start `rook`. The first time, sign in through the browser and pick or create the project your work is filed under:

```text
$ rook

› /login
› /project create support-agents

› /explore .

  read 6 files · 1 agent
  triage-service — triages support tickets: severity, owning team, a reply

› /generate

  14 scenarios · 9 functional · 2 non-functional · 3 adversarial

› /profile add local

  How is this agent invoked?  paste a curl · command · http · mcp
› curl http://127.0.0.1:9110/v1/triage -H 'content-type: application/json' -d '{"input":"look at T-1043"}'

  POST http://127.0.0.1:9110/v1/triage
  the scenario goes in "input"

› /sync

  recording 1 agent(s)
  triage-service: new upstream — recording everything
  triage-service: recorded

› /run

  14 scenario(s) → triage-service

  … 11 passed · 2 failed · 1 unverifiable

› /ui
```

`/ui` opens the hosted results app on what you have synced: every verdict, the exchange that produced it, the tools the agent called, and — after a second run — what changed. `/ui --local` serves the evidence on disk in a read-only local viewer instead.

You do not have to run the commands in order. Ask for a later step and `rook` plans the ones it needs first, with the cost, before spending anything. Or just describe what you want in a sentence.

## Commands

| Command                        | What it does                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `/login` · `/logout`           | sign in with your TestMu AI account, or sign out                             |
| `/project`                     | list projects, `use <id>` one, or `create <name>` one                        |
| `/explore`                     | read the codebase — find agents and what they do                             |
| `/agent`                       | list agents, switch the active one                                           |
| `/generate`                    | write scenarios for the active agent                                         |
| `/profile`                     | how to invoke it — `add <name>` (paste a curl), `use`, `test`, `fix`, `show` |
| `/sync`                        | record the project upstream — every agent, as one write                      |
| `/run`                         | execute scenarios against the live agent                                     |
| `/report`                      | what a run found, and — with `--rca` — why                                   |
| `/ui`                          | the hosted results view; `--local` for the on-disk viewer                    |
| `/scenarios`                   | list, exclude, include, delete                                               |
| `/status`                      | where this machine stands against upstream — what is stale or unsynced       |
| `/mcp` · `/env`                | the MCP servers `rook` may call, and the values profiles reference           |
| `/ask`                         | say what you want in words — `rook` works out the command                    |
| `/plan`                        | your account and credit balance                                              |
| `/doctor` · `/guide` · `/help` | diagnostics, the whole sequence explained, and every command                 |

Three ways to invoke the agent under test: an **HTTP** endpoint, a **command** (`claude -p "{{goal}}"`), or an **MCP** tool. For setup, profiles, scenario selection and reading results, see the [user guide](docs/user-guide/README.md).

## In CI

Every step has a headless form. Export `LT_USERNAME` and `LT_ACCESS_KEY` (your username and access key) from CI secrets and `rook` signs in with them; no `rook login` step is needed. Headless commands need tool grants up front, so pass `--yes` once you have reviewed what the agent under test can do (see [A note on safety](#a-note-on-safety)).

```bash
rook project use "$ROOK_PROJECT_ID"
rook agent use "$ROOK_AGENT_ID"
rook explore . --yes
rook generate --yes
rook sync --yes
rook run --yes --json > run.json
rook report "$(jq -r .run_id run.json)" --json > report.json
```

| Exit code | Meaning                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | the command did what it said — a finished run exits `0` whether scenarios passed or failed; gate on the verdicts in `rook report --json`                                                                                                            |
| `1`       | anything else: signed out, refused, unreachable, bad flags, a run that could not start. With `--json`, inspect `error` or `reason` when a document exists; a refused run may have `ok: true, discarded: "refused"`. Some errors only produce stderr |

`rook run` refuses an agent that has never been synced. To keep a result local instead, skip `sync` and use `rook run --test`. The [CI recipe](skill-installer/skills/references/ci.md) is a complete, gated script, and [Headless use and CI](docs/user-guide/headless-and-ci.md) covers sign-in, permission grants, budgets and verdict gating.

## For AI coding agents reading this

Use the [Rook skill](skill-installer/skills/SKILL.md) to test, evaluate, or red-team an AI agent and interpret its saved results. It covers setup, target permissions, credit budgets, profiles, CI and evidence-based verdicts using your installed Rook CLI.

Install it user-wide (needs Node.js 22+ and npm):

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

Set `ROOK_HOME` to keep the second somewhere else, such as a CI workspace. It is deliberately outside your project, so a credential cannot be swept into a commit by `git add -A`. Profiles and MCP configuration reference secrets as `${VAR}` rather than embedding them, so they are safe to commit.

## A note on safety

**The agent you point `rook` at is yours, and its writes are real.** `rook` invokes it the way a user would and cannot roll anything back. Do not rely on a per-target write-tool confirmation in headless mode. Before authoring or testing a profile, or running scenarios, review the target and the real actions it can take; authorize those actions and the credit spend in your coding-agent session or CI configuration.

Judges are told to verify without changing anything — calling `issue_refund` to find out whether a refund exists creates one. Rook evaluates tool calls against its permission policy; headless calls need effective grants rather than an interactive prompt.

> [!IMPORTANT]
> Even so: **point it at staging.**

## Telemetry

`rook` records operational events — no prompts, no code, no arguments — and sends them to TestMu AI, attributed to your organization, to find failures. Set `ROOK_TELEMETRY=off` (or `"telemetry": false` in `~/.testmuai/rook/config.json`) to keep them on your machine. The one-time notice appears only in an interactive terminal, so set the variable in CI if you want it off there.

## Support

- **Bugs and feature requests** — [open an issue](https://github.com/LambdaTest/rook/issues/new/choose). Verdicts you disagree with are the most useful reports we get.
- **Security** — do not open a public issue. See [SECURITY.md](SECURITY.md).
- **Contributing** — see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Documentation** — [TestMu AI Agent Assurance](https://www.testmuai.com/support/docs/agent-assurance-overview/).

<div align="center">
<br>
<sub>Licensed under <a href="LICENSE">Apache 2.0</a> · Made by <a href="https://www.testmuai.com">TestMu AI</a></sub>
</div>
