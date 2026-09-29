import { startServer } from '../runtime/server.mjs';
import { loadDemoEnv, validateDemoConfig } from '../runtime/config.mjs';

try {
  const config = await loadDemoEnv(process.argv[2] ?? process.env.DEMO_ID ?? "healthcare-agent-code");
  validateDemoConfig(config);
  const app = await startServer({ demoId: config.demo.id });
  console.log(`${app.manifest.title}\n${app.url}\nDemo walkthrough: ${app.url}/overview\nConfiguration: ${config.envFile}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
