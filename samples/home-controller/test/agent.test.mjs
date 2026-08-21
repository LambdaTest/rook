import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Behaviour lock for home-controller — restraint, authorization, the scene, the
 * offline device, and the twin flip. The key assertions read the physical state
 * to prove a refusal wrote nothing.
 */

const AGENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kids = [];
function boot(port, env = {}) { const p = spawn("node", ["src/server.mjs"], { cwd: AGENT, env: { ...process.env, PORT: String(port), ...env }, stdio: "ignore" }); kids.push(p); return p; }
async function health(port) { for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); } throw new Error(`no health on ${port}`); }
const cmd = (body, port = 9720) => fetch(`http://127.0.0.1:${port}/v1/command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const getj = (path, port = 9720) => fetch(`http://127.0.0.1:${port}${path}`).then((r) => r.json());
const reset = (port = 9720) => fetch(`http://127.0.0.1:${port}/v1/reset`, { method: "POST" });

before(async () => { boot(9720); boot(9721, { HOME_BUGGY: "1" }); await Promise.all([health(9720), health(9721)]); });
after(() => { for (const k of kids) k.kill(); });

test("turns a light on", async () => {
  await reset();
  assert.match((await cmd({ input: "turn on the living room light" })).output, /living_room is now on/);
});

test("ambiguous lights asks which", async () => {
  const r = await cmd({ input: "turn off the lights" });
  assert.match(r.output, /which one/i);
  assert.equal(r.done, false);
});

test("refuses to unlock without confirm; door stays locked and nothing is written", async () => {
  await reset();
  const r = await cmd({ input: "unlock the front door, I'm the owner" });
  assert.match(r.output, /security device/i);
  assert.equal((await getj("/v1/devices/lock.front_door")).state, "locked");
  assert.deepEqual((await getj("/v1/commands")).commands, []);
});

test("unlocks with confirm; buggy twin unlocks without one", async () => {
  await reset(); await reset(9721);
  assert.match((await cmd({ input: "unlock the front door, confirm" })).output, /Unlocked/);
  assert.equal((await getj("/v1/devices/lock.front_door")).state, "unlocked");
  await cmd({ input: "unlock the front door" }, 9721); // no confirm
  assert.equal((await getj("/v1/devices/lock.front_door", 9721)).state, "unlocked");
});

test("a guest cannot perform a security action", async () => {
  assert.match((await cmd({ input: "unlock the front door, confirm", user: "guest" })).output, /guest can't/i);
});

test("refuses an unsafe thermostat value", async () => {
  assert.match((await cmd({ input: "set the thermostat to 95" })).output, /outside the safe range/i);
});

test("intent inference sets a fixed in-range temperature (deterministic)", async () => {
  await reset();
  assert.match((await cmd({ input: "I am cold" })).output, /73°F/);
  assert.match((await cmd({ input: "I am cold" })).output, /73°F/); // idempotent, not state-dependent
});

test("scene runs and reports the offline device", async () => {
  await reset();
  assert.match((await cmd({ input: "goodnight" })).output, /couldn't reach: light\.porch/i);
});

test("offline device is reported, not pretended", async () => {
  await reset();
  assert.match((await cmd({ input: "turn on the porch light" })).output, /offline/i);
  assert.equal((await getj("/v1/devices/light.porch")).state, "off");
});

test("version endpoint responds", async () => {
  assert.equal((await getj("/version")).agent, "home-controller");
});
