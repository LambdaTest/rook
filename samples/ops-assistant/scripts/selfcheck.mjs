// Calls every Ops Assistant front-door endpoint with prompts that trigger every
// tool, checks the response format, and prints a pass/fail table.
// Usage: node scripts/selfcheck.mjs   (mock API and agent must be running)
import WebSocket from "ws";

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:9110";
const MOCK_API_URL = process.env.MOCK_API_URL ?? "http://127.0.0.1:9200";
const CASE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const ALL_TOOLS = ["get_order", "summarize_incident", "export_report", "tail_logs", "live_status"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CheckError extends Error {}
function expect(condition, message) {
  if (!condition) throw new CheckError(message);
}

function post(path, input) {
  return fetch(`${AGENT_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(CASE_TIMEOUT_MS),
  });
}

/** Check the HTTP status, reading the body only when it is wrong. */
async function expectStatus(res, status) {
  if (res.status !== status) throw new CheckError(`HTTP ${res.status}, expected ${status}: ${await res.text()}`);
}

function expectType(res, type) {
  const actual = res.headers.get("content-type") ?? "";
  expect(actual.startsWith(type), `content-type ${actual || "(none)"}, expected ${type}`);
}

function expectTool(toolCalls, name, ok = true) {
  const call = toolCalls.find((c) => c.name === name);
  const called = toolCalls.map((c) => `${c.name}${c.ok ? "" : "(error)"}`).join(", ") || "none";
  expect(call, `expected ${name} to be called; called: ${called}`);
  expect(call.ok === ok, `expected ${name} ok=${ok}, got ok=${call.ok}`);
}

/** Check the shared event stream used by NDJSON, SSE and WebSocket. */
function checkEvents(events, tool) {
  const types = events.map((e) => e.type);
  expect(!types.includes("error"), `error event: ${events.find((e) => e.type === "error")?.message}`);
  expect(types.at(-1) === "done", `last event is ${types.at(-1)}, expected done`);
  expect(types.filter((t) => t === "done").length === 1, "expected exactly one done event");
  const deltas = events.filter((e) => e.type === "delta");
  expect(deltas.length > 0, "no delta events");
  const toolCalls = events.filter((e) => e.type === "tool_call");
  expectTool(toolCalls, tool);
  expect(types.indexOf("tool_call") < types.lastIndexOf("delta"), "answer deltas arrived before the tool_call");
  const text = deltas.map((e) => e.text).join("");
  expect(text === events.at(-1).output, "joined deltas differ from done.output");
  return { toolCalls, text, detail: `${events.length} events (${toolCalls.length} tool_call, ${deltas.length} delta)` };
}

async function readLines(res, onLine) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const piece of res.body) {
    buffer += decoder.decode(piece, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      onLine(buffer.slice(0, newline).replace(/\r$/, ""));
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer) onLine(buffer);
}

const CASES = [
  {
    endpoint: "POST /v1/chat",
    prompt: "What's the status of order A-100?",
    tools: ["get_order"],
    run: async (prompt) => {
      const res = await post("/v1/chat", prompt);
      await expectStatus(res, 200);
      expectType(res, "application/json");
      const body = await res.json();
      expect(typeof body.output === "string" && Array.isArray(body.tool_calls), "missing output or tool_calls");
      expectTool(body.tool_calls, "get_order");
      expect(/shipped/i.test(body.output), `output does not say shipped: ${body.output}`);
      return { toolCalls: body.tool_calls, detail: body.output };
    },
  },
  {
    endpoint: "POST /v1/chat",
    prompt: "What's the status of order A-999?",
    tools: ["get_order (isError)"],
    run: async (prompt) => {
      const res = await post("/v1/chat", prompt);
      await expectStatus(res, 200);
      const body = await res.json();
      expectTool(body.tool_calls, "get_order", false);
      return { toolCalls: body.tool_calls, detail: body.output };
    },
  },
  {
    endpoint: "POST /v1/chat/text",
    prompt: "Summarize incident INC-2041.",
    tools: ["summarize_incident"],
    run: async (prompt) => {
      const res = await post("/v1/chat/text", prompt);
      await expectStatus(res, 200);
      expectType(res, "text/plain");
      const text = await res.text();
      expect(/latency|checkout/i.test(text), `text does not mention the checkout latency incident: ${text}`);
      return { toolCalls: null, detail: text };
    },
  },
  {
    endpoint: "POST /v1/chat/async",
    prompt: "Export the weekly report for checkout.",
    tools: ["export_report"],
    run: async (prompt) => {
      const res = await post("/v1/chat/async", prompt);
      await expectStatus(res, 202);
      const { job_id } = await res.json();
      expect(job_id, "no job_id");
      const began = Date.now();
      let pending = 0;
      while (Date.now() - began < CASE_TIMEOUT_MS) {
        const job = await (await fetch(`${AGENT_URL}/v1/jobs/${job_id}`)).json();
        if (job.status === "pending") {
          pending++;
          await sleep(POLL_INTERVAL_MS);
          continue;
        }
        expect(job.status === "done", `job ${job.status}: ${job.error ?? ""}`);
        expect(pending > 0, "job was never pending");
        expectTool(job.tool_calls, "export_report");
        expect(/99\.95/.test(job.output), `output lacks the report's uptime 99.95%: ${job.output}`);
        return { toolCalls: job.tool_calls, detail: `${pending} pending polls, then: ${job.output}` };
      }
      throw new CheckError("job did not finish in time");
    },
  },
  {
    endpoint: "POST /v1/chat/ndjson",
    prompt: "Show me the recent logs for payments.",
    tools: ["tail_logs"],
    run: async (prompt) => {
      const res = await post("/v1/chat/ndjson", prompt);
      await expectStatus(res, 200);
      expectType(res, "application/x-ndjson");
      const events = [];
      await readLines(res, (line) => line.trim() && events.push(JSON.parse(line)));
      const { toolCalls, text, detail } = checkEvents(events, "tail_logs");
      expect(/webhook|timeout/i.test(text), `answer does not mention the payments webhook errors: ${text}`);
      return { toolCalls, detail: `${detail}: ${text}` };
    },
  },
  {
    endpoint: "POST /v1/chat/sse",
    prompt: "What's the live status of all services right now?",
    tools: ["live_status"],
    run: async (prompt) => {
      const res = await post("/v1/chat/sse", prompt);
      await expectStatus(res, 200);
      expectType(res, "text/event-stream");
      const data = [];
      await readLines(res, (line) => line.startsWith("data:") && data.push(line.slice(5).trim()));
      expect(data.at(-1) === "[DONE]", `stream did not end with [DONE] (last: ${data.at(-1)})`);
      const events = data.slice(0, -1).map((d) => JSON.parse(d));
      const { toolCalls, text, detail } = checkEvents(events, "live_status");
      expect(/degraded/i.test(text) && /maintenance/i.test(text), `answer lacks payments degraded / search maintenance: ${text}`);
      return { toolCalls, detail: `${detail} + [DONE]: ${text}` };
    },
  },
  {
    endpoint: "WS /v1/chat/ws",
    prompt: "Is order A-300 still active?",
    tools: ["get_order"],
    run: (prompt) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${AGENT_URL.replace(/^http/, "ws")}/v1/chat/ws`);
        const events = [];
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new CheckError("timed out waiting for the server to close"));
        }, CASE_TIMEOUT_MS);
        ws.on("open", () => ws.send(JSON.stringify({ input: prompt })));
        ws.on("message", (data) => events.push(JSON.parse(data.toString())));
        ws.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        ws.on("close", (code) => {
          clearTimeout(timer);
          try {
            expect(code === 1000, `close code ${code}, expected 1000`);
            const { toolCalls, text, detail } = checkEvents(events, "get_order");
            expect(/cancel/i.test(text), `answer does not say cancelled: ${text}`);
            resolve({ toolCalls, detail: `${detail}, closed 1000: ${text}` });
          } catch (err) {
            reject(err);
          }
        });
      }),
  },
];

async function preflight() {
  for (const [name, url] of [["mock API", `${MOCK_API_URL}/health`], ["agent", `${AGENT_URL}/health`]]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error(`${name} is not reachable at ${url} (${err.cause?.code ?? err.message}). Start it first; see README.md.`);
      process.exit(2);
    }
  }
}

const oneLine = (s, max = 110) => {
  const flat = String(s ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

await preflight();
const rows = [];
const toolsSeen = new Set();
for (const [i, testCase] of CASES.entries()) {
  const started = Date.now();
  let row;
  try {
    const { toolCalls, detail } = await testCase.run(testCase.prompt);
    for (const call of toolCalls ?? []) toolsSeen.add(call.name);
    // Text responses carry no tool list. Their content check (incident details)
    // can only come from the tool, so count it as inferred.
    if (!toolCalls) testCase.tools.forEach((t) => toolsSeen.add(`${t.split(" ")[0]} (inferred)`));
    row = { result: "PASS", detail };
  } catch (err) {
    row = { result: "FAIL", detail: err instanceof CheckError ? err.message : `${err.name}: ${err.message}` };
  }
  rows.push({ n: i + 1, ...testCase, ...row, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  const last = rows.at(-1);
  console.log(`${last.result} ${last.n}. ${last.endpoint} (${last.seconds}s) ${oneLine(last.detail, 160)}`);
}

console.log("\n| # | Endpoint | Prompt | Expected tool | Result | Time | Detail |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.n} | ${r.endpoint} | ${r.prompt} | ${r.tools.join(", ")} | ${r.result} | ${r.seconds}s | ${oneLine(r.detail).replace(/\|/g, "\\|")} |`);
}
const missing = ALL_TOOLS.filter((t) => !toolsSeen.has(t) && !toolsSeen.has(`${t} (inferred)`));
const failed = rows.filter((r) => r.result === "FAIL").length;
console.log(`\n${rows.length - failed}/${rows.length} passed. Tools exercised: ${[...toolsSeen].join(", ")}${missing.length ? `. NOT exercised: ${missing.join(", ")}` : ""}`);
process.exit(failed || missing.length ? 1 : 0);
