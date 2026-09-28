import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { root, demoName, findDemo, setupDemoEnv, loadDemoEnv, validateDemoConfig, selectedRookProject } from '../shared/config.mjs';
import { startServer } from '../shared/server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DEMO_|MODEL_|ROOK_)/.test(key)) delete env[key];
  return { ...env, ...extra };
}
async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'rook-env-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function command(script, args, env, input = '', cwd = root) {
  const child = spawn(process.execPath, [join(root, script), ...args], { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', chunk => out += chunk);
  child.stderr.on('data', chunk => err += chunk);
  child.stdin.end(input);
  const [code] = await once(child, 'close');
  return { code, out, err };
}

test('named selectors choose the intended audience and preserve numeric and directory selectors', async () => {
  const expected = {
    'banking-agent-code': '01-banking-code', 'banking-agent': '02-banking-no-code',
    'healthcare-agent-code': '03-healthcare-code', 'healthcare-agent': '04-healthcare-no-code',
    'insurance-agent-code': '05-insurance-code', 'insurance-agent': '06-insurance-no-code',
    'customer-support-agent-code': '07-customer-support-code', 'customer-support-agent': '08-customer-support-no-code',
  };
  for (const [name, id] of Object.entries(expected)) {
    for (const selector of [name, id, id.slice(0, 2), String(Number(id.slice(0, 2)))]) {
      assert.equal((await findDemo(selector)).id, id);
    }
  }
  assert.equal((await findDemo()).id, '01-banking-code');
  for (const selector of ['insurance', 'insurance-agent-typo', '09', '../insurance-agent']) {
    await assert.rejects(findDemo(selector), /Choose a demo name:.*insurance-agent-code/);
  }
});

test('named workspace preparation preserves the Developer and QE source boundary', async t => {
  const directory = await temporary(t);
  const code = join(directory, 'developer'), qe = join(directory, 'qe'), docsOnly = join(directory, 'docs-only');
  for (const [script, name, target] of [['prepare-rook', 'insurance-agent-code', code], ['prepare-rook', 'insurance-agent', qe], ['prepare-qe', 'insurance-agent', docsOnly]]) {
    const result = await command(`scripts/${script}.mjs`, [name, target], childEnv());
    assert.equal(result.code, 0, result.err);
    assert.match(await readFile(join(target, 'PRD.md'), 'utf8'), /Atlas Cover/);
  }
  assert.ok((await stat(join(code, 'source', 'demos', '05-insurance-code', 'agent.mjs'))).isFile());
  for (const path of [qe, docsOnly]) await assert.rejects(stat(join(path, 'source')), { code: 'ENOENT' });
  const rejected = await command('scripts/prepare-qe.mjs', ['insurance-agent-code', join(directory, 'wrong-edition')], childEnv());
  assert.equal(rejected.code, 1);
  assert.match(rejected.err, /Choose a QE demo name/);
});

test('all eight .env files are isolated, setup preserves edits, and shell values win without expansion', async t => {
  const directory = await temporary(t);
  await copyFile(join(root, 'catalog.json'), join(directory, 'catalog.json'));
  await writeFile(join(directory, '.env'), 'MODEL_API_KEY=root-secret-must-not-load\n');
  for (const demo of catalog.demos) {
    const folder = join(directory, 'demos', demo.id);
    await mkdir(folder, { recursive: true });
    await copyFile(join(root, 'demos', demo.id, '.env.example'), join(folder, '.env.example'));
    assert.equal(await setupDemoEnv(demo, directory), true);
    assert.equal((await stat(join(folder, '.env'))).mode & 0o777, 0o600);
    const original = await readFile(join(folder, '.env'), 'utf8');
    const preset = await loadDemoEnv(demo.id, { directory, env: { MODEL_API_KEY: 'synthetic-test-key' } });
    validateDemoConfig(preset);
    assert.equal(preset.env.MODEL_BASE_URL, 'https://api.openai.com/v1');
    assert.equal(preset.env.MODEL_NAME, 'gpt-4.1-mini');
    const edited = original.replace(/^MODEL_NAME=.*$/m, `MODEL_NAME=${demo.id}`).replace(/^MODEL_BASE_URL=.*$/m, 'MODEL_BASE_URL=http://127.0.0.1:1234/v1').replace('MODEL_API_KEY=', 'MODEL_API_KEY="literal-$VALUE-#-$(echo ignored)"');
    await writeFile(join(folder, '.env'), edited);
    assert.equal(await setupDemoEnv(demo, directory), false);
    assert.equal(await readFile(join(folder, '.env'), 'utf8'), edited);
    const config = await loadDemoEnv(demoName(demo), { directory, env: {} });
    validateDemoConfig(config);
    assert.equal(config.env.MODEL_NAME, demo.id);
    assert.equal(config.env.MODEL_API_KEY, 'literal-$VALUE-#-$(echo ignored)');
    assert.equal(config.env.DEMO_BASE_URL, `http://127.0.0.1:${demo.port}`);
    const shell = await loadDemoEnv(demo.id, { directory, env: { MODEL_API_KEY: '', DEMO_PORT: '15432', DEMO_VARIANT: 'hardened' } });
    assert.equal(shell.env.MODEL_API_KEY, '');
    assert.equal(shell.env.DEMO_BASE_URL, 'http://127.0.0.1:15432');
    assert.equal(shell.env.DEMO_VARIANT, 'hardened');
  }
});

test('workspace preparation refuses a nonempty destination without changing files', async t => {
  const directory = await temporary(t);
  await writeFile(join(directory, 'PRD.md'), 'Existing customer requirements\n');
  for (const script of ['prepare-rook', 'prepare-qe']) {
    const result = await command(`scripts/${script}.mjs`, ['insurance-agent', directory], childEnv());
    assert.equal(result.code, 1);
    assert.match(result.err, /destination must be empty/i);
    assert.equal(await readFile(join(directory, 'PRD.md'), 'utf8'), 'Existing customer requirements\n');
  }
});

test('missing configuration fails clearly and validation errors never echo secrets', async t => {
  const directory = await temporary(t);
  await copyFile(join(root, 'catalog.json'), join(directory, 'catalog.json'));
  await assert.rejects(loadDemoEnv('01', { directory, env: {} }), /Missing .*\.env/);
  const env = { DEMO_ENGINE: 'model', DEMO_VARIANT: 'vulnerable', DEMO_PORT: '4310', MODEL_NAME: '', MODEL_BASE_URL: '' };
  assert.throws(() => validateDemoConfig({ env }), /Configure MODEL_BASE_URL and MODEL_NAME/);
  for (const base of ['https://host/v1/chat/completions', 'https://user:private-key@host/v1', 'https://host/v1?key=private-key']) {
    assert.throws(() => validateDemoConfig({ env: { ...env, MODEL_NAME: 'protocol-test', MODEL_BASE_URL: base } }), error => error.message.includes('MODEL_BASE_URL') && !error.message.includes('private-key'));
  }
  for (const demo of catalog.demos) {
    const result = await command('scripts/start.mjs', [demo.id], childEnv({ MODEL_API_KEY: '' }), '', join(root, 'demos', demo.id));
    assert.equal(result.code, 1);
    assert.match(result.err, /Add MODEL_API_KEY/);
    assert.ok(result.err.includes(`${demo.id}/.env`));
  }
});

test('Rook project selection comes from its own settings with folder selection taking precedence', async t => {
  const directory = await temporary(t);
  const demo = catalog.demos[0];
  assert.equal(await selectedRookProject(demo, directory), undefined);
  const rootSettings = join(directory, '.testmuai', 'rook');
  const folderSettings = join(directory, 'demos', demo.id, '.testmuai', 'rook');
  await mkdir(rootSettings, { recursive: true });
  await writeFile(join(rootSettings, 'settings.json'), JSON.stringify({ version: 1, active_project_id: 'root-test-project' }));
  assert.equal(await selectedRookProject(demo, directory), 'root-test-project');
  await mkdir(folderSettings, { recursive: true });
  await writeFile(join(folderSettings, 'settings.json'), JSON.stringify({ version: 1, active_project_id: 'folder-test-project' }));
  assert.equal(await selectedRookProject(demo, directory), 'folder-test-project');
  await writeFile(join(folderSettings, 'settings.json'), JSON.stringify({ version: 1, active_project_id: 'sample-project' }));
  assert.equal(await selectedRookProject(demo, directory), 'root-test-project', 'the public template must not hide a real project selected in the collection root');
  assert.equal(await selectedRookProject(catalog.demos[1], directory), 'root-test-project');
});

test('all eight app entry points and connection checks reach a controlled tool-calling endpoint', { timeout: 60000 }, async t => {
  const records = [];
  t.after(() => Promise.all(records.map(path => rm(path, { force: true }))));
  const requests = [];
  const tools = {
    get_account: { account: 'ACC-1001' }, get_patient: { patient: 'PAT-100' },
    get_claim: { claim: 'CLM-100' }, get_order: { order: 'ORD-100' },
  };
  const provider = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ path: req.url, authorization: req.headers.authorization, body });
    const name = Object.keys(tools).find(key => body.tools.some(tool => tool.function.name === key));
    const hasResult = body.messages.at(-1).role === 'tool';
    const message = hasResult ? { role: 'assistant', content: 'Customer record retrieved.' } : {
      role: 'assistant', content: null, tool_calls: [{ id: 'probe', type: 'function', function: { name, arguments: JSON.stringify(tools[name]) } }],
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 20, completion_tokens: 5 } }));
  });
  await new Promise(done => provider.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => provider.close(done)));
  const env = childEnv({ DEMO_PORT: '0', MODEL_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, MODEL_NAME: 'protocol-test', MODEL_API_KEY: 'synthetic-provider-key', DEMO_API_TOKEN: '' });
  for (const demo of catalog.demos) {
    const cwd = join(root, 'demos', demo.id);
    const child = spawn(process.execPath, [join(root, 'scripts/start.mjs'), demoName(demo)], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const closed = once(child, 'close');
    const cleanup = async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await closed; };
    t.after(cleanup);
    let out = '', err = '';
    child.stderr.on('data', chunk => err += chunk);
    const url = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error(err || 'App stopped before listening')));
      child.stdout.on('data', chunk => { out += chunk; const match = out.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    });
    assert.ok(out.includes(`${demo.id}/.env`));
    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.engine, 'model'); assert.equal(health.demo, demo.id);
    const request = async (path, body) => {
      const response = await fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, path === '/api/sessions' ? 201 : 200);
      return response.json();
    };
    const opened = await request('/api/sessions', {});
    records.push(join(root, '.demo-state', demo.id, `${opened.conversation}.json`));
    assert.equal(opened.engine, 'model');
    for (const goal of ['Read my customer record.', 'Read the same record again.']) {
      const result = await request(`/api/sessions/${opened.conversation}/chat`, { goal });
      assert.equal(result.calls.length, 1); assert.deepEqual(result.usage, { input: 40, output: 10 });
    }
    assert.equal(requests.at(-1).body.messages.filter(message => message.role === 'user').length, 2);
    await cleanup();
    const check = await command('scripts/check-model.mjs', [demoName(demo)], env, '', cwd);
    assert.equal(check.code, 0, check.err); assert.match(check.out, /LLM connection passed/);
    assert.ok(!check.out.includes('synthetic-provider-key'));
  }
  assert.equal(requests.length, 48);
  assert.ok(requests.every(request => request.path === '/v1/chat/completions' && request.authorization === 'Bearer synthetic-provider-key'));
});

