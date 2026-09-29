#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A transparent MCP recording proxy.
 *
 * It speaks the same newline-delimited JSON-RPC as mcp/weather-server.mjs and
 * sits directly in front of it: every message from the client (rook) is
 * forwarded to the real server, and every reply straight back — so tools/list,
 * discovery, and results are untouched. The one thing it adds is an INDEPENDENT
 * record: each `tools/call` is appended to a trace file BEFORE it reaches the
 * server. Unlike the agent's self-reported `steps`, this log is written by a
 * separate process on the wire, so it is trusted evidence that a tool actually
 * ran — the observation rook's CALL-* / mcp_probe checks want.
 *
 *   .mcp.json → node mcp/recording-proxy.mjs   (proxy spawns the real server)
 *   env TWS_MCP_TARGET   path to the wrapped server (default mcp/weather-server.mjs)
 *   env TWS_TOOL_TRACE   trace file (default data/tool-trace.jsonl)
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = process.env.TWS_MCP_TARGET ?? resolve(HERE, "weather-server.mjs");
const TRACE = process.env.TWS_TOOL_TRACE ?? resolve(HERE, "..", "data", "tool-trace.jsonl");
mkdirSync(dirname(TRACE), { recursive: true });

const child = spawn("node", [TARGET], { stdio: ["pipe", "pipe", "inherit"] });
child.on("exit", (code) => process.exit(code ?? 0));

function record(entry) {
  try { appendFileSync(TRACE, JSON.stringify(entry) + "\n"); } catch { /* never break the wire on a log failure */ }
}

let inBuf = "";
process.stdin.on("data", (chunk) => {
  inBuf += chunk.toString();
  const lines = inBuf.split("\n");
  inBuf = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        if (msg.method === "tools/call") record({ at: new Date().toISOString(), id: msg.id ?? null, tool: msg.params?.name ?? null, arguments: msg.params?.arguments ?? {} });
      } catch { /* not JSON we care about — forward verbatim */ }
    }
    child.stdin.write(line + "\n");
  }
});
process.stdin.on("end", () => child.stdin.end());

child.stdout.on("data", (chunk) => process.stdout.write(chunk));
