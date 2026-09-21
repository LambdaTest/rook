import { loadDemoEnv } from '../shared/config.mjs';

await loadDemoEnv(process.argv[2] ?? 'banking-agent-code');
// The model credentials are only needed by the target HTTP service.
for (const key of ['MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY']) delete process.env[key];
await import('../shared/mcp.mjs');