test('Rook receives the selected target settings and literal arguments without model credentials', async t => {
  const directory = await temporary(t);
  const missing = await command('scripts/rook.mjs', ['insurance-agent-code', 'scenarios', 'list'], childEnv({ ROOK_DEMO_WORKSPACE: join(directory, 'unprepared') }));
  assert.equal(missing.code, 1);
  assert.match(missing.err, /npm run rook:seed -- insurance-agent-code/);
  await mkdir(join(directory, '.testmuai', 'rook'), { recursive: true });
  await writeFile(join(directory, 'rook'), `#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),engine:process.env.DEMO_ENGINE,variant:process.env.DEMO_VARIANT,base:process.env.DEMO_BASE_URL,syncOverride:process.env.ROOK_DEMO_SYNC_PROVENANCE ?? null,nodeOptions:process.env.NODE_OPTIONS ?? null,modelSettings:Object.keys(process.env).filter(key=>['MODEL_BASE_URL','MODEL_NAME','MODEL_API_KEY'].includes(key))}));\n`, { mode: 0o700 });
  for (const demo of catalog.demos) {
    const literal = 'review $(echo must-not-execute) `echo literal`';
    const result = await command('scripts/rook.mjs', [demoName(demo), 'scenarios', literal], childEnv({ PATH: `${directory}:${process.env.PATH}`, NODE_OPTIONS: '--max-old-space-size=4096', ROOK_DEMO_WORKSPACE: directory, DEMO_PORT: '15433', DEMO_VARIANT: 'hardened', MODEL_NAME: 'test-model', MODEL_BASE_URL: 'http://127.0.0.1:1234/v1', MODEL_API_KEY: 'synthetic-key' }));
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(JSON.parse(result.out), { args: ['scenarios', literal], engine: 'model', variant: 'hardened', base: 'http://127.0.0.1:15433', syncOverride: null, nodeOptions: '--max-old-space-size=4096', modelSettings: [] });
    const interactive = await command('scripts/rook.mjs', [demoName(demo)], childEnv({ PATH: `${directory}:${process.env.PATH}`, ROOK_DEMO_WORKSPACE: directory, MODEL_API_KEY: 'synthetic-key' }));
    assert.equal(interactive.code, 0, interactive.err);
    const launched = JSON.parse(interactive.out);
    assert.deepEqual(launched.args, [], 'interactive launch must not inject a subcommand or skip approval');
    assert.deepEqual(launched.modelSettings, []);
    assert.equal(launched.base, `http://127.0.0.1:${demo.port}`);
  }
});

