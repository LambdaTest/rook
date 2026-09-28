import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSelectedScenarios, checkSampleRuns } from '../scripts/sample-runs.mjs';
import { readFile } from 'node:fs/promises';

const report = { run_id: 'recorded-run', totals: { planned: 1, executed: 1, passed: 1, failed: 0, unverifiable: 0 } };
const verdict = { run_id: 'recorded-run', scenario_id: 'SC-104', status: 'Pass', criteria: [{ criterion_id: 'C1', status: 'Pass', evidence: 'The correlated effects array is empty.' }] };
test('replay processes every recorded run exactly once', async () => {
  const manifest = JSON.parse(await readFile(new URL('../artifacts/reference/sample-runs.json', import.meta.url)));
  const result = await checkSampleRuns();
  assert.equal(result.samples.length, 33);
  assert.deepEqual(result.samples.map(run => run.id).sort(), manifest.runs.map(run => run.id).sort());
  assert.equal(result.samples.reduce((count, run) => count + run.scenarios.length, 0), 50);
});
test('unknown headline verdict blocks even when criteria pass and totals agree', () => {
  const partial = { ...report, totals: { ...report.totals, passed: 0 } };
  assert.equal(assessSelectedScenarios(partial, [{ ...verdict, status: 'Partial' }], ['SC-104']).allowed, false);
});
test('selected-scenario gate requires evidence for every requested scenario', () => {
  assert.equal(assessSelectedScenarios(report, [verdict], ['SC-104']).allowed, true);
  assert.equal(assessSelectedScenarios(report, [], ['SC-104']).allowed, false);
  assert.equal(assessSelectedScenarios(report, [verdict], []).allowed, false);
  assert.equal(assessSelectedScenarios(report, [verdict, verdict], ['SC-104']).allowed, false);
  assert.equal(assessSelectedScenarios(report, [{ ...verdict, run_id: 'other-run' }], ['SC-104']).allowed, false);
});
test('a passing headline cannot hide an unverified or failed criterion', () => {
  for (const status of ['Fail', 'Unable to Verify', 'Unjudged']) {
    assert.equal(assessSelectedScenarios(report, [{ ...verdict, criteria: [{ criterion_id: 'C1', status }] }], ['SC-104']).allowed, false);
  }
  assert.equal(assessSelectedScenarios(report, [{ ...verdict, criteria: [] }], ['SC-104']).allowed, false);
  assert.equal(assessSelectedScenarios(report, [{ ...verdict, criteria: [{ criterion_id: 'C1', status: 'Pass' }] }], ['SC-104']).allowed, false);
  assert.equal(assessSelectedScenarios({ ...report, totals: { ...report.totals, executed: 0 } }, [verdict], ['SC-104']).allowed, false);
});
