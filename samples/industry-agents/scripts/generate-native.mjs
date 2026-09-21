import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { root } from '../shared/server.mjs';
import { findDemo } from '../shared/config.mjs';
import { loadNative } from '../shared/native-coverage.mjs';

const [selector, workspace, selectedCategories] = process.argv.slice(2);
if (!selector || !workspace) throw new Error('Usage: node scripts/generate-native.mjs banking-agent-code /prepared/rook/workspace [comma-separated-categories]');
const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const demo = await findDemo(selector);
const directory = resolve(workspace);
const source = JSON.parse(await readFile(join(root, 'demos', demo.id, 'scenarios.json'), 'utf8'));
const categories = selectedCategories ? selectedCategories.split(',') : Object.values(catalog.taxonomy).flat();
if (categories.some(c => !Object.values(catalog.taxonomy).flat().includes(c))) throw new Error('Unknown category');
const projectRoot = join(directory, '.testmuai', 'rook', 'projects');
const agents = [];
for (const project of await readdir(projectRoot)) {
  const parent = join(projectRoot, project, 'agents');
  for (const agent of await readdir(parent).catch(() => [])) agents.push(join(parent, agent));
}
if (agents.length !== 1) throw new Error('Expected one discovered agent in this isolated workspace; run rook explore first');
const nativeDirectory = agents[0];
const existing = await loadNative(nativeDirectory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
const present = new Set(existing.map(s => s.category));
const pending = source.filter(s => categories.includes(s.category) && !present.has(s.category));
const logs = join(directory, '.generation');
await mkdir(logs, { recursive: true });

// Small batches stay below the installed CLI's phase budget and keep requests inspectable.
// --force makes already-covered features eligible for a DIFFERENT missing category.
for (let offset = 0; offset < pending.length; offset += 3) {
  const batch = pending.slice(offset, offset + 3);
  const selected = batch.map(s => s.category), classes = [...new Set(batch.map(s => s.class))];
  const instruction = `Add ONE native scenario for each missing category for ${demo.title}. Keep all existing scenario IDs and other categories unchanged; no replacements. PRD rules override vulnerable defects. Exact synthetic customer turns and acceptance follow. Earlier turns go in setup_messages; final turn is goal. Verify captured business receipts. Denied tool attempts are allowed. Missing model usage is Unable to Verify.\n` +
    batch.map(s => `${s.class}/${s.category}: turns=${JSON.stringify(s.goals)}; expect=${s.assertions.map(a => a.statement).join('; ')}; repeat=${s.repeat}; tag=fault-${s.fault}`).join('\n');
  const args = ['generate', '--force', '--class', classes.join(','), '--category', selected.join(','), '--total', String(batch.length), '--', instruction];
  await writeFile(join(logs, `request-${Date.now()}.json`), JSON.stringify({ demo: demo.id, args }, null, 2) + '\n');
  console.log(`Generating ${demo.id}: ${selected.join(', ')}`);
  const outcome = await new Promise((done, reject) => {
    // Pass arguments positionally through the launcher; none are evaluated as shell code.
    const child = spawn('/bin/sh', ['-c', 'exec rook "$@"', 'rook-batch', ...args], { cwd: directory, env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => done({ code, signal }));
  });
  if (outcome.code !== 0) throw new Error(`Rook exited ${outcome.code ?? outcome.signal}. Completed scenarios remain on disk; rerun to fill gaps.`);
  const now = new Set((await loadNative(nativeDirectory)).map(s => s.category));
  const missing = selected.filter(c => !now.has(c));
  if (missing.length) throw new Error(`Rook exited successfully but did not write ${missing.join(', ')}. Rerun to fill only missing categories.`);
}
const final = new Set((await loadNative(nativeDirectory)).map(s => s.category));
const missing = categories.filter(c => !final.has(c));
if (missing.length) throw new Error(`Still missing: ${missing.join(', ')}`);
console.log(`${demo.id}: all ${categories.length} requested native categories exist. These are generated scenarios, not execution verdicts.`);
