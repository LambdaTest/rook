import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function demoName(demo) {
  return `${demo.domain}-agent${demo.style === 'code' ? '-code' : ''}`;
}

export async function findDemo(selector = 'banking-agent-code', directory = root) {
  const catalog = JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8'));
  const demo = catalog.demos.find(d => demoName(d) === selector || d.id === selector || (/^\d+$/.test(selector) && d.id.startsWith(`${selector.padStart(2, '0')}-`)));
  if (!demo) throw new Error(`Choose a demo name: ${catalog.demos.map(demoName).join(', ')}. Existing numbers and directory IDs also work.`);
  return demo;
}

export async function setupDemoEnv(demo, directory = root) {
  const path = join(directory, 'demos', demo.id, '.env');
  const template = await readFile(`${path}.example`, 'utf8');
  try {
    await writeFile(path, template, { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

// Each CLI is a separate process. Shell values take precedence, and no root or
// sibling .env file is read. Parsing does not execute shell text or expand $VAR.
export async function loadDemoEnv(selector = 'banking-agent-code', { directory = root, env = process.env } = {}) {
  const demo = await findDemo(selector, directory);
  const envFile = join(directory, 'demos', demo.id, '.env');
  let values;
  try { values = parseEnv(await readFile(envFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`Missing ${envFile}. Run npm run setup -- ${demoName(demo)} from the collection root (samples/industry-agents), then add MODEL_API_KEY.`);
  }
  const baseOverride = env.DEMO_BASE_URL;
  for (const [key, value] of Object.entries(values)) if (env[key] === undefined) env[key] = value;
  env.DEMO_ENGINE ??= 'model';
  env.DEMO_VARIANT ??= 'vulnerable';
  env.DEMO_PORT ??= String(demo.port);
  if (!baseOverride && (!values.DEMO_BASE_URL || values.DEMO_BASE_URL === `http://127.0.0.1:${demo.port}`)) {
    env.DEMO_BASE_URL = `http://127.0.0.1:${env.DEMO_PORT}`;
  }
  env.DEMO_BASE_URL ||= `http://127.0.0.1:${env.DEMO_PORT}`;
  return { demo, envFile, env };
}

export function validateDemoConfig({ env = process.env, envFile = '.env' } = {}) {
  if (!['model', 'fixture'].includes(env.DEMO_ENGINE)) throw new Error(`Invalid DEMO_ENGINE in ${envFile}. Use model for the demo.`);
  if (!['vulnerable', 'hardened'].includes(env.DEMO_VARIANT)) throw new Error(`Invalid DEMO_VARIANT in ${envFile}. Use vulnerable or hardened.`);
  if (!/^\d+$/.test(env.DEMO_PORT ?? '') || Number(env.DEMO_PORT) > 65535) throw new Error(`Invalid DEMO_PORT in ${envFile}. Use a port from 0 through 65535.`);
  if (env.DEMO_ENGINE !== 'model') return;
  const missing = ['MODEL_BASE_URL', 'MODEL_NAME'].filter(key => !env[key]?.trim() || /^(your[-_]|replace[-_]|<)/i.test(env[key].trim()));
  if (missing.length) throw new Error(`Configure ${missing.join(' and ')} in ${envFile}; set MODEL_API_KEY if your provider requires it. No model request was sent.`);
  let url;
  try { url = new URL(env.MODEL_BASE_URL); } catch { /* Report the setting, never its value. */ }
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /\/chat\/completions\/?$/.test(url.pathname)) {
    throw new Error(`MODEL_BASE_URL in ${envFile} must be an HTTP(S) API base URL, usually ending in /v1, without credentials, query parameters or /chat/completions.`);
  }
  const provider = { 'api.openai.com': 'OpenAI', 'generativelanguage.googleapis.com': 'Gemini' }[url.hostname];
  if (provider && !env.MODEL_API_KEY?.trim()) {
    throw new Error(`Add MODEL_API_KEY to ${envFile}. The ${provider} URL and model are already configured. No model request was sent.`);
  }
}

export async function selectedRookProject(demo, directory = root) {
  // Rook's own selection stays authoritative; no project ID belongs in the
  // normal .env template. A folder-local selection takes precedence over root.
  for (const folder of [join(directory, 'demos', demo.id), directory]) {
    try {
      const settings = JSON.parse(await readFile(join(folder, '.testmuai', 'rook', 'settings.json'), 'utf8'));
      if (settings.active_project_id && settings.active_project_id !== 'sample-project') return settings.active_project_id;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
