import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, findDemo, setupDemoEnv } from '../shared/config.mjs';

const selector = process.argv[2];
const demos = selector ? [await findDemo(selector)] : JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')).demos;
for (const demo of demos) {
  const created = await setupDemoEnv(demo);
  console.log(`${demo.id}: ${created ? 'created .env; add only MODEL_API_KEY' : 'kept existing .env'}`);
}
