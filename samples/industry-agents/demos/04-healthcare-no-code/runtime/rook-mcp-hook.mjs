import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const phase = process.argv[2] ?? process.env.ROOK_HOOK;
const directory = process.env.ROOK_STATE_DIR;
if (!directory) throw new Error('ROOK_STATE_DIR is required');
await mkdir(directory, { recursive: true });
const path = join(directory, 'mcp-session.json');
const client = new Client({ name: 'rook-agent-profile', version: '0.1.0' });
const env = Object.fromEntries(Object.entries(process.env).filter(([,v])=>v !== undefined));
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url)), ...(phase === 'collect' ? [] : ['--target'])], env }));
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find(c=>c.type==='text')?.text ?? 'MCP tool failed');
  return JSON.parse(result.content.find(c=>c.type==='text').text);
}
async function id() { return JSON.parse(await readFile(path,'utf8')).conversation; }
try {
  let result = {};
  if (phase === 'prepare') { const tools = await client.listTools(); result = { tools: tools.tools.map(t=>t.name) }; }
  else if (phase === 'open') {
    // Fault demonstrations use the HTTP hook; the MCP target keeps its schema minimal.
    result = await call('start_agent_session', { ...(process.env.DEMO_VARIANT ? { variant: process.env.DEMO_VARIANT } : {}), ...(process.env.DEMO_ENGINE ? { engine: process.env.DEMO_ENGINE } : {}) });
    await writeFile(path, JSON.stringify(result), { mode:0o600 });
  } else if (phase === 'execute') {
    let goal='';for await (const chunk of process.stdin) goal+=chunk;
    result = await call('ask_agent', { session_id: await id(), goal });
    result.agent_reply = result.output;
  } else if (phase === 'close') result = await call('close_agent_session', { session_id: await id() });
  else if (phase === 'collect') {
    const proof = await call('inspect_session', { session_id: await id() });
    const evidenceFile = resolve(directory,`evidence-${proof.sessionId}.json`);
    await writeFile(evidenceFile,JSON.stringify(proof,null,2));
    await writeFile(join(directory,'demo-evidence.json'),JSON.stringify(proof,null,2));
    result = { output:JSON.stringify({ sessionId:proof.sessionId,effects:proof.effects,verificationGaps:proof.verificationGaps }),conversation:proof.sessionId,calls:proof.calls,traces:proof.traces,
      evidence_file:evidenceFile,evidence_kind:'Collected synthetic target observations, not an agent-produced business artifact',...(proof.usage?{usage:proof.usage}:{}) };
  } else throw new Error(`Unsupported hook phase: ${phase}`);
  process.stdout.write(JSON.stringify(result));
} finally { await client.close(); }
