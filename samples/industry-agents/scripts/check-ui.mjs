import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, startServer } from '../shared/server.mjs';
import { findDemo } from '../shared/config.mjs';
import { domains } from '../shared/registry.mjs';
import { assess, verdict } from '../shared/assertions.mjs';
import { customerImpact } from '../shared/web/presentation.mjs';

const exec = promisify(execFile);
const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const selector = process.argv[2];
const demos = selector ? [await findDemo(selector)] : catalog.demos;
const outputDir = join(root, 'artifacts', 'local', 'browser-checks');
await mkdir(outputDir, { recursive: true });

// An installed CLI or a previously cached npx package is required. Never install
// packages implicitly during verification, and never pass commands through a shell.
let cli = 'agent-browser', prefix = [];
let browserVersion;
try { browserVersion = (await exec(cli, ['--version'])).stdout.trim(); }
catch {
  cli = 'npx'; prefix = ['--no-install', 'agent-browser@0.37.1'];
  browserVersion = (await exec(cli, [...prefix, '--version'])).stdout.trim();
  // Resolve the cached executable once instead of starting npm for every click.
  try {
    const resolved = (await exec('npx', ['--no-install', '--package=agent-browser@0.37.1', '--', 'which', 'agent-browser'])).stdout.trim();
    if (resolved && !resolved.includes('\n')) { cli = resolved; prefix = []; }
  } catch { /* The npx fallback also works on platforms without which. */ }
}

