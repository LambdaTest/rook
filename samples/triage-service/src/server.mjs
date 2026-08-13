import { createServer } from "node:http";
import { handle } from "./agent.mjs";

/**
 * HTTP in front of the agent.
 *
 * POST /v1/triage  { "input": "..." }  →  { "output": "...", "steps": [...] }
 *
 * A session id may be sent as `session_id`; it is echoed back so a multi-turn
 * profile has something to thread, which is the shape rook's `conversation`
 * block expects.
 */
const PORT = Number(process.env.PORT ?? 9110);

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/v1/triage")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "POST /v1/triage" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let request;
  try {
    request = JSON.parse(body || "{}");
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "body must be JSON" }));
    return;
  }

  try {
    const result = await handle(request);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      session_id: request.session_id ?? null,
      output: result.output,
      steps: result.steps,
      usage: { input_tokens: 0, output_tokens: 0 },
    }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, () => {
  process.stdout.write(`triage-service listening on http://127.0.0.1:${PORT}\n`);
});
