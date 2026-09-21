// Rook execute hook (rook/profile-attachment.yaml). Same envelope as ask.mjs,
// but hands the agent an itinerary to read (the text+file input path). The path
// defaults to the shipped example under docs/; override with TWS_ATTACHMENT.
const goal = await new Promise((resolve, reject) => {
  let text = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => resolve(text));
  process.stdin.on("error", reject);
});

const base = process.env.TWS_URL ?? "http://127.0.0.1:9700";
const documentPath = process.env.TWS_ATTACHMENT ?? "docs/sample-itinerary.md";
const response = await fetch(`${base}/v1/recommend`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: goal || "summarize this itinerary", document_path: documentPath }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`trip-weather-station returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

const body = await response.json();
console.log(JSON.stringify({
  agent_reply: body.output,
  calls: Array.isArray(body.steps) ? body.steps.map((step) => ({ name: step.tool, arguments: step.args ?? {} })) : [],
  usage: body.usage ? { input: body.usage.input_tokens, output: body.usage.output_tokens } : undefined,
}));
