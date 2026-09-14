import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import { Agent, request as httpRequest } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startTriageServer } from "../src/server.mjs";

/**
 * HTTP regression tests for src/server.mjs.
 *
 * Every test starts the sample as a disposable child process so that a crash
 * (an unhandled rejection or an out-of-memory abort) is observed as the real
 * process dying, not as an exception inside the test runner. Nothing here
 * touches shared services or the default port 9110.
 *
 * Covered:
 *   - loopback binding by default; banner derived from the bound socket
 *   - aborted / reset request bodies must not terminate the service
 *   - a documented byte limit and body-read timeout; 413 / 408; bounded memory
 */

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "server.mjs");
const BANNER = /listening on (http:\/\/\S+)/;

const children = new Set();
after(async () => {
  for (const child of children) await stop(child);
});

// ---------------------------------------------------------------- helpers --

/**
 * Spawn `node src/server.mjs` with the given environment and resolve once the
 * startup banner has been printed. The returned record tracks stdout/stderr
 * and the exit status so a test can assert the process is still alive.
 */
async function startServer({ env = {}, nodeArgs = [], bannerTimeoutMs = 5000 } = {}) {
  // Let the child reserve its own ephemeral port; ignore unrelated runner config.
  const child = spawn(process.execPath, [...nodeArgs, SERVER], {
    env: { ...process.env, HOST: "", PORT: "0", TRIAGE_MAX_BODY_BYTES: "", TRIAGE_BODY_TIMEOUT_MS: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const record = { child, stdout: "", stderr: "", exit: null };
  children.add(child);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { record.stdout += chunk; });
  child.stderr.on("data", (chunk) => { record.stderr += chunk; });
  child.on("exit", (code, signal) => { record.exit = { code, signal }; });

  const banner = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no banner within ${bannerTimeoutMs}ms\nstdout: ${record.stdout}\nstderr: ${record.stderr}`)), bannerTimeoutMs);
    const check = () => {
      const m = BANNER.exec(record.stdout);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    };
    child.stdout.on("data", check);
    child.on("exit", () => { clearTimeout(timer); reject(new Error(`exited before banner: ${JSON.stringify(record.exit)}\nstderr: ${record.stderr}`)); });
    check();
  });
  record.banner = banner;
  record.url = new URL(banner);
  return record;
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 2000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  children.delete(child);
}

/** Wait a short grace period, then report whether the child is still running. */
async function stillAlive(record, graceMs = 300) {
  await new Promise((r) => setTimeout(r, graceMs));
  return record.exit === null;
}

function requestJson(url, { method = "GET", headers = {}, body, agent } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers, agent }, (res) => {
      let data = "";
      res.on("error", reject);
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* keep raw */ }
        resolve({ status: res.statusCode, headers: res.headers, text: data, json, socket: req.socket });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** A representative, valid triage call. Asserts only the HTTP contract. */
async function assertValidTriage(record) {
  const res = await requestJson(new URL("/v1/triage", record.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "please look at T-1043", session_id: "s-1" }),
  });
  assert.equal(res.status, 200, `expected a healthy 200, got ${res.status}: ${res.text}`);
  assert.equal(res.json?.session_id, "s-1");
  assert.equal(typeof res.json?.output, "string");
  assert.ok(Array.isArray(res.json?.steps));
}

/** Open a raw TCP connection to `port` on `host`; resolve true on connect. */
function canConnect(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const sock = connect({ host, port });
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

function hasIPv6Loopback() {
  return Object.values(networkInterfaces()).flat().some((i) => i && i.family === "IPv6" && i.address === "::1");
}

function externalIPv4() {
  return Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;
}

/**
 * Send raw bytes on a fresh socket and collect whatever the server writes
 * back until the socket closes, the server answers, or `waitMs` elapses.
 */
function rawExchange(port, { write, waitMs = 3000, host = "127.0.0.1" }) {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port });
    let response = "";
    let errored = null;
    const finish = () => { sock.destroy(); resolve({ response, sock, error: errored }); };
    const timer = setTimeout(finish, waitMs);
    sock.setEncoding("utf8");
    sock.on("data", (c) => {
      response += c;
      if (/\r\n\r\n/.test(response)) { clearTimeout(timer); finish(); }
    });
    sock.on("error", (e) => { errored = e; });
    sock.on("close", () => { clearTimeout(timer); finish(); });
    sock.once("connect", () => {
      Promise.resolve(write(sock)).catch(reject);
    });
  });
}

function statusOf(raw) {
  return Number(/^HTTP\/1\.1 (\d{3})/.exec(raw)?.[1] ?? 0);
}

const LIMIT = 65536; // bytes; the tests pin the limit via env so runs stay fast

// ---------------------------------------------------------- loopback binding --

test("banner reports the actually bound loopback address and real port (PORT=0)", async () => {
  const record = await startServer({ env: { PORT: "0", HOST: "" } });
  assert.equal(record.url.hostname, "127.0.0.1", `banner host: ${record.banner}`);
  const port = Number(record.url.port);
  assert.ok(Number.isInteger(port) && port > 0, `banner must show the real ephemeral port, got: ${record.banner}`);
  const res = await requestJson(new URL("/healthz", record.url));
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true });
  await stop(record.child);
});

test("default listener is loopback-only, not a wildcard socket", async () => {
  const record = await startServer({ env: { HOST: "" } });
  const port = Number(record.url.port);
  assert.equal(await canConnect("127.0.0.1", port), true, "loopback must be reachable");

  // Keep the port reserved while checking that an explicit PORT is honoured.
  // Ignoring the requested port would let a second server start elsewhere.
  await assert.rejects(startServer({ env: { PORT: String(port) } }), /EADDRINUSE/);

  // A wildcard listen() without a host binds `::` (dual-stack) and is therefore
  // reachable on IPv6 loopback and on every external interface. A loopback-only
  // listener refuses both. Each probe is used only when the host can run it.
  let probed = 0;
  if (hasIPv6Loopback()) {
    probed += 1;
    assert.equal(await canConnect("::1", port), false, "[::1] must not reach the default listener");
  }
  const ext = externalIPv4();
  if (ext) {
    probed += 1;
    assert.equal(await canConnect(ext, port), false, `${ext} must not reach the default listener`);
  }
  assert.ok(probed > 0, "no non-loopback probe available on this host; binding could not be verified");
  await stop(record.child);
});

test("explicit HOST override is honoured and reflected in the banner", async () => {
  const record = await startServer({ env: { HOST: "0.0.0.0" } });
  const port = Number(record.url.port);
  assert.equal(record.url.hostname, "0.0.0.0", `banner: ${record.banner}`);
  assert.equal(await canConnect("127.0.0.1", port), true);

  // Positive control, scoped to what 0.0.0.0 actually binds: Node treats it
  // as an IPv4-only wildcard, not dual-stack, so only the external-IPv4
  // probe applies here — [::1] is covered by the dual-stack test below.
  const ext = externalIPv4();
  if (ext) {
    assert.equal(await canConnect(ext, port), true, `${ext} must reach an explicit 0.0.0.0 listener`);
  }
  await stop(record.child);
});

test("HOST=:: is dual-stack and reachable on both IPv6 loopback and external IPv4 — positive control", async () => {
  // The original bug bound this exact dual-stack socket (`listen(port)` with
  // no host resolves to `::`). This test reproduces that socket family on
  // purpose, as a positive control for the refusal assertions in the
  // loopback-only test above: without it, canConnect() returning `false` for
  // a filtered or timed-out probe would be indistinguishable from a real
  // refusal, and that test could pass without proving anything.
  if (!hasIPv6Loopback()) return;
  const record = await startServer({ env: { HOST: "::" } });
  const port = Number(record.url.port);
  assert.equal(await canConnect("::1", port), true, "[::1] must reach a dual-stack listener");
  const ext = externalIPv4();
  if (ext) {
    assert.equal(await canConnect(ext, port), true, `${ext} must reach a dual-stack listener`);
  }
  await stop(record.child);
});

test("an empty HOST option does not fall through to a wildcard bind", async () => {
  // Only reachable through the programmatic API: env HOST="" is already
  // covered above via the CLI entrypoint and the `||` fallback in
  // startTriageServer resolves it the same way, but a caller passing
  // `{ host: "" }` must fall back through an empty environment to loopback.
  const inheritedHost = process.env.HOST;
  process.env.HOST = "";
  let server;
  try {
    server = await startTriageServer({ host: "", port: 0 });
    const address = server.address();
    assert.equal(address.address, "127.0.0.1", `expected loopback, got ${JSON.stringify(address)}`);
  } finally {
    if (inheritedHost === undefined) delete process.env.HOST;
    else process.env.HOST = inheritedHost;
    if (server) await new Promise((resolve) => server.close(resolve));
  }
});

// ------------------------------------------------------------- aborted bodies --

test("a reset mid-body does not terminate the service; a valid request follows", async () => {
  const record = await startServer();
  const port = Number(record.url.port);

  const { sock } = await rawExchange(port, {
    waitMs: 400,
    write: async (s) => {
      s.write("POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n");
      s.write("{\"input\":\"abcdefghij"); // 20 bytes of a declared 1000
      await new Promise((r) => setTimeout(r, 100));
      s.resetAndDestroy();
    },
  });
  sock.destroy();

  assert.equal(await stillAlive(record), true, `service died after a reset: ${JSON.stringify(record.exit)}\n${record.stderr}`);
  assert.doesNotMatch(record.stderr, /UnhandledPromiseRejection|Unhandled|ECONNRESET.*\n.*at /, `stderr shows an unhandled failure:\n${record.stderr}`);
  await assertValidTriage(record);
  await stop(record.child);
});

test("abort before any body byte does not terminate the service", async () => {
  const record = await startServer();
  const port = Number(record.url.port);

  const { sock } = await rawExchange(port, {
    waitMs: 400,
    write: async (s) => {
      s.write("POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n");
      await new Promise((r) => setTimeout(r, 100));
      s.resetAndDestroy();
    },
  });
  sock.destroy();

  assert.equal(await stillAlive(record), true, `service died: ${JSON.stringify(record.exit)}\n${record.stderr}`);
  await assertValidTriage(record);
  await stop(record.child);
});

test("fifty bounded aborts leave the service alive and responsive", async () => {
  const record = await startServer();
  const port = Number(record.url.port);
  for (let i = 0; i < 50; i += 1) {
    const { sock } = await rawExchange(port, {
      waitMs: 150,
      write: async (s) => {
        s.write(`POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n{"input":"${i}`);
        await new Promise((r) => setTimeout(r, 10));
        s.resetAndDestroy();
      },
    });
    sock.destroy();
  }
  assert.equal(await stillAlive(record), true, `service died: ${JSON.stringify(record.exit)}\n${record.stderr}`);
  await assertValidTriage(record);
  await stop(record.child);
});

