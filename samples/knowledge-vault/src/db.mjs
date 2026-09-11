import { DatabaseSync } from "node:sqlite";

/**
 * VaultDb — the durable local database, on built-in SQLite (`node:sqlite`, no
 * dependency). It is the system of record: documents plus the tables that make
 * the vault a real application — an audit trail, users + access rules, document
 * version history, and a data-driven synonym map. The vector index (in memory)
 * is derived from the `documents` rows on boot.
 *
 * File-backed (data/vault.db by default) or ":memory:" for a throwaway instance.
 */
export class VaultDb {
  constructor(path) {
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, domain TEXT NOT NULL, topic TEXT, text TEXT NOT NULL,
        confidential INTEGER NOT NULL DEFAULT 0, injected INTEGER NOT NULL DEFAULT 0,
        superseded INTEGER NOT NULL DEFAULT 0, effective TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS documents_domain ON documents(domain);

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, session_id TEXT, query TEXT,
        namespace TEXT, citations TEXT, confidential_hit INTEGER, outcome TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS acl (
        user_id TEXT NOT NULL, domain TEXT NOT NULL, PRIMARY KEY (user_id, domain)
      );

      CREATE TABLE IF NOT EXISTS document_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL, text TEXT,
        topic TEXT, domain TEXT, confidential INTEGER, at TEXT
      );
      CREATE INDEX IF NOT EXISTS versions_doc ON document_versions(doc_id);

