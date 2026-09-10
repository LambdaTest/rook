import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS } from "./corpus.mjs";
import { MemoryStore } from "./store.mjs";
import { indexDoc, setSynonyms, addSynonym as addSynonymModule, getSynonyms, DEFAULT_SYNONYMS } from "./retrieval.mjs";
import { VaultDb } from "./db.mjs";

/**
 * The vault's storage facade — the database (documents, audit_log, users, acl,
 * document_versions, synonyms) and the search index behind one object, so the
 * HTTP and MCP servers share the same store, CRUD, access rules, and history.
 *
 *   backend "sqlite" (default): everything persists in data/vault.db.
 *   backend "memory": in-memory only (resets on exit).
 */

const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function seedDocs() { return DOCS.map((d) => ({ ...d, effective: d.effective ?? "2025-01-01" })); }

const SEED_USERS = [
  { id: "alice", name: "Alice Admin", role: "admin", domains: ["*"] },
  { id: "dave", name: "Dave Editor", role: "editor", domains: ["*"] },
  { id: "carol", name: "Carol Comms", role: "member", domains: ["HR", "IT", "Personal"] },
  { id: "guest", name: "Guest", role: "guest", domains: ["Personal"] },
];

// RBAC: which operations each role may perform. `read` is ask/search; the rest
// are the write operations on the database. Anonymous (no user) = read-only.
const PERMISSIONS = {
  admin: new Set(["read", "read_audit", "create", "edit", "delete", "revert", "grant", "revoke", "manage_users", "add_synonym"]),
  editor: new Set(["read", "create", "edit", "delete", "revert", "add_synonym"]),
  member: new Set(["read", "create", "edit"]),
  guest: new Set(["read"]),
  anon: new Set(["read"]),
};

// Does one in-memory audit entry match a query filter (memory backend parity
// with the SQL WHERE built in db.mjs)? Timestamps are ISO strings, so string
// comparison is chronological.
function auditMatches(e, f = {}) {
  if (f.outcome && e.outcome !== f.outcome) return false;
  if (f.session_id && e.session_id !== f.session_id) return false;
  if (f.confidential_hit !== undefined && !!e.confidential_hit !== !!f.confidential_hit) return false;
  if (f.since && !(String(e.at) >= String(f.since))) return false;
  if (f.until && !(String(e.at) <= String(f.until))) return false;
  return true;
}

export class Vault {
  constructor({ backend = process.env.VAULT_BACKEND ?? "sqlite", dbPath = process.env.VAULT_DB } = {}) {
    this.backend = backend === "memory" ? "memory" : "sqlite";
    this.rbac = process.env.KV_RBAC_OFF !== "1"; // the vulnerable twin sets KV_RBAC_OFF=1
    this.docs = new Map();
    this.vectors = new MemoryStore();
    this.last = null;
    this._audit = [];
    this._users = new Map();
    this._acl = new Map();
    this._versions = new Map();

    if (this.backend === "sqlite") {
      this.dbPath = dbPath ?? resolve(AGENT_ROOT, "data/vault.db");
      if (this.dbPath !== ":memory:") mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new VaultDb(this.dbPath);
      if (this.db.isEmpty()) this.db.seed(seedDocs());
      if (this.db.usersEmpty()) this.db.seedUsers(SEED_USERS);
      if (this.db.synonymsEmpty()) this.db.seedSynonyms(DEFAULT_SYNONYMS);
      setSynonyms(this.db.allSynonyms());
      for (const d of this.db.allDocs()) this.#index(d);
    } else {
      this.dbPath = null;
      this.db = null;
      setSynonyms(DEFAULT_SYNONYMS);
      for (const u of SEED_USERS) { this._users.set(u.id, { id: u.id, name: u.name, role: u.role }); this._acl.set(u.id, [...u.domains]); }
      for (const d of seedDocs()) this.#index(d);
    }
  }

  #index(doc) { this.docs.set(doc.id, doc); this.vectors.add(indexDoc(doc)); }

  // ── reads ──────────────────────────────────────────────────────────────────
  getDoc(id) { return this.docs.get(id); }
  hasDoc(id) { return this.docs.has(id); }
  allDocs() { return [...this.docs.values()]; }
  docCount() { return this.docs.size; }
  chunkCount() { return this.vectors.size(); }
  namespaces() { return this.vectors.namespaces(); }
  domainsSummary() {
    const by = new Map();
    for (const d of this.docs.values()) { const e = by.get(d.domain) ?? { domain: d.domain, documents: 0, confidential: 0 }; e.documents += 1; if (d.confidential) e.confidential += 1; by.set(d.domain, e); }
    return [...by.values()];
  }

