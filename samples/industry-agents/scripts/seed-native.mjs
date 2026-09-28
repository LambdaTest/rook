import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { root } from '../shared/server.mjs';
import { demoName, loadDemoEnv, selectedRookProject } from '../shared/config.mjs';

const [selector = 'banking-agent-code', workspace, projectArg] = process.argv.slice(2);
const { demo } = await loadDemoEnv(selector);
for (const key of ['MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY']) delete process.env[key];
const projectId = projectArg || process.env.ROOK_PROJECT_ID || await selectedRookProject(demo);
if (!projectId || !/^[A-Za-z0-9-]+$/.test(projectId)) throw new Error('Select a Rook project first: run rook project create "Rook Customer Demos" or rook project use <id> from the demo folder or collection root (samples/industry-agents), then retry. No project ID is needed in .env.');
const directory = workspace ? resolve(workspace) : resolve(root, process.env.ROOK_DEMO_WORKSPACE || join('artifacts', 'local', 'rook-reviewed', demo.id));
const pack = join(root, 'demos', demo.id, 'rook');
const provenance = JSON.parse(await readFile(join(pack, 'provenance.json'), 'utf8'));
const prepared = spawnSync(process.execPath, [join(root, 'scripts', 'prepare-rook.mjs'), selector, directory], { stdio: 'inherit' });
if (prepared.status !== 0) throw new Error('Workspace preparation failed; existing state was preserved');
const project = spawnSync('rook', ['project', 'use', projectId], { cwd: directory, stdio: 'inherit' });
if (project.status !== 0) throw new Error('Rook project selection failed');
const projectPath = join(directory, '.testmuai', 'rook', 'projects', projectId);
const target = join(projectPath, 'agents', provenance.agentId);
await mkdir(target, { recursive: true });
await copyFile(join(pack, 'agent.yaml'), join(target, 'agent.yaml'));
for (const dir of ['features', 'scenarios']) {
  await mkdir(join(target, dir), { recursive: true });
  for (const file of await readdir(join(pack, dir))) await copyFile(join(pack, dir, file), join(target, dir, file));
}
await mkdir(join(target, 'scripts'));
await mkdir(join(target, 'profiles'));
await copyFile(join(root, 'shared', 'rook-hook.mjs'), join(target, 'scripts', 'demo-http.mjs'));
const profiles = [['demo-normal', 'none'], ['demo-dependency-error', 'dependency_error'], ['demo-slow-tool', 'slow_tool'], ['demo-poisoned-context', 'poisoned_context'], ['demo-mcp', 'none']];
for (const [id, fault] of profiles) {
  const script = id === 'demo-mcp' ? join(root, 'shared', 'rook-mcp-hook.mjs') : 'scripts/demo-http.mjs';
  const profile = { id, name: id, hooks: Object.fromEntries(['prepare','open','execute','close','collect'].map(phase => [phase, script])),
    env: ['DEMO_BASE_URL','DEMO_VARIANT','DEMO_ENGINE', ...(process.env.DEMO_API_TOKEN ? ['DEMO_API_TOKEN'] : [])].map(variable => ({ variable })),
    capabilities: { multi_turn: true, calls: true, usage: false }, hook_env: { DEMO_FAULT: fault }, concurrency: 1 };
  await writeFile(join(target, 'profiles', `${id}.yaml`), yaml.dump(profile, { lineWidth: 100 }));
}
await writeFile(join(projectPath, 'active'), provenance.agentId + '\n');
await writeFile(join(target, 'profiles', 'active'), 'demo-normal\n');
console.log(`Your ${demoName(demo)} workspace is ready with 18 scenarios.\nFrom the collection root (samples/industry-agents), run npm run rook -- ${demoName(demo)} to open interactive Rook.\nInside Rook, start with /guide or /scenarios list.`);
