# Case-studies capability matrix

Which Rook capability each of the three case-study agents proves after the v2
build, and where the remaining gaps are covered elsewhere in `sample/`.

Legend: ● demonstrated · — not applicable to this agent.

| Rook capability | knowledge-vault | devops-copilot | home-controller |
|---|:—:|:—:|:—:|
| Code-only discovery (plain codebase) | ● | ● | ● |
| Functional scenarios (happy/negative/boundary) | ● | ● | ● |
| Adversarial scenarios | ● injection, exfil, confidential | ● destructive, secret-exfil, confused-deputy | ● authority claims |
| HTTP **sync** transport | ● | ● | ● |
| HTTP **async + poll** transport | — | ● `/v1/jobs` | — |
| **Command / CLI** transport | — | ● `cli.mjs`, exit 0/2 | — |
| **Multi-turn** (`conversation.kind: field`) | ● follow-up | ● approval gating | ● disambiguation + confirm |
| **Attachment input** (`text+file`) | ● PDF/doc summarise | — | — |
| Reset between scenarios (`reset:`) | ● | ● | ● |
| Converse (rook answers the agent's question) | ● | ● "confirm?" | ● "which light?" |
| Deterministic checks (regex / json_path) | ● | ● | ● |
| **Trajectory / tool-call assertions** (`steps[]`) | ● search→read→answer | ● tests-before-patch | ● no-write-on-refusal |
| **Verify the effect, read-only** (no mutation) | ● `/v1/last` grounding | ● `/v1/executed` | ● `/v1/devices/:id` |
| **Restraint = correctness** | ● refuse when not found | ● refuse destructive | ● door stays locked |
| Forbidden tripwires | ● leaked confidential | ● printed secret | ● unsupported promise |
| **Red-team victim/hardened twin** | ● `KV_LEAKY` | ● `DEVOPS_BUGGY` | ● `HOME_BUGGY` |
| **Reliability / flaky** trend | — | ● flaky test | — |
| **Performance / latency** | ● slow "full audit" | — | — |
| Token economy (`observe.usage`) | ● | ● | ● |
| **Recovery / graceful degradation** | — | ● patch rollback | ● offline device, partial scene |
| Regression — **code** (good vs buggy) | ● | ● | ● |
| Write-tool disclosure (`/manifest`, write flags) | ● (all reads) | ● `run_shell`, `apply_patch` | ● `set_device` |
| CI exit codes (0 / 2) | — | ● via `cli.mjs` | — |

## What the trio deliberately does NOT cover (and where it lives)

These are covered elsewhere in `sample/`, so the case studies stay focused:

| Capability | Where it's shown |
|---|---|
| Declared discovery (`.claude/agents`, skill, subagent) | [`../refund-desk`](../refund-desk), [`../demo/booking-desk`](../demo/booking-desk) |
| MCP server discovery + `mcp_call` read-only judging | [`../refund-desk`](../refund-desk), [`../fixtures/d-declared`](../fixtures/d-declared) |
| Framework discovery (CrewAI / LangGraph) | [`../fixtures/d-crewai`](../fixtures/d-crewai), [`../fixtures/d-langgraph`](../fixtures/d-langgraph) |
| MCP invocation transport (`kind: mcp`) | (declared in the profile schema; verify before relying on it) |
| Multi-turn **flag** (`--resume`) | [`../fixtures/t-mt-cli`](../fixtures/t-mt-cli) |
| Unable-to-Verify (rook itself can't observe) | [`../fixtures/v-unverifiable`](../fixtures/v-unverifiable) |
| `${VAR}` secret safety | [`../fixtures/s-secret-echo`](../fixtures/s-secret-echo), [`../byoa-template`](../byoa-template) |
| Prompt/model regression | [`../hero`](../hero) (`HERO_PROMPT`) |
| RCA / remedies, history / trends / `/ui` | any agent, after a signed-in `/run` (needs credits) |

## The transports, at a glance

The trio now exercises three of Rook's transports from one folder:

- **HTTP sync** — all three (`/v1/ask`, `/v1/task`, `/v1/command`).
- **HTTP async + poll** — `devops-copilot` `rook/profile-async.yaml` (`/v1/jobs` → poll).
- **Command / CLI** — `devops-copilot` `rook/profile-cli.yaml` (`node cli.mjs "{{goal}}"`).

Point the same suite at a sync and a CLI profile of `devops-copilot` and the
verdicts should agree — where they don't, the transports have diverged, which is
itself a thing worth catching.
