#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manageSkills, AGENTS } from './lib/installer.js';

const help = `Usage: rook-skill [install|update|uninstall] [options]

Install is the default. Install/update uses the skill bundled with this package;
use npx @testmuai/rook-skill@latest update to fetch the latest package.

  --agent <name>   Select claude-code, codex, or gemini-cli (repeatable).
                   Default: all three.
  --prefix <dir>   Root containing the client directories. Default: your home.
  --help          Show this help.

Destinations: .claude/skills/rook, .agents/skills/rook, .gemini/skills/rook.
Existing unowned or locally modified skills are preserved; move or back them up
before replacing them. Uninstall removes only unchanged installer-owned copies.
This installs skill files, not the Rook CLI. Node.js 22 or newer is required.
`;

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  const { values, positionals } = parseArgs({
    options: { agent: { type: 'string', multiple: true }, prefix: { type: 'string' }, help: { type: 'boolean' } },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write(help);
  } else {
    const action = positionals[0] ?? 'install';
    if (positionals.length > 1 || !['install', 'update', 'uninstall'].includes(action)) {
      throw new Error('Expected install, update, or uninstall. Use --help for usage.');
    }
    const agents = values.agent ?? Object.keys(AGENTS);
    for (const name of agents) if (!Object.hasOwn(AGENTS, name)) throw new Error(`Unknown agent: ${name}`);
    const results = manageSkills({ action, agents: [...new Set(agents)],
      prefix: resolve(values.prefix ?? homedir()), packageRoot: dirname(fileURLToPath(import.meta.url)) });
    for (const result of results) process.stdout.write(`${result.message}: ${result.agent} → ${result.target}\n`);
  }
} catch (error) {
  process.stderr.write(`rook-skill: ${error.message}\n`);
  process.exitCode = 1;
}
