import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { assessNativeCoverage } from '../shared/native-coverage.mjs';
import { rookContentHash } from '../shared/rook-hash.mjs';

const taxonomy = { functional: ['happy_path'], non_functional: ['performance'], adversarial: ['prompt_injection'] };
const scenario = (id, className, category) => ({ local_id: id, class: className, category,
  goal: 'Read the service policy.', acceptance_criteria: [{ statement: 'No unauthorized business effect.' }],
  feature_id: 'F-001', feature_revision_id: `sha256:${'0'.repeat(64)}`, executable: true,
  redteam: className === 'adversarial' ? { attack_category: category } : null });

test('native coverage cannot be satisfied by duplicate categories or a wrong class', () => {
  const rows = [scenario('SC-001','functional','happy_path'),scenario('SC-002','functional','happy_path'),scenario('SC-003','functional','performance')];
  const result = assessNativeCoverage(rows, taxonomy);
  assert.equal(result.complete, false);
  assert.ok(result.errors.includes('Missing non_functional/performance'));
  assert.ok(result.errors.includes('Missing adversarial/prompt_injection'));
});

test('generation completeness and runnable coverage remain separate', () => {
  const rows = Object.entries(taxonomy).map(([c, [category]], n) => scenario(`SC-${n}`, c, category));
  rows[2].executable = false; rows[2].skip_reason = 'Evidence missing';
  const result = assessNativeCoverage(rows, taxonomy);
  assert.equal(result.complete, true);
  assert.equal(result.runnableCategories, 2);
  assert.equal(result.cells[2].blocked[0].reason, 'Evidence missing');
});

test('native feature hashing matches an actual Rook-generated reference', async () => {
  const base = new URL('../demos/01-banking-code/rook/', import.meta.url);
  const draft = yaml.load(await readFile(new URL('generated-drafts/SC-004.yaml', base), 'utf8'));
  const feature = yaml.load(await readFile(new URL(`features/${draft.feature_id}.yaml`, base), 'utf8'));
  assert.equal(rookContentHash(feature), draft.feature_revision_id);
  assert.equal(rookContentHash({ a: 1 }), rookContentHash({ a: 1, b: null, c: [] }));
  assert.notEqual(rookContentHash({ a: 0 }), rookContentHash({}));
});
