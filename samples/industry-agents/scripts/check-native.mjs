import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { assessNativeCoverage, loadNative } from '../shared/native-coverage.mjs';
import { rookContentHash } from '../shared/rook-hash.mjs';
import { root } from '../shared/server.mjs';

const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const rows = [];
for (const demo of catalog.demos) {
  const directory = join(root, 'demos', demo.id, 'rook');
  try {
    const scenarios = await loadNative(directory);
    const coverage = assessNativeCoverage(scenarios, catalog.taxonomy);
    const provenance = JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8'));
    const spec = yaml.load(await readFile(join(directory, 'agent.yaml'), 'utf8'));
    if (!['codebase', 'docs', 'manifest_only'].includes(spec.source?.kind)) coverage.errors.push('Unsupported native agent source kind');
    for (const [file, expected] of Object.entries(provenance.sha256)) {
      const actual = createHash('sha256').update(await readFile(join(directory, file))).digest('hex');
      if (expected !== actual) coverage.errors.push(`Snapshot changed without provenance update: ${file}`);
    }
    for (const s of scenarios) {
      const feature = yaml.load(await readFile(join(directory, 'features', `${s.feature_id}.yaml`), 'utf8'));
      if (rookContentHash(feature) !== s.feature_revision_id) coverage.errors.push(`${s.local_id}: stale feature reference`);
      const fault = { integration: 'dependency_error', performance: 'slow_tool', prompt_injection: 'poisoned_context' }[s.category] ?? 'none';
      if (!s.tags?.includes(`fault-${fault}`)) coverage.errors.push(`${s.local_id}: missing fault-${fault} tag`);
      if (['performance','token_economy','reliability'].includes(s.category) && s.repeat < 3) coverage.errors.push(`${s.local_id}: repeat must be at least 3`);
      if (['state_context','reliability'].includes(s.category) && (!s.multi_turn || !s.setup_messages?.length)) coverage.errors.push(`${s.local_id}: missing prior customer turn`);
    }
    coverage.complete = coverage.errors.length === 0;
    coverage.rookGeneratedDrafts = provenance.rookGeneratedDrafts;
    coverage.curatedOrigin = provenance.curatedOrigin;
    rows.push({ demo: demo.id, ...coverage });
  } catch (error) {
    rows.push({ demo: demo.id, total: 0, complete: false, errors: [error.code === 'ENOENT' ? 'Native Rook scenario directory missing' : error.message] });
  }
}
const report = { kind: 'native-scenario-inventory', executionVerdicts: false, generatedAt: new Date().toISOString(),
  expectedDemos: 8, expectedCategoriesPerDemo: 18, complete: rows.every(r => r.complete), rows };
const output = resolve(process.argv[2] ?? join(root, 'artifacts', 'local', 'native-coverage.json'));
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
for (const row of rows) console.log(`${row.demo}: ${row.total} native scenarios; ${row.complete ? 'all 18 categories' : row.errors.join('; ')}; origin=${row.curatedOrigin ?? 'unknown'}`);
console.log(`Inventory written to ${output}. Generation coverage is distinct from Rook execution verdicts.`);
if (!report.complete) process.exitCode = 1;
