import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('release stamping accepts an explicit stable version and preserves metadata', async (t) => {
  const { stampVersion } = await import('../../scripts/prepare-skill-release.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'rook-skill-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'package.json');
  writeFileSync(file, JSON.stringify({ name: '@testmuai/rook-skill', version: '0.1.0', license: 'Apache-2.0' }));
  stampVersion(file, '1.2.3');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')),
    { name: '@testmuai/rook-skill', version: '1.2.3', license: 'Apache-2.0' });
  const before = readFileSync(file, 'utf8');
  for (const version of ['', 'major', 'v1.2.3', '01.2.3', '1.2', '1.2.3-rc.1', '1.2.3\n', "1.2.3';process.exit(0)//"]) {
    assert.throws(() => stampVersion(file, version), /version/i);
    assert.equal(readFileSync(file, 'utf8'), before);
  }
  writeFileSync(file, JSON.stringify({ name: 'other-package', version: '0.1.0' }));
  assert.throws(() => stampVersion(file, '1.2.3'), /package/i);
});
