import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import assert from 'node:assert/strict';
import { checkImportedArtifacts } from './verify-import.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const statuses = ['Pass', 'Fail', 'Unable to Verify'];

export function assessSelectedScenarios(report, verdicts, requiredIds) {
  const problems = [];
  if (!requiredIds.length || new Set(requiredIds).size !== requiredIds.length) problems.push('The required scenario list is empty or contains duplicates.');
  if (verdicts.length !== requiredIds.length || new Set(verdicts.map(v => v.scenario_id)).size !== verdicts.length) problems.push('A selected scenario is missing, duplicated or unexpected.');
  for (const id of requiredIds) {
    const verdict = verdicts.find(v => v.scenario_id === id);
    if (!verdict) { problems.push(`${id}: verdict missing`); continue; }
    if (verdict.run_id !== report.run_id) problems.push(`${id}: verdict belongs to a different run`);
    if (!statuses.includes(verdict.status)) problems.push(`${id}: unknown verdict`);
    if (verdict.status !== 'Pass') problems.push(`${id}: ${verdict.status}`);
    if (!verdict.criteria?.length) problems.push(`${id}: criteria missing`);
    for (const criterion of verdict.criteria ?? []) {
      if (criterion.status !== 'Pass') problems.push(`${id}/${criterion.criterion_id}: ${criterion.status}`);
      if (typeof criterion.evidence !== 'string' || !criterion.evidence.trim()) problems.push(`${id}/${criterion.criterion_id}: supporting evidence missing`);
    }
  }
  if (report.totals?.planned !== requiredIds.length || report.totals?.executed !== requiredIds.length) problems.push('The selected run did not execute every required scenario.');
  for (const [status, key] of [['Pass', 'passed'], ['Fail', 'failed'], ['Unable to Verify', 'unverifiable']]) {
    if (report.totals?.[key] !== verdicts.filter(v => v.status === status).length) problems.push(`Report total ${key} does not match the verdicts.`);
  }
  return { allowed: problems.length === 0, problems };
}

export async function checkSampleRuns({ output = null, selected = null } = {}) {
  await checkImportedArtifacts();
  const manifest = JSON.parse(await readFile(join(root, 'artifacts/reference/sample-runs.json'), 'utf8'));
  if (manifest.kind !== 'recorded-rook-runs' || !manifest.runs?.length) throw new Error('No recorded Rook runs found.');
  const summaries = [];
  for (const run of manifest.runs.filter(r => !selected || r.id === selected)) {
    for (const [file, hash] of Object.entries(run.files)) {
      const path = resolve(root, run.directory, file);
      if (relative(root, path).startsWith('..')) throw new Error('Sample path escapes repository.');
      if (digest(await readFile(path)) !== hash) throw new Error(`${run.id}/${file}: recorded content changed; review provenance before updating its hash.`);
    }
    const read = async file => yaml.load(await readFile(join(root, run.directory, file), 'utf8'));
    const report = await read('report.yaml');
    if (report.run_id !== run.runId) throw new Error(`${run.id}: mismatched run identity`);
    const verdicts = await Promise.all(run.scenarios.map(id => read(`scenarios/${id}/verdict.yaml`)));
    const assessment = assessSelectedScenarios(report, verdicts, run.scenarios);
    const actualDecision = assessment.allowed ? 'allow' : 'block';
    if (actualDecision !== run.expectedDecision) throw new Error(`${run.id}: expected ${run.expectedDecision}, observed ${actualDecision}`);
    summaries.push({ id: run.id, recordedAt: report.generated, runId: report.run_id, scenarios: run.scenarios, decision: actualDecision, totals: report.totals, reasons: assessment.problems });
  }
  if (!summaries.length) throw new Error(`Unknown recorded sample: ${selected}`);
  const expectedIds = manifest.runs.filter(run => !selected || run.id === selected).map(run => run.id).sort();
  assert.deepEqual(summaries.map(run => run.id).sort(), expectedIds, 'Replay must process every selected manifest run exactly once.');
  const result = { kind: 'recorded-evidence-replay', checkedAt: new Date().toISOString(), scope: 'Selected recorded scenarios only; no model or new Rook run is executed.', samples: summaries };
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
    const rows = summaries.map(s => `| ${s.id} | ${s.totals.passed} | ${s.totals.failed} | ${s.totals.unverifiable} | ${s.decision.toUpperCase()} |`);
    await writeFile(join(output, 'summary.md'), ['# Recorded Rook evidence', '', result.scope, '', '| Sample | Pass | Fail | Unable to Verify | Selected-scenario gate |', '|---|---:|---:|---:|---|', ...rows, '', 'ALLOW applies only to every selected scenario and criterion in that recorded run. Filtered, skipped and unrunnable cases outside this selection remain outside the decision. It is not an overall release approval.', '', 'A green workflow means the evidence checks and expected gate decisions matched. Recorded failures and missing evidence are retained.', ''].join('\n'));
  }
  return result;
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'check', selected] = process.argv.slice(2);
  if (!['check', 'gate'].includes(command) || (command === 'gate' && !selected)) throw new Error('Use: npm run samples:check, or node scripts/sample-runs.mjs gate SAMPLE_ID');
  const result = await checkSampleRuns({ output: command === 'check' ? join(root, 'artifacts/local/sample-replay') : null, selected });
  for (const sample of result.samples) console.log(`${sample.id}: ${sample.decision.toUpperCase()} (${sample.totals.passed} Pass, ${sample.totals.failed} Fail, ${sample.totals.unverifiable} Unable to Verify)`);
  console.log(result.scope);
  if (command === 'gate' && result.samples.some(s => s.decision === 'block')) process.exitCode = 1;
}
