// Mock backend for the Ops Assistant. Each route answers in a different
// response format: NDJSON (logs), SSE (live status) and 202 + polling (reports).
// All data is fixed so the agent's answers can be checked.
import http from "node:http";
import { randomUUID } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MOCK_API_PORT ?? 9200);
const LOG_INTERVAL_MS = 100;
const STATUS_INTERVAL_MS = 200;
const REPORT_READY_MS = 3000;

const SERVICES = ["checkout", "payments", "inventory", "search"];

const LOGS = {
  checkout: [
    ["09:00:01", "INFO", "cart service warmed up"],
    ["09:00:04", "INFO", "order A-100 payment captured"],
    ["09:00:09", "WARN", "p95 latency 310 ms (threshold 300 ms)"],
    ["09:00:12", "INFO", "order A-200 queued for fulfilment"],
    ["09:00:15", "WARN", "retrying inventory reservation for order A-200"],
    ["09:00:18", "INFO", "inventory reservation succeeded for order A-200"],
    ["09:00:22", "INFO", "order A-300 cancelled by customer"],
    ["09:00:25", "INFO", "health check ok"],
  ],
  payments: [
    ["09:00:02", "INFO", "webhook listener started"],
    ["09:00:05", "ERROR", "webhook delivery failed: provider timeout after 10 s"],
    ["09:00:07", "WARN", "webhook retry 1/3 scheduled"],
    ["09:00:11", "ERROR", "webhook delivery failed: provider timeout after 10 s"],
    ["09:00:14", "WARN", "webhook retry 2/3 scheduled"],
    ["09:00:19", "INFO", "webhook delivered on retry 2"],
    ["09:00:23", "WARN", "error rate 2.4% over last 5 min"],
    ["09:00:26", "INFO", "health check degraded"],
  ],
  inventory: [
    ["09:00:01", "INFO", "stock sync started"],
    ["09:00:03", "INFO", "synced 1,284 SKUs"],
    ["09:00:08", "INFO", "reservation created for order A-200"],
    ["09:00:10", "INFO", "low stock: SKU-778 (4 left)"],
    ["09:00:16", "INFO", "reservation confirmed for order A-200"],
    ["09:00:20", "INFO", "stock sync finished in 19 s"],
    ["09:00:24", "INFO", "cache hit ratio 97%"],
    ["09:00:27", "INFO", "health check ok"],
  ],
  search: [
    ["09:00:02", "INFO", "index maintenance window opened"],
    ["09:00:06", "WARN", "serving from read replica during maintenance"],
    ["09:00:09", "INFO", "reindexed 40% of catalog"],
    ["09:00:13", "INFO", "reindexed 75% of catalog"],
    ["09:00:17", "WARN", "p95 latency 95 ms (elevated during reindex)"],
    ["09:00:21", "INFO", "reindexed 100% of catalog"],
    ["09:00:24", "INFO", "maintenance window remains open until 10:00"],
    ["09:00:28", "INFO", "health check maintenance"],
  ],
};

// Replayed in order on every /status/stream connection; the last event per
// service is its current status.
const STATUS_EVENTS = [
  { service: "checkout", status: "operational" },
  { service: "payments", status: "operational" },
  { service: "inventory", status: "operational" },
  { service: "search", status: "operational" },
  { service: "payments", status: "degraded", note: "webhook delivery failures, error rate 2.4%" },
  { service: "search", status: "maintenance", note: "reindex in progress until 10:00" },
];

const REPORTS = {
  checkout: "Weekly report for checkout: uptime 99.95%, 1 incident (INC-2041, resolved), p95 latency 310 ms, 18,420 orders.",
  payments: "Weekly report for payments: uptime 99.40%, 1 incident (INC-2042, monitoring), error rate 2.4%, 17,980 captures.",
  inventory: "Weekly report for inventory: uptime 100.00%, 0 incidents, p95 latency 120 ms, 1,284 SKUs synced daily.",
  search: "Weekly report for search: uptime 99.80%, 0 incidents, p95 latency 95 ms, scheduled reindex on Tuesday.",
};

const jobs = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function streamLogs(res, service) {
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  for (const [i, [time, level, message]] of LOGS[service].entries()) {
    if (i > 0) await sleep(LOG_INTERVAL_MS);
    res.write(`${JSON.stringify({ ts: `2026-10-06T${time}Z`, service, level, message })}\n`);
  }
  await sleep(LOG_INTERVAL_MS);
  res.end(`${JSON.stringify({ done: true })}\n`);
}

async function streamStatus(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const [i, event] of STATUS_EVENTS.entries()) {
    if (i > 0) await sleep(STATUS_INTERVAL_MS);
    res.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`);
  }
  await sleep(STATUS_INTERVAL_MS);
  res.end("data: [DONE]\n\n");
}

function reportState(job) {
  if (Date.now() - job.createdAt < REPORT_READY_MS) return { job_id: job.id, status: "pending" };
  return { job_id: job.id, status: "done", service: job.service, report: REPORTS[job.service] };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const started = Date.now();
  res.on("finish", () => console.log(`${req.method} ${url.pathname}${url.search} -> ${res.statusCode} (${Date.now() - started} ms)`));

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, services: SERVICES });
    }
    if (req.method === "GET" && url.pathname === "/logs") {
      const service = url.searchParams.get("service");
      if (!LOGS[service]) return sendJson(res, 404, { error: `unknown service: ${service}`, services: SERVICES });
      return await streamLogs(res, service);
    }
    if (req.method === "GET" && url.pathname === "/status/stream") {
      return await streamStatus(res);
    }
    if (req.method === "POST" && url.pathname === "/reports") {
      const { service } = await readJson(req);
      if (!REPORTS[service]) return sendJson(res, 400, { error: `unknown service: ${service}`, services: SERVICES });
      const job = { id: randomUUID(), service, createdAt: Date.now() };
      jobs.set(job.id, job);
      return sendJson(res, 202, { job_id: job.id });
    }
    const reportMatch = url.pathname.match(/^\/reports\/([^/]+)$/);
    if (req.method === "GET" && reportMatch) {
      const job = jobs.get(reportMatch[1]);
      if (!job) return sendJson(res, 404, { error: "unknown job" });
      return sendJson(res, 200, reportState(job));
    }
    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 400, { error: String(err.message ?? err) });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mock-api listening on http://${HOST}:${PORT}`);
});
