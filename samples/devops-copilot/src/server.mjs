import { createServer } from "node:http";
import { handle, manifest, reset, getStore, SYSTEM_PROMPT } from "./copilot.mjs";

/**
 * devops-copilot — a coding/system-automation assistant with a dangerous tool
 * surface. HTTP front door; the same brain also runs as a CLI (cli.mjs) and as
 * an async job runner (POST /v1/jobs + poll), so one agent exercises three of
 * rook's transports.
 *
 *   POST /v1/task    { "input": "run the tests", "session_id"? }  -> { output, steps, done, session_id, usage }
 *   POST /v1/jobs    { "input": "run the full CI pipeline" }      -> { job_id, status: "pending" }   (async)
 *   GET  /v1/jobs/:id                                             -> { job_id, status, output }
 *   GET  /v1/executed · GET /v1/patches · GET /v1/manifest · GET /version · GET /healthz · POST /v1/reset
 *
 * In memory, resets with the process (the sample/ safety rule). DEVOPS_BUGGY=1
 * drops the allow-list and the approval gate — it runs whatever it's asked.
 */

const PORT = Number(process.env.PORT ?? 9610);
const VERSION = "1.1.0";
const MAX_BODY = 256 * 1024;
const JOB_CAP = 50; // keep the jobs map from growing without bound on a long run
export { SYSTEM_PROMPT };

const sessions = new Map();
const jobs = new Map();

function json(res, code, body) { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }
async function readJson(req) { let raw = ""; for await (const c of req) { raw += c; if (raw.length > MAX_BODY) throw new Error("body too large"); } return JSON.parse(raw || "{}"); }
function log(req, t0) { if (process.env.DEBUG) process.stderr.write(`devops-copilot ${req.method} ${req.url} ${Date.now() - t0}ms\n`); }

const server = createServer(async (req, res) => {
  const t0 = Date.now();
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const p = url.pathname;
    if (req.method === "GET" && p === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "GET" && p === "/version") return json(res, 200, { agent: "devops-copilot", version: VERSION });
    if (req.method === "GET" && p === "/v1/manifest") return json(res, 200, manifest());
    if (req.method === "GET" && p === "/v1/executed") return json(res, 200, { executed: getStore().executed });
    if (req.method === "GET" && p === "/v1/patches") return json(res, 200, { patches: getStore().patches });
    if (req.method === "POST" && p === "/v1/reset") { reset(); sessions.clear(); jobs.clear(); return json(res, 200, { ok: true }); }

    if (req.method === "POST" && p === "/v1/task") {
      let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "body must be JSON and under 256KB" }); }
      const input = String(body.input ?? body.goal ?? "");
      const sid = body.session_id && sessions.has(body.session_id) ? body.session_id : `S-${(sessions.size + 1).toString().padStart(4, "0")}`;
      const { output, steps, session, done } = handle(input, sessions.get(sid) ?? {});
      sessions.set(sid, session);
      return json(res, 200, { output, steps, done, session_id: sid, usage: { input_tokens: Math.ceil(input.length / 4), output_tokens: Math.ceil(output.length / 4) } });
    }

    // Async job: return a handle immediately, complete after a fixed number of
    // polls (deterministic — no wall-clock, so a fast or slow poller sees the
    // same sequence).
    if (req.method === "POST" && p === "/v1/jobs") {
      let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "body must be JSON and under 256KB" }); }
      if (jobs.size >= JOB_CAP) jobs.delete(jobs.keys().next().value); // evict oldest
      const id = `job-${jobs.size + 1}-${sessions.size}`;
      const { output } = handle(String(body.input ?? body.goal ?? ""), {});
      jobs.set(id, { polls: 0, output });
      return json(res, 200, { job_id: id, status: "pending" });
    }
    let m;
    if (req.method === "GET" && (m = p.match(/^\/v1\/jobs\/(.+)$/))) {
      const job = jobs.get(m[1]);
      if (!job) return json(res, 404, { error: "no such job" });
      job.polls += 1;
      const done = job.polls >= 2;
      return json(res, 200, { job_id: m[1], status: done ? "completed" : "pending", output: done ? job.output : null });
    }

    return json(res, 404, { error: "POST /v1/task · POST /v1/jobs · GET /v1/executed" });
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: "internal error" });
  } finally {
    log(req, t0);
  }
});
server.listen(PORT, "127.0.0.1", () => process.stdout.write(`devops-copilot${process.env.DEVOPS_BUGGY === "1" ? " (buggy)" : ""} on http://127.0.0.1:${PORT}\n`));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => server.close(() => process.exit(0)));
process.on("unhandledRejection", (e) => process.stderr.write(`unhandledRejection: ${e}\n`));
