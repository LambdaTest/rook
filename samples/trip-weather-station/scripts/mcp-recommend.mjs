// Rook execute hook (rook/profile-mcp.yaml). Drives the `weather` MCP server
// declared in .mcp.json (through the recording proxy) and calls the `recommend`
// tool with the goal, so the grounded recommendation is exercised over MCP.
// Prints the Rook envelope { agent_reply, calls[] } on stdout.
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const goal = await new Promise((r, j) => { let t = ""; process.stdin.setEncoding("utf-8"); process.stdin.on("data", (c) => { t += c; }); process.stdin.on("end", () => r(t)); process.stdin.on("error", j); });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn("node", ["mcp/recording-proxy.mjs"], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
const responses = new Map();
let buf = "";
child.stdout.on("data", (d) => { buf += d; const lines = buf.split("\n"); buf = lines.pop() ?? ""; for (const l of lines) if (l.trim()) { try { const m = JSON.parse(l); responses.set(m.id, m); } catch {} } });
const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "recommend", arguments: { query: goal.trim() } } });

for (let i = 0; i < 300 && !responses.has(2); i++) await new Promise((r) => setTimeout(r, 25));
child.kill();

const msg = responses.get(2);
const text = msg?.result?.content?.[0]?.text ?? "";
let reply = text;
try { const parsed = JSON.parse(text); reply = parsed.output ?? parsed.message ?? JSON.stringify(parsed); } catch {}
console.log(JSON.stringify({ agent_reply: reply, calls: [{ name: "recommend", arguments: { query: goal.trim() } }] }));
