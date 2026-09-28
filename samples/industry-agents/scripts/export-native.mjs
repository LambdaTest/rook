import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { root } from '../shared/server.mjs';
import { findDemo } from '../shared/config.mjs';
import { assessNativeCoverage, loadNative } from '../shared/native-coverage.mjs';

const [selector, nativeAgentPath, build] = process.argv.slice(2);
if (!selector || !nativeAgentPath || !build) throw new Error('Usage: node scripts/export-native.mjs banking-agent-code /actual/rook/agent/directory installed-build');
const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const demo = await findDemo(selector);
const source = resolve(nativeAgentPath), target = join(root, 'demos', demo.id, 'rook');
const scenarios = await loadNative(source), coverage = assessNativeCoverage(scenarios, catalog.taxonomy);
if (!coverage.complete) throw new Error(`Refusing an incomplete export: ${coverage.errors.join('; ')}`);
const agent = yaml.load(await readFile(join(source, 'agent.yaml'), 'utf8'));
const featureFiles = (await readdir(join(source, 'features'))).filter(f => f.endsWith('.yaml'));
const featureIds = new Set(await Promise.all(featureFiles.map(async f => yaml.load(await readFile(join(source, 'features', f), 'utf8')).local_id)));
for (const s of scenarios) if (!featureIds.has(s.feature_id)) throw new Error(`Unknown feature ${s.feature_id} in ${s.local_id}`);
await mkdir(target, { recursive: true });
if ((await readdir(target)).length) throw new Error('Export destination must be empty; preserve previous generation evidence');
const files = ['agent.yaml', ...featureFiles.map(f => `features/${f}`), ...(await readdir(join(source, 'scenarios'))).filter(f => f.endsWith('.yaml')).map(f => `scenarios/${f}`)];
const hashes = {};
for (const file of files) {
  await mkdir(resolve(target, file, '..'), { recursive: true });
  await copyFile(join(source, file), join(target, file));
  hashes[file] = createHash('sha256').update(await readFile(join(target, file))).digest('hex');
}
await writeFile(join(target, 'provenance.json'), JSON.stringify({ kind: 'native-rook-generation-snapshot', demo: demo.id,
  rookBuild: build, exportedAt: new Date().toISOString(), agentId: agent.local_id,
  exploration: demo.style === 'code' ? 'PRD plus domain implementation' : 'PRD and connection only',
  scenarioOrigins: [...new Set(scenarios.map(s => s.origin))], coverage, sha256: hashes,
  note: 'Generated scenarios and discovered feature pins, not fabricated run results. Review blocked scenarios and fault profiles before execution.' }, null, 2) + '\n');
console.log(`${demo.id}: exported ${scenarios.length} native Rook scenarios and ${featureFiles.length} discovered features`);