  // ── document writes (+ version snapshot on edit) ────────────────────────────
  upsertDoc(doc) {
    const d = { ...doc, topic: doc.topic ?? `uploaded ${doc.id}`, effective: doc.effective ?? "2025-01-01" };
    const existing = this.docs.get(d.id);
    if (existing) this.#snapshot(existing); // record the pre-edit version
    if (this.db) this.db.upsertDoc(d);
    this.docs.set(d.id, d);
    this.vectors.removeDoc(d.id).add(indexDoc(d));
    return d;
  }
  deleteDoc(id) {
    if (!this.docs.has(id)) return false;
    if (this.db) this.db.deleteDoc(id);
    this.docs.delete(id);
    this.vectors.removeDoc(id);
    return true;
  }
  #snapshot(doc) {
    if (this.db) this.db.addVersion(doc);
    else { const list = this._versions.get(doc.id) ?? []; list.unshift({ version: list.length + 1, text: doc.text, topic: doc.topic, domain: doc.domain, confidential: !!doc.confidential, at: new Date().toISOString() }); this._versions.set(doc.id, list); }
  }

  // ── version history + revert ────────────────────────────────────────────────
  versionsOf(id) { return this.db ? this.db.versionsOf(id) : (this._versions.get(id) ?? []); }
  revert(id) {
    const versions = this.versionsOf(id);
    if (!versions.length) return null;
    const prev = versions[0]; // newest snapshot = the state before the last edit
    return this.upsertDoc({ id, domain: prev.domain, topic: prev.topic, text: prev.text, confidential: prev.confidential });
  }

  // ── audit log ────────────────────────────────────────────────────────────
  logQuery(e) { if (this.db) this.db.logQuery(e); else this._audit.push({ at: new Date().toISOString(), ...e }); }
  recentAudit(limit = 20) {
    if (this.db) return this.db.recentAudit(limit);
    return this._audit.slice(-limit).reverse();
  }
  // Paginated + filterable read of the audit trail, newest first. Returns the
  // page (`rows`) and the `total` matching the filter (ignoring limit/offset),
  // so a caller can page through every row. Works on both backends.
  queryAudit(f = {}) {
    if (this.db) return { total: this.db.auditCount(f), rows: this.db.queryAudit(f) };
    const matched = this._audit.filter((e) => auditMatches(e, f));
    const limit = Math.min(Math.max(Number(f.limit) || 20, 1), 500);
    const offset = Math.max(Number(f.offset) || 0, 0);
    return { total: matched.length, rows: matched.slice().reverse().slice(offset, offset + limit) };
  }
  auditCount(f) { return this.db ? this.db.auditCount(f) : this._audit.filter((e) => auditMatches(e, f)).length; }

  // ── users + access control ──────────────────────────────────────────────────
  getUser(id) { return this.db ? this.db.getUser(id) : this._users.get(id); }
  allUsers() { return this.db ? this.db.allUsers() : [...this._users.values()].map((u) => ({ ...u, domains: this._acl.get(u.id) ?? [] })); }
  addUser(u) { if (this.db) this.db.addUser(u); else this._users.set(u.id, { id: u.id, name: u.name ?? u.id, role: u.role ?? "member" }); }
  grant(user, domain) { if (this.db) this.db.grant(user, domain); else { const a = this._acl.get(user) ?? []; if (!a.includes(domain)) a.push(domain); this._acl.set(user, a); } }
  revoke(user, domain) { if (this.db) return this.db.revoke(user, domain); const a = this._acl.get(user) ?? []; const i = a.indexOf(domain); if (i < 0) return false; a.splice(i, 1); return true; }
  allowedDomains(user) { return this.db ? this.db.allowedDomains(user) : (this._acl.get(user) ?? []); }

  // ── RBAC ─────────────────────────────────────────────────────────────────
  roleOf(user) { if (!user) return "anon"; const u = this.getUser(user); return u ? u.role : "unknown"; }
  can(user, op) { if (!this.rbac) return true; const perms = PERMISSIONS[this.roleOf(user)]; return perms ? perms.has(op) : false; }

  // ── synonyms (data-driven retrieval) ─────────────────────────────────────────
  synonyms() { return getSynonyms(); }
  addSynonym(term, canonical) { addSynonymModule(term, canonical); if (this.db) this.db.addSynonym(String(term).toLowerCase(), String(canonical).toLowerCase()); return { term: String(term).toLowerCase(), canonical: String(canonical).toLowerCase() }; }

  reset() {
    if (this.db) { this.db.clear(); this.db.seed(seedDocs()); }
    this.docs = new Map();
    this.vectors = new MemoryStore();
    this._audit = [];
    this._versions = new Map();
    for (const d of (this.db ? this.db.allDocs() : seedDocs())) this.#index(d);
    this.last = null;
  }
}

export function openVault(opts) { return new Vault(opts); }
