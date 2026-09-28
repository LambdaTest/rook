import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { domains } from './registry.mjs';
import { createSession, executeTurn, evidence } from './engine.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validId = /^[0-9a-f-]{36}$/;
const contentTypes = { 'index.html': 'text/html', 'app.css': 'text/css', 'app.mjs': 'text/javascript', 'presentation.mjs': 'text/javascript' };
const safeError = (message, status = 400) => Object.assign(new Error(message), { status });

export async function startServer(options = {}) {
  const demoId = options.demoId ?? process.env.DEMO_ID ?? '01-banking-code';
  if (!/^[0-9]{2}-[a-z-]+$/.test(demoId)) throw new Error('Invalid demo ID');
  const manifest = JSON.parse(await readFile(join(root, 'demos', demoId, 'demo.json'), 'utf8'));
  const domain = domains[manifest.domain];
  if (!domain) throw new Error('Unknown demo domain');
  const engine = options.engine ?? process.env.DEMO_ENGINE ?? 'fixture';
  const stateDir = options.stateDir ?? join(root, '.demo-state', demoId);
  await mkdir(stateDir, { recursive: true });
  const sessions = new Map(), queues = new Map();
  const token = options.token ?? process.env.DEMO_API_TOKEN;
  const load = async id => {
    if (!validId.test(id)) throw safeError('Invalid session ID', 404);
    if (!sessions.has(id)) {
      try { sessions.set(id, JSON.parse(await readFile(join(stateDir, `${id}.json`), 'utf8'))); }
      catch { throw safeError('Session not found', 404); }
    }
    return sessions.get(id);
  };
  const save = async session => {
    const temp = join(stateDir, `${session.id}.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(session, null, 2), { mode: 0o600 });
    await rename(temp, join(stateDir, `${session.id}.json`));
  };
  const locked = async (id, fn) => {
    const previous = queues.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    queues.set(id, current);
    try { return await current; } finally { if (queues.get(id) === current) queues.delete(id); }
  };
  const readBody = async req => {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 65536) throw safeError('Request too large', 413); }
    try { return raw ? JSON.parse(raw) : {}; } catch { throw safeError('Invalid JSON'); }
  };
  const server = createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      // Prevent cross-origin browser writes and DNS rebinding on the local fixture service.
      const host = req.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw safeError('Invalid Host', 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw safeError('Cross-origin request denied', 403);
      const path = new URL(req.url, `http://${host}`).pathname;
      if (req.method === 'GET' && path === '/overview') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
        return res.end(await readFile(join(root, 'docs', 'demo-walkthrough.html')));
      }
      if (req.method === 'GET' && (path === '/' || /^\/(app\.css|app\.mjs|presentation\.mjs)$/.test(path))) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        res.writeHead(200, { 'Content-Type': contentTypes[file], 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
        return res.end(await readFile(join(root, 'shared', 'web', file)));
      }
      if (path === '/health' && req.method === 'GET') return send(200, { status: 'ok', demo: demoId, engine });
      if (token) {
        const received = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${token}`);
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw safeError('Bearer token required', 401);
      }
      if (path === '/api/demo' && req.method === 'GET') {
        const scenarios = JSON.parse(await readFile(join(root, 'demos', demoId, 'scenarios.json'), 'utf8'));
        return send(200, { ...manifest, name: domain.name, agent: domain.agent, accent: domain.accent, persona: domain.persona, mission: domain.mission, starter: domain.starter, policy: domain.policy, scenarios });
      }
      if (path === '/api/sessions' && req.method === 'POST') {
        const body = await readBody(req);
        const session = createSession(domain, { variant: body.variant ?? process.env.DEMO_VARIANT ?? 'vulnerable', engine: body.engine ?? engine, fault: body.fault ?? 'none' });
        sessions.set(session.id, session); await save(session);
        return send(201, { conversation: session.id, engine: session.engine, variant: session.variant });
      }
      const match = path.match(/^\/api\/sessions\/([^/]+)(?:\/(chat|evidence|close))?$/);
      if (!match) throw safeError('Not found', 404);
      const [, id, action] = match;
      const body = req.method === 'POST' ? await readBody(req) : {};
      return await locked(id, async () => {
        const session = await load(id);
        if (action === 'evidence' && req.method === 'GET') return send(200, evidence(session));
        if (action === 'chat' && req.method === 'POST') {
          if (session.closed) throw safeError('Session is closed', 409);
          let status = 200, reply;
          try { reply = await executeTurn(domain, session, body.goal, options.modelOptions); }
          catch (error) { status = error.evidence ? 502 : 400; reply = { error: error.message, ...(error.evidence ? { evidence: error.evidence } : {}) }; }
          // A client can close the service as soon as it receives the reply.
          await save(session);
          return send(status, reply);
        }
        if (action === 'close' && req.method === 'POST') { session.closed = true; await save(session); return send(200, { closed: true }); }
        throw safeError('Not found', 404);
      });
    } catch (error) { if (!res.headersSent) send(error.status ?? 400, { error: error.message }); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(options.port ?? Number(process.env.DEMO_PORT ?? manifest.port), '127.0.0.1', done); });
  return { server, manifest, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadDemoEnv, validateDemoConfig } = await import('./config.mjs');
  const config = await loadDemoEnv(process.env.DEMO_ID ?? '01');
  validateDemoConfig(config);
  const app = await startServer({ demoId: config.demo.id });
  console.log(`${app.manifest.title}: ${app.url}\nDemo walkthrough: ${app.url}/overview`);
}
