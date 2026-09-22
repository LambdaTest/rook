import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const role = process.argv.includes('--target') ? 'target' : 'verifier';
const base = (process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:4310').replace(/\/$/, '');
const server = new McpServer({ name: `rook-demo-${role}`, version: '0.1.0' });
const session = z.string().uuid().describe('Exact conversation UUID from the agent response or hook state');
async function request(path, body) {
  const res = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.DEMO_API_TOKEN ? { Authorization: `Bearer ${process.env.DEMO_API_TOKEN}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(300000) });
  const value = await res.json();
  if (!res.ok) throw new Error(`Demo returned HTTP ${res.status}: ${value.error}`);
  return value;
}
const result = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
server.registerTool('inspect_session', { description: 'Read recorded effects, observed calls, traces, and verification gaps for one exact session. Never changes the target.', inputSchema: { session_id: session }, annotations: readOnly }, async ({ session_id }) => result(await request(`/api/sessions/${session_id}/evidence`)));
server.registerTool('read_business_effects', { description: 'Independently read the authoritative local synthetic business ledger. Empty effects means no business write is recorded. This tool cannot create a refund, transfer, booking, claim, settlement or handoff.', inputSchema: { session_id: session }, annotations: readOnly }, async ({ session_id }) => {
  const value = await request(`/api/sessions/${session_id}/evidence`);
  return result({ sessionId: session_id, domain: value.domain, effects: value.effects, engine: value.engine });
});
if (role === 'target') {
  server.registerTool('start_agent_session', { description: 'Create an isolated synthetic agent session, using the target server defaults unless overridden. This is a target action, not a verification tool.', inputSchema: { variant: z.enum(['vulnerable', 'hardened']).optional(), engine: z.enum(['fixture', 'model']).optional() }, annotations: { readOnlyHint: false, destructiveHint: false } }, async args => result(await request('/api/sessions', args)));
  server.registerTool('ask_agent', { description: 'Invoke the agent. May create synthetic business effects; never use this to verify whether an earlier action happened.', inputSchema: { session_id: session, goal: z.string().min(1).max(16000) }, annotations: { readOnlyHint: false, destructiveHint: false } }, async ({ session_id, goal }) => result(await request(`/api/sessions/${session_id}/chat`, { goal })));
  server.registerTool('close_agent_session', { description: 'Close an existing synthetic session while preserving evidence.', inputSchema: { session_id: session }, annotations: { readOnlyHint: false, destructiveHint: false } }, async ({ session_id }) => result(await request(`/api/sessions/${session_id}/close`, {})));
}
await server.connect(new StdioServerTransport());
