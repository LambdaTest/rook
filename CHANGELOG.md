## [0.1.13] - 2026-10-23

### Behavior changes
- [plan-check] Rook checks your organisation's Agent Assurance plan before any model call or credit spend. An organisation with no plan, an ended free trial or an expired subscription is refused with `plan_required` and a link to the billing plans page, whatever credit balance it holds.
- [plan-cloud-features] On a plan without Rook cloud, such as Starter, Rook runs locally. Syncing to Rook cloud, cloud project status and recording runs on Rook cloud are refused with `upgrade_plan` and a link to upgrade.
- [plan-upgrade-link] A plan refusal names the billing page that lifts it: the CLI shows it as the next step and the web app opens it. Only https links on LambdaTest or TestMu AI hosts are used.
- [windows-support] Rook runs on Windows: commands, hooks and shims launch through cmd.exe with safe quoting, path checks handle drive roots, case-insensitive folders, short names and junctions, and brief Windows file-sharing and lock errors are retried.
- [windows-scenario-inventory] `rook run` no longer fails on Windows with EPERM when it writes the scenario inventory.
- [process-cleanup] A bash command that times out or is aborted stops its whole process group, and a process an MCP server launcher leaves behind is stopped after close.
- [tui-flag-values] In the TUI, flag-value suggestions such as `--class` and `--category` follow the flag under the caret, not the first flag on the line.

### Added
- Agent Assurance plan check before model calls and credit spend, with an upgrade link on refusals; plans without Rook cloud run locally.
- Windows support for launching commands, file and path handling, and locks.

### Fixed
- `rook run` on Windows no longer fails with EPERM while writing the scenario inventory.
- Bash timeouts and aborts stop the whole process group; leftover MCP launcher processes are stopped after close.
- TUI flag-value suggestions follow the flag under the caret.
## [0.1.12] - 2026-10-21

### Behavior changes