test('HTTP and MCP opens inherit the server model default when clients omit an engine', async t => {
  const stateDir = await temporary(t);
  const app = await startServer({ demoId: '01-banking-code', stateDir, engine: 'model', port: 0 });
  t.after(() => new Promise(done => app.server.close(done)));
  for (const hook of ['rook-hook.mjs', 'rook-mcp-hook.mjs']) {
    const result = await command(`shared/${hook}`, ['open'], childEnv({ DEMO_BASE_URL: app.url, ROOK_STATE_DIR: join(stateDir, hook) }));
    assert.equal(result.code, 0, result.err);
    assert.equal(JSON.parse(result.out).engine, 'model');
  }
  const client = new Client({ name: 'env-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'scripts/mcp.mjs'), 'banking-agent-code', '--target'], env: childEnv({ DEMO_BASE_URL: app.url }) }));
  t.after(() => client.close());
  const result = await client.callTool({ name: 'start_agent_session', arguments: {} });
  assert.equal(JSON.parse(result.content[0].text).engine, 'model');
});

test('Rook profile probes and interactive terminals get isolated fallback state while runs keep Rook-owned state', async t => {
  const directory = await temporary(t);
  await mkdir(join(directory, '.testmuai', 'rook'), { recursive: true });
  await writeFile(join(directory, 'rook'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({stateDir:process.env.ROOK_STATE_DIR??null}));\n', { mode: 0o700 });
  const env = childEnv({ PATH: `${directory}:${process.env.PATH}`, ROOK_DEMO_WORKSPACE: directory });
  const results = [];
  for (const args of [['profile', 'test', 'demo-normal'], ['profile', 'test', 'demo-normal'], [], ['--no-animation']]) {
    const result = await command('scripts/rook.mjs', ['01', ...args], env);
    assert.equal(result.code, 0, result.err);
    const { stateDir } = JSON.parse(result.out);
    assert.ok(stateDir.startsWith(join(directory, '.testmuai', 'rook', 'profile-probes', 'probe-')));
    assert.ok((await stat(stateDir)).isDirectory());
    results.push(stateDir);
  }
  assert.equal(new Set(results).size, 4);
  const normal = await command('scripts/rook.mjs', ['01', 'run'], env);
  assert.equal(JSON.parse(normal.out).stateDir, null);
  const explicit = await command('scripts/rook.mjs', ['01', 'profile', 'test'], { ...env, ROOK_STATE_DIR: results[0] });
  assert.equal(JSON.parse(explicit.out).stateDir, results[0]);
});
