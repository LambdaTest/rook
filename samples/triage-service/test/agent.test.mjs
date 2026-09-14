import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const ids = ["T-1041", "T-1042", "T-1043"];

async function fixture(t) {
  // Each case imports its own in-memory ticket store, including reply records.
  const directory = await mkdtemp(join(tmpdir(), "triage-agent-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of ["agent.mjs", "tools.mjs"]) {
    await copyFile(new URL(`../src/${file}`, import.meta.url), join(directory, file));
  }
  const { handle } = await import(pathToFileURL(join(directory, "agent.mjs")));
  const { TOOLS, getTicket } = await import(pathToFileURL(join(directory, "tools.mjs")));
  const calls = [];
  for (const [name, tool] of Object.entries(TOOLS)) {
    const original = tool.fn;
    tool.fn = args => {
      calls.push({ tool: name, args: structuredClone(args) });
      return original(args);
    };
  }
  const snapshot = () => Object.fromEntries(ids.map(ticket_id => [ticket_id, getTicket({ ticket_id })]));
  return { handle, tools: TOOLS, calls, snapshot };
}

const rejected = [
  "Following up on T-10411, still broken",
  "T-10410",
  "T-104100000000000000000",
  "T-104",
  "T-",
  "T-nope",
  "T1041",
  "t-1041",
  "T-１０４１",
  "T–1041",
  "XT-1041",
  "T-1041x",
  "xT-1041y",
  "1T-1041",
  "_T-1041",
  "T-1041_",
  "éT-1041",
  "T-1041é",
  "T-1041\u0301",
  "T-1041\u200b",
  "T-1041-extra",
  "T-1041-T-1042",
  "T-1041 T-1042",
  "T-1042 T-1041",
  "T-1041,T-1042",
  "T-1041/T-1042",
  "T-1041\nT-1042",
  "T-1041 T-1041",
  "T-10411 T-1041",
  "T-1041 T-10411",
  "T-9999 T-1041",
  "T-1041 T-9999",
  "T-nope T-1041",
  "T-1041 T-nope",
  "t-1041 T-1042",
  "T1041 T-1042",
  "XT-1041 T-1042",
  "T-1042 XT-1041",
  "T-1041 and T-",
  "T -1041",
  "T - 1041",
  "T -1041 T-1042",
  "T - 1041 T-1042",
  "T-1042 T - 1041",
  "T\t-1041 T-1042",
  "T\n-1041 T-1042",
  "T −1041 T-1042",
  "",
  "Please look at my ticket",
  null,
  undefined,
  1041,
  ["T-1041"],
  { toString: () => "T-1041" },
];

for (const input of rejected) {
  test(`refuses ${JSON.stringify(input)} before any tool call`, async t => {
    const { handle, calls, snapshot } = await fixture(t);
    const before = snapshot();
    const response = await handle({ input });
    assert.deepEqual(calls, [], "the agent must not invoke even a read tool");
    assert.deepEqual(response.steps, []);
    assert.deepEqual(snapshot(), before, "all ticket fields and reply records must stay unchanged");
    assert.match(response.output, /ticket id/i);
    for (const ticket of Object.values(before)) {
      assert(!JSON.stringify(response).includes(ticket.customer), "no customer data in the response");
      assert(!JSON.stringify(response).includes(ticket.subject), "no ticket data in the response");
    }
  });
}

const accepted = [
  "T-1041",
  "T-1041 please",
  "please triage T-1041",
  "please triage T-1041 today",
  "(T-1041)",
  "[T-1041]",
  "{T-1041}",
  '"T-1041"',
  "'T-1041'",
  "`T-1041`",
  "T-1041.",
  "T-1041, please",
  "ticket:T-1041; thanks!",
  "T-1041?",
  "\tT-1041\r\n",
  "please\nT-1041\nthanks",
  "support-team: T-1041",
  "support - please triage T-1041",
];

for (const [input, id, severity, team] of [
  ...accepted.map(input => [input, "T-1041", "S2", "billing"]),
  ["T-1042", "T-1042", "S3", "support"],
  ["T-1043", "T-1043", "S1", "platform"],
]) {
  test(`triages the exact standalone identifier in ${JSON.stringify(input)}`, async t => {
    const { handle, calls, snapshot } = await fixture(t);
    const before = snapshot();
    const response = await handle({ input });
    const message = `Thanks for reporting this. We have logged ${id} as ${severity} and passed it to our ${team} team.`;
    const expectedCalls = [
      { tool: "get_ticket", args: { ticket_id: id } },
      { tool: "set_severity", args: { ticket_id: id, severity } },
      { tool: "assign_team", args: { ticket_id: id, team } },
      { tool: "reply_to_customer", args: { ticket_id: id, message } },
    ];
    assert.deepEqual(calls, expectedCalls);
    assert.deepEqual(response.steps.map(({ tool, args }) => ({ tool, args })), expectedCalls);
    assert.deepEqual(response.steps[0].result, before[id]);
    assert.deepEqual(response.steps[3].result, { ok: true, ticket_id: id, sent_to: before[id].customer });
    assert.deepEqual(snapshot(), {
      ...before,
      [id]: { ...before[id], severity, owner: team, reply: message },
    });
    assert.equal(response.output, `${id} triaged as ${severity} and assigned to ${team}.`);
  });
}

for (const id of ["T-9999", "T-0000"]) {
  test(`refuses unknown ${id} after only its exact lookup`, async t => {
    const { handle, calls, snapshot } = await fixture(t);
    const before = snapshot();
    const response = await handle({ input: `Please triage ${id}.` });
    assert.deepEqual(calls, [{ tool: "get_ticket", args: { ticket_id: id } }]);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(response, { output: `No ticket ${id} exists.`, steps: [] });
  });
}

test("does not disguise an unexpected lookup failure as an unknown ticket", async t => {
  const { handle, tools, snapshot } = await fixture(t);
  const before = snapshot();
  const failure = new Error("ticket store unavailable");
  tools.get_ticket.fn = () => { throw failure; };
  await assert.rejects(handle({ input: "T-1041" }), error => error === failure);
  assert.deepEqual(snapshot(), before);
});
