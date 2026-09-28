import { access, mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { root, demoName, loadDemoEnv } from '../shared/config.mjs';

const [selector = 'banking-agent-code', ...command] = process.argv.slice(2);
const interactive = command.length === 0 || command.every(arg => arg === '--no-animation');
const { demo } = await loadDemoEnv(selector);
const workspace = resolve(root, process.env.ROOK_DEMO_WORKSPACE || join('artifacts', 'local', 'rook-reviewed', demo.id));
try { await access(join(workspace, '.testmuai', 'rook')); }
catch {
  throw new Error(`Prepare this workspace first: ${workspace}\nSelect a project with rook project create or rook project use, then run npm run rook:seed -- ${demoName(demo)} from the collection root (samples/industry-agents).\nSee docs/testing-with-rook.md for setup.`);
}
const env = { ...process.env };
// Rook connects to the agent service; only that service needs the LLM secret.
for (const key of ['MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY']) delete env[key];
// The installed Rook profile probe runs open/execute/close without a stateDir.
// Give each CLI probe or interactive terminal its own fallback scope. Rook
// supplies a scenario-specific directory for actual runs, overriding this value.
if ((interactive || (command[0] === 'profile' && command[1] === 'test')) && !env.ROOK_STATE_DIR) {
  const probes = join(workspace, '.testmuai', 'rook', 'profile-probes');
  await mkdir(probes, { recursive: true });
  env.ROOK_STATE_DIR = await mkdtemp(join(probes, 'probe-'));
}
// Positional arguments stay literal, including a planner instruction containing
// shell syntax. Rook retains its normal tool-approval prompts and authentication.
const child = spawn('/bin/sh', ['-c', 'exec rook "$@"', 'rook-demo', ...command], { cwd: workspace, env, stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
