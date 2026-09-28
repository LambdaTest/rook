import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';
import { root, loadDemoEnv, validateDemoConfig } from '../shared/config.mjs';
import { startServer } from '../shared/server.mjs';
import { assessSelectedScenarios } from './sample-runs.mjs';

const segment = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const readYaml = async file => yaml.load(await readFile(file, 'utf8'));

export async function nativeWorkspace(directory) {
  const base = join(directory, '.testmuai/rook');
  const { active_project_id: projectId } = JSON.parse(await readFile(join(base, 'settings.json')));
  if (!segment.test(projectId)) throw new Error('Invalid native project ID');
  const project = join(base, 'projects', projectId);
  const agentId = (await readFile(join(project, 'active'), 'utf8')).trim();
  if (!segment.test(agentId)) throw new Error('Invalid native agent ID');
  return { base, projectId, project, agentId, agent: join(project, 'agents', agentId) };
}

export async function copyNativeWorkspace(source, destination, overrideProject) {
  if (overrideProject !== undefined && !segment.test(overrideProject)) throw new Error('Invalid project override');
  await mkdir(destination, { recursive: true });
  if ((await readdir(destination)).length) throw new Error('CI workspace destination must be empty');
  const original = await nativeWorkspace(source);
  const projectId = overrideProject ?? original.projectId;
  const base = join(destination, '.testmuai/rook');
  const project = join(base, 'projects', projectId);
  const agent = join(project, 'agents', original.agentId);
  await mkdir(agent, { recursive: true });
  for (const file of ['PRD.md', 'connection.md', 'scenarios.json', 'agents-overview.md']) await cp(join(source, file), join(destination, file));
  await cp(join(original.base, '.gitignore'), join(base, '.gitignore'));
  await writeFile(join(base, 'settings.json'), JSON.stringify({ version: 1, active_project_id: projectId }, null, 2) + '\n');
  const metadata = overrideProject ? { version: 1, name: `CI project ${projectId}`, selected_at: new Date().toISOString() } : await readYaml(join(original.project, 'project.yaml'));
  await writeFile(join(project, 'project.yaml'), yaml.dump(metadata));
  await writeFile(join(project, 'active'), original.agentId + '\n');
  // Copy inputs by name. Never inherit runs, server pins, jobs or credentials.
  for (const entry of ['agent.yaml', 'features', 'scenarios', 'profiles', 'scripts']) await cp(join(original.agent, entry), join(agent, entry), { recursive: true });
  return nativeWorkspace(destination);
}

export function assessNativeRun(document, verdicts, requiredIds, cliExitCode) {
  const problems = [];
  if (cliExitCode !== 0) problems.push(`Rook exited with status ${cliExitCode}`);
  if (document?.ok !== true || document.halted !== false || document.discarded) problems.push('Rook did not complete the requested run');
  if (!segment.test(document?.run_id ?? '') || !document?.report || document.report.run_id !== document.run_id) problems.push('Native run identity or report is missing');
  if (problems.length) return { allowed: false, problems };
  const selected = assessSelectedScenarios(document.report, verdicts, requiredIds);
  return { allowed: selected.allowed, problems: selected.problems };
}

async function executeRook(command, args, { cwd, env, output, signal }) {
  const out = createWriteStream(join(output, 'rook-result.json'));
  const err = createWriteStream(join(output, 'rook-stderr.log'));
  const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let launchError;
  child.once('error', error => { launchError = error; });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  let killTimer;
  const terminate = signal => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('error', () => child.kill(signal));
    } else {
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') child.kill(signal); }
    }
  };
  const stop = () => {
    terminate('SIGTERM');
    killTimer = setTimeout(() => terminate('SIGKILL'), 5000);
    killTimer.unref();
  };
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  const [code, killedBy] = await new Promise(done => child.once('close', (...values) => done(values)));
  signal.removeEventListener('abort', stop);
  // A descendant with separate output can outlive the parent's close event.
  if (signal.aborted) terminate('SIGKILL');
  clearTimeout(killTimer);
  await Promise.all([finished(out), finished(err)]);
  if (launchError) throw new Error(`Cannot launch Rook (${launchError.code}); set ROOK_BIN to the executable`);
  return { code: code ?? (killedBy === 'SIGTERM' ? 143 : 1), signal: killedBy };
}

