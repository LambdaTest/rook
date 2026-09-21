import { createHash } from 'node:crypto';

// Feature revision contract inspected in Rook build 5be0db96's sync/manifest.ts.
// Keep false and zero; absent, null, empty strings and empty collections are equivalent.
const empty = value => value == null || value === '' || (Array.isArray(value) ? value.length === 0 : typeof value === 'object' && Object.values(value).every(empty));
const stable = value => value === null || typeof value !== 'object' ? JSON.stringify(value) ?? 'null'
  : Array.isArray(value) ? `[${value.map(stable).join(',')}]`
  : `{${Object.entries(value).filter(([, v]) => !empty(v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
export const rookContentHash = value => `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
