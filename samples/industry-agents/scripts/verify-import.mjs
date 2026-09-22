import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Pin the complete source manifest as well as the evidence it names. Otherwise
// removing a run or a file entry would silently reduce what a green replay proves.
export async function checkImportedArtifacts(base = root) {
  const provenance = JSON.parse(await readFile(join(base, 'import-provenance.json')));
  assert.ok(provenance.immutableArtifacts.includes('artifacts/reference/sample-runs.json'));
  for (const file of provenance.immutableArtifacts) {
    const path = resolve(base, file);
    const local = relative(base, path);
    assert.ok(!isAbsolute(local) && local !== '..' && !local.startsWith('../'), 'Artifact path escapes sample directory');
    const actual = createHash('sha256').update(await readFile(path)).digest('hex');
    assert.equal(actual, provenance.importedFiles[file], `${file}: imported evidence changed`);
  }
  const manifest = JSON.parse(await readFile(join(base, 'artifacts/reference/sample-runs.json')));
  const runs = manifest.runs.length;
  const results = manifest.runs.reduce((count, run) => count + run.scenarios.length, 0);
  const editions = new Set(manifest.runs.map(run => run.id.split('/')[0])).size;
  assert.equal(runs, provenance.expectedRuns);
  assert.equal(results, provenance.expectedResults);
  assert.equal(new Set(manifest.runs.map(run => run.id)).size, runs);
  assert.equal(editions, 8);
  return { artifacts: provenance.immutableArtifacts.length, runs, results, editions };
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkImportedArtifacts();
  console.log(`Source evidence verified: ${result.artifacts} artifacts, ${result.runs} runs, ${result.results} selected results across ${result.editions} editions.`);
}
