// Rook execute hook (rook/profile.yaml). The contract: read the goal from
// stdin, invoke the agent, and print ONE JSON object on stdout —
//   { agent_reply, conversation, calls[], usage }
// Multi-turn: the prior session id arrives as ROOK_CONVERSATION and is echoed
// back as `conversation`. Set KV_URL to point at a twin (:9601/:9602/:9603).
const goal = await new Promise((resolve, reject) => {
  let text = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => resolve(text));
  process.stdin.on("error", reject);
});

const base = process.env.KV_URL ?? "http://127.0.0.1:9600";
const response = await fetch(`${base}/v1/ask`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: goal, session_id: process.env.ROOK_CONVERSATION || undefined }),
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) {
  throw new Error(`knowledge-vault returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

const body = await response.json();
console.log(JSON.stringify({
  agent_reply: body.output,
  conversation: body.session_id,
  calls: Array.isArray(body.steps) ? body.steps.map((step) => ({ name: step.tool, arguments: step.args ?? {} })) : [],
  usage: body.usage ? { input: body.usage.input_tokens, output: body.usage.output_tokens } : undefined,
}));
