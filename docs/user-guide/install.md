# Install

[Guide index](README.md) · Next: [Getting started](getting-started.md)

The commands in this guide describe Rook 0.1.1. Install the CLI first; add the
coding-agent skill if you want Claude Code, Codex, or another supported client
to drive it for you.

## Install the CLI

With npm, pin the version this guide covers:

```bash
npm install -g @testmuai/rook@0.1.1
rook --version
rook doctor
```

The [repository installation instructions](../../README.md#install) also
cover Homebrew and the shell installer for macOS and Linux. Those release
archives include a Node runtime. Check the resulting version rather than
assuming an unpinned install matches this guide. `rook update` may install a
new release, so recheck its help and output contract after updating.

## Install the coding-agent skill

The canonical bundle is [`skill-installer/skills/`](../../skill-installer/skills/SKILL.md),
including its `references/` directory. It does not install the Rook CLI.
Cloning this repository makes its generated Claude Code and Codex skills
available inside this clone; it does not install them into a different project.

For a manual project installation, copy the whole canonical bundle into your
agent repository at the location for your client:

| Client | Project location | User-wide location |
| --- | --- | --- |
| Claude Code | `.claude/skills/rook/` | `~/.claude/skills/rook/` |
| Codex | `.agents/skills/rook/` | `~/.agents/skills/rook/` |

Review an existing `rook` skill before replacing it. For updates, copy
`SKILL.md` and `references/` together and check CLI compatibility. To remove
a manual installation, remove only the bundle you installed at that scope,
after preserving any edits you need.

You can also use the third-party Vercel skills CLI, with Node.js and npm
available. Run this from your agent repository **after the canonical skill
has landed on `main`**:

```bash
npx skills add https://github.com/LambdaTest/rook/tree/main/skill-installer/skills --skill rook --agent claude-code codex
```

Select the clients you use. This route installs at project scope; add
`--global` for user-wide scope. Before merge, use the absolute path to
`skill-installer/skills` in your PR checkout in place of the GitHub URL.
Review existing copies before allowing replacement.

## Upcoming npm skill installer

`@testmuai/rook-skill` is **upcoming, not a published installation route**.
Its planned interface requires Node.js 22 or later: `npx @testmuai/rook-skill`
installs, `update` refreshes the bundle, and `uninstall` removes it. Repeat
`--agent` to select `claude-code`, `codex`, or `gemini-cli`. `--prefix` sets
the installation root, which defaults to your home directory. The client
paths beneath it are `.claude/skills/rook`, `.agents/skills/rook`, and
`.gemini/skills/rook`.

The installer is intended to protect unowned directories and local edits.
Use the manual or Vercel route above until publication.