// --------------------------------------------------------------- body limits --

test("an oversized declared Content-Length is rejected with 413 before the body arrives", async () => {
  const record = await startServer({ env: { TRIAGE_MAX_BODY_BYTES: String(LIMIT) } });
  const port = Number(record.url.port);

  const { response } = await rawExchange(port, {
    waitMs: 2500,
    write: (s) => {
      // Headers only: a limit-aware server must answer without waiting for 200 000 bytes.
      s.write(`POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: ${LIMIT * 3}\r\n\r\n`);
    },
  });
  assert.equal(statusOf(response), 413, `expected 413, raw response:\n${response || "<none>"}`);
  assert.equal(await stillAlive(record), true);
  await assertValidTriage(record);
  await stop(record.child);
});

test("an oversized chunked body is rejected with 413 while streaming", async () => {
  const record = await startServer({ env: { TRIAGE_MAX_BODY_BYTES: String(LIMIT) } });
  const port = Number(record.url.port);

  const piece = "x".repeat(8192);
  const chunk = `${piece.length.toString(16)}\r\n${piece}\r\n`;
  const { response } = await rawExchange(port, {
    waitMs: 3000,
    write: async (s) => {
      s.write("POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n");
      for (let sent = 0; sent < LIMIT * 3 && !s.destroyed; sent += piece.length) {
        if (!s.write(chunk)) await once(s, "drain").catch(() => {});
      }
      if (!s.destroyed) s.write("0\r\n\r\n");
    },
  });
  assert.equal(statusOf(response), 413, `expected 413, raw response:\n${response || "<none>"}`);
  assert.equal(await stillAlive(record), true);
  await assertValidTriage(record);
  await stop(record.child);
});

