import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, symlink, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImportedArtifacts } from '../scripts/verify-import.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the imported evidence is complete and byte-identical to its source', async () => {
  const result = await checkImportedArtifacts(root);
  assert.equal(result.runs, 33);
  assert.equal(result.results, 50);
  assert.equal(result.editions, 8);
});

test('missing, altered or silently delisted recorded evidence fails verification', async t => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'industry artifacts ')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const provenance = JSON.parse(await readFile(join(root, 'import-provenance.json')));
  for (const file of ['import-provenance.json', 'catalog.json', ...provenance.immutableArtifacts]) {
    await mkdir(dirname(join(base, file)), { recursive: true });
    await copyFile(join(root, file), join(base, file));
  }
  const manifestPath = join(base, 'artifacts/reference/sample-runs.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const evidenceKey = Object.keys(manifest.runs[0].files).find(file => file.includes('/artifacts/'));
  assert.ok(evidenceKey, 'Mutation must remove collected evidence, not a required report/verdict file.');
  const evidencePath = join(base, manifest.runs[0].directory, evidenceKey);
  const evidenceBytes = await readFile(evidencePath);
  await mkdir(join(base, 'scripts'));
  for (const file of ['sample-runs.mjs', 'verify-import.mjs']) await copyFile(join(root, 'scripts', file), join(base, 'scripts', file));
  await symlink(join(root, 'node_modules'), join(base, 'node_modules'), 'dir');
  const gate = () => promisify(execFile)(process.execPath, [join(base, 'scripts/sample-runs.mjs'), 'gate', manifest.runs[0].id]);
  assert.match((await gate()).stdout, /ALLOW/);
  for (const [script, output] of [['sample-runs.mjs', /ALLOW/], ['verify-import.mjs', /594 artifacts, 33 runs, 50/]]) {
    const alias = join(base, `linked-${script}`);
    await symlink(join(base, 'scripts', script), alias);
    const result = await promisify(execFile)(process.execPath, [alias, 'gate', manifest.runs[0].id]);
    assert.match(result.stdout, output);
  }
  const delisted = structuredClone(manifest);
  delete delisted.runs[0].files[evidenceKey];
  await rm(evidencePath);
  await writeFile(manifestPath, JSON.stringify(delisted));
  await assert.rejects(gate(), /changed|ENOENT/);
  await writeFile(manifestPath, manifestBytes);
  await writeFile(evidencePath, evidenceBytes);
  await checkImportedArtifacts(base);
  await writeFile(evidencePath, Buffer.concat([evidenceBytes, Buffer.from('\nchanged\n')]));
  await assert.rejects(checkImportedArtifacts(base), /changed/);
  await rm(evidencePath);
  await assert.rejects(checkImportedArtifacts(base), /ENOENT/);
  await writeFile(evidencePath, evidenceBytes);
  for (const change of [
    m => m.runs.pop(),
    m => delete m.runs[0].files[Object.keys(m.runs[0].files)[0]],
    m => { m.runs[0].expectedDecision = 'block'; },
  ]) {
    const altered = structuredClone(manifest);
    change(altered);
    await writeFile(manifestPath, JSON.stringify(altered));
    await assert.rejects(checkImportedArtifacts(base), /changed/);
  }
  await writeFile(manifestPath, manifestBytes);
  assert.equal((await checkImportedArtifacts(base)).runs, 33);
});
