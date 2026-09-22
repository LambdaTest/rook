import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm, access, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { copyNativeWorkspace, assessNativeRun, nativeWorkspace, runNativeCI } from '../scripts/rook-ci.mjs';
import { root } from '../shared/config.mjs';

test('public CI requires an explicit project before starting a target', async () => {
  const old = process.env.ROOK_SAMPLE_PROJECT_ID;
  delete process.env.ROOK_SAMPLE_PROJECT_ID;
  try {
    await assert.rejects(runNativeCI('banking-agent-code', {project: ''}), /--project.*ROOK_SAMPLE_PROJECT_ID/);
    await assert.rejects(runNativeCI('banking-agent-code', {project: 'sample-project'}), /--project.*ROOK_SAMPLE_PROJECT_ID/);
  } finally {
    if (old === undefined) delete process.env.ROOK_SAMPLE_PROJECT_ID;
    else process.env.ROOK_SAMPLE_PROJECT_ID = old;
  }
});

test('all eight native workspaces contain the original 18 scenarios and portable hooks', async () => {
  const catalog = JSON.parse(await readFile(join(root, 'catalog.json')));
  for (const demo of catalog.demos) {
    const native = await nativeWorkspace(join(root, 'demos', demo.id));
    assert.equal((await readdir(join(native.agent, 'scenarios'))).length, 18);
    for (const file of await readdir(join(native.agent, 'scenarios'))) {
      assert.deepEqual(await readFile(join(native.agent, 'scenarios', file)), await readFile(join(root, 'demos', demo.id, 'rook/scenarios', file)));
    }
    const profile = yaml.load(await readFile(join(native.agent, 'profiles/demo-normal.yaml'), 'utf8'));
    for (const hook of Object.values(profile.hooks)) await access(join(native.agent, hook));
    assert.deepEqual(await readFile(join(native.agent, 'scripts/demo-http.mjs')), await readFile(join(root, 'shared/rook-hook.mjs')));
  }
});

test('each edition contains a complete authentic native smoke result with unchanged evidence', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'native-ci-runs.json')));
  const catalog = JSON.parse(await readFile(join(root, 'catalog.json')));
  assert.deepEqual(manifest.runs.map(run => run.demo).sort(), catalog.demos.map(demo => demo.id).sort());
  for (const run of manifest.runs) {
    const native = await nativeWorkspace(join(root, 'demos', run.demo));
    assert.equal(join(root, run.directory), join(native.agent, 'runs', run.runId));
    for (const [file, hash] of Object.entries(run.files)) {
      assert.equal(createHash('sha256').update(await readFile(join(root, run.directory, file))).digest('hex'), hash, `${run.demo}/${file}`);
    }
    const report = yaml.load(await readFile(join(root, run.directory, 'report.yaml'), 'utf8'));
    const verdict = yaml.load(await readFile(join(root, run.directory, 'scenarios/SC-101/verdict.yaml'), 'utf8'));
    assert.equal(assessNativeRun({ok:true,halted:false,run_id:run.runId,report}, [verdict], ['SC-101'], 0).allowed, true);
  }
});

test('workspace copies are isolated, portable and consistently retargeted', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'native CI with spaces '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(root, 'demos/01-banking-code');
  const original = await readFile(join(source, '.testmuai/rook/settings.json'));
  const destinations = [join(dir, 'one'), join(dir, 'two')];
  const copies = await Promise.all(destinations.map(destination => copyNativeWorkspace(source, destination, 'CI-PROJECT')));
  for (const copy of copies) {
    assert.equal(copy.projectId, 'CI-PROJECT');
    assert.ok(copy.agent.startsWith(dir));
    await assert.rejects(access(join(copy.agent, 'state.json')), { code: 'ENOENT' });
    await assert.rejects(access(join(copy.agent, 'runs')), { code: 'ENOENT' });
    assert.match(await readFile(join(copy.project, 'project.yaml'), 'utf8'), /CI-PROJECT/);
  }
  await writeFile(join(copies[0].agent, 'agent.yaml'), 'changed');
  assert.notEqual(await readFile(join(copies[1].agent, 'agent.yaml'), 'utf8'), 'changed');
  assert.deepEqual(await readFile(join(source, '.testmuai/rook/settings.json')), original);
  await assert.rejects(copyNativeWorkspace(source, destinations[0]), /empty/);
  await assert.rejects(copyNativeWorkspace(source, join(dir, 'bad'), '../escape'), /project/);
});

test('native CI rejects zero-exit failures, incomplete runs and missing evidence', () => {
  const report = { run_id: 'fresh-run', totals: { planned: 1, executed: 1, passed: 1, failed: 0, unverifiable: 0 } };
  const verdict = { run_id: 'fresh-run', scenario_id: 'SC-101', status: 'Pass', criteria: [{ criterion_id: 'C1', status: 'Pass', evidence: 'Observed receipt.' }] };
  const result = { ok: true, run_id: 'fresh-run', halted: false, report };
  const assess = (doc = result, verdicts = [verdict], code = 0) => assessNativeRun(doc, verdicts, ['SC-101'], code);
  assert.equal(assess().allowed, true);
  for (const doc of [{}, { ...result, ok: false }, { ...result, halted: true }, { ...result, discarded: 'declined' }, { ...result, run_id: '../escape' }, { ...result, report: undefined }]) assert.equal(assess(doc).allowed, false);
  for (const status of ['Fail', 'Unable to Verify', 'Unknown']) assert.equal(assess(result, [{ ...verdict, status }]).allowed, false);
  assert.equal(assess(result, []).allowed, false);
  assert.equal(assess(result, [verdict], 7).allowed, false);
  assert.equal(assess({ ...result, report: { ...report, totals: { ...report.totals, executed: 0 } } }).allowed, false);
});

