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

- Full-screen terminal UI redesign, with animated phase spinners.
- Copy mode in the TUI: Ctrl+Y selects transcript lines and Enter copies them to the clipboard. Mouse selection and drag-to-copy also work.
- Reference a workspace file in a TUI message with `@path`. rook attaches the file's contents to that message.
- The TUI completes flag values such as `--class` and `--category`.
- `rook ui --local` opens a redesigned local viewer that looks like the cloud app. Every install now includes it.
- Only one rook session can run in a workspace folder at a time. A second session is refused and shows the process that holds the folder; `rook doctor` still runs.
- If your CLI is older than the minimum version the service accepts, rook refuses to run. It shows the installed and required versions and the command to update.

### Changed

- Pass rate now counts Unable to Verify results: Pass / (Pass + Fail + Unable to Verify). Every place rook shows a pass rate uses this formula.
- rook keeps a separate project selection for each environment.
- rook refuses unknown commands and extra arguments, and suggests the closest command. Before, `rook typo` opened the TUI and `rook status extra` ran `status`.
- The version shown in the TUI is now the exact released version, with no `-alpha` suffix.
- Errors from the service use the same wording everywhere, and each one says what to do next.
- The docs link points to the TestMu AI agent assurance docs.

### Fixed

- `json_path` checks work when a hook returns the agent's response as a serialized JSON string.
- `/ask` in the TUI no longer hangs after it answers.
- `/doctor` in the TUI reports mode `tui` instead of `cli`.
- A browser `/login` in the TUI takes effect even when `LT_USERNAME` and `LT_ACCESS_KEY` are exported.
- Two rook processes no longer reuse the same sign-in refresh token, which could sign you out.
- When the service returns an error, rook now reports that error. It no longer shows a connection failure, and it cleans server text before displaying it.
- Concurrent rook processes no longer upload the same telemetry twice.
- `rook export logs` no longer prints a Node DEP0190 warning.
- Ending a session with a signal releases its workspace lock.
- Mouse handling, text selection and completions in the TUI are more stable.

## [0.1.5] - 2026-09-22

### Added

- `rook profile add` writes the hook script as a single Node file and generates a README next to `profile.yaml`.
- `rook profile add` saves the profile before verifying it. If a run stops early, continue with `rook profile test` or `rook profile fix`.
- A verified `rook profile add` stores the credentials its live run proved, as `rook env set` does.
- `rook env set` accepts `KEY VALUE`, `KEY=VALUE`, or `--from <file>` (a `.env` or `.json` file), as well as JSON.
- `--debug` writes extra diagnostic details to the local log.
- `rook doctor --session <id>` shows the file paths for a recorded session.
- Tool-call criteria with an expected count (`times`) now count repeated identical calls. More calls than expected is a Fail.
- The judge sees the token usage your agent reports.
- Resume planning can see the results of earlier completed and interrupted runs.

### Changed

- New projects get readable folder names (`<name>--<id>`). Existing folders keep working.
- Default hook timeouts are longer: 2 minutes for prepare, open and close, and 10 minutes for execute and collect.
- `rook profile add` has a larger credit allowance, so multi-step agents can finish verifying.
- Failed commands write diagnostics to the local log, with credentials redacted, and send them with your existing telemetry uploads.

### Fixed

- Windows: `rook login`, `/login`, `/ui` and `/docs` now open the browser.
- The TUI prints the project line once at startup, not after every command.
- The product name is spelled TestMu AI everywhere in the CLI.

## [0.1.4] - 2026-09-22

Maintenance release. No user-facing changes to the CLI.

## [0.1.3] - 2026-09-10

### Fixed

- A `rook update` from an npm install no longer fails with `TAR_BAD_ARCHIVE`.
- Resumed runs execute the scenarios that the approved plan selected. They reject incomplete carried evidence and report interrupted or aborted work accurately.
- The terminal menu and help show the allowed values for positional arguments, and parser errors are no longer printed twice.

### Removed

- An unused runtime dependency.

## [0.1.2] - 2026-09-10

### Added

- Choose whether to create a project, select an existing project, or open the project recorded in the current workspace.

### Changed

- Long project lists scroll within a fixed area of the terminal.
- Cached project names update when a project is renamed.

### Fixed

- When you plan a run from explicit flags, rook no longer makes a model planning call. Free-text instructions still use the planner.
- The active profile no longer changes after you add a profile.
- The TUI and the shell parse comma-separated list flags the same way, including spaces around commas and root options placed between values.
- Attack generation resolves supported file citation suffixes. When access is refused, rook reports which cited files it can read.

## [0.1.1] - 2026-09-05

### Added

- `rook login` with a username and access key, for machines with no browser, including CI runners.
- Native end-to-end adversarial (red-team) testing. Attack patterns carry their metadata, risk weighting guides the run, and rook validates the catalog before using it.
- rook registers each session and resolves the project at startup, with a project picker when more than one is available. `rook sync` and `rook status` report the project state and the four sync states.
- rook opens every `explore`, `generate` and `run` as a job before it starts and records how it ended, including how rook was driven and what it cost. Concurrent jobs share one screen and ask one question at a time.
- Run evidence and artifacts are uploaded and can be traced to the session, job and run that produced them. Credit usage is attributed to the same three ids.
- Public installs are told when a newer rook is available.
- Headless mode declares what it needs up front and refuses what it cannot honor, instead of failing partway through.
- One connectivity state. To retry, run the same command again.
- Richer generated-scenario output in the TUI, and a new startup screen.

### Changed

- The credits top-up link opens the billing page.
- Scenario classification uses three independent axes (class, category and tags) instead of one kind.

### Fixed

- Windows: `rook login` works. rook passes the full authorize URL to the browser and always prints it so you can open it by hand.
- Login: the consent page's redirect back to rook works, and logins are no longer cut off after eight seconds with "signed out elsewhere".
- A 403 is no longer reported as an expired session. Each auth failure now names its own remedy, and the access key stays out of hook scripts.
- Ctrl+C no longer loses the end of a session, and pending job results are saved before exit.
- Running out of credits stops the whole session and explains why. Every early exit from `run` says what happened.
- rook no longer refuses readable documents as zip bombs.
- `explore` and `generate` handle malformed model output by guarding or reporting it, instead of crashing or silently dropping fields.
- The permission prompt keeps its unconfirmed-write warning, and write labels (`[WRITE]` / `[WRITE?]`) are correct.
- rook no longer reports false CRITICAL findings.
- Scenarios no longer invent record ids, which made correct agents fail.
- The project picker can be exited, and a wrong URL is no longer reported as a missing project.
- `--force` applies to each candidate separately. The TUI's force count is correct and a startup crash is fixed.
- `rook plan` no longer registers a session.

## [0.1.0] - 2026-08-14

### Added

- Initial public release. `rook` reads an agent's codebase, writes a scenario suite for it, runs the agent for real, and grades the result with evidence. When it cannot verify something, it reports that instead of guessing. See the [README](https://github.com/LambdaTest/rook) for details.
- Install with npm: `npm install -g @testmuai/rook`
- Install with curl: `curl -fsSL https://raw.githubusercontent.com/LambdaTest/rook/main/install.sh | bash`
- Install with Homebrew (superseded; see [Install](https://github.com/LambdaTest/rook#install) for the current command): `brew tap lambdatest/rook https://github.com/LambdaTest/rook.git && brew install lambdatest/rook/rook`
- Supports macOS and Linux on x64 and arm64. The curl and Homebrew installs bundle their own runtime, so they need no local Node. The npm install needs npm to download rook.
