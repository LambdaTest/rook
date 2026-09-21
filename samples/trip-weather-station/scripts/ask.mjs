// Rook execute hook (rook/profile.yaml). The contract: read the goal from
// stdin, invoke the agent, and print ONE JSON object on stdout —
//   { agent_reply, conversation, calls[], usage }
// Multi-turn: the prior session id arrives as ROOK_CONVERSATION and is echoed
// back as `conversation`. Set TWS_URL to point at a twin (:9701..:9704).
const goal = await new Promise((resolve, reject) => {
  let text = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => resolve(text));
  process.stdin.on("error", reject);
});

const base = process.env.TWS_URL ?? "http://127.0.0.1:9700";
const response = await fetch(`${base}/v1/recommend`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: goal, session_id: process.env.ROOK_CONVERSATION || undefined }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`trip-weather-station returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

const body = await response.json();
console.log(JSON.stringify({
  agent_reply: body.output,
  conversation: body.session_id,
  calls: Array.isArray(body.steps) ? body.steps.map((step) => ({ name: step.tool, arguments: step.args ?? {} })) : [],
  usage: body.usage ? { input: body.usage.input_tokens, output: body.usage.output_tokens } : undefined,
}));
