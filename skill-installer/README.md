# Rook skill installer

Install the Rook coding-agent skill and its references for Claude Code, Codex
and Gemini CLI. This package installs instructions; install the Rook CLI
separately using the [repository's installation guide](https://github.com/LambdaTest/rook#install).
The bundled skill currently describes Rook 0.1.1. Its package version is independent.

Requires Node.js 22+ and npm. The npm commands below apply after maintainers
publish the first package; an unpublished checkout can be tested locally as shown below.

```bash
npx @testmuai/rook-skill
npx @testmuai/rook-skill@latest update
npx @testmuai/rook-skill uninstall
```

By default all three copies are installed in your home directory:

| Client | Destination |
| --- | --- |
| Claude Code | `~/.claude/skills/rook/` |
| Codex | `~/.agents/skills/rook/` |
| Gemini CLI | `~/.gemini/skills/rook/` |

Use `--agent claude-code`, `--agent codex` or `--agent gemini-cli` to select
clients. Repeat the flag to select more than one. Install and update use the
bundle in the package being executed; `@latest` asks npm for the current release.
Keep that skill's documented CLI version compatible with your installed Rook.

```bash
npx @testmuai/rook-skill --agent codex --agent claude-code
node skill-installer/cli.js install --agent codex --prefix /tmp/rook-skill-preview
node skill-installer/cli.js uninstall --agent codex --prefix /tmp/rook-skill-preview
```

`--prefix` chooses a root in place of your home. The same client directories are
created beneath it, so the preview above uses `/tmp/rook-skill-preview/.agents/skills/rook`.
Those preview files do not install into your normal client configuration.

## Existing skills and updates

The installer records the installed version and an ownership/hash manifest.
It updates or removes only copies it owns whose files still match that record.
Locally edited files, extra files/directories, missing files, unknown existing
skills and symlinks in the client/skills/skill paths stop the operation before
any selected target is changed. The explicitly supplied prefix itself is resolved
first, so aliases such as `/tmp` remain usable.
Back up or move an existing custom skill before installing this package there.
There is no force-delete option.

Updates replace the complete owned bundle, so retired reference files do not
linger. Copies are staged and renamed, with rollback if replacement fails.
A filesystem failure is a nonzero exit; inspect any reported backup path before
retrying. A leftover `.installer-lock` directory means another operation may be
running or was interrupted; verify that no installer is active before removing it.
Uninstall leaves parent directories and unrelated skills in place.

## Maintainer release

After the installer is merged, run **Publish rook-skill** from `main` in
`LambdaTest/rook`, supplying an explicit stable package version such as `0.1.0`.
The workflow tests the package on macOS and Linux, stamps that version, packs it,
and publishes using the repository's `NPM_TOKEN`. The token must have publishing
access to `@testmuai/rook-skill`. No push or pull-request event publishes a package.
The same npm package version cannot be published again; choose a new version for
new contents. This workflow does not create a Git tag or alter the checked-in
package version, so retain the workflow run and its commit as release provenance.

Before publishing, run `bash scripts/test-skill-installer.sh` from the repository
root and update the canonical skill/mirrors together for any CLI contract changes.