      CREATE TABLE IF NOT EXISTS synonyms ( term TEXT PRIMARY KEY, canonical TEXT NOT NULL );
    `);

    this._insDoc = this.db.prepare(`INSERT OR REPLACE INTO documents (id,domain,topic,text,confidential,injected,superseded,effective,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    this._delDoc = this.db.prepare(`DELETE FROM documents WHERE id = ?`);
    this._getDoc = this.db.prepare(`SELECT * FROM documents WHERE id = ?`);
    this._allDoc = this.db.prepare(`SELECT * FROM documents ORDER BY rowid`);
    this._countDoc = this.db.prepare(`SELECT COUNT(*) AS n FROM documents`);

    this._insAudit = this.db.prepare(`INSERT INTO audit_log (at,session_id,query,namespace,citations,confidential_hit,outcome) VALUES (?,?,?,?,?,?,?)`);
    this._recentAudit = this.db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`);
    this._countAudit = this.db.prepare(`SELECT COUNT(*) AS n FROM audit_log`);

    this._insUser = this.db.prepare(`INSERT OR REPLACE INTO users (id,name,role) VALUES (?,?,?)`);
    this._getUser = this.db.prepare(`SELECT * FROM users WHERE id = ?`);
    this._allUsers = this.db.prepare(`SELECT * FROM users ORDER BY id`);
    this._countUsers = this.db.prepare(`SELECT COUNT(*) AS n FROM users`);
    this._grant = this.db.prepare(`INSERT OR IGNORE INTO acl (user_id,domain) VALUES (?,?)`);
    this._revoke = this.db.prepare(`DELETE FROM acl WHERE user_id = ? AND domain = ?`);
    this._aclOf = this.db.prepare(`SELECT domain FROM acl WHERE user_id = ?`);

    this._insVer = this.db.prepare(`INSERT INTO document_versions (doc_id,text,topic,domain,confidential,at) VALUES (?,?,?,?,?,?)`);
    this._versOf = this.db.prepare(`SELECT * FROM document_versions WHERE doc_id = ? ORDER BY id DESC`);

    this._setSyn = this.db.prepare(`INSERT OR REPLACE INTO synonyms (term,canonical) VALUES (?,?)`);
    this._allSyn = this.db.prepare(`SELECT * FROM synonyms ORDER BY term`);
    this._countSyn = this.db.prepare(`SELECT COUNT(*) AS n FROM synonyms`);
  }

  #now() { return new Date().toISOString(); }

  // ── documents ────────────────────────────────────────────────────────────
  isEmpty() { return this._countDoc.get().n === 0; }
  count() { return this._countDoc.get().n; }
  #writeDoc(d, createdAt) {
    const now = this.#now();
    this._insDoc.run(d.id, d.domain, d.topic ?? "", d.text, d.confidential ? 1 : 0, d.injected ? 1 : 0, d.superseded ? 1 : 0, d.effective ?? "2025-01-01", createdAt ?? d.created_at ?? now, now);
  }
  seed(docs) { this.db.exec("BEGIN"); try { for (const d of docs) this.#writeDoc(d); this.db.exec("COMMIT"); } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
  upsertDoc(d) { this.#writeDoc(d, this._getDoc.get(d.id)?.created_at); }
  deleteDoc(id) { return this._delDoc.run(id).changes > 0; }
  getDoc(id) { return this.#rowDoc(this._getDoc.get(id)); }
  allDocs() { return this._allDoc.all().map((r) => this.#rowDoc(r)); }
  #rowDoc(r) { return r ? { id: r.id, domain: r.domain, topic: r.topic, text: r.text, confidential: !!r.confidential, injected: !!r.injected, superseded: !!r.superseded, effective: r.effective } : undefined; }
  clear() { this.db.exec("DELETE FROM documents; DELETE FROM document_versions; DELETE FROM audit_log;"); }

  // ── audit_log ────────────────────────────────────────────────────────────
  logQuery(e) { this._insAudit.run(this.#now(), e.session_id ?? null, e.query ?? "", e.namespace ?? null, JSON.stringify(e.citations ?? []), e.confidential_hit ? 1 : 0, e.outcome ?? null); }
  #auditRow(r) { return { at: r.at, session_id: r.session_id, query: r.query, namespace: r.namespace, citations: JSON.parse(r.citations || "[]"), confidential_hit: !!r.confidential_hit, outcome: r.outcome }; }
  recentAudit(limit = 20) { return this._recentAudit.all(Math.min(Math.max(Number(limit) || 20, 1), 500)).map((r) => this.#auditRow(r)); }
  // Build a parameterised WHERE for the audit filters (outcome, session_id,
  // confidential_hit, since/until). `at` is an ISO string, so a lexical >=/<=
  // range is chronological.
  #auditWhere(f = {}) {
    const clauses = [], params = [];
    if (f.outcome) { clauses.push("outcome = ?"); params.push(String(f.outcome)); }
    if (f.session_id) { clauses.push("session_id = ?"); params.push(String(f.session_id)); }
    if (f.confidential_hit !== undefined) { clauses.push("confidential_hit = ?"); params.push(f.confidential_hit ? 1 : 0); }
    if (f.since) { clauses.push("at >= ?"); params.push(String(f.since)); }
    if (f.until) { clauses.push("at <= ?"); params.push(String(f.until)); }
    return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
  }
  queryAudit(f = {}) {
    const { where, params } = this.#auditWhere(f);
    const limit = Math.min(Math.max(Number(f.limit) || 20, 1), 500);
    const offset = Math.max(Number(f.offset) || 0, 0);
    return this.db.prepare(`SELECT * FROM audit_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map((r) => this.#auditRow(r));
  }
  auditCount(f = {}) { const { where, params } = this.#auditWhere(f); return where ? this.db.prepare(`SELECT COUNT(*) AS n FROM audit_log${where}`).get(...params).n : this._countAudit.get().n; }

  // ── users + acl ──────────────────────────────────────────────────────────
  usersEmpty() { return this._countUsers.get().n === 0; }
  seedUsers(users) { for (const u of users) { this._insUser.run(u.id, u.name ?? u.id, u.role ?? "member"); for (const d of u.domains ?? []) this._grant.run(u.id, d); } }
  addUser(u) { this._insUser.run(u.id, u.name ?? u.id, u.role ?? "member"); }
  getUser(id) { const r = this._getUser.get(id); return r ? { id: r.id, name: r.name, role: r.role } : undefined; }
  allUsers() { return this._allUsers.all().map((r) => ({ id: r.id, name: r.name, role: r.role, domains: this.allowedDomains(r.id) })); }
  grant(user, domain) { this._grant.run(user, domain); }
  revoke(user, domain) { return this._revoke.run(user, domain).changes > 0; }
  allowedDomains(user) { return this._aclOf.all(user).map((r) => r.domain); }

  // ── document_versions ────────────────────────────────────────────────────
  addVersion(d) { this._insVer.run(d.id, d.text, d.topic ?? null, d.domain, d.confidential ? 1 : 0, this.#now()); }
  versionsOf(id) { return this._versOf.all(id).map((r) => ({ version: r.id, text: r.text, topic: r.topic, domain: r.domain, confidential: !!r.confidential, at: r.at })); }

  // ── synonyms ─────────────────────────────────────────────────────────────
  synonymsEmpty() { return this._countSyn.get().n === 0; }
  seedSynonyms(entries) { for (const e of entries) this._setSyn.run(e.term, e.canonical); }
  addSynonym(term, canonical) { this._setSyn.run(term, canonical); }
  allSynonyms() { return this._allSyn.all().map((r) => ({ term: r.term, canonical: r.canonical })); }

  close() { this.db.close(); }
}
