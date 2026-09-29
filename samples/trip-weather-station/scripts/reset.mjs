// Re-seed the station between scenarios (referenced by rook/profile.yaml `reset:`).
const base = process.env.TWS_URL ?? "http://127.0.0.1:9700";
// reset is admin-gated; authenticate as the seeded admin (override with TWS_RESET_USER).
const res = await fetch(`${base}/v1/reset`, { method: "POST", headers: { "x-user": process.env.TWS_RESET_USER ?? "alice" } });
if (!res.ok) { process.stderr.write(`reset failed: ${res.status}\n`); process.exit(1); }
process.stdout.write("trip-weather-station reset\n");
