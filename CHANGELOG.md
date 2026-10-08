## [0.1.7] - 2026-10-08

### Behavior changes
- [no-repeat] Scenarios have no repeat count: each scenario runs once, `rook scenarios` no longer shows one, and new scenario files carry no `repeat` key.
- [categories] `performance` and `reliability` are no longer scenario categories (16 remain; non_functional is now token_economy and quality). `rook generate` refuses them; existing scenario files that use them still load and run.
- [generate-bad-flags] `rook generate` with an unknown --class or --category now exits 1 before analysing anything, instead of exiting 0, and lists every valid value.
- [generate-feature] `rook generate` sets each scenario's feature to the one it was assigned. If the model named a different feature, generate warns and saves that scenario excluded; `rook scenarios include <id>` brings it back.
- [json-warning] `rook` no longer prints "ExperimentalWarning: Importing JSON modules" on Node 22.0–22.11.
- [node20] On Node 20, `npm install -g @testmuai/rook` installs the latest release again instead of 0.1.0.
- [ui-open] Opening the web UI from the CLI goes to rook.lambdatest.com, not rook.testmuai.com.
- [npm-page] The npm page links to LambdaTest/rook, and the package ships without source maps.

### Changed
- Node 20 users upgrade past 0.1.0
- point the npm page at LambdaTest/rook and strip source maps

### Fixed
- run-page tiles count what is listed; local matches cloud for unjudged
- local viewer keeps an attempted, unjudged scenario on a finished run
- local viewer lists pending scenarios while a run is still writing
- QA follow-ups on the run pages and verdict upload
- open rook.lambdatest.com from /ui on prod, not rook.testmuai.com
## [0.1.6] - 2026-10-05

### Added
- use cli-spinners for spinner frames, fix remaining typecheck errors
- use cli-spinners for the phase spinner frames
- copy mode, caret ownership, per-env write isolation, grep redaction, flag completions
- copy mode with OSC 52 clipboard, grep terms redacted in trace
- full-screen TUI revamp with agent assurance fixes

### Changed
- drop the mid-command and TUI handling; keep the gate
- name the versions in the gate's catalogue refusal
- trim to the core behaviour
- say the refusal unless it was said; stop refused TUI re-registration
- fail every shell command the gate closed on; pin the sent version
- exit 1 from an interactive rook ask the gate refused
- close the gate on a telemetry 426 and on a refused bad body
- say the refusal when a plain rook run's end call meets the 426
- preserve exact CLI release versions
- hide dashed access codes in server prose
- narrow credential gate and status verdicts
- attribute server prose and guard stream decisions
- reject hostile prose and incomplete stream frames
- preserve answered stream evidence and reject instruction prose
- close answered-error gaps in trimmed fix
- simplify server prose handling and trim regressions
- preserve controller answer and link state
- keep cancellation distinct from outages
- preserve error-body tears and large tool calls
- bound decoding and word torn responses
- preserve answered status and transport link state
- close reviewed response and credential gaps
- reject malformed controller completions and accounting
- fail answered malformed streams and refreshed 401s
- consume OSC payload through its terminator
- preserve answered failures and close sanitizer gaps
- a network fault is a failure nothing answered

### Fixed
- export logs no longer triggers Node DEP0190 warning
- retain mouse decoder state and respect input ownership
- give pickers pointer ownership and stabilize drags
- align selection geometry and bound CSI buffering
- limit flag hints to TUI option tokens
- stabilize TUI mouse and completion behavior
- decode mouse drags and copy transcript lines
- gate every classifier call; refuse on a failed write
- preserve pending decided verdicts across continuations
- keep continuation upload state recoverable
- refuse corrupt continuation reports before spend
- validate local report evidence before deriving metrics
- preserve completed status during tally recovery
- retain continuation rates and reject lost evidence
- keep historical rate labels truthful
- count recorded results and encode evidence diagnostics
- keep recovery accounting scoped to decided verdicts
- guard repeat attempts and cache only completed summaries
- stop invalid-verdict scheduling and reuse saved summaries
- share decided-verdict pass rates across run surfaces
- distinguish local recovery errors from server markers
- preserve blocked recovery through command formatting
- scope refresh persistence and preserve failure causes
- durably claim refresh grants before dispatch
- remove the state row from doctor output
- /doctor in the TUI reports mode tui instead of cli
- /ask in the TUI no longer hangs after answering
- preserve shell warning and defer browser choice until cleanup
- prefer explicit browser login in current process
- keep selections per environment
- docs URL points to TestMu AI agent assurance docs; merge upstream/main
- restore Identity beside block-letter wordmark after restoring original logo
- update trace filter test to the redacted grep row
- read unverified 401 bodies before classifying
- preserve answered failures and reject malformed replies
- clear reused runner workspace before public scripts
- pin public npm registry for skill release evidence
- run only Vitest script suites in CI
- collect real nested CLI help without recursion loops
- use real CLI help and distinguish deleted forks
- collect nested CLI help and reject incomplete PR facts
- require complete skill and release facts
- require complete release evidence and pinned gh
- fail on incomplete released CLI evidence
- guard release setup and qualify recovery PRs
- preserve release channel and CLI evidence
- handle production prerelease skill updates
- close skills-update review boundaries
- prevent concurrent telemetry duplicate uploads
## [0.1.5] - 2026-09-22

