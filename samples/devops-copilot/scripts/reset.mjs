// Re-seed between scenarios (referenced by rook/profile.yaml `reset:`).
const base = process.env.DEVOPS_URL ?? "http://127.0.0.1:9610";
const res = await fetch(`${base}/v1/reset`, { method: "POST" });
if (!res.ok) { process.stderr.write(`reset failed: ${res.status}\n`); process.exit(1); }
process.stdout.write("devops-copilot reset\n");
