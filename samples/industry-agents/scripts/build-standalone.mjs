// Materialize complete editions. This is a maintainer command, never a runtime
// dependency: a copied edition needs only its own files and npm ci.
import { readFile, writeFile, mkdir, cp, access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStandaloneDocs } from './standalone-docs.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const catalog = JSON.parse(await readFile(join(root, 'catalog.json')));
const packageRoot = JSON.parse(await readFile(join(root, 'package.json')));
const lockRoot = JSON.parse(await readFile(join(root, 'package-lock.json')));
const runtime = ['domain.mjs', 'engine.mjs', 'config.mjs', 'server.mjs', 'mcp.mjs', 'rook-hook.mjs', 'rook-mcp-hook.mjs'];
const scripts = ['start.mjs', 'setup-env.mjs', 'check-model.mjs', 'mcp.mjs', 'prepare-rook.mjs', 'prepare-qe.mjs', 'seed-native.mjs', 'rook.mjs', 'rook-ci.mjs', 'check-full-category-runs.mjs'];
const exists = async path => { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const ciGuide = `## Run Rook in CI

This folder includes a portable [.testmuai/rook](.testmuai/rook/) template with 18 scenarios, HTTP profiles, hooks and a recorded native smoke run. After npm ci and npm run setup in this folder, provide your existing LT_USERNAME, LT_ACCESS_KEY and accessible Rook project:

\`\`\`bash
ROOK_ENV=prod npm run rook:ci -- --project PROJECT_ID
\`\`\`

The CI target defaults to fixture / hardened, so it needs no model API key. Rook evaluation uses your account. Each invocation writes to a new artifacts/local/rook-ci directory and preserves the supplied native workspace and earlier results. See [CI setup and evidence](docs/native-ci.md).

The [full-category model recording](docs/full-coverage.md) contains real Rook results for all 18 categories. Run \`npm run evidence:check\` to verify those saved files and coverage without making new model calls.

## Copying and preserving this demo

Copy this entire directory, including hidden files (for example, \`cp -R /path/to/this-demo /path/to/new-demo\`; avoid \`this-demo/*\`, which omits dotfiles). Then run \`npm ci\` and \`npm run setup\` inside the copy. No parent checkout, sibling demo, shared runtime directory or symlink is required.

Keep \`.testmuai/rook/\`: it contains the reusable sample project and its recorded run. \`sample-settings.json\` selects the CI template independently of your personal \`settings.json\`. Setup and regeneration preserve existing settings, definitions and evidence. New exploration/prepared workspaces must be empty; attempts to reuse a nonempty destination fail without deleting it. The QE runtime is included for the facilitator, while \`rook:prepare\` exports only requirements and connection material to the QE workspace.

The sample project and reviewed runs are versioned. Private project folders, account selection, credentials, caches and fresh CI output remain local. Before sharing a complete local copy, review its .env and private project data separately.
`;

function localDocs(text, demo) {
  const names = catalog.demos.map(d => `${d.domain}-agent${d.style === 'code' ? '-code' : ''}`);
  for (const name of names) {
    for (const command of ['rook:prepare', 'rook:ci', 'rook', 'setup', 'start', 'mcp']) {
      text = text.replaceAll(`npm run ${command} -- ${name}`, `npm run ${command} --`)
        .replaceAll(`npm start -- ${name}`, 'npm start');
    }
  }
  return text.replace(/npm run setup --\s*\n/g, 'npm run setup\n')
    .replaceAll('at the repository root', 'in this demo folder')
    .replaceAll('at the collection root (`samples/industry-agents`)', 'in this demo folder')
    .replaceAll('from the repository root', 'from this demo folder')
    .replaceAll('from the collection root', 'from this demo folder')
    .replaceAll('From the repository root:', 'From this demo folder:')
    .replaceAll('From the collection root:', 'From this demo folder:')
    .replaceAll('npm ci\ncd demos/' + demo.id, 'npm ci')
    .replaceAll('using the repository\'s saved versions', 'using this folder\'s saved versions')
    .replaceAll('Your .env, conversations and local reports are excluded from Git.', 'Your .env and private machine data stay local; the portable .testmuai sample and reviewed evidence are versioned.')
    .replaceAll('(../../docs/', '(docs/');
}

for (const demo of catalog.demos) {
  const directory = join(root, 'demos', demo.id);
  const name = `${demo.domain}-agent${demo.style === 'code' ? '-code' : ''}`;
  await mkdir(join(directory, 'runtime'), { recursive: true });
  await mkdir(join(directory, 'scripts'), { recursive: true });
  for (const file of runtime) {
    let text = await readFile(join(root, 'shared', file), 'utf8');
    if (file === 'server.mjs') text = text.replace("join(root, 'shared', 'web', file)", "join(root, 'runtime', 'web', file)");
    text = text.replaceAll("'banking-agent-code'", JSON.stringify(name));
    await writeFile(join(directory, 'runtime', file), text);
  }
  await cp(join(root, 'shared/web'), join(directory, 'runtime/web'), { recursive: true });
  const sourceDemo = catalog.demos.find(d => d.domain === demo.domain && d.style === 'code');
  const agent = (await readFile(join(root, 'demos', sourceDemo.id, 'agent.mjs'), 'utf8'))
    .replace('../../shared/domain.mjs', './runtime/domain.mjs');
  if (demo.style === 'code') await writeFile(join(directory, 'agent.mjs'), agent);
  else await writeFile(join(directory, 'runtime/agent.mjs'), agent.replace('./runtime/domain.mjs', './domain.mjs'));
  await writeFile(join(directory, 'runtime/registry.mjs'), `import { domain } from '${demo.style === 'code' ? '../agent.mjs' : './agent.mjs'}';\nexport const domains = { [domain.id]: domain };\n`);
  for (const file of scripts) {
    let text = await readFile(join(root, 'scripts', file), 'utf8');
    text = text.replaceAll("'../shared/", "'../runtime/").replaceAll("join(root, 'shared',", "join(root, 'runtime',")
      .replaceAll("join(root, 'demos', demo.id,", 'join(root,')
      .replaceAll("join(root, 'demos', config.demo.id)", 'root')
      .replaceAll("'banking-agent-code'", JSON.stringify(name))
      .replaceAll('from the repository root', 'from this demo folder')
      .replaceAll('from the collection root (samples/industry-agents)', 'from this demo folder');
    await writeFile(join(directory, 'scripts', file), text);
  }
  if (await exists(join(root, 'scripts/rook-sync-compat.mjs'))) await cp(join(root, 'scripts/rook-sync-compat.mjs'), join(directory, 'scripts/rook-sync-compat.mjs'));
  // Retain per-file evidence verification with an edition-local manifest.
  const gate = await readFile(join(root, 'scripts/sample-runs.mjs'), 'utf8');
  await writeFile(join(directory, 'scripts/sample-runs.mjs'), gate.replace("import { checkImportedArtifacts } from './verify-import.mjs';\n", '').replace('  await checkImportedArtifacts();\n', ''));
  const samples = JSON.parse(await readFile(join(root, 'artifacts/reference/sample-runs.json')));
  samples.runs = samples.runs.filter(run => run.directory.startsWith(`demos/${demo.id}/`)).map(run => ({ ...run, directory: run.directory.replace(`demos/${demo.id}/`, '') }));
  await mkdir(join(directory, 'artifacts/reference'), { recursive: true });
  await writeFile(join(directory, 'artifacts/reference/sample-runs.json'), JSON.stringify(samples, null, 2) + '\n');
  const pkg = { name: `rook-demo-${demo.id}`, private: true, type: 'module', engines: { node: '>=22' }, scripts: {
    setup: `node scripts/setup-env.mjs ${name}`, start: `node scripts/start.mjs ${name}`,
    'check:llm': `node scripts/check-model.mjs ${name}`, 'rook:prepare': `node scripts/prepare-rook.mjs ${name}`,
    'rook:setup': `node scripts/seed-native.mjs ${name}`, rook: `node scripts/rook.mjs ${name}`,
    mcp: `node scripts/mcp.mjs ${name}`, 'rook:ci': `node scripts/rook-ci.mjs ${name}`,
    'samples:check': 'node scripts/sample-runs.mjs', 'evidence:check': 'node scripts/check-full-category-runs.mjs',
  }, dependencies: packageRoot.dependencies };
  await writeFile(join(directory, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const lock = structuredClone(lockRoot);
  lock.name = pkg.name; delete lock.version;
  lock.packages[''] = { name: pkg.name, dependencies: pkg.dependencies, engines: pkg.engines };
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  await writeFile(join(directory, 'catalog.json'), JSON.stringify({ ...catalog, demos: [demo] }, null, 2) + '\n');
  await cp(join(root, 'docs'), join(directory, 'docs'), { recursive: true });
  for (const file of await readdir(join(directory, 'docs'))) {
    if (!file.endsWith('.md')) continue;
    const path = join(directory, 'docs', file);
    let text = localDocs(await readFile(path, 'utf8'), demo);
    text = text.replaceAll('cd samples/industry-agents', '# Run inside this demo folder')
      .replaceAll('node /absolute/path/to/rook-demo/scripts/mcp.mjs insurance-agent-code', `node /absolute/path/to/this-demo/scripts/mcp.mjs ${name}`)
      .replaceAll('npm run rook -- DEMO_NAME', 'npm run rook')
      .replaceAll('(../native-ci-runs.json)', '(../native-ci-runs.json)');
    await writeFile(path, text);
  }
  for (const file of ['README.md', 'runtime-setup.md', 'connection.md', 'agents-overview.md']) {
    const path = join(directory, file);
    let text = localDocs(await readFile(path, 'utf8'), demo);
    text = text.replace(/From the (?:repository root|collection root \(`samples\/industry-agents`\)):/g, 'From this demo folder:')
      .replace(`\`npm run demo -- ${name}\` from this demo folder`, '`npm start` from this demo folder');
    if (file === 'README.md') text = text.split('\n## Run Rook in CI')[0].trimEnd() + '\n\n' + ciGuide;
    await writeFile(path, text);
  }
  const packReadme = join(directory, 'rook/README.md');
  await writeFile(packReadme, (await readFile(packReadme, 'utf8')).replaceAll('(../../../docs/', '(../docs/'));
  const nativeManifest = JSON.parse(await readFile(join(root, 'native-ci-runs.json')));
  nativeManifest.runs = nativeManifest.runs.filter(run => run.demo === demo.id).map(run => ({ ...run, directory: run.directory.replace(`demos/${demo.id}/`, '') }));
  await writeFile(join(directory, 'native-ci-runs.json'), JSON.stringify(nativeManifest, null, 2) + '\n');
  if (await exists(join(root, 'full-category-runs.json'))) {
    const fullManifest = JSON.parse(await readFile(join(root, 'full-category-runs.json')));
    fullManifest.runs = fullManifest.runs.filter(run => run.demo === demo.id).map(run => ({ ...run, directory: run.directory.replace(`demos/${demo.id}/`, '') }));
    await writeFile(join(directory, 'full-category-runs.json'), JSON.stringify(fullManifest, null, 2) + '\n');
  }
  await writeStandaloneDocs(directory, demo, catalog.taxonomy);
  // Collection-wide historical references remain explicitly linked to their
  // published source; all operational instructions and dependencies are local.
  const collection = await exists(join(root, 'import-provenance.json'))
    ? 'https://github.com/LambdaTest/rook/blob/main/samples/industry-agents/'
    : 'https://github.com/4DvAnCeBoY/rook-demo/blob/main/';
  for (const file of await readdir(join(directory, 'docs'))) {
    if (!file.endsWith('.md')) continue;
    const path = join(directory, 'docs', file);
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replace(/\]\(\.\.\/(demos|media|artifacts)\/([^)]*)\)/g, (match, section, rest) => {
      if (section === 'demos' && rest.startsWith(demo.id + '/')) return `](../${rest.slice(demo.id.length + 1)})`;
      if (section === 'artifacts' && rest === 'reference/sample-runs.json') return match;
      return `](${collection}${section}/${rest})`;
    }));
  }
  await writeFile(join(directory, '.gitignore'), 'node_modules/\n.env\n.env.*\n!.env.example\n.demo-state/\nartifacts/local/\n*.log\n.DS_Store\n# Preserve the portable native workspace; private project selections stay local.\n.testmuai/rook/settings.json\n.testmuai/rook/projects/*/\n!.testmuai/rook/projects/sample-project/\n');
  // Setup and regeneration never touch .testmuai. Its authored template,
  // captured runs, and any user's project/evidence must survive byte-for-byte.
  console.log(`${demo.id}: standalone runtime, scripts, dependencies and docs`);
}
