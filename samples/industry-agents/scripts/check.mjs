import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { root } from '../shared/server.mjs';
import { domains } from '../shared/registry.mjs';
import { parseEnv } from 'node:util';
const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
assert.equal(catalog.demos.length, 8);
const categories = Object.values(catalog.taxonomy).flat();
assert.equal(categories.length, 18);
for (const demo of catalog.demos) {
  const directory = join(root, 'demos', demo.id);
  for (const file of ['README.md','PRD.md','connection.md','demo.json','scenarios.json','agents-overview.md','runtime-setup.md','.env.example','package.json']) await readFile(join(directory,file));
  const env = parseEnv(await readFile(join(directory, '.env.example'), 'utf8'));
  assert.deepEqual(Object.keys(env).sort(), ['DEMO_BASE_URL', 'MODEL_API_KEY', 'MODEL_BASE_URL', 'MODEL_NAME']);
  assert.equal(env.DEMO_BASE_URL, `http://127.0.0.1:${demo.port}`);
  assert.equal(env.MODEL_BASE_URL, 'https://api.openai.com/v1');
  assert.equal(env.MODEL_NAME, 'gpt-4.1-mini');
  assert.equal(env.MODEL_API_KEY, '');
  const overview = await readFile(join(directory, 'agents-overview.md'), 'utf8');
  assert.ok(overview.includes('```mermaid\nflowchart'), `${demo.id}: missing flow diagram`);
  assert.ok(overview.includes('High-level functions'), `${demo.id}: missing function inventory`);
  for (const tool of domains[demo.domain].tools) assert.ok(overview.includes(`\`${tool.name}\``), `${demo.id}: undocumented tool ${tool.name}`);
  const scenarios = JSON.parse(await readFile(join(directory,'scenarios.json'),'utf8'));
  assert.deepEqual(scenarios.map(s=>s.category).sort(), [...categories].sort());
  assert.equal(new Set(scenarios.map(s=>s.id)).size, scenarios.length);
  for (const scenario of scenarios) {
    assert.ok(catalog.taxonomy[scenario.class].includes(scenario.category));
    assert.ok(scenario.goals.length && scenario.assertions.length && scenario.impact);
  }
  if (demo.style === 'no-code') assert.ok(!(await readdir(directory)).some(f=>/\.(mjs|js|ts|py)$/.test(f)));
}
console.log('8 demo directories validated; every demo has all 18 categories and an agents-overview.md with flow diagrams and tool functions; QE directories contain no application source.');