test('runner executes a subprocess, gates its evidence and closes its target on failure or timeout', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'native CLI stub '));
  const previous = { ...process.env };
  const outputs = [];
  const assertStopped = async pid => {
    for (let attempt = 0; attempt < 20; attempt++) {
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') return; throw error; }
      // A container's PID 1 may leave an already-dead orphan unreaped.
      if (process.platform === 'linux') {
        try { if (/\) Z /.test(await readFile(`/proc/${pid}/stat`, 'utf8'))) return; }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail(`Process ${pid} survived cancellation`);
  };
  t.after(async () => {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    for (const output of outputs) {
      try {
        const {pid} = JSON.parse(await readFile(join(output, 'descendant.json')));
        process.kill(pid, 'SIGKILL');
      } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
    }
    await Promise.all([dir, ...outputs].map(path => rm(path, { recursive: true, force: true })));
  });
  const binary = join(dir, 'rook.cjs');
  // A unit-test subprocess, never published as an actual Rook result.
  await writeFile(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const output = path.dirname(process.cwd());
fs.writeFileSync(path.join(output, 'invocation.json'), JSON.stringify({ args: process.argv.slice(2), ci: process.env.CI, url: process.env.DEMO_BASE_URL, engine: process.env.DEMO_ENGINE, modelKeyPresent: Boolean(process.env.MODEL_API_KEY), pid: process.pid }));
if (['hang', 'silent-descendant'].includes(process.env.ROOK_UNIT_MODE)) {
  const silent = process.env.ROOK_UNIT_MODE === 'silent-descendant';
  const descendant = require('node:child_process').spawn(process.execPath, ['-e', silent ? 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)' : 'setTimeout(() => {}, 8000)'], {stdio:silent ? 'ignore' : 'inherit'});
  fs.writeFileSync(path.join(output, 'descendant.json'), JSON.stringify({pid:descendant.pid}));
  if (!silent) process.on('SIGTERM', () => descendant.once('exit', () => process.exit(0)));
  setInterval(() => {}, 1000);
}
else if (process.env.ROOK_UNIT_MODE === 'exit') { console.log('{}'); process.exitCode = 7; }
else {
  const base = path.join(process.cwd(), '.testmuai/rook');
  const settings = JSON.parse(fs.readFileSync(path.join(base, 'settings.json')));
  const project = path.join(base, 'projects', settings.active_project_id);
  const agent = fs.readFileSync(path.join(project, 'active'), 'utf8').trim();
  const run = path.join(project, 'agents', agent, 'runs', 'unit-run');
  fs.mkdirSync(path.join(run, 'scenarios/SC-101'), {recursive:true});
  const totals = {planned:1,executed:1,passed:1,failed:0,unverifiable:0};
  fs.writeFileSync(path.join(run, 'report.yaml'), JSON.stringify({totals,run_id:'unit-run'}));
  fs.writeFileSync(path.join(run, 'scenarios/SC-101/verdict.yaml'), JSON.stringify({run_id:'unit-run',scenario_id:'SC-101',status:'Pass',criteria:[{criterion_id:'C1',status:'Pass',evidence:'Unit fixture receipt'}]}));
  console.log(JSON.stringify({ok:true,halted:false,run_id:'unit-run',report:{run_id:'unit-run',totals}}));
}
`);
  await chmod(binary, 0o755);
  process.env.ROOK_BIN = binary;
  process.env.MODEL_API_KEY = 'unit-test-key-must-not-reach-rook';
  for (const mode of ['pass', 'exit', 'hang', 'silent-descendant', 'missing']) {
    process.env.ROOK_UNIT_MODE = mode;
    process.env.ROOK_BIN = mode === 'missing' ? join(dir, 'absent') : binary;
    const started = Date.now();
    const summary = await runNativeCI('banking-agent-code', { project: 'UNIT-PROJECT', engine: 'fixture', timeoutMs: ['hang', 'silent-descendant'].includes(mode) ? 1000 : 10000 });
    outputs.push(summary.output);
    assert.equal(summary.allowed, mode === 'pass', JSON.stringify(summary.problems));
    assert.deepEqual(JSON.parse(await readFile(join(summary.output, 'ci-summary.json'))), summary);
    if (mode === 'missing') { assert.match(summary.problems.join(' '), /Cannot launch Rook/); continue; }
    const invocation = JSON.parse(await readFile(join(summary.output, 'invocation.json')));
    assert.equal(invocation.ci, 'true');
    assert.equal(invocation.engine, 'fixture');
    assert.equal(invocation.modelKeyPresent, false);
    assert.deepEqual(invocation.args, ['run', '--test', '--yes', '--json', '--only', 'SC-101', '--profile', 'demo-normal', '--concurrency', '1']);
    await assert.rejects(fetch(invocation.url));
    assert.throws(() => process.kill(invocation.pid, 0), { code: 'ESRCH' });
    if (mode === 'exit') assert.equal(summary.cliExitCode, 7);
    if (['hang', 'silent-descendant'].includes(mode)) {
      assert.ok(Date.now() - started < 6500, 'timeout must terminate descendants within its grace period');
      assert.match(summary.problems.join(' '), /cancelled or timed out/);
      const descendant = JSON.parse(await readFile(join(summary.output, 'descendant.json')));
      await assertStopped(descendant.pid);
    }
  }
});
