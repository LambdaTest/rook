# Rook skill installer

Install the Rook skill for Claude Code, Codex and Gemini CLI. Requires Node.js
22+ and npm. Install the [Rook CLI](https://github.com/LambdaTest/rook#install)
separately. The skill supports compatible CLI releases and has its own package
version; a CLI version bump alone does not require a skill-package release.

```bash
npx @testmuai/rook-skill
npx @testmuai/rook-skill@latest update
npx @testmuai/rook-skill uninstall
```

By default, all three clients receive the skill beneath your home directory:

| Client | Destination |
| --- | --- |
| Claude Code | `~/.claude/skills/rook/` |
| Codex | `~/.agents/skills/rook/` |
| Gemini CLI | `~/.gemini/skills/rook/` |

Use `--agent claude-code`, `--agent codex` or `--agent gemini-cli` to select
clients; repeat the flag for multiple clients. Install/update uses the executed
package's bundle; `@latest` fetches the current release. `--prefix` replaces the
home root. Preview an unpublished checkout without changing your home skills:

```bash
node skill-installer/cli.js install --agent codex --prefix /tmp/rook-skill-preview
node skill-installer/cli.js uninstall --agent codex --prefix /tmp/rook-skill-preview
```

Updates and uninstall require unchanged installer-owned files. Unowned skills,
local edits, added/missing files or directories, and symlinks beneath the resolved
prefix stop the operation. Back up or move custom skills first; there is no force
option. Replacements roll back on failure; inspect any reported backup path.
Before removing a stale `.installer-lock`, verify no installer is running.
Uninstall preserves parent directories and unrelated skills.

## Release

After merging, run **Publish rook-skill** on `main` in `LambdaTest/rook` with a
new stable version such as `0.1.0`. Configure `NPM_TOKEN` with publish access to
`@testmuai/rook-skill` first. The manual workflow validates the version, runs
package and mirror tests, stamps, packs and publishes. It creates no Git tag or
version commit; retain the run and source commit as release provenance.
Before release, run `bash scripts/test-skill-installer.sh`; keep the canonical
skill and mirrors aligned when commands, workflows or output contracts change.
