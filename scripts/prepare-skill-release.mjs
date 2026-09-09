import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      !version.split('.').every((part) => Number.isSafeInteger(Number(part)))) {
    throw new Error('Release version must be an explicit stable X.Y.Z version (for example 0.1.0).');
  }
  return version;
}

export function stampVersion(packageFile, version) {
  validateVersion(version);
  const metadata = JSON.parse(readFileSync(packageFile, 'utf8'));
  if (metadata.name !== '@testmuai/rook-skill') throw new Error('Unexpected package name; refusing to prepare a release.');
  metadata.version = version;
  writeFileSync(packageFile, `${JSON.stringify(metadata, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const version = validateVersion(process.env.SKILL_VERSION);
    if (process.argv[2] === '--check') {
      process.stdout.write(`Valid release version: ${version}\n`);
    } else if (process.argv.length === 2) {
      stampVersion(fileURLToPath(new URL('../skill-installer/package.json', import.meta.url)), version);
      process.stdout.write(`Prepared @testmuai/rook-skill@${version}\n`);
    } else throw new Error('Usage: prepare-skill-release.mjs [--check], with SKILL_VERSION set.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