test("exact byte boundary — at the limit succeeds, one byte over is 413", async () => {
  const record = await startServer({ env: { TRIAGE_MAX_BODY_BYTES: String(LIMIT) } });
  const prefix = "{\"input\":\"";
  const suffix = "\"}";
  const overhead = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);

  const atLimit = prefix + "a".repeat(LIMIT - overhead) + suffix;
  assert.equal(Buffer.byteLength(atLimit), LIMIT);
  const ok = await requestJson(new URL("/v1/triage", record.url), {
    method: "POST", headers: { "content-type": "application/json" }, body: atLimit,
  });
  assert.equal(ok.status, 200, `at-limit body must succeed: ${ok.text}`);

  const overLimit = prefix + "a".repeat(LIMIT - overhead + 1) + suffix;
  assert.equal(Buffer.byteLength(overLimit), LIMIT + 1);
  const rejected = await requestJson(new URL("/v1/triage", record.url), {
    method: "POST", headers: { "content-type": "application/json" }, body: overLimit,
  }).catch((e) => ({ status: -1, text: String(e) }));
  assert.equal(rejected.status, 413, `one byte over must be 413: ${rejected.text}`);

  assert.equal(await stillAlive(record), true);
  await assertValidTriage(record);
  await stop(record.child);
});

test("the limit counts bytes, not characters (multibyte input)", async () => {
  const record = await startServer({ env: { TRIAGE_MAX_BODY_BYTES: String(LIMIT) } });
  const prefix = "{\"input\":\"";
  const suffix = "\"}";
  const euro = "€"; // 3 bytes in UTF-8
  // 22 000 characters is far below LIMIT as a character count but 66 000+ bytes.
  const chars = 22000;
  const body = prefix + euro.repeat(chars) + suffix;
  assert.ok(body.length < LIMIT, "character count is under the limit by design");
  assert.ok(Buffer.byteLength(body) > LIMIT, "byte count is over the limit by design");

  const res = await requestJson(new URL("/v1/triage", record.url), {
    method: "POST", headers: { "content-type": "application/json" }, body,
  }).catch((e) => ({ status: -1, text: String(e) }));
  assert.equal(res.status, 413, `multibyte body over the byte limit must be 413: ${res.text?.slice(0, 200)}`);

  // Multibyte content under the byte limit is still accepted and parsed.
  const under = prefix + euro.repeat(Math.floor((LIMIT - 12) / 3) - 10) + suffix;
  assert.ok(Buffer.byteLength(under) <= LIMIT);
  const okRes = await requestJson(new URL("/v1/triage", record.url), {
    method: "POST", headers: { "content-type": "application/json" }, body: under,
  });
  assert.equal(okRes.status, 200, `multibyte body under the byte limit must succeed: ${okRes.text?.slice(0, 200)}`);
  await assertValidTriage(record);
  await stop(record.child);
});

