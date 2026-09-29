// Re-seed the vault between scenarios (referenced by rook/profile.yaml `reset:`).
const base = process.env.KV_URL ?? "http://127.0.0.1:9600";
// reset is admin-gated; authenticate as the seeded admin (override with KV_RESET_USER).
const res = await fetch(`${base}/v1/reset`, { method: "POST", headers: { "x-user": process.env.KV_RESET_USER ?? "alice" } });
if (!res.ok) { process.stderr.write(`reset failed: ${res.status}\n`); process.exit(1); }
process.stdout.write("knowledge-vault reset\n");