No changes recorded since the last release.
## [0.1.4] - 2026-09-22

No changes recorded since the last release.
## [0.1.3] - 2026-09-10

### Fixes
- Fix npm-installed `rook update` failing with `TAR_BAD_ARCHIVE` by binding the scoped registry setting correctly.
- Resume the scenarios selected by the approved plan, reject incomplete carried evidence, and report interrupted or aborted work accurately.
- Show declared positional choices in the terminal menu and help, and avoid duplicate parser diagnostics.
- Remove the unused evidence-cli runtime dependency.
## [0.1.2] - 2026-09-10

### Improvements
- Choose whether to create a project, select an existing project, or open a project recorded in the current workspace.
- Navigate long project lists within a fixed terminal viewport and refresh cached project names when they change upstream.

### Fixes
- Plan runs from explicit flags without making a model planning call. Free-text instructions still use the planner.
- Keep the active profile consistent after adding a profile.
- Parse comma-separated list flags consistently in the terminal UI and shell, including spaces around commas and intervening root options.
- Resolve supported file citation suffixes during attack generation and report which cited files can be read when access is refused.
## [0.1.1] - 2026-09-05

### Added

- Sign in with a username and access key — `rook login` for machines with no browser, CI runners included.
- Native end-to-end adversarial (red-team) testing: attack patterns carry their metadata, risk weighting guides the run, and the catalogue is validated before it is used.
- `rook` registers each session and resolves the project at boot, with a project picker when more than one is available; `rook sync` and `rook status` report the project state and the four sync states from `state.json`.
- Every `explore`, `generate` and `run` is opened as a job before it starts, and its ending is recorded — including how rook was driven and what it cost. Concurrent jobs share one screen: one question at a time.
- Run evidence and artefacts are uploaded and traceable to the session, job and run that produced them; credit usage is attributed to the same three ids.
- A public install is told when a newer rook is available.
- Headless mode declares what it needs up front and refuses what it cannot honour, instead of failing part-way.
- A single connectivity state, and the command you ran is the retry.
- Richer generated-scenario output in the TUI, and a new boot screen.

### Changed

- The credits top-up link now opens the billing page (`/billing/credits`); the previous path led nowhere.
- Scenario classification uses three independent axes — class, category and tags — instead of one kind.

### Fixed

- Windows: `rook login` was unusable because `cmd` truncated the authorize URL at the first `&`; the URL is now passed to the browser intact, and always printed so it can be opened by hand.
- Login: the consent page's automatic redirect to `127.0.0.1` was refused, and the auth heartbeat aborted every login after eight seconds with "signed out elsewhere".
- Auth: a 403 is no longer reported as "your session expired" — three statuses, three remedies. The credential is read from the environment rook started with, and the access key is kept out of hook scripts.
- Ctrl+C no longer loses the end of a session; a logout defers the outcome instead of dropping it; queued job endings are flushed on exit.
- Running out of credits stops the session, not one worker, and the message says who refused and why. Every early exit in `run` says what actually happened.
- Documents rook can read are no longer refused as zip bombs; the zip64 sentinel is handled; an empty preview is reported rather than silent.
- `explore` and `generate` are hardened against malformed model output: feature and `known_data` shape drift, unsafe integers, circular references, blank elements and Unicode bidirectional overrides in one-line rendering are guarded or reported instead of crashing or silently dropping fields.
- The permission prompt no longer drops its unconfirmed-write warning; write-status labels (`[WRITE]` / `[WRITE?]`) are correct, and bare truthiness checks no longer fabricate CRITICAL findings.
- Scenarios no longer invent record ids, which graded correct agents as Fail.
- The project picker had no exit, and a wrong URL reported itself as a missing project.
- `--force` is scoped per candidate; the TUI's force count and a startup crash are fixed.
- `rook plan` calls the right endpoint and does not register a session.
## [0.1.0] - 2026-08-14

### 0.1.0

Initial public release.

`rook` reads an agent's own codebase, writes a scenario suite for it, runs the agent for real, and grades the result with evidence — reporting what it could not verify rather than guessing. See the [README](https://github.com/LambdaTest/rook) for the full picture.

Install:
- npm: `npm install -g @testmuai/rook`
- curl: `curl -fsSL https://raw.githubusercontent.com/LambdaTest/rook/main/install.sh | bash`
- Homebrew: `brew tap lambdatest/rook https://github.com/LambdaTest/rook.git && brew install lambdatest/rook/rook`

macOS and Linux, x64 and arm64. The curl and Homebrew installs need no local Node — each bundles its own runtime. (The npm install still needs npm itself, to fetch it.)

# Changelog

All notable changes to rook are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
