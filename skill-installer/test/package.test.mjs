import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('the packed npm artifact installs and uninstalls offline through its real bin', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'rook-skill-pack-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const env = { ...process.env, npm_config_cache: join(temp, 'npm-cache'), npm_config_audit: 'false', npm_config_fund: 'false' };
  const npm = (...args) => {
    const result = spawnSync('npm', args, { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout;
  };
  const [packed] = JSON.parse(npm('pack', '--ignore-scripts', '--json', '--pack-destination', temp));
  const paths = packed.files.map((file) => file.path);
  for (const path of ['cli.js', 'lib/installer.js', 'LICENSE', 'README.md', 'skills/SKILL.md', 'skills/references/verdicts.md']) {
    assert.ok(paths.includes(path), `${path} missing from package`);
  }
  assert.equal(paths.some((path) => path.startsWith('test/') || path.includes('.testmuai') || path.startsWith('.github/')), false);
  const prefix = join(temp, 'installed');
  const archive = join(temp, packed.filename);
  const invoke = (action) => npm('exec', '--offline', '--yes', '--package', archive, '--', 'rook-skill', action, '--agent', 'codex', '--prefix', prefix);
  invoke('install');
  const installed = join(prefix, '.agents/skills/rook');
  assert.equal(readFileSync(join(installed, 'SKILL.md'), 'utf8'), readFileSync(join(root, 'skills/SKILL.md'), 'utf8'));
  assert.equal(readFileSync(join(installed, 'references/verdicts.md'), 'utf8'), readFileSync(join(root, 'skills/references/verdicts.md'), 'utf8'));
  invoke('uninstall');
  assert.equal(existsSync(installed), false);
});
