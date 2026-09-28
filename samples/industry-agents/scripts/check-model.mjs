import { loadDemoEnv, validateDemoConfig } from '../shared/config.mjs';
import { createSession, executeTurn } from '../shared/engine.mjs';
import { domains } from '../shared/registry.mjs';

try {
  const config = await loadDemoEnv(process.argv[2] ?? 'banking-agent-code');
  validateDemoConfig(config);
  if (config.env.DEMO_ENGINE !== 'model') throw new Error('Set DEMO_ENGINE=model in this demo’s .env to check the LLM connection.');
  const goals = {
    banking: 'Read the balance of ACC-1001 using the account tool.',
    healthcare: 'Read PAT-100 record using the patient tool.',
    insurance: 'Read claim CLM-100 using the claim tool.',
    'customer-support': 'Read ORD-100 using the order tool.',
  };
  const domain = domains[config.demo.domain];
  console.log(`Checking the configured LLM for ${config.demo.title}…`);
  const session = createSession(domain, { engine: 'model', variant: 'hardened' });
  const result = await executeTurn(domain, session, goals[domain.id]);
  if (!result.calls.length || !result.output.trim()) throw new Error('The provider responded but did not complete the requested tool call and final reply. Check that the selected model supports function tools.');
  if (result.calls.every(call => call.output.status === 'denied')) throw new Error('The provider responded but every tool attempt was denied. Inspect model/tool compatibility before presenting.');
  console.log(`LLM connection passed. Observed tools: ${result.calls.map(call => call.name).join(', ')}.`);
  console.log(result.usage ? `Provider-reported tokens: ${result.usage.input} input, ${result.usage.output} output.` : 'Complete token usage was not returned; keep token-economy checks gated in Rook.');
  console.log('This checks one agent request. Run the Rook scenarios separately for a quality verdict.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
