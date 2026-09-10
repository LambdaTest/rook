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