// Read-only browser observation. Customer actions use click/select/fill below.
async function readBrowserState() {
  const until = Date.now() + 15000;
  const el = id => document.getElementById(id);
  while (!el('send') || el('send').disabled || !el('brand')?.textContent || document.title === 'Agent Assurance — ROOK') {
    if (Date.now() > until) throw new Error('UI did not become ready');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return {
    title: document.title, brand: el('brand').textContent, persona: el('persona').textContent,
    audience: el('audience').textContent, agent: el('chat-title').textContent,
    hasEngineSelector: Boolean(el('engine')), hasFaultSelector: Boolean(el('fault')), visibleText: document.body.innerText, policy: el('policy').textContent,
    cards: [...document.querySelectorAll('.scenario-button small')].map(e => e.textContent),
    cardCount: el('scenario-count').textContent, category: el('category').value,
    selected: [...document.querySelectorAll('.scenario-button')].findIndex(e => e.getAttribute('aria-pressed') === 'true'),
    goal: el('goal').value, variant: el('variant').value,
    session: el('session-id').textContent.replace('SESSION ', ''), hint: el('turn-hint').textContent,
    expectations: el('expectations').textContent, expectationCount: el('expectations').querySelectorAll('li').length,
    effectCount: el('effect-count').textContent, tokens: el('tokens').textContent,
    effects: [...document.querySelectorAll('.ledger-row code')].map(e => JSON.parse(e.textContent)),
    traces: [...document.querySelectorAll('.trace pre')].map(e => JSON.parse(e.textContent)),
    traceOpen: [...document.querySelectorAll('.trace')].map(e => e.open),
    messages: [...document.querySelectorAll('.message.assistant')].map(e => e.textContent),
    readableReplies: [...document.querySelectorAll('.message.assistant .reply-text')].map(e => e.textContent),
    userMessages: [...document.querySelectorAll('.message.user')].map(e => e.textContent),
    exportDisabled: el('export').disabled, error: el('error').hidden ? null : el('error').textContent,
    width: innerWidth, documentWidth: document.documentElement.scrollWidth,
  };
}

function assertTraces(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (const [index, trace] of actual.entries()) {
    const { durationMs, ...observed } = trace;
    const { durationMs: expectedDuration, ...recorded } = expected[index];
    assert.deepEqual(observed, recorded);
    // Chrome -> CLI JSON may differ by one floating-point unit. Preserve exact
    // IDs, arguments and outcomes, with a 1 microsecond tolerance for timings.
    if (expectedDuration === undefined) assert.equal(durationMs, undefined);
    else assert.ok(Number.isFinite(durationMs) && Math.abs(durationMs - expectedDuration) < 0.001);
  }
}

async function checkDemo(demo) {
  const directory = join(outputDir, demo.id);
  await mkdir(directory, { recursive: true });
  const stateDir = await mkdtemp(join(tmpdir(), 'rook-ui-'));
  const browserSession = 'rook-check-' + process.pid + '-' + demo.id.slice(0, 2);
  const result = { demo: demo.id, status: 'running', checks: [], observations: [], screenshots: [] };
  const browser = async (...args) => {
    let stdout;
    const expression = args[0] === 'eval' ? args[1] : undefined;
    const command = expression ? ['eval', '--stdin'] : args;
    try {
      const pending = exec(cli, [...prefix, '--session', browserSession, '--json', ...command], { cwd: root, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      pending.child.stdin.end(expression ?? '');
      ({ stdout } = await pending);
    } catch (error) { throw new Error('agent-browser ' + args[0] + ': ' + (error.stdout || error.stderr || error.signal || error.message)); }
    const response = JSON.parse(stdout);
    if (!response.success) throw new Error(response.error ?? 'Browser command failed');
    return response.data;
  };
  const read = async () => (await browser('eval', '(' + readBrowserState.toString() + ')()')).result;
  let app, ui, step;
  const check = async (name, fn) => {
    step = name;
    await fn();
    result.checks.push({ name, status: 'pass' });
  };
  const screenshot = async name => {
    await browser('screenshot', join(directory, name), '--full');
    result.screenshots.push(name);
  };
  try {
    // Port 1 is intentionally unavailable: the error-path check cannot call a
    // real model, even if the facilitator's environment has model credentials.
    const runtimeOptions = { demoId: demo.id, port: 0, stateDir, token: '', engine: 'fixture',
      modelOptions: { baseUrl: 'http://127.0.0.1:1/v1', model: 'unavailable-ui-test-model', apiKey: '' } };
    app = await startServer(runtimeOptions);
    result.url = app.url;
    const domain = domains[demo.domain];
    const scenarios = JSON.parse(await readFile(join(root, 'demos', demo.id, 'scenarios.json'), 'utf8'));
    const choose = async category => {
      const index = scenarios.findIndex(s => s.category === category);
      assert.ok(index >= 0);
      const before = ui.session;
      const button = '.scenario-button:nth-child(' + (index + 1) + ')';
      await browser('scrollintoview', button);
      await browser('click', button);
      ui = await read();
      assert.notEqual(ui.session, before, 'Choosing a scenario must start a fresh session');
      assert.equal(ui.selected, index);
      assert.equal(ui.goal, scenarios[index].goals[0]);
      const config = await (await fetch(app.url + '/api/sessions/' + ui.session + '/evidence')).json();
      assert.equal(config.fault, scenarios[index].fault);
      assert.equal(ui.expectationCount, scenarios[index].assertions.length);
      assert.ok(ui.expectations.includes(customerImpact(scenarios[index])));
      assert.equal(ui.error, null);
      return scenarios[index];
    };
    const send = async (expectError = false) => {
      await browser('click', '#send');
      ui = await read();
      if (!expectError) assert.equal(ui.error, null);
      const response = await fetch(app.url + '/api/sessions/' + ui.session + '/evidence');
      assert.equal(response.status, 200);
      const proof = await response.json();
      assert.equal(ui.effectCount, String(proof.effects.length));
      assert.deepEqual(ui.effects, proof.effects, 'Rendered ledger must match authoritative session evidence');
      assertTraces(ui.traces, proof.traces.filter(t => t.kind === 'tool' || t.kind === 'error'));
      assert.equal(ui.exportDisabled, false);
      if (!expectError) assert.ok(ui.messages.at(-1).includes(proof.turns.at(-1).output));
      return proof;
    };
    const runScenario = async (category, expected) => {
      const scenario = await choose(category);
      const id = ui.session;
      let proof;
      for (const [index, goal] of scenario.goals.entries()) {
        assert.equal(ui.goal, goal, 'The UI must offer the next ordered customer turn');
        proof = await send();
        assert.equal(proof.sessionId, id, 'All turns must reuse one session');
        assert.equal(proof.turns.length, index + 1);
      }
      assert.deepEqual(proof.turns.map(t => t.goal), scenario.goals);
      assert.equal(proof.variant, ui.variant);
      assert.equal(proof.fault, scenario.fault);
      const criteria = assess(scenario, proof);
      assert.equal(verdict(criteria), expected, demo.id + ' / ' + category);
      const filename = category + '-' + ui.variant + '.json';
      await writeFile(join(directory, filename), JSON.stringify(proof, null, 2) + '\n');
      result.observations.push({ category, variant: ui.variant, sessionId: id, localVerdict: expected, criteria, evidence: filename });
      return proof;
    };

    await check('Domain branding, audience, persona and policy', async () => {
      await browser('set', 'viewport', '1440', '1000');
      await browser('open', app.url);
      ui = await read();
      assert.equal(ui.brand, domain.name);
      assert.equal(ui.agent, domain.agent);
      assert.equal(ui.persona, domain.persona);
      assert.equal(ui.policy, domain.policy);
      assert.ok(ui.audience.includes(demo.audience.toUpperCase()));
      assert.ok(ui.audience.includes(demo.style === 'code' ? 'SOURCE ACCESS' : 'REQUIREMENTS ACCESS'));
      assert.equal(ui.hasEngineSelector, false);
      assert.equal(ui.hasFaultSelector, false);
      assert.ok(!/fixture|live model|\bdemo\b/i.test(ui.visibleText));
      assert.equal(ui.cards.length, 18);
      assert.equal(ui.documentWidth, ui.width);
      const snapshot = await browser('snapshot', '-i');
      await writeFile(join(directory, 'initial-snapshot.json'), JSON.stringify(snapshot, null, 2));
    });
    await check('Server-configured connection failure is explicit and a fresh session clears the error', async () => {
      const unavailable = await startServer({ ...runtimeOptions, engine: 'model', stateDir: join(stateDir, 'model-errors') });
      try {
        await browser('open', unavailable.url); ui = await read();
        const savedApp = app; app = unavailable;
        try {
          await choose('happy_path');
          const proof = await send(true);
          assert.ok(ui.error, 'A failed model endpoint must show an error');
          assert.equal(proof.engine, 'model');
          assert.equal(proof.effects.length, 0);
          assert.ok(proof.turns.at(-1).error);
          await browser('click', '#new-session'); ui = await read();
          assert.equal(ui.error, null);
          assert.equal(ui.messages.length, 0);
          assert.equal(ui.effectCount, '0');
        } finally { app = savedApp; }
      } finally { await new Promise(resolve => unavailable.server.close(resolve)); }
      await browser('open', app.url); ui = await read();
    });
    await check('Three class filters contain exactly 5 / 4 / 9 categories', async () => {
      for (const [kind, categories] of Object.entries(catalog.taxonomy)) {
        await browser('select', '#category', kind); ui = await read();
        assert.deepEqual(ui.cards, categories.map(c => c.replaceAll('_', ' ')));
        assert.equal(ui.cardCount, String(categories.length));
      }
      await browser('select', '#category', 'all'); ui = await read();
    });
    await check('All 18 scenario cards load the right goal, fault, criteria and impact', async () => {
      for (const scenario of scenarios) await choose(scenario.category);
    });
    await check('Happy path shows an actual receipt and missing token usage', async () => {
      const proof = await runScenario('happy_path', 'pass');
      assert.ok(!ui.readableReplies.at(-1).startsWith('{'), 'Customer confirmation must be readable prose');
      assert.ok(ui.readableReplies.at(-1).includes(proof.effects[0].id));
      assert.ok(ui.tokens.includes('Unable to Verify'));
    });
    await check('Expandable trace exposes correlated tool arguments and outcome', async () => {
      await browser('click', '.trace:first-child summary'); ui = await read();
      assert.equal(ui.traceOpen[0], true);
      assert.ok(ui.traces[0].traceId && ui.traces[0].parentSpanId && ui.traces[0].arguments);
    });
    await check('JSON download contains the same session, effects and trace', async () => {
      await browser('download', '#export', join(directory, 'downloaded-evidence.json'));
      const exported = JSON.parse(await readFile(join(directory, 'downloaded-evidence.json'), 'utf8'));
      assert.equal(exported.sessionId, ui.session);
      assert.deepEqual(exported.effects, ui.effects);
      assertTraces(ui.traces, exported.traces.filter(t => t.kind === 'tool'));
    });
    await check('Vulnerable policy defect is visible in the ledger', async () => {
      await runScenario('policy_violation', 'fail');
      assert.equal(ui.effects.length, 1);
      await screenshot('desktop-vulnerable.png');
    });
    await check('Hardened policy repair changes the business outcome', async () => {
      const before = ui.session;
      await browser('select', '#variant', 'hardened'); ui = await read();
      assert.notEqual(ui.session, before);
      await runScenario('policy_violation', 'pass');
      assert.deepEqual(ui.effects.map(e => e.type), demo.domain === 'healthcare' ? ['urgent_handoff'] : []);
      await screenshot('desktop-hardened.png');
    });
    await check('Two-turn context stays in one conversation', async () => { await runScenario('state_context', 'pass'); });
    await check('Dependency failure does not create a false receipt', async () => { await runScenario('integration', 'pass'); });
    await check('Retrieved prompt injection does not create an export', async () => { await runScenario('prompt_injection', 'pass'); });
    await check('Slow dependency is visible in the trace', async () => {
      await runScenario('performance', 'fail');
      assert.ok(ui.traces.some(t => t.durationMs >= 100));
    });
    await check('New session clears messages, ledger, traces and export', async () => {
      const before = ui.session;
      await browser('click', '#new-session'); ui = await read();
      assert.notEqual(ui.session, before);
      assert.equal(ui.effectCount, '0');
      assert.equal(ui.messages.length, 0);
      assert.equal(ui.userMessages.length, 0);
      assert.equal(ui.traces.length, 0);
      assert.equal(ui.exportDisabled, true);
    });
    await check('Mobile 390px layout supports a complete customer request', async () => {
      await browser('set', 'viewport', '390', '844'); ui = await read();
      assert.equal(ui.documentWidth, 390);
      await runScenario('happy_path', 'pass');
      assert.equal(ui.documentWidth, 390, 'Receipt content must not overflow the mobile layout');
      await screenshot('mobile.png');
    });
    await check('No uncaught browser errors', async () => {
      assert.deepEqual((await browser('errors')).errors, []);
    });
    result.status = 'pass';
  } catch (error) {
    result.status = 'fail';
    result.checks.push({ name: step ?? 'Setup', status: 'fail', error: error.message });
    result.error = error.stack;
    try { await screenshot('failure.png'); result.failureState = await read(); } catch { /* Preserve the original failure. */ }
  } finally {
    try { await browser('close'); } catch { /* Browser may never have opened. */ }
    if (app) await new Promise(resolve => app.server.close(resolve));
    await rm(stateDir, { recursive: true, force: true });
    await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(demo.id + ': ' + result.status + ' (' + result.checks.filter(c => c.status === 'pass').length + ' browser checks)' + (result.status === 'fail' ? ' — ' + step : ''));
  return result;
}

// Independent servers and named browser sessions permit two simultaneous demos.
const results = [];
for (let i = 0; i < demos.length; i += 2) {
  const batch = await Promise.allSettled(demos.slice(i, i + 2).map(checkDemo));
  for (const item of batch) {
    if (item.status === 'fulfilled') results.push(item.value);
    else throw item.reason;
  }
}
const report = { generatedAt: new Date().toISOString(), browserVersion, nodeVersion: process.version,
  evidenceKind: 'Real Chrome interactions against synthetic fixture targets; local assertions, not Rook judge or live inference results',
  passed: results.filter(r => r.status === 'pass').length, failed: results.filter(r => r.status === 'fail').length, results };
const filename = selector ? 'summary-' + demos[0].id + '.json' : 'summary.json';
await writeFile(join(outputDir, filename), JSON.stringify(report, null, 2) + '\n');
console.log('Browser report: artifacts/local/browser-checks/' + filename);
if (report.failed) process.exitCode = 1;
