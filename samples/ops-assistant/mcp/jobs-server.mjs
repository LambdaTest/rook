// jobs-server: tools that read the mock API's async, NDJSON and SSE endpoints.
// export_report sends MCP progress notifications while it polls.
import { MOCK_API_URL, errorResult, log, serveTools, textResult } from "./lib.mjs";

const POLL_INTERVAL_MS = 500;
const REPORT_TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text).error ?? text;
  } catch {
    return text;
  }
}

/** Yield each complete line of a streamed response body. */
async function* lines(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const piece of body) {
    buffer += decoder.decode(piece, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      yield buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) yield buffer;
}

const serviceInput = {
  type: "object",
  properties: { service: { type: "string", enum: ["checkout", "payments", "inventory", "search"] } },
  required: ["service"],
};

await serveTools("jobs-server", {
  export_report: {
    description: "Export the weekly report for a service. Starts a backend job and waits for it (a few seconds), sending progress updates.",
    inputSchema: serviceInput,
    handler: async ({ service }, extra) => {
      const start = await fetch(`${MOCK_API_URL}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service }),
      });
      if (start.status !== 202) return errorResult(`Report request failed (${start.status}): ${await errorBody(start)}`);
      const { job_id } = await start.json();

      const progressToken = extra._meta?.progressToken;
      const began = Date.now();
      for (let poll = 1; Date.now() - began < REPORT_TIMEOUT_MS; poll++) {
        const res = await fetch(`${MOCK_API_URL}/reports/${job_id}`);
        if (!res.ok) return errorResult(`Report status failed (${res.status}): ${await errorBody(res)}`);
        const job = await res.json();
        if (job.status === "done") return textResult(job.report);
        if (progressToken !== undefined) {
          const elapsed = ((Date.now() - began) / 1000).toFixed(1);
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: poll, message: `report ${job_id} pending (${elapsed}s)` },
          });
        }
        await sleep(POLL_INTERVAL_MS);
      }
      return errorResult(`Report ${job_id} was not ready after ${REPORT_TIMEOUT_MS / 1000}s.`);
    },
  },

  tail_logs: {
    description: "Read the recent log lines for a service (streamed from the backend as NDJSON) and return them as text.",
    inputSchema: serviceInput,
    handler: async ({ service }) => {
      const res = await fetch(`${MOCK_API_URL}/logs?service=${encodeURIComponent(service)}`);
      if (!res.ok) return errorResult(`Log request failed (${res.status}): ${await errorBody(res)}`);
      const out = [];
      for await (const line of lines(res.body)) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        if (entry.done) break;
        out.push(`${entry.ts} ${entry.level} ${entry.service}: ${entry.message}`);
      }
      log("jobs-server", `tail_logs read ${out.length} lines for ${service}`);
      return textResult(out.join("\n"));
    },
  },

  live_status: {
    description: "Get the current status of every service (read from the backend's live SSE status stream).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const res = await fetch(`${MOCK_API_URL}/status/stream`, { headers: { accept: "text/event-stream" } });
      if (!res.ok) return errorResult(`Status stream failed (${res.status}): ${await errorBody(res)}`);
      const latest = new Map();
      let events = 0;
      for await (const line of lines(res.body)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") break;
        const event = JSON.parse(data);
        latest.set(event.service, event);
        events++;
      }
      log("jobs-server", `live_status read ${events} events`);
      const text = [...latest.values()]
        .map(({ service, status, note }) => `${service}: ${status}${note ? ` (${note})` : ""}`)
        .join("\n");
      return textResult(text);
    },
  },
});
