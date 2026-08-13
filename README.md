# rook — TestMu AI (Formerly LambdaTest)

**Agent assurance from the terminal.** Point `rook` at an AI agent you own. It reads the codebase to work out what the agent actually does, writes a test suite for it, invokes the agent for real, and grades what comes back — with evidence, and with an explicit account of anything it could not check.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-brightgreen)
[![Issues](https://img.shields.io/github/issues/LambdaTest/rook)](https://github.com/LambdaTest/rook/issues)

> **Status: pre-alpha, and there are no public releases yet.** This repository is where they will land — binaries per OS and architecture, release notes, sample agents, and the issue tracker. Watch it or open an issue; installation instructions go live with the first tag.

---

## Contents

- [What it does](#what-it-does)
- [Why it works this way](#why-it-works-this-way)
- [Install](#install)
- [Five minutes](#five-minutes)
- [Commands](#commands)
- [In CI](#in-ci)
- [Sample agents](#sample-agents)
- [Where things are kept](#where-things-are-kept)
- [A note on safety](#a-note-on-safety)
- [Support, issues, security](#support-issues-security)

---

## What it does

Testing an AI agent is awkward because there is no fixed contract. Input might be a sentence, a pull request, or an image; output might be prose, a created ticket, or a written file. So `rook` derives the tests rather than asking you to write them.

```
$ rook

  /explore .    read the codebase — find the agents and what they do
  /generate     scenarios: functional · non-functional · adversarial
  /profile set  how to invoke it — paste a curl, or give a command
  /run          execute them, 3 at a time
  /ui           verdicts, evidence and trends, in a browser
```

Scenarios span three classes and eighteen categories — happy path, negative, boundary, integration and state handling; performance, token economy, reliability and quality; and the adversarial set: prompt injection, jailbreak, data exfiltration, PII leakage, harmful content, hallucination, hijacking, policy violation and technical injection.

## Why it works this way

Two ideas do most of the work.

**An agent's account of what it did is the weakest evidence available about what it did.** It is the one party with a reason to be wrong. So `rook` does not grade the reply. It reads the code, watches the filesystem, and calls the agent's own tools to check the effect — then quotes what it found.

**Anything `rook` could not verify is reported as unverifiable — never as a pass, never as a failure.** It is excluded from the denominator rather than counted against you, and the gaps are computed rather than asked of a model, so a verdict can say *"Pass, and here is what nobody looked at."* A harness that reports a failure it did not observe is worse than one that admits it could not look.

What a run gives you:

- **Per criterion**, not per scenario: what was expected, what happened, and a quote as evidence.
- **What could not be checked, and why.**
- **What changed since last time** — newly failing, fixed, **flaky** (flips between runs on an unchanged scenario, which calls for the opposite response to a regression), and scenarios whose definition changed, so their history no longer compares.
- **What it did, not just what it said** — files that changed on disk while it ran, artifacts it produced, and tool calls checked against the agent's own tool surface.

## Install

Three ways, on macOS and Linux, x64 and arm64. Each one carries its own Node runtime, so none of them needs Node installed.

**Homebrew**

```
brew tap LambdaTest/rook https://github.com/LambdaTest/rook.git
brew install rook
```

**Shell installer** — downloads the archive matching your platform, verifies its checksum, and links `rook` into `~/.local/bin`. Pass `--dir` to put it somewhere else, or `--version X.Y.Z` to pin one.

```
curl -fsSL https://raw.githubusercontent.com/LambdaTest/rook/main/install.sh | bash
```

**npm** — if you would rather manage it with your other global CLIs.

```
npm install -g @testmuai/rook
```

Nothing is published yet: these land with the first tag, and until then every one of them will 404. [Open an issue](https://github.com/LambdaTest/rook/issues/new/choose) if you would like to be told when that happens.

## Five minutes

Once installed, from inside a project that contains an agent:

```
› /explore .

  read 6 files · 1 agent
  triage-service — triages support tickets: severity, owning team, a reply

› /generate

  14 scenarios · 9 functional · 2 non-functional · 3 adversarial

› /profile set

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

| | |
|---|---|
| `/explore` | read the codebase — find agents and what they do |
| `/agent` | list agents, switch the active one |
| `/generate` | write scenarios for the active agent |
| `/profile` | how to invoke it — `set` (paste a curl), `test`, `show` |
| `/run` | execute scenarios against the live agent |
| `/ui` | the browser view — runs, evidence, trends |
| `/scenarios` | list, exclude, include, delete |
| `/mcp` | the MCP servers `rook` may call |
| `/plan` | what is stale, and what refreshing it would cost |
| `/budget` · `/doctor` · `/guide` · `/help` | |

Three ways to invoke the agent under test: an **HTTP** endpoint, a **command** (`claude -p "{{goal}}"`), or an **MCP** tool.

## In CI

There is a headless mode:

```bash
rook explore .
rook generate
rook run
rook report
```

| Exit code | Meaning |
|---|---|
| `0` | success |
| `1` | error |
| `3` | unauthorized |
| `4` | budget exhausted |

## Sample agents

Two agents to try `rook` against live in [`samples/`](samples), covering the two cases that exist in the wild:

| | |
|---|---|
| [`triage-service`](samples/triage-service) | A plain codebase — a prompt in a string, a tool table, an HTTP server. Nothing declares itself an agent, so finding it means reading the code. |
| [`refund-desk`](samples/refund-desk) | A Claude Code agent — `.claude/agents/*.md`, a skill, a read-only subagent and two MCP servers. Found deterministically, then each server is asked what tools it really has. |

Both keep their state in memory and reset with the process, so they are safe to point a harness at. Both are also deliberately imperfect — an agent that passes everything teaches you nothing about a harness.

## Where things are kept

Everything `rook` produces is plain files. No database.

| Path | What |
|---|---|
| `<project>/.testmuai/rook/` | agents, scenarios, runs, evidence — yours, and committable |
| `~/.testmuai/rook/` | credentials, settings, permission grants, sessions |

The second is deliberately outside your project, so a credential cannot be swept into a commit by `git add -A`. Profiles and MCP configuration reference secrets as `${VAR}` rather than embedding them, so they are safe to commit.

## A note on safety

**The agent you point `rook` at is yours, and its writes are real.** `rook` invokes it the way a user would and cannot roll anything back. Before a run it says how many write tools the agent declares and asks once; grants are per target, so approving one agent does not approve the next.

Judges are told to verify without changing anything — calling `issue_refund` to find out whether a refund exists creates one — and every tool call they make goes through the same prompt.

Even so: **point it at staging.**

## Support, issues, security

- **Bugs and feature requests** — [open an issue](https://github.com/LambdaTest/rook/issues/new/choose).
- **Security** — do not open a public issue. See [SECURITY.md](SECURITY.md).
- **Contributing** — see [CONTRIBUTING.md](CONTRIBUTING.md).

Licensed under [Apache 2.0](LICENSE).
