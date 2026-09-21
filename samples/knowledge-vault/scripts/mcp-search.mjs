// Rook execute hook (rook/profile-mcp.yaml). Drives the vault MCP server over
// stdio JSON-RPC (the server .mcp.json declares, via the recording proxy) and
// calls the `search` tool with the goal — exercising retrieval grey-box over
// MCP. Prints the ranked passages as agent_reply plus the tool call.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const goal = await new Promise((resolve, reject) => {
  let text = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => resolve(text));
  process.stdin.on("error", reject);
});
const query = goal.trim();

const root = fileURLToPath(new URL("..", import.meta.url)); // the sample root
const server = process.env.KV_MCP_SERVER ?? "mcp/recording-proxy.mjs";
const child = spawn("node", [server], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });

const responses = new Map();
let buf = "";
child.stdout.setEncoding("utf-8");
child.stdout.on("data", (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.id != null) responses.set(m.id, m); } catch { /* not JSON-RPC we track */ }
  }
});
const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");

send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search", arguments: { query } } });
const deadline = Date.now() + 15_000;
while (!responses.has(1) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
child.kill();

const res = responses.get(1);
if (!res) throw new Error("vault MCP server did not answer tools/call search in time");
if (res.error) throw new Error(`vault MCP search error: ${res.error.message ?? JSON.stringify(res.error)}`);

console.log(JSON.stringify({
  agent_reply: res.result?.content?.[0]?.text ?? "[]",
  calls: [{ name: "search", arguments: { query } }],
}));
