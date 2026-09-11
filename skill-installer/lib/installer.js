import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const AGENTS = { 'claude-code': '.claude', codex: '.agents', 'gemini-cli': '.gemini' };
const PACKAGE = '@testmuai/rook-skill';
const MARKER = '.rook-skill-install.json';

function present(path) {
  try { return lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Include empty directories and reject links; ownership never authorizes following
// a skill symlink or removing files that were added after installation.
function inventory(root, relative = '') {
  const result = Object.create(null);
  for (const name of readdirSync(join(root, relative)).sort()) {
    if (!relative && name === MARKER) continue;
    const key = relative ? `${relative}/${name}` : name;
    const path = join(root, key);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) throw new Error(`Refusing symlink in skill: ${path}`);
    if (st.isDirectory()) {
      result[`${key}/`] = 'directory';
      Object.assign(result, inventory(root, key));
    } else if (st.isFile()) {
      result[key] = `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
    } else throw new Error(`Unsupported file type: ${path}`);
  }
  return result;
}

function stable(value) { return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))); }

function assertOwned(target) {
  const st = present(target);
  if (!st) return false;
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`Refusing non-directory or symlink target: ${target}`);
  const markerPath = join(target, MARKER);
  const markerStat = present(markerPath);
  if (!markerStat?.isFile() || markerStat.isSymbolicLink()) {
    throw new Error(`Existing skill is not owned by this installer: ${target}. Back it up or move it first.`);
  }
  let marker;
  try { marker = JSON.parse(readFileSync(markerPath, 'utf8')); } catch {
    throw new Error(`Invalid ownership record: ${markerPath}. Existing files were preserved.`);
  }
  if (marker?.schema !== 1 || marker.package !== PACKAGE || !marker.files ||
      typeof marker.files !== 'object' || Array.isArray(marker.files)) {
    throw new Error(`Unrecognized ownership record: ${markerPath}`);
  }
  if (stable(inventory(target)) !== stable(marker.files)) {
    throw new Error(`Locally modified skill: ${target}. Back up or move your edits before updating or uninstalling.`);
  }
  return true;
}

function canonicalPrefix(prefix) {
  let current = resolve(prefix);
  const missing = [];
  while (!present(current)) {
    missing.unshift(basename(current));
    current = dirname(current);
  }
  if (!statSync(current).isDirectory()) throw new Error(`Prefix is not a directory: ${current}`);
  return join(realpathSync(current), ...missing);
}

function assertParents(path, prefix) {
  for (let current = path;; current = dirname(current)) {
    const st = present(current);
    if (st?.isSymbolicLink()) throw new Error(`Refusing symlinked client or skills directory: ${current}`);
    if (st && !st.isDirectory()) throw new Error(`Parent is not a directory: ${current}`);
    if (current === prefix) break;
    if (dirname(current) === current) throw new Error('Target is outside the selected prefix.');
  }
}

export function manageSkills({ action, agents, prefix, packageRoot }) {
  // Resolve an explicitly selected prefix (including aliases such as /tmp),
  // then reject links below it rather than following client-directory links.
  prefix = canonicalPrefix(prefix);
  const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.name !== PACKAGE || typeof metadata.version !== 'string') throw new Error('Invalid skill package metadata.');
  const source = join(packageRoot, 'skills');
  if (action !== 'uninstall') {
    const st = present(source);
    if (!st?.isDirectory() || st.isSymbolicLink()) throw new Error('The packaged skills directory is missing or is a symlink.');
    inventory(source);
    if (!/^name:\s*rook\s*$/m.test(readFileSync(join(source, 'SKILL.md'), 'utf8'))) throw new Error('The packaged Rook SKILL.md is invalid.');
    if (present(join(source, MARKER)) || present(join(source, 'VERSION'))) throw new Error('The skill bundle contains reserved installer files.');
  }
  const plans = agents.map((agent) => {
    const target = join(prefix, AGENTS[agent], 'skills', 'rook');
    assertParents(dirname(target), prefix);
    return { agent, target, owned: assertOwned(target), lock: `${target}.installer-lock` };
  });
  const locked = [];
  let committed = false;
  try {
    for (const plan of plans) {
      if (action === 'uninstall' && !plan.owned) continue;
      assertParents(dirname(plan.target), prefix);
      mkdirSync(dirname(plan.target), { recursive: true });
      try { mkdirSync(plan.lock); } catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Another operation or a stale lock exists: ${plan.lock}. Check it before retrying.`);
        throw error;
      }
      locked.push(plan.lock);
      plan.owned = assertOwned(plan.target);
      if (action !== 'uninstall') {
        plan.stage = mkdtempSync(join(dirname(plan.target), '.rook-skill-stage-'));
        cpSync(source, plan.stage, { recursive: true });
        writeFileSync(join(plan.stage, 'VERSION'), `${metadata.version}\n`);
        writeFileSync(join(plan.stage, MARKER), `${JSON.stringify({ schema: 1, package: PACKAGE,
          version: metadata.version, files: inventory(plan.stage) }, null, 2)}\n`);
      }
    }
    // Keep old copies until every replacement succeeds, so a rename failure can
    // roll back earlier targets. Staging never merges with an existing skill.
    for (const plan of plans) {
      if (action === 'uninstall' && !plan.owned) continue;
      assertParents(dirname(plan.target), prefix);
      assertOwned(plan.target);
      if (present(plan.target)) {
        plan.backupRoot = mkdtempSync(join(dirname(plan.target), '.rook-skill-backup-'));
        plan.backup = join(plan.backupRoot, 'previous');
        renameSync(plan.target, plan.backup);
        plan.moved = true;
      }
      if (plan.stage) {
        renameSync(plan.stage, plan.target);
        plan.stage = null;
        plan.installed = true;
      }
    }
    committed = true;
  } catch (error) {
    const failures = [];
    for (const plan of [...plans].reverse()) {
      try {
        if (plan.installed) rmSync(plan.target, { recursive: true });
        if (plan.moved) { renameSync(plan.backup, plan.target); plan.moved = false; }
      } catch (rollbackError) { failures.push(`${plan.target}: ${rollbackError.message}; backup: ${plan.backup}`); }
    }
    if (failures.length) error.message += `\nRollback needs attention:\n${failures.join('\n')}`;
    throw error;
  } finally {
    for (const plan of plans) {
      if (plan.stage) rmSync(plan.stage, { recursive: true, force: true });
      // Preserve a backup if rollback failed; it may be the only remaining copy.
      if (plan.backupRoot && (committed || !plan.moved)) rmSync(plan.backupRoot, { recursive: true, force: true });
    }
    for (const lock of locked) rmSync(lock, { recursive: true, force: true });
  }
  return plans.map(({ agent, target, owned }) => ({ agent, target,
    message: action === 'uninstall' ? (owned ? 'Removed' : 'Not installed') : `Installed v${metadata.version}` }));
}