export async function runNativeCI(selector, options = {}) {
  const projectId = options.project ?? process.env.ROOK_SAMPLE_PROJECT_ID;
  if (!projectId || projectId === 'sample-project') throw new Error('Choose your Rook project with --project PROJECT_ID or ROOK_SAMPLE_PROJECT_ID');
  if (!segment.test(projectId)) throw new Error('Invalid project override');
  const requiredIds = (options.only ?? 'SC-101').split(',');
  if (!requiredIds.length || new Set(requiredIds).size !== requiredIds.length || requiredIds.some(id => !/^SC-\d+$/.test(id))) throw new Error('Use distinct scenario IDs, e.g. --only SC-101,SC-104');
  const profile = options.profile ?? 'demo-normal';
  if (!segment.test(profile)) throw new Error('Invalid profile name');
  const engine = options.engine ?? process.env.DEMO_ENGINE ?? 'fixture';
  const variant = options.variant ?? process.env.DEMO_VARIANT ?? 'hardened';
  // Only the application process receives the model provider configuration.
  process.env.DEMO_ENGINE = engine;
  process.env.DEMO_VARIANT = variant;
  const config = await loadDemoEnv(selector);
  validateDemoConfig(config);
  const parent = join(root, 'artifacts/local/rook-ci', config.demo.id);
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, 'run-'));
  const workspace = join(output, 'workspace');
  const native = await copyNativeWorkspace(join(root, 'demos', config.demo.id), workspace, projectId);
  await access(join(native.agent, 'profiles', `${profile}.yaml`));
  for (const id of requiredIds) await access(join(native.agent, 'scenarios', `${id}.yaml`));
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? 900000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Invalid CI timeout');
  const timer = setTimeout(() => controller.abort(), timeout);
  const interrupt = () => controller.abort();
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  let app;
  let cliExitCode = 1;
  let document = null;
  let assessment = { allowed: false, problems: [] };
  try {
    app = await startServer({ demoId: config.demo.id, engine, port: 0, stateDir: join(output, 'target-state') });
    const env = { ...process.env, CI: 'true', DEMO_BASE_URL: app.url, DEMO_ENGINE: engine, DEMO_VARIANT: variant };
    for (const key of ['MODEL_API_KEY', 'MODEL_BASE_URL', 'MODEL_NAME', 'ROOK_DEMO_SYNC_PROVENANCE']) delete env[key];
    const args = ['run', '--test', '--yes', '--json', '--only', requiredIds.join(','), '--profile', profile, '--concurrency', '1'];
    const result = await executeRook(process.env.ROOK_BIN ?? 'rook', args, { cwd: workspace, env, output, signal: controller.signal });
    cliExitCode = result.code;
    document = JSON.parse(await readFile(join(output, 'rook-result.json'), 'utf8'));
    const verdicts = [];
    if (segment.test(document.run_id ?? '')) {
      const run = join(native.agent, 'runs', document.run_id);
      const saved = await readYaml(join(run, 'report.yaml'));
      if (!isDeepStrictEqual(saved, document.report)) throw new Error('CLI report differs from saved native report');
      for (const id of requiredIds) verdicts.push(await readYaml(join(run, 'scenarios', id, 'verdict.yaml')));
    }
    assessment = assessNativeRun(document, verdicts, requiredIds, cliExitCode);
    if (controller.signal.aborted) assessment = { allowed: false, problems: ['CI invocation was cancelled or timed out', ...assessment.problems] };
  } catch (error) {
    assessment = { allowed: false, problems: [...(controller.signal.aborted ? ['CI invocation was cancelled or timed out'] : []), error.message] };
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGTERM', interrupt);
    process.removeListener('SIGINT', interrupt);
    if (app) {
      app.server.closeAllConnections();
      await new Promise(done => app.server.close(done));
    }
  }
  const summary = { kind: 'fresh-native-rook-run', demo: config.demo.id, engine, variant, profile, selectedScenarios: requiredIds, projectId: native.projectId, runId: document?.run_id ?? null, cliExitCode, ...assessment, workspace, output };
  await writeFile(join(output, 'ci-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: Object.fromEntries(['only', 'profile', 'engine', 'variant', 'project'].map(name => [name, { type: 'string' }])) });
  if (positionals.length !== 1) throw new Error('Usage: npm run rook:ci -- DEMO_NAME [--only SC-101] [--engine model|fixture] [--project PROJECT_ID]');
  const summary = await runNativeCI(positionals[0], values);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.allowed ? 0 : (summary.cliExitCode || 1);
}