test("a stalled body hits the read timeout, gets 408, and resources are released", async () => {
  const record = await startServer({ env: { TRIAGE_BODY_TIMEOUT_MS: "600" } });
  const port = Number(record.url.port);

  const startedAt = Date.now();
  const { response } = await rawExchange(port, {
    waitMs: 4000,
    write: (s) => {
      s.write("POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n");
      s.write("{\"input\":\"partial"); // then stall forever
    },
  });
  const elapsed = Date.now() - startedAt;
  assert.equal(statusOf(response), 408, `expected 408 after the read deadline (waited ${elapsed}ms), raw:\n${response || "<none>"}`);
  assert.ok(elapsed < 3500, `timeout should fire near 600ms, took ${elapsed}ms`);
  assert.equal(await stillAlive(record), true);
  await assertValidTriage(record);
  await stop(record.child);
});

test("memory stays bounded under a constrained heap; same PID survives an oversized stream", async () => {
  const record = await startServer({
    nodeArgs: ["--max-old-space-size=32"],
    env: { TRIAGE_MAX_BODY_BYTES: String(LIMIT) },
  });
  const port = Number(record.url.port);
  const pid = record.child.pid;

  // Stream up to 150 MiB of chunked body from a reused 64 KiB buffer. A server
  // that buffers everything into one string exceeds a 32 MiB heap and aborts;
  // a bounded server answers 413 after LIMIT bytes and closes the socket.
  const piece = Buffer.alloc(65536, 0x78);
  const framed = Buffer.concat([Buffer.from(`${piece.length.toString(16)}\r\n`), piece, Buffer.from("\r\n")]);
  const cap = 150 * 1024 * 1024;
  let sent = 0;
  const { response } = await rawExchange(port, {
    waitMs: 20000,
    write: async (s) => {
      s.write("POST /v1/triage HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n");
      while (sent < cap && !s.destroyed) {
        if (!s.write(framed)) await once(s, "drain").catch(() => {});
        sent += piece.length;
      }
    },
  });

  assert.equal(await stillAlive(record), true, `process ${pid} died after ${sent} bytes: ${JSON.stringify(record.exit)}\n${record.stderr.slice(0, 800)}`);
  assert.equal(statusOf(response), 413, `expected 413, raw:\n${response || "<none>"}\nsent ${sent} bytes`);
  assert.equal(record.child.pid, pid);
  await assertValidTriage(record);
  await stop(record.child);
});

