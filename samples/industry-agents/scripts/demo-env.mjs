import { demoName } from '../shared/config.mjs';
export function demoEnv(demo) {
  return `# ${demo.title}
# Set MODEL_API_KEY here or export it in the OS environment. Exported values win.
# Then run npm run check:llm and npm start.
MODEL_API_KEY=

# Already configured — no edits needed for this demo.
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4.1-mini
DEMO_BASE_URL=http://127.0.0.1:${demo.port}
`;
}

export function demoPackage(demo) {
  const selector = demoName(demo);
  return {
    name: `rook-demo-${demo.id}`, private: true, type: 'module', engines: { node: '>=22' },
    dependencies: { '@modelcontextprotocol/sdk': '1.30.0', 'js-yaml': '4.3.2', zod: '^3.25.0' },
    scripts: {
      setup: `node scripts/setup-env.mjs ${selector}`,
      start: `node scripts/start.mjs ${selector}`,
      'check:llm': `node scripts/check-model.mjs ${selector}`,
      'rook:setup': `node scripts/seed-native.mjs ${selector}`,
      rook: `node scripts/rook.mjs ${selector}`,
      mcp: `node scripts/mcp.mjs ${selector}`,
    },
  };
}
