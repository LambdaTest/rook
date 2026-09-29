import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Implements the documented Rook hook contract; this is not a Rook verdict generator.
const phase = process.argv[2] ?? process.env.ROOK_HOOK;
const base = (process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:4310').replace(/\/$/, '');
const directory = process.env.ROOK_STATE_DIR;
if (!directory) throw new Error('ROOK_STATE_DIR is required');
await mkdir(directory, { recursive: true });
const stateFile = join(directory, 'demo-session.json');
const headers = { 'Content-Type': 'application/json', ...(process.env.DEMO_API_TOKEN ? { Authorization: `Bearer ${process.env.DEMO_API_TOKEN}` } : {}) };
async function request(path, body) {
  const res = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(300000) });
  const data = await res.json();
  if (!res.ok) throw new Error(`Demo HTTP ${res.status}: ${data.error ?? 'request failed'}`);
  return data;
}
async function conversation() {
  const value = JSON.parse(await readFile(stateFile, 'utf8')).conversation;
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error('Invalid stored conversation');
  return value;
}
let output = {};
if (phase === 'prepare') output = await request('/health');
else if (phase === 'open') {
  output = await request('/api/sessions', { variant: process.env.DEMO_VARIANT, engine: process.env.DEMO_ENGINE, fault: process.env.DEMO_FAULT ?? 'none' });
  await writeFile(stateFile, JSON.stringify(output), { mode: 0o600 });
} else if (phase === 'execute') {
  let goal = ''; for await (const chunk of process.stdin) goal += chunk;
  const id = await conversation();
  const data = await request(`/api/sessions/${id}/chat`, { goal });
  // The inspected internal build reads agent_reply; public docs describe output.
  output = { output: data.output, agent_reply: data.output, conversation: id, calls: data.calls, ...(data.usage ? { usage: data.usage } : {}) };
} else if (phase === 'close') output = await request(`/api/sessions/${await conversation()}/close`, {});
else if (phase === 'collect') {
  const id = await conversation();
  const data = await request(`/api/sessions/${id}/evidence`);
  const evidenceFile = resolve(directory, `evidence-${id}.json`);
  await writeFile(evidenceFile, JSON.stringify(data, null, 2));
  await writeFile(join(directory, 'demo-evidence.json'), JSON.stringify(data, null, 2));
  // Put independently read state into output as well as an artifact. Rook versions differ
  // in how they retain arbitrary trace fields; the readable JSON is the source of truth.
  output = { conversation: id, output: JSON.stringify({ sessionId: id, engine: data.engine, effects: data.effects, verificationGaps: data.verificationGaps }),
    evidence_file: evidenceFile, evidence_kind: 'Collected synthetic target observations, not an agent-produced business artifact',
    calls: data.calls, ...(data.usage ? { usage: data.usage } : {}), traces: data.traces };
} else throw new Error(`Unsupported hook phase: ${phase}`);
process.stdout.write(JSON.stringify(output));
