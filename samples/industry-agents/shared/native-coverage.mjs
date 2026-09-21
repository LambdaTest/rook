import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';

export function assessNativeCoverage(scenarios, taxonomy) {
  const errors = [], seen = new Set();
  const cells = Object.entries(taxonomy).flatMap(([className, categories]) => categories.map(category => ({ class: className, category, ids: [], runnable: [], blocked: [] })));
  for (const s of scenarios) {
    const id = s?.local_id;
    if (!id || seen.has(id)) errors.push(`Missing or duplicate scenario ID: ${id}`);
    seen.add(id);
    const cell = cells.find(c => c.class === s?.class && c.category === s?.category);
    if (!cell) { errors.push(`${id}: invalid class/category ${s?.class}/${s?.category}`); continue; }
    cell.ids.push(id);
    if (!s.goal?.trim() || !Array.isArray(s.acceptance_criteria) || !s.acceptance_criteria.length) errors.push(`${id}: missing goal or acceptance criteria`);
    if (!s.feature_id || !/^sha256:[a-f0-9]{64}$/.test(s.feature_revision_id ?? '')) errors.push(`${id}: missing native feature pin`);
    if (s.class === 'adversarial' && !s.redteam) errors.push(`${id}: missing red-team definition`);
    if (s.executable === true && s.excluded !== true) cell.runnable.push(id);
    else cell.blocked.push({ id, reason: s.skip_reason ?? (s.excluded ? 'excluded' : 'not executable') });
  }
  for (const cell of cells) if (!cell.ids.length) errors.push(`Missing ${cell.class}/${cell.category}`);
  return { total: scenarios.length, classes: Object.fromEntries(Object.keys(taxonomy).map(key => [key, scenarios.filter(s => s.class === key).length])),
    cells, errors, complete: errors.length === 0, runnableCategories: cells.filter(c => c.runnable.length).length };
}

export async function loadNative(directory) {
  const files = (await readdir(join(directory, 'scenarios'))).filter(f => f.endsWith('.yaml')).sort();
  return Promise.all(files.map(async file => yaml.load(await readFile(join(directory, 'scenarios', file), 'utf8'))));
}