- [tui-update-now-runs-update] Choosing "update now" at the TUI's startup update prompt now closes the TUI and runs rook update in the restored terminal through the channel that installed Rook (npm, the curl installer or Homebrew), so the installer's own output and prompts work, instead of printing an npm install command to copy by hand. "skip this launch" and "never ask again" behave as before.
- [tui-slash-update-leaves-tui] Typing /update in the TUI (bare, with --json or with --), running it from the queue, or accepting a suggested update command now exits the TUI and runs rook update in the terminal after queued work is dropped and the screen is restored. /update auto still runs inside the TUI, and /update with any other flag, such as --debug, still runs inside the TUI as before. --json is not passed on, so the update prints its normal human-readable output, and the TUI closes even when there is nothing to install.
- [tui-update-exit-status] When the TUI hands off to rook update, Rook waits for it and exits with its status (non-zero if the update failed, could not identify the install channel, or was killed). If the update process cannot be launched it prints `could not start rook update: <reason>. Run rook update yourself.` and exits 1. A failed update can print the diagnostics footer twice.
- [update-brew-runs-upgrade] rook update on a Homebrew install now runs brew upgrade itself, using the Homebrew installation that owns Rook's keg rather than the first brew on PATH, and the tap named in the install receipt (or the public lambdatest/rook tap when none is usable). It reports success only after the installed keg shows the requested version. Previously it printed the brew command and exited 1. If Homebrew installs nothing new, for example because the tap has not caught up with npm right after a release, it says the command changed nothing and exits 1.
- [update-brew-refreshes-taps] Every installer rook update runs is now given HOMEBREW_AUTO_UPDATE_SECS=0, so a Homebrew upgrade refreshes its taps first and sees a release published since Homebrew's last daily refresh, even if HOMEBREW_NO_AUTO_UPDATE is set in the user's environment.
- [update-installer-env-proxy-and-brew-optouts] The installer rook update runs (npm, the curl install script or Homebrew) now receives the proxy variables HTTP_PROXY, HTTPS_PROXY, ALL_PROXY and NO_PROXY (upper and lower case) and the Homebrew opt-outs HOMEBREW_NO_ANALYTICS, HOMEBREW_NO_INSTALL_CLEANUP, HOMEBREW_NO_CLEANUP_FORMULAE, HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK, HOMEBREW_NO_INSTALL_UPGRADE, HOMEBREW_NO_ENV_HINTS, HOMEBREW_NO_EMOJI and HOMEBREW_NO_COLOR in addition to PATH and HOME, so updates work on networks that need an environment-configured proxy. Every other variable, including Homebrew mirror, remote, hook and GitHub token settings, is still withheld.
- [update-run-again-notice] After a confirmed update on any install channel, rook update now prints "run rook again to use the new version." after the `updated: <old> → <new>.` line. Rook does not relaunch itself.
- [update-waits-out-ctrl-c] While rook update's installer runs (including after a TUI hand-off and when Rook re-launches itself to honour proxy settings), Rook no longer exits on Ctrl-C but lets the terminal deliver it to the installer, waits for the installer to stop and then reports the outcome. A SIGTERM Rook receives is passed on to the installer's direct process only, not to processes the installer started.
- [regex-miss-judged] A regex acceptance check that does not match the agent's reply no longer fails the criterion outright. The judge model grades the miss on the criterion's meaning, with the expected pattern shown for reference, so a correct answer in a different format, quoting, separator, wording, order or line layout is no longer marked Fail. A match is still an instant Pass. A regex that asserts something is absent (one that still matches a bland multi-line reply, such as a leading negative lookahead) still fails deterministically when the forbidden text appears. A judged miss can add a judge call, and if that call fails the criterion is reported as Unable to Verify instead of Fail. The scenario check that audits criteria at generate time applies the same rule.
- [sync-incomplete-exit-code] When rook sync (or /sync in the TUI) gets no usable answer from Rook's service for one or more of the agents it sent, the command now exits with code 1 even if other agents were recorded. Its summary line adds ", N not returned" and/or ", N malformed" followed by " — run /sync again", and it reports the sync job to Rook's service as failed with outcome code sync_incomplete. Before, it exited 0 and reported the job as completed or as having nothing to do.
- [sync-unanswered-agent-not-saved] rook sync no longer saves an agent's local sync state (state.json) when Rook's service leaves that agent out of its answer, or answers without a version id (or, when the agent's ref did not move, without a current version id). For each such agent it prints a warning that nothing was saved locally. Before, a missing agent was skipped silently, and an entry without a version could be saved as if it had landed, including as a branch reporting that upstream was "still at undefined".
- [tui-login-escape-cancels] Pressing Escape during the browser sign-in started by /login in the TUI now cancels it, whether Rook is registering its client, waiting for the browser or exchanging the code. It shows "interrupted" and "login cancelled", saves no credentials, closes the local sign-in callback listener at once and ends the command with a failure status, instead of waiting until the 10-minute timeout. Once the token is about to be saved the sign-in completes, and a genuine failure or timeout is still reported as its own error. Escape-to-cancel is TUI only and covers only the browser flow; rook login in a shell still uses Ctrl-C.
- [login-returns-after-sign-in] rook login with the browser flow now returns to the shell prompt after "signed in" (within the existing 10-second linger, or sooner once the browser's signed-in page finishes) instead of hanging until the browser is quit, because idle browser connections to the local callback listener are now closed. The late "You're signed in" page is still delivered in full.
- [evidence-upload-failure-warning] When a run that uploads evidence to a Rook project (a run with a project and a run started on Rook's service, not test mode) has one or more evidence uploads fail, the run still finishes with its usual exit code, but its closing summary now adds the warning line `N evidence upload(s) failed — see <log file path>` after the evidence path. N counts every failed upload attempt in the run, including scenario evidence and the report and analysis uploads. An unreadable directory counts once, and a retried scenario counts again on every attempt.
- [evidence-upload-failure-log] Each failed evidence upload now writes an "evidence upload failed" error entry to Rook's daily log file (by default `~/.testmuai/rook/logs/rook-<date>.log`), whatever the telemetry setting. The entry names the stage that failed (read, presign, put or complete), the HTTP status or a vetted error code such as ECONNREFUSED or TimeoutError, the evidence kind, the run id and the evidence file's name. It never contains the presigned upload URL or the raw error message. An evidence file or folder that exists but cannot be read now counts as a failed upload instead of being skipped silently; a file the run never wrote is still skipped without a log entry.
- [evidence-upload-failure-report] When telemetry uploading is allowed, each failed evidence upload is also reported to Rook's service as a small diagnostic. Telemetry is on by default, is turned off by ROOK_TELEMETRY=off or the telemetry setting in Rook's config, and takes effect only after the one-time telemetry notice has been shown on an interactive terminal, so headless and CI runs that never showed it send no report. The report carries only the failing stage, HTTP status, vetted error code, evidence kind and run id, with no upload URL or free text. It is sent in the background with a 5-second timeout and can never fail the run.
- [session-register-env-report] When the CLI registers a session with Rook's service it now also sends a small terminal env report: schema version, a known terminal name, whether stdout is a terminal, terminal columns and rows, color level, and user or root on macOS and Linux. Shell, shell version and Windows admin status are always left empty. The report is left out when telemetry is turned off with ROOK_TELEMETRY=off (or 0 or false) or the telemetry config setting, or when a config file exists but cannot be read. It does not wait for the one-time telemetry notice, so it is sent even before that notice has been shown.
- [env-report-privacy] The terminal env report records only a fixed list of terminal names (VS Code, JetBrains, Alacritty, ConEmu, Windows Terminal, mintty, iTerm, Apple Terminal, WezTerm, Ghostty and Hyper) and never stores raw TERM_PROGRAM, SHELL, USER, HOME, hostname or username values.
- [env-report-local-logs] The terminal env report is also written on this machine to the boot event in Rook's local event log, to crash entries in the diagnostic log, to the command debug record when debug logging is on (--debug or ROOK_LOG_LEVEL=debug), and as an env line in about.txt of a rook export logs bundle, whatever the telemetry setting. It is stripped from uploaded telemetry events.
- [transcript-held-value-masking] Before each session transcript line is written, Rook now replaces values it holds with a marker naming their source, such as `[redacted: env NAME]` or `[redacted: rook credential]`. This covers values saved with rook env set in any project (including ones already applied to the running process or set mid-session), credential-named environment variables (names containing PASSWORD, PASSWD, PASSPHRASE, SECRET, TOKEN, COOKIE, CREDENTIAL, PRIVATE_KEY or API_KEY, or ending in `_PASS`, `_PWD`, `_PAT`, `_DSN`, `_KEY` or `_AUTH`), and the signed-in account's OAuth tokens and access key, each matched raw, trimmed, percent-encoded and JSON-escaped when it is 8 characters or longer. What Rook sends to the model is unchanged.
- [transcript-recognised-credential-masking] Every string and key a session transcript records (prompts, tool arguments and output, agent replies, conversation handles, the model's answers and reasoning) now also goes through Rook's diagnostic redaction. A value under a credential-named key becomes `[redacted]` whatever its shape (objects, arrays and JSON schemas included), and a credential key's object or array is masked whole even in prose, escaped JSON or cut-short output. Authorization and cookie headers, provider API keys, GitHub and Slack tokens, JWTs, PEM private keys and connection-string passwords are masked; an unquoted Authorization header in text is masked to the end of its line. Base64 image data is left intact apart from held values.
- [transcript-url-query-masking] In session transcripts every http or https URL and every database or message-broker connection string keeps its origin and path, but any user credentials, query string and fragment in it are replaced by `[credentials/query redacted]`, whether or not they held a secret. One that cannot be parsed as a URL is replaced whole by `[invalid URL redacted]`.
- [transcript-json-normalised] JSON that appears inside recorded text is kept byte for byte in the session transcript only when it is already compact canonical JSON or pretty-printed with 2-space, 4-space or tab indentation. Any other JSON is re-encoded, so spacing, unicode escapes, repeated keys (only the last value is kept) and integers beyond 2^53 can differ from what the tool printed.
- [transcript-masking-limitations] Transcript masking is best effort. It does not cover held values shorter than 8 characters unless they sit under a credential-named key or match a known token form, personal data, passwords passed as command-line arguments such as curl -u or mysql -p, secrets inside images or other encodings, other files Rook writes, or transcripts recorded by earlier versions, which stay as they were.
- [transcript-write-failure-stops-recording] If a session transcript line cannot be written, cannot be masked (error code EREDACT), or has a large string that cannot be written to the blobs folder, Rook drops that line, prints one warning on stderr that the session transcript could not be written and the rest of this session is not being recorded, and records nothing more for the session rather than write the text unmasked or inline. Previously the warning said only that role calls were not being recorded.
- [transcript-large-string-blobs] Every string of 4,096 UTF-8 bytes or more in a session transcript line is now written, after masking, to a blobs folder beside transcript.jsonl as a file named by its SHA-256 hex digest (folder mode 0700, files 0600, identical content stored once), and the line holds a reference object `{"$blob": "sha256:<hex>", "bytes": <size>}` in its place. A transcript field is therefore not always inline in the line itself.
- [transcript-format-v2-dollar-keys] Session transcript lines are now written with format version v 2. In v2 lines every object key that begins with $ gains one extra $ (a schema's $ref is written as $$ref), so that only spill references have exactly the keys $blob and bytes. Lines written by earlier versions are left as they were, and a resumed session can mix v1 and v2 lines, so readers should check v on each line.
- [export-logs-transcript-notice-blobs] rook export logs now carries a session's blobs folder along with its transcript. The notice it prints and writes to about.txt now says which credentials are masked (rook env set values of 8 characters or more from any project, credential-named environment variables, your sign-in, and keys, tokens and passwords written as such), that transcripts recorded by older versions are not masked, and that large payloads are in blobs/.
- [diagnostic-redaction-more-token-shapes] Rook's diagnostic log, the logs bundled by rook export logs, crash records, and Rook's own status, warning, error and progress messages in the terminal and TUI now also mask GitHub and Slack tokens, JWTs, PEM private keys, cookie and set-cookie headers and cookie fields, credential keys inside escaped JSON, and the credentials and query strings of database and message-broker connection strings (postgres, mysql, mariadb, redis, mongodb, amqp, mssql, sqlserver). rook export logs applies these rules to older daily logs as it bundles them; the files on disk are unchanged. A status, warning, error or progress message, or a --json failure error string, that is entirely JSON but not already compact is now printed in compact form.
- [transcript-tool-calls] Every tool call the agent takes up, MCP tools included, is now written to the session transcript (transcript.jsonl under `~/.testmuai/rook/sessions/<project>/<session>/`, or under ROOK_HOME). A tool_call_start event with the call's arguments is written before any permission prompt. A tool_call_end event is written once the call settles and records the outcome (ok, declined, error, no_such_tool or needs_human), the output the model saw (capped at 60,000 characters, and holding the error message when a tool failed) with its uncapped length, the latency, and interrupted: true when the turn had already been interrupted. A call that stops the loop instead of returning output, such as an ask_user question nobody can answer (needs_human), records an error message of up to 500 characters in place of the output. An interrupt (Ctrl-C, or Escape in the TUI) does not stop a turn's remaining tool calls, so they still run and are marked this way. Calls the loop never takes up, such as those past the per-turn cap or after an earlier call stopped the loop, get no start event, and a start with no end means the process died during that call.
- [transcript-tool-refusal-cause] When a tool call is refused, its tool_call_end entry in the session transcript now records who refused it in a cause field and adds the permission gate's reason when it gave one. The cause is declined when you said no, denied when a stored rule refused it, policy_unreadable when the policy file could not be read, or no_authority when a headless run had nobody to ask. This includes a refused ask_user that stops the loop. A plain no at the prompt for a model-chosen action is now recorded as declined, while the text the model and the TUI show is unchanged.
- [transcript-tool-definitions] The first role_call_start event of each agent loop in the session transcript now also records tool_definitions, the full tool schemas sent to the model, and response_schema_definition when a structured response was requested, alongside the existing list of tool names.
- [transcript-target-turns] During a run, every message sent to the agent under test is now written to the session transcript as it is sent, so a run killed mid-conversation keeps the turns it already exchanged. A target_turn_start event with the message and the conversation handle sent is written before the execute hook runs. A target_turn_end event is written once the hook returns and records the outcome (ok, error or timeout, matching the status in response.json). On ok it adds the reply, the returned conversation handle and the tool calls and usage the hook reported; otherwise it adds the error and the hook's exit code. Both events carry ids for the execution, local run, scenario, attempt, agent and turn, plus the upstream run and run-scenario ids when present, and the end event also carries the latency and interrupted: true if the run was interrupted. A message that is never sent, because the deadline or turn limit came first or the run was interrupted, has no start event, and the single probe message sent by profile test or /profile add is not recorded.
- [transcript-target-turn-errors] If the agent's execute hook cannot be started for a turn, for example because the conversation handle contains a NUL byte or is too large for the environment, the turn's target_turn_end is recorded as an error with the message before the scenario fails. Each turn's end is also written before the execute hook's own report, so the agent's reply stays in the transcript even when that report cannot be written.
- [transcript-loop-end] Every model role Rook starts now ends with exactly one loop_end line in the local session transcript. The line records the role, its phase, its job, agent, run and scenario ids, whether Rook accepted the output, the stop reason, turns and credits used, whether the last reply was cut off or salvaged, any shape or parse fault, and the same error text the user saw. A role refused before it started, by a session halt or the nesting limit, is recorded with started set to false, and a credit halt reads budget_halt.
- [transcript-job-lines] Every Rook job (for example explore, generate, sync or a run) now writes a job_start line to the session transcript before Rook registers the job with its service and before the work begins. After teardown it writes exactly one job_end line with the job's status, outcome code, numeric facts, version id and result reference, all taken from the same code Rook reports to its service, so a job the service refused still shows a start and a not_registered end.
- [transcript-dropped-job] A job that is still queued behind the concurrency limit when Rook shuts down now gets a job_end line with outcome dropped, and no job_start, in the session transcript.
- [transcript-sync-result] rook sync (and /sync in the TUI) now writes one sync_result line per agent folder to the session transcript, under the sync's job id. Each line gives the folder, the local agent id, the outcome (advanced, current, profile_only, branched, skipped, not_returned or malformed) and the version ids Rook's service returned. The lines are written before any local sync state is saved, and a folder skipped because it has no spec is recorded even if the upload later fails.
- [transcript-run-phases] rook run (and /run in the TUI) now writes a run_phase line to the session transcript each time it enters plan (again on every re-plan after a correction), confirm (before asking for approval), execute and record. Each line carries the local run id and, once it exists, the service's run id. The record line says whether execution halted early and why: interrupted, budget, agent_unreachable, runner_error or a session halt. A run continued with --run starts at execute.
- [transcript-scenario-outcomes] rook run now writes a scenario_start line (scenario id, index, total, attempt) before each scenario's agent is called, and exactly one scenario_end line for every start. Once the scenario is graded, scenario_end carries the outcome (passed, failed, unverifiable, unjudged or not_run) if the run's tally has one, the verdict status, the summary, the unverifiable reason and the judge credits. It also carries the error if a step threw. Scenarios re-judged from an earlier pass are marked judge_only, and scenarios the run never took up get no lines.
- [doctor-json] rook doctor accepts a new --json flag that prints the whole doctor report as one JSON object with snake_case keys (version, sessions, log paths, registration, log level, node, os as name/version/arch, workspace, environment, controller and api as url/status pairs, identity, auth, project, mode, a boolean tty and the terminal env object) and no banner, so stdout is pure JSON. Exit codes are unchanged. The TUI's /doctor completion now offers --json.
- [doctor-os-row] rook doctor shows a new os row with the OS name, exact version and CPU architecture (for example macOS 15.6 (24G84) arm64, a Linux distribution from os-release with its kernel, or Windows 10/11 named from the build number with its update revision), adding the Node architecture when it differs from the hardware and noting Rosetta translation, with unknown for any part it cannot read.
- [doctor-terminal-rows] rook doctor text output adds stdout tty, terminal, shell, shell version, privilege, color level and size (columns x rows) rows after its existing rows, printing unknown for anything it cannot detect.
- [doctor-shell-detection] rook doctor detects the active shell (pwsh, Windows PowerShell, cmd, bash, zsh, fish, sh, dash, ksh, tcsh or csh) from up to six parent processes, looking past sudo and the sh or cmd wrapper npm adds, and reports its version. On Windows the version comes from PowerShell's own version, the pwsh file version or the OS build for cmd, while other Windows shells such as Git Bash show no version.
- [doctor-terminal-and-privilege] rook doctor reports privilege as user or root on macOS and Linux and as user or admin on Windows (unknown when the Windows elevation check cannot run). On Windows it also identifies Windows Terminal, VS Code, mintty or a classic console window (conhost) from the parent processes when no terminal variable names one.
- [doctor-probe-fixed-paths] rook doctor starts its probe programs only by absolute path and never runs a shell by bare name, so a program planted in the current folder or on PATH cannot run in their place. On macOS and Linux, ps, sw_vers and sysctl come from fixed system paths, and the shell version check runs the shell from the absolute path ps reports for it, from an absolute SHELL value naming the same shell, or from /bin, /usr/bin, /usr/local/bin or /opt/homebrew/bin. On Windows it starts only the System32 Windows PowerShell.
- [doctor-probe-timeouts] rook doctor runs its probes in parallel with its service reachability checks and times out each probe call after 1.5 seconds on macOS and Linux (3 seconds for the whole walk up the parent processes that finds the shell) and its single PowerShell call on Windows after 5 seconds plus a 1.5-second guard, killing any probe that does not answer and leaving that field unknown. Doctor can take up to about 6.5 seconds on Windows when PowerShell starts cold.
- [env-report-color-level] The env report's color level, shown by rook doctor and sent at registration, is 0 when NO_COLOR is set to a non-empty value, follows FORCE_COLOR values 0 to 3 even when output is redirected, is 0 for other redirected output, and otherwise follows the terminal's color depth.
- [one-shot-banner-mascot] The banner printed by rook doctor and by the TUI when it is started without a terminal now draws the boot screen's 15-column, ten-row one-colour rook mascot with eye holes, with the Rook version, the Agent Assurance by TestMu AI tagline and the environment centred beside it, dimmed on a terminal and plain when piped or when NO_COLOR is set.
- [tui-doctor-banner-layout] Typing /doctor in the TUI now shows the complete banner with every row, its spacing and the aligned identity text intact, dimmed and kept out of collapsed output. It truncates each row instead of wrapping it on a narrow terminal, and copies it as plain text without color codes in full-screen mode.
- [tui-update-control-event] A /update that hands off to rook update, whether typed, queued or accepted in the TUI, now records an "update" UI-control event in Rook's local diagnostics log, which is uploaded with other diagnostic events only when telemetry uploading is allowed.

### Added
- The session transcript now records every tool call the agent runs, MCP tools included: its arguments before any permission prompt, then how the call ended, the output the model saw with its full length, the latency, whether the turn had been interrupted, and who refused the call when it was refused (you at the prompt, a stored rule, an unreadable policy, or a headless run with nobody to ask).
- The session transcript now records every message a run sends to the agent under test, as it is sent, and what came back: the reply, conversation handle, tool calls and usage on success, or the error or timeout and exit code on failure. A run killed mid-conversation keeps the turns it already exchanged.
- The session transcript now records how each model role ended, each job's start and end (a queued job dropped at shutdown is recorded as dropped), what Rook's service recorded for each agent in a sync, each phase of a run and why execution halted early, and a start and exactly one end for every scenario with its verdict, judge credits and any error.
- The first model call of each agent loop now records the full tool definitions and response schema that were sent, not only the tool names.
- Session transcripts now mask credentials before each line is written: values saved with `rook env set` in any project, credential-named environment variables, your sign-in tokens and access key, and keys, tokens, passwords, cookies and connection-string passwords recognisable by name or form. What Rook sends to the model is unchanged. Masking is best effort: held values under 8 characters, personal data, passwords passed as command-line arguments, secrets inside images, and transcripts recorded by earlier versions are not masked.
- Strings of 4 KiB or more in a session transcript are now stored, masked, in a `blobs/` folder beside `transcript.jsonl`, named by their SHA-256 hash, and the line holds a `{"$blob": "sha256:<hex>", "bytes": n}` reference instead.
- The diagnostic log, exported logs, crash records and Rook's own status, warning, error and progress messages now also mask GitHub and Slack tokens, JWTs, PEM private keys, cookie headers and the credentials in database and message-broker connection strings.
- `rook doctor --json` prints the full doctor report as one JSON object, including OS details and a terminal environment object. The TUI's `/doctor` completion offers `--json` too.
- `rook doctor` shows an `os` row with the OS name, exact version and CPU architecture, noting Rosetta or a different Node architecture.
- `rook doctor` reports the terminal environment: whether stdout is a terminal, the terminal app, the active shell and its version, privilege (user, root or admin), color level and terminal size. Its probes run in parallel and only by absolute path, never by bare name; on Windows it starts only the System32 Windows PowerShell.
- Session registration sends a small terminal environment report to Rook's service: a known terminal name, whether stdout is a terminal, size, color level, and user or root on macOS and Linux. Raw environment values are never included. `ROOK_TELEMETRY=off` or the telemetry config setting leaves the report out; it does not wait for the one-time telemetry notice.
- The terminal environment report is recorded locally in the boot event, in crash entries, in debug command logs and in the `about.txt` of `rook export logs` bundles. It is never included in uploaded telemetry.
- When telemetry uploading is allowed, Rook reports a failed evidence upload to Rook's service with only the failing stage, HTTP status, error code, evidence kind and run id. The upload URL is never sent, and headless runs that never showed the telemetry notice send nothing.

### Changed
- Choosing "update now" at the TUI's update prompt, or typing `/update`, now closes the TUI and runs `rook update` in your terminal through the channel that installed Rook, then exits with the update's status. `/update auto` still runs inside the TUI.
- `rook update` on a Homebrew install now runs `brew upgrade` itself. It uses the Homebrew that owns Rook's install, refreshes taps first and confirms the new version before reporting success.
- After a confirmed update, `rook update` prints "run rook again to use the new version."
- While an update's installer runs, Ctrl-C goes to the installer and Rook waits for it to stop before reporting the outcome. A SIGTERM sent to Rook is passed on to the installer.
- The installer run by `rook update` now also receives a fixed set of Homebrew opt-out settings, such as `HOMEBREW_NO_ANALYTICS`.
- `rook sync` now exits with code 1 and reports the sync as incomplete when Rook's service does not answer for every agent it was sent. The summary adds the number of agents not returned or malformed and suggests running `/sync` again.
- A regex check that misses can now add a judge call to grading. If that call fails, the criterion is reported as Unable to Verify instead of Fail.
- Session transcript lines are now format version 2. In v2 lines any object key that starts with `$` gains one extra `$` (a schema's `$ref` is written as `$$ref`). Lines written by earlier versions are unchanged.
- Web URLs and database or message-broker connection strings in session transcripts keep their origin and path, but any embedded credentials, query string and fragment are replaced by `[credentials/query redacted]`.
- JSON a tool printed is kept as written in the transcript only when it is compact canonical JSON or pretty-printed with 2-space, 4-space or tab indentation. Other JSON is re-encoded, so spacing, unicode escapes, repeated keys and integers beyond 2^53 can change.
- If a transcript line cannot be written or masked, or one of its large strings cannot be stored in `blobs/`, Rook drops the line, warns once that the rest of the session is not being recorded, and stops recording instead of writing unmasked text.
- `rook export logs` now includes each exported session's `blobs/` folder. Its notice now lists what is masked and says that transcripts from older versions are not masked.
- A status, warning, error or progress message that is entirely JSON is now printed in compact form when it was not already compact.
- The `rook doctor` banner, and the message shown when the TUI starts without a terminal, now use the boot screen's ten-row rook mascot with the version, tagline and environment centred beside it.

### Fixed
- A regex check no longer fails a correct answer just because it is written in another format. The judge now grades a miss on the criterion's meaning, a match still passes instantly, and a regex that asserts something is absent still fails when the forbidden text appears.
- `rook update` now passes `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `NO_PROXY` to the installer, so updates work on networks that need a proxy set in the environment.
- `rook sync` no longer saves local sync state for an agent the service left out of its answer or answered without a version, and warns about each one. Before, a missing agent was skipped silently, and one without a version could be saved, sometimes as a branch whose upstream was reported as "still at undefined".
- Escape now cancels `/login` in the TUI while it signs in through the browser. Nothing is saved and the command reports "login cancelled" instead of waiting out the 10-minute timeout.
- `rook login` now returns to the prompt after "signed in" instead of hanging until the browser is closed.
- A failed evidence upload during a run is no longer silent. Each one is written to Rook's log file with its stage and error code, and the run ends with a count of failed uploads and the log path. An evidence file or folder that exists but cannot be read now counts as a failed upload instead of being skipped.
- `/doctor` in the TUI keeps the banner's full layout. Rows and spacing are no longer stripped or folded into collapsed output, narrow terminals truncate rows instead of wrapping them, and copying the banner in full-screen mode gives plain text.
## [0.1.11] - 2026-10-12

### Behavior changes
- [sync-orphans] `rook sync` stops before uploading when a scenario names a feature its agent does not carry, and lists each one with its agent, the missing feature and a fix.
- [registered-session] A command that calls the model controller or opens an upstream job refuses before anything runs or is charged when its session could not be registered.
- [session-transcript] Each session's `transcript.jsonl` records the raw input and output of every role call, including refused, failed and interrupted calls.
- [client-headers] CLI and TUI requests send `X-Source-Product: rook` and `X-Rook-Client: cli` or `tui`; `--debug` output shows the client.
- [owasp-mapping] Red-team scenarios carry OWASP LLM, OWASP Agentic (ASI) and MITRE ATLAS references. Scenarios that cannot run are written and named with a reason instead of dropped.
- [redteam-reports] Reports keep refusals, interrupted runs and coverage gaps, and a grounded partial compromise counts as a Fail.
- [cli-text] Help, guide and the TUI's Get Started list teach sync before run; remedies name commands that exist; `rook update` fallbacks print `brew upgrade lambdatest/rook/rook`; the guide lists every credit-spending command and what leaves the machine, including telemetry and `ROOK_TELEMETRY=off`; login text says TestMu AI.
- [logout-note] `rook logout` warns when `LT_USERNAME`/`LT_ACCESS_KEY` still sign commands in.
- [consent-logo] `rook login` shows the Rook logo on the consent page; a cached OAuth client re-registers once to pick it up.
- [boot-banner] The TUI boot banner shows a pixel rook mascot beside ROOK in amber.

### Added
- ANSI-Shadow ROOK in amber beside the mascot
- pixel rook mascot and ROOK name in the boot banner
- full OWASP LLM/ASI mapping, ASI06 two-session proof, poetry variant, reachability fixes
- canonical OWASP and MITRE scenario metadata
- add OWASP multi-turn coverage

### Changed
- preserve grounded outcomes and generation failures
- preserve coverage gaps and rebuild evidence-backed reports
- exclusive attack evidence channels, deterministic report, pre-spend gates
- align retained attack evidence and coverage paths
- correct retained attack coverage and cached failure reports
- preserve refusals and collect interrupted attack evidence
- preserve attack evidence and pinned coverage inventory
- ground attack decisions and align coverage verdict states

### Fixed
- amber name, version-aware threshold, full colour grids
- write non-runnable scenarios and name them instead of dropping
- generate only runnable scenarios
- keep cross-session evidence and settle incomplete judging honestly
- reject contradictory scenario criteria
- preserve grounded OWASP coverage evidence
- require action receipts and retain grounded coverage
- bind retained evidence to its execution
- show the rook logo on the OAuth consent page
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
