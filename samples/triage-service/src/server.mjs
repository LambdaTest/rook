import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { handle } from "./agent.mjs";

/**
 * HTTP in front of the agent.
 *
 * POST /v1/triage  { "input": "..." }  →  { "output": "...", "steps": [...] }
 *
 * A session id may be sent as `session_id`; it is echoed back so a multi-turn
 * profile has something to thread, which is the shape rook's `conversation`
 * block expects.
 *
 * Listener defaults (all overridable through the environment):
 *
 *   HOST                    127.0.0.1   bind address; set explicitly to expose
 *                                       the sample beyond this machine
 *   PORT                    9110        TCP port; 0 picks a free one
 *   TRIAGE_MAX_BODY_BYTES   1048576     request body limit in bytes (1 MiB);
 *                                       larger bodies get HTTP 413
 *   TRIAGE_BODY_TIMEOUT_MS  10000       deadline for receiving the whole body;
 *                                       a stalled upload gets HTTP 408
 *
 * The startup banner is derived from the socket that was actually bound, so
 * it reports the real address and port rather than the requested ones.
 */
export const DEFAULTS = Object.freeze({
  host: "127.0.0.1",
  port: 9110,
  maxBodyBytes: 1024 * 1024,
  bodyTimeoutMs: 10_000,
});

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Read the whole request body, enforcing a byte limit and a read deadline.
 *
 * Bytes are counted from the raw Buffer chunks, so multibyte characters and
 * chunked transfer encoding are measured correctly. Resolves with a Buffer;
 * rejects with an Error whose `code` is one of:
 *
 *   E_BODY_TOO_LARGE   more than `maxBytes` arrived (or were declared)
 *   E_BODY_TIMEOUT     the body did not finish within `timeoutMs`
 *   E_REQUEST_ABORTED  the client went away before the body completed
 *
 * Whatever the outcome, every listener and the timer are removed so a
 * rejected request holds no further resources.
 */
export function readRequestBody(req, { maxBytes, timeoutMs }) {
  const declared = req.headers["content-length"];
  if (declared !== undefined && Number(declared) > maxBytes) {
    return Promise.reject(bodyError("E_BODY_TOO_LARGE", `declared body of ${declared} bytes exceeds ${maxBytes}`));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
      req.off("close", onClose);
      fn(value);
    };

    const onData = (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.pause();
        settle(reject, bodyError("E_BODY_TOO_LARGE", `body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => settle(resolve, Buffer.concat(chunks, received));
    const onError = (err) => settle(reject, bodyError("E_REQUEST_ABORTED", err?.message ?? "request stream error"));
    const onAborted = () => settle(reject, bodyError("E_REQUEST_ABORTED", "client aborted the request"));
    const onClose = () => {
      // Closed without `end`: the connection dropped part-way through the body.
      if (!req.complete) settle(reject, bodyError("E_REQUEST_ABORTED", "connection closed before the body completed"));
    };
    const timer = setTimeout(() => {
      req.pause();
      settle(reject, bodyError("E_BODY_TIMEOUT", `body not received within ${timeoutMs}ms`));
    }, timeoutMs);

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
    req.on("close", onClose);
  });
}

function bodyError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Write a JSON reply if the connection can still take one. `close` marks a
 * reply after which the request body may still be unread: the header makes
 * Node end the socket once the reply has flushed instead of draining it.
 */
function sendJson(res, status, payload, { close = false } = {}) {
  if (res.headersSent || res.destroyed || !res.socket?.writable) return false;
  const headers = { "content-type": "application/json" };
  if (close) headers.connection = "close";
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
  return true;
}

/**
 * Answer a body-read failure at the request boundary. The reply closes the
 * connection, so the rest of an oversized or stalled body is never read. When
 * no reply can be written (the client aborted, or the socket is already gone)
 * the response is destroyed outright so the request holds nothing further.
 */
function rejectBody(res, err, limits) {
  let answered = false;
  if (err.code === "E_BODY_TOO_LARGE") {
    answered = sendJson(res, 413, { error: `body must be at most ${limits.maxBodyBytes} bytes` }, { close: true });
  } else if (err.code === "E_BODY_TIMEOUT") {
    answered = sendJson(res, 408, { error: `body must arrive within ${limits.bodyTimeoutMs}ms` }, { close: true });
  }
  if (!answered) res.destroy();
}

async function handleRequest(req, res, limits) {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/v1/triage")) {
    sendJson(res, 404, { error: "POST /v1/triage" }, { close: true });
    return;
  }

  let body;
  try {
    body = await readRequestBody(req, { maxBytes: limits.maxBodyBytes, timeoutMs: limits.bodyTimeoutMs });
  } catch (err) {
    rejectBody(res, err, limits);
    return;
  }

  let request;
  try {
    request = JSON.parse(body.length ? body.toString("utf8") : "{}");
  } catch {
    sendJson(res, 400, { error: "body must be JSON" });
    return;
  }

  try {
    const result = await handle(request);
    sendJson(res, 200, {
      session_id: request.session_id ?? null,
      output: result.output,
      steps: result.steps,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

/**
 * Build the HTTP server without listening. Every request runs inside its own
 * observed promise: a rejection is answered (500 when still possible) and
 * never escapes as an unhandled rejection that would end the process.
 */
export function createTriageServer(options = {}) {
  const limits = {
    maxBodyBytes: positiveInt(options.maxBodyBytes ?? process.env.TRIAGE_MAX_BODY_BYTES, DEFAULTS.maxBodyBytes),
    bodyTimeoutMs: positiveInt(options.bodyTimeoutMs ?? process.env.TRIAGE_BODY_TIMEOUT_MS, DEFAULTS.bodyTimeoutMs),
  };

  return createServer((req, res) => {
    handleRequest(req, res, limits).catch((err) => {
      if (!sendJson(res, 500, { error: err?.message ?? "internal error" })) res.destroy();
    });
  });
}

/** Bind and resolve with the listening server; `server.address()` is authoritative. */
export function startTriageServer(options = {}) {
  const host = options.host ?? (process.env.HOST || DEFAULTS.host);
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : DEFAULTS.port);
  const server = createTriageServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

/** Render a bound address as a URL, bracketing IPv6 literals. */
export function formatAddress(address) {
  const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
  return `http://${host}:${address.port}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startTriageServer()
    .then((server) => {
      process.stdout.write(`triage-service listening on ${formatAddress(server.address())}\n`);
    })
    .catch((err) => {
      process.stderr.write(`triage-service failed to start: ${err.message}\n`);
      process.exit(1);
    });
}
