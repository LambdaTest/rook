import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { manageSkills, AGENTS } from '../lib/installer.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const clients = ['.claude', '.agents', '.gemini'];

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'rook-skill-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const pkg = join(temp, 'package');
  cpSync(packageRoot, pkg, { recursive: true });
  const prefix = join(temp, 'prefix');
  const target = (client = '.agents') => join(prefix, client, 'skills', 'rook');
  const run = (...args) => spawnSync(process.execPath,
    [join(pkg, 'cli.js'), ...args, '--prefix', prefix], { encoding: 'utf8' });
  const ok = (...args) => {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result;
  };
  return { temp, pkg, prefix, target, run, ok };
}

test('default install copies the complete bundle to all three client homes', (t) => {
  const f = fixture(t);
  f.ok();
  for (const client of clients) {
    assert.equal(readFileSync(join(f.target(client), 'SKILL.md'), 'utf8'),
      readFileSync(join(f.pkg, 'skills/SKILL.md'), 'utf8'));
    assert.equal(readFileSync(join(f.target(client), 'references/verdicts.md'), 'utf8'),
      readFileSync(join(f.pkg, 'skills/references/verdicts.md'), 'utf8'));
    assert.equal(readFileSync(join(f.target(client), 'VERSION'), 'utf8'), '0.1.0\n');
  }
});

test('agent selection and repeated install preserve unrelated files', (t) => {
  const f = fixture(t);
  mkdirSync(f.prefix, { recursive: true });
  writeFileSync(join(f.prefix, 'keep.txt'), 'keep');
  f.ok('install', '--agent', 'codex');
  f.ok('install', '--agent', 'codex');
  assert.equal(existsSync(f.target('.claude')), false);
  assert.equal(readFileSync(join(f.prefix, 'keep.txt'), 'utf8'), 'keep');
});

test('update replaces unchanged owned copies and removes retired bundle files', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.pkg, 'skills/references/retired.md'), 'old');
  f.ok('install', '--agent', 'codex');
  rmSync(join(f.pkg, 'skills/references/retired.md'));
  writeFileSync(join(f.pkg, 'skills/references/new.md'), 'new');
  const metadata = JSON.parse(readFileSync(join(f.pkg, 'package.json'), 'utf8'));
  metadata.version = '0.2.0';
  writeFileSync(join(f.pkg, 'package.json'), JSON.stringify(metadata));
  f.ok('update', '--agent', 'codex');
  assert.equal(existsSync(join(f.target(), 'references/retired.md')), false);
  assert.equal(readFileSync(join(f.target(), 'references/new.md'), 'utf8'), 'new');
  assert.equal(readFileSync(join(f.target(), 'VERSION'), 'utf8'), '0.2.0\n');
});

test('uninstall removes only owned copies; missing copies are harmless', (t) => {
  const f = fixture(t);
  f.ok('install');
  f.ok('uninstall', '--agent', 'codex');
  f.ok('uninstall', '--agent', 'codex');
  assert.equal(existsSync(f.target()), false);
  assert.equal(existsSync(f.target('.claude')), true);
});

test('an unowned target prevents changes to every selected client', (t) => {
  const f = fixture(t);
  mkdirSync(f.target('.gemini'), { recursive: true });
  writeFileSync(join(f.target('.gemini'), 'mine.md'), 'personal skill');
  assert.notEqual(f.run('install').status, 0);
  assert.equal(existsSync(f.target('.claude')), false);
  assert.equal(readFileSync(join(f.target('.gemini'), 'mine.md'), 'utf8'), 'personal skill');
});

for (const action of ['update', 'uninstall']) {
  test(`${action} refuses local edits without deleting anything`, (t) => {
    const f = fixture(t);
    f.ok('install', '--agent', 'codex');
    writeFileSync(join(f.target(), 'SKILL.md'), 'my edited instructions');
    const result = f.run(action, '--agent', 'codex');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /modified|changed|edit/i);
    assert.equal(readFileSync(join(f.target(), 'SKILL.md'), 'utf8'), 'my edited instructions');
  });
}

test('extra files, empty directories, and removed files count as local changes', (t) => {
  const f = fixture(t);
  f.ok('install', '--agent', 'codex');
  writeFileSync(join(f.target(), 'notes.txt'), 'user notes');
  assert.notEqual(f.run('update', '--agent', 'codex').status, 0);
  rmSync(join(f.target(), 'notes.txt'));
  mkdirSync(join(f.target(), 'personal'));
  assert.notEqual(f.run('uninstall', '--agent', 'codex').status, 0);
  rmSync(join(f.target(), 'personal'), { recursive: true });
  rmSync(join(f.target(), 'references/verdicts.md'));
  assert.notEqual(f.run('uninstall', '--agent', 'codex').status, 0);
  assert.equal(existsSync(join(f.target(), 'SKILL.md')), true);
});

