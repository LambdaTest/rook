import { loadDemoEnv } from '../runtime/config.mjs';

await loadDemoEnv(process.argv[2] ?? "healthcare-agent");
// The model credentials are only needed by the target HTTP service.
for (const key of ['MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY']) delete process.env[key];
await import('../runtime/mcp.mjs');