test("valid JSON still returns 400 for malformed bodies and the service keeps serving", async () => {
  const record = await startServer();
  const bad = await requestJson(new URL("/v1/triage", record.url), {
    method: "POST", headers: { "content-type": "application/json" }, body: "{not json",
  });
  assert.equal(bad.status, 400);
  await assertValidTriage(record);
  await stop(record.child);
});

// ---------------------------------------------------------- connection reuse --

test("a successful reply keeps the connection alive; a rejection closes it", { timeout: 5000 }, async (t) => {
  const record = await startServer({ env: { TRIAGE_MAX_BODY_BYTES: String(LIMIT) } });

  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  t.after(() => agent.destroy());
  const ok = await requestJson(new URL("/healthz", record.url), { agent });
  assert.equal(ok.status, 200);
  assert.match(String(ok.headers.connection), /keep-alive/i, `expected keep-alive, got: ${ok.headers.connection}`);

  const triage = await requestJson(new URL("/v1/triage", record.url), {
    agent, method: "POST", body: JSON.stringify({ input: "please look at T-1043" }),
  });
  assert.equal(triage.status, 200);
  assert.equal(triage.socket, ok.socket, "triage must reuse the health-check socket");
  const again = await requestJson(new URL("/healthz", record.url), { agent });
  assert.equal(again.socket, ok.socket, "successful triage must leave the same socket reusable");

  const rejected = await requestJson(new URL("/v1/triage", record.url), {
    agent, method: "POST",
    headers: { "content-type": "application/json", "content-length": String(LIMIT * 3) },
  }).catch((e) => ({ status: -1, headers: {}, text: String(e) }));
  assert.equal(rejected.status, 413);
  assert.match(String(rejected.headers.connection), /close/i, `expected close, got: ${rejected.headers.connection}`);
  if (!rejected.socket.destroyed) await once(rejected.socket, "close");

  await assertValidTriage(record);
  await stop(record.child);
});

test("healthz with a declared but unread body still answers 200 and closes the connection", async () => {
  const record = await startServer();
  const port = Number(record.url.port);

  // GET is not required to be bodyless. A declared body on /healthz that the
  // handler never reads must not leave the connection open waiting on — or
  // silently draining — bytes nobody asked for; the byte limit and timeout
  // above are scoped to /v1/triage and do not apply to this route.
  const { response } = await rawExchange(port, {
    waitMs: 1500,
    write: (s) => {
      s.write("GET /healthz HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000000\r\n\r\n");
    },
  });
  assert.equal(statusOf(response), 200, `expected 200, raw:\n${response || "<none>"}`);
  assert.match(response, /connection:\s*close/i, `expected the reply to close the connection, raw:\n${response}`);
  assert.equal(await stillAlive(record), true);
  await assertValidTriage(record);
  await stop(record.child);
});