test('a target symlink is never followed or removed', (t) => {
  const f = fixture(t);
  const other = join(f.temp, 'other');
  mkdirSync(other);
  writeFileSync(join(other, 'mine'), 'keep');
  mkdirSync(dirname(f.target()), { recursive: true });
  symlinkSync(other, f.target(), 'dir');
  assert.notEqual(f.run('install', '--agent', 'codex').status, 0);
  assert.notEqual(f.run('uninstall', '--agent', 'codex').status, 0);
  assert.equal(readFileSync(join(other, 'mine'), 'utf8'), 'keep');
  assert.equal(existsSync(f.target()), true);
});

for (const component of ['.agents', '.agents/skills']) {
  test(`installation refuses a symlinked ${component} parent before changing any target`, (t) => {
    const f = fixture(t);
    const outside = join(f.temp, 'outside');
    mkdirSync(outside);
    const link = join(f.prefix, component);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(outside, link, 'dir');
    assert.notEqual(f.run('install').status, 0);
    assert.equal(existsSync(f.target('.claude')), false);
    assert.deepEqual(fs.readdirSync(outside), []);
  });
}

test('updates and uninstall refuse an owned tree moved behind a parent symlink', (t) => {
  const f = fixture(t);
  f.ok('install', '--agent', 'codex');
  const outside = join(f.temp, 'moved-client');
  fs.renameSync(join(f.prefix, '.agents'), outside);
  symlinkSync(outside, join(f.prefix, '.agents'), 'dir');
  for (const action of ['update', 'uninstall']) {
    assert.notEqual(f.run(action, '--agent', 'codex').status, 0);
    assert.equal(existsSync(join(outside, 'skills/rook/SKILL.md')), true);
  }
});

test('an explicitly selected prefix alias is resolved before client paths are checked', (t) => {
  const f = fixture(t);
  const actual = join(f.temp, 'actual-prefix');
  mkdirSync(actual);
  symlinkSync(actual, f.prefix, 'dir');
  f.ok('install', '--agent', 'codex');
  assert.equal(existsSync(join(actual, '.agents/skills/rook/SKILL.md')), true);
});

test('parent path conflicts are detected before installing any client', (t) => {
  const f = fixture(t);
  mkdirSync(f.prefix);
  writeFileSync(join(f.prefix, '.gemini'), 'not a directory');
  assert.notEqual(f.run('install').status, 0);
  assert.equal(existsSync(f.target('.claude')), false);
});

test('missing or symlinked source bundle fails without creating targets', (t) => {
  const f = fixture(t);
  symlinkSync(join(f.temp, 'outside'), join(f.pkg, 'skills/references/link.md'));
  assert.notEqual(f.run('install').status, 0);
  assert.equal(existsSync(f.target()), false);
  rmSync(join(f.pkg, 'skills'), { recursive: true });
  assert.notEqual(f.run('install').status, 0);
  assert.equal(existsSync(f.target()), false);
});

test('invalid commands, agents and options fail without installation', (t) => {
  const f = fixture(t);
  for (const args of [['erase'], ['install', '--agent', '../../outside'], ['--unknown']]) {
    assert.notEqual(f.run(...args).status, 0);
    assert.equal(existsSync(f.target()), false);
  }
  f.ok('--help');
});

test('a replacement failure restores copies already changed in the transaction', (t) => {
  const f = fixture(t);
  f.ok('install');
  const oldSkill = readFileSync(join(f.target(), 'SKILL.md'), 'utf8');
  writeFileSync(join(f.pkg, 'skills/SKILL.md'), `${oldSkill}\nUpdated bundle.\n`);
  const rename = fs.renameSync;
  let count = 0;
  t.mock.method(fs, 'renameSync', (...args) => {
    if (++count === 3) throw new Error('injected rename failure');
    return rename(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.throws(() => manageSkills({ action: 'update', agents: Object.keys(AGENTS),
    prefix: f.prefix, packageRoot: f.pkg }), /injected rename failure/);
  for (const client of clients) {
    assert.equal(readFileSync(join(f.target(client), 'SKILL.md'), 'utf8'), oldSkill);
    assert.deepEqual(fs.readdirSync(dirname(f.target(client))), ['rook']);
  }
});
