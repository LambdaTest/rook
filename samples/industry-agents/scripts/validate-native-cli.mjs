import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { root } from '../shared/server.mjs';

const base = resolve(process.argv[2] ?? join(root, 'artifacts/local/rook-reviewed'));
const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const output = join(root, 'artifacts/local/native-cli-validation');
await mkdir(output, { recursive: true });
const summaries = [];
for (const demo of catalog.demos) {
  const result = spawnSync('rook', ['scenarios', 'list', '--json'], { cwd: join(base, demo.id), encoding: 'utf8',
    env: { ...process.env, DEMO_BASE_URL: `http://127.0.0.1:${demo.port}`, DEMO_ENGINE: 'fixture', DEMO_VARIANT: 'hardened' } });
  assert.equal(result.status, 0, result.stderr || `Rook failed for ${demo.id}`);
  const report = JSON.parse(result.stdout);
  await writeFile(join(output, `${demo.id}.json`), JSON.stringify(report, null, 2) + '\n');
  assert.equal(report.total, 18);
  assert.deepEqual(report.scenarios.map(s => `${s.class}/${s.category}`).sort(), Object.entries(catalog.taxonomy).flatMap(([c, cats]) => cats.map(cat => `${c}/${cat}`)).sort());
  assert.ok(report.scenarios.every(s => s.state === 'current' && !s.excluded));
  assert.equal(report.runnable, 17);
  const blocked = report.scenarios.filter(s => s.unrunnable);
  assert.deepEqual(blocked.map(s => s.category), ['token_economy']);
  summaries.push({ demo: demo.id, nativeLoaded: report.total, current: true, fixtureRunnable: report.runnable, blocked });
  console.log(`${demo.id}: Rook loaded 18 current scenarios; 17 runnable with fixtures; token_economy correctly requires usage.`);
}
await writeFile(join(output, 'summary.json'), JSON.stringify({ kind: 'actual-rook-native-loader-validation', executionVerdicts: false, summaries }, null, 2) + '\n');
