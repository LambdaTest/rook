import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, startServer } from '../shared/server.mjs';
import { assess, verdict } from '../shared/assertions.mjs';

const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const results = [];
for (const demo of catalog.demos) {
  const app = await startServer({ demoId: demo.id, port: 0 });
  const request = async (path, body) => {
    const res = await fetch(`${app.url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json(); if (!res.ok) throw new Error(`${res.status}: ${data.error}`); return data;
  };
  try {
    const scenarios = JSON.parse(await readFile(join(root, 'demos', demo.id, 'scenarios.json'), 'utf8'));
    for (const variant of ['vulnerable', 'hardened']) {
      for (const scenario of scenarios) {
        const samples = [];
        for (let sample = 0; sample < scenario.repeat; sample++) {
          const { conversation } = await request('/api/sessions', { variant, engine: 'fixture', fault: scenario.fault });
          for (const goal of scenario.goals) await request(`/api/sessions/${conversation}/chat`, { goal });
          await request(`/api/sessions/${conversation}/close`, {});
          const proof = await request(`/api/sessions/${conversation}/evidence`);
          const criteria = assess(scenario, proof);
          samples.push({ conversation, status: verdict(criteria), criteria, proof });
        }
        const status = samples.some(s => s.status === 'fail') ? 'fail' : samples.some(s => s.status === 'unable_to_verify') ? 'unable_to_verify' : 'pass';
        results.push({ demo: demo.id, variant, scenario: scenario.id, category: scenario.category, status, samples });
      }
    }
  } finally { await new Promise(done => app.server.close(done)); }
  console.log(`Rehearsed ${demo.id}`);
}
await mkdir(join(root, 'artifacts', 'local'), { recursive: true });
const summary = { generatedAt: new Date().toISOString(), evidenceKind: 'local deterministic fixture rehearsal; not Rook verdicts or live model results',
  counts: Object.fromEntries(['pass','fail','unable_to_verify'].map(status => [status, results.filter(r => r.status === status).length])),
  results };
await writeFile(join(root, 'artifacts', 'local', 'rehearsal.json'), JSON.stringify(summary, null, 2));
const compact = results.map(({ samples, ...row }) => row);
await writeFile(join(root, 'artifacts', 'local', 'summary.json'), JSON.stringify({ ...summary, results: compact }, null, 2));
console.log(JSON.stringify(summary.counts));
console.log('Full evidence: artifacts/local/rehearsal.json. Intentional failures are demonstration results, not harness failures.');
