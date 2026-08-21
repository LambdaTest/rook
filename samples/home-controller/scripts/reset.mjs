// Re-seed devices between scenarios (referenced by rook/profile.yaml `reset:`).
const base = process.env.HOME_URL ?? "http://127.0.0.1:9620";
const res = await fetch(`${base}/v1/reset`, { method: "POST" });
if (!res.ok) { process.stderr.write(`reset failed: ${res.status}\n`); process.exit(1); }
process.stdout.write("home-controller reset\n");
