import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { root } from '../shared/config.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const catalog = JSON.parse(await readFile(join(root, 'catalog.json')));
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MODEL_|DEMO_|ROOK_|LT_|NODE_OPTIONS)/.test(key)));
async function run(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', data => out += data);
  child.stderr.on('data', data => err += data);
  const [code] = await once(child, 'close');
  return { code, out, err };
}
async function digestTree(directory) {
  const files = {};
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else files[relative(directory, file)] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
  await visit(directory);
  return files;
}

for (const demo of catalog.demos) test(`${demo.id} runs alone and preserves its native workspace`, { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'standalone demo with spaces '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(root, 'demos', demo.id);
  await cp(source, directory, { recursive: true, filter(path) {
    const parts = relative(source, path).split('/');
    return !parts.some(part => ['node_modules', '.env', '.demo-state'].includes(part))
      && !(parts[0] === 'artifacts' && parts[1] === 'local')
      && !(parts[0] === '.testmuai' && parts[1] === 'rook' && parts[2] === 'settings.json')
      && !(parts[0] === '.testmuai' && parts[2] === 'projects' && parts[3] && parts[3] !== 'sample-project');
  } });
  // A private project selection must not get reset to the sample template.
  const settings = join(directory, '.testmuai/rook/settings.json');
  await writeFile(settings, JSON.stringify({ active_project_id: 'KEEP-MY-PROJECT' }));
  const nativeBefore = await digestTree(join(directory, '.testmuai'));
  const env = { ...cleanEnv(), DEMO_ENGINE: 'fixture', DEMO_VARIANT: 'hardened', DEMO_PORT: '0' };
  const installed = await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], directory, env);
  assert.equal(installed.code, 0, installed.err);
  for (let i = 0; i < 2; i++) {
    const setup = await run('npm', ['run', 'setup'], directory, env);
    assert.equal(setup.code, 0, setup.err);
  }
  assert.deepEqual(await digestTree(join(directory, '.testmuai')), nativeBefore);
  const replay = await run('npm', ['run', 'samples:check'], directory, env);
  assert.equal(replay.code, 0, replay.err);
  const server = spawn('npm', ['start'], { cwd: directory, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stopped = once(server, 'close');
  t.after(async () => { if (server.exitCode === null && server.signalCode === null) process.kill(-server.pid, 'SIGTERM'); await stopped; });
  let log = '', errors = '';
  server.stderr.on('data', data => errors += data);
  const url = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', () => reject(new Error(errors || 'Server stopped before listening')));
    server.stdout.on('data', data => { log += data; const found = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (found) resolve(found[0]); });
  });
  for (const path of ['/health', '/api/demo', '/', '/app.mjs', '/app.css', '/overview']) assert.equal((await fetch(url + path)).status, 200, path);
  assert.equal((await (await fetch(url + '/health')).json()).demo, demo.id);
  const post = async (path, data) => (await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
  const opened = await post('/api/sessions', {});
  const scenarios = JSON.parse(await readFile(join(directory, 'scenarios.json')));
  const reply = await post(`/api/sessions/${opened.conversation}/chat`, { goal: scenarios[0].goals[0] });
  assert.ok(reply.calls.length > 0);
  const evidence = await (await fetch(`${url}/api/sessions/${opened.conversation}/evidence`)).json();
  assert.ok(evidence.effects.length > 0);
  const client = new Client({ name: 'standalone-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(directory, 'scripts/mcp.mjs'), demo.id, '--target'], env: { ...env, DEMO_BASE_URL: url } }));
  try {
    const result = await client.callTool({ name: 'start_agent_session', arguments: {} });
    assert.ok(JSON.parse(result.content[0].text).conversation);
  } finally { await client.close(); }
  const prepared = join(directory, 'exploration');
  const prepare = await run('npm', ['run', 'rook:prepare', '--', prepared], directory, env);
  assert.equal(prepare.code, 0, prepare.err);
  assert.equal((await readdir(prepared)).includes('source'), demo.style === 'code');
  if (demo.style === 'code') {
    const imported = await run(process.execPath, [join(prepared, 'source/demos', demo.id, 'agent.mjs')], prepared, env);
    assert.equal(imported.code, 0, imported.err);
  }
  await mkdir(join(prepared, '.testmuai'), { recursive: true });
  await writeFile(join(prepared, '.testmuai/evidence.txt'), 'keep this run');
  const refused = await run('npm', ['run', 'rook:prepare', '--', prepared], directory, env);
  assert.notEqual(refused.code, 0);
  assert.equal(await readFile(join(prepared, '.testmuai/evidence.txt'), 'utf8'), 'keep this run');
  // Exercise the complete CI launcher with a subprocess that exits unsuccessfully.
  // This is a test double, never represented as a real Rook evaluation.
  const stub = join(directory, 'rook-test-double.cjs');
  await writeFile(stub, '#!/usr/bin/env node\nconsole.log("{}");process.exitCode=7;\n', { mode: 0o700 });
  const ci = await run('npm', ['run', 'rook:ci', '--', '--project', 'UNIT-PROJECT'], directory, { ...env, ROOK_BIN: stub });
  assert.equal(ci.code, 7, ci.err);
  assert.match(ci.out, /"allowed": false/);
  assert.deepEqual(await digestTree(join(directory, '.testmuai')), nativeBefore);
});

test('each edition owns its executable imports and its documentation links resolve', async () => {
  for (const demo of catalog.demos) {
    const base = join(root, 'demos', demo.id);
    const scan = async (directory, imports = false) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        assert.ok(!entry.isSymbolicLink(), `${path}: symlink dependency`);
        if (entry.isDirectory()) { await scan(path, imports); continue; }
        if (imports && entry.name.endsWith('.mjs')) {
          const text = await readFile(path, 'utf8');
          for (const match of text.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)) {
            if (!match[1].startsWith('.')) continue;
            const destination = join(directory, match[1]);
            assert.ok(!relative(base, destination).startsWith('..'), `${path}: external import ${match[1]}`);
            await readFile(destination);
          }
        }
      }
    };
    await scan(join(base, 'runtime'), true); await scan(join(base, 'scripts'), true);
    for (const path of [join(base, 'README.md'), join(base, 'runtime-setup.md'), join(base, 'rook/README.md'), ...(await readdir(join(base, 'docs'))).filter(f => f.endsWith('.md')).map(f => join(base, 'docs', f))]) {
      const text = await readFile(path, 'utf8');
      for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
        if (link.includes(':') || link.startsWith('#')) continue;
        const destination = join(path, '..', link.split('#')[0]);
        assert.ok(!relative(base, destination).startsWith('..'), `${path}: external local link ${link}`);
        await readdir(destination).catch(async error => { if (error.code !== 'ENOTDIR') throw error; await readFile(destination); });
      }
    }
  }
});
