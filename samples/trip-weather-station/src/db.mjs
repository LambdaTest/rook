import { DatabaseSync } from "node:sqlite";

/**
 * StationDb — the durable local database, on built-in SQLite (`node:sqlite`, no
 * dependency). It is the system of record for the trip advisor: destinations,
 * saved trips, the weather cache (with a fetched_at that decides freshness), an
 * audit trail, users + access rules, trip version history, and the activity
 * profiles the advisor matches against.
 *
 * File-backed (data/station.db by default) or ":memory:" for a throwaway.
 */
export class StationDb {
  constructor(path) {
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT, zone TEXT NOT NULL,
        lat REAL, lon REAL, note TEXT, injected INTEGER NOT NULL DEFAULT 0,
        severe TEXT, normals TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS locations_zone ON locations(zone);

      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY, location_id TEXT NOT NULL, title TEXT, when_ TEXT,
        party INTEGER, owner TEXT, confidential INTEGER NOT NULL DEFAULT 0,
        note TEXT, created_at TEXT, updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS weather_cache (
        location_id TEXT NOT NULL, kind TEXT NOT NULL, reading TEXT,
        fetched_at TEXT, PRIMARY KEY (location_id, kind)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, session_id TEXT, query TEXT,
        activity TEXT, citations TEXT, unsafe_hit INTEGER, outcome TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS acl (
        user_id TEXT NOT NULL, zone TEXT NOT NULL, PRIMARY KEY (user_id, zone)
      );

      CREATE TABLE IF NOT EXISTS trip_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT NOT NULL, title TEXT,
        location_id TEXT, when_ TEXT, party INTEGER, note TEXT, confidential INTEGER, at TEXT
      );
      CREATE INDEX IF NOT EXISTS versions_trip ON trip_versions(trip_id);

      CREATE TABLE IF NOT EXISTS activities (
        name TEXT PRIMARY KEY, profile TEXT NOT NULL
      );
    `);

    this._insLoc = this.db.prepare(`INSERT OR REPLACE INTO locations (id,name,country,zone,lat,lon,note,injected,severe,normals,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    this._delLoc = this.db.prepare(`DELETE FROM locations WHERE id = ?`);
    this._getLoc = this.db.prepare(`SELECT * FROM locations WHERE id = ?`);
    this._allLoc = this.db.prepare(`SELECT * FROM locations ORDER BY rowid`);
    this._countLoc = this.db.prepare(`SELECT COUNT(*) AS n FROM locations`);

    this._insTrip = this.db.prepare(`INSERT OR REPLACE INTO trips (id,location_id,title,when_,party,owner,confidential,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    this._delTrip = this.db.prepare(`DELETE FROM trips WHERE id = ?`);
    this._getTrip = this.db.prepare(`SELECT * FROM trips WHERE id = ?`);
    this._allTrip = this.db.prepare(`SELECT * FROM trips ORDER BY rowid`);

    this._getCache = this.db.prepare(`SELECT * FROM weather_cache WHERE location_id = ? AND kind = ?`);
    this._setCache = this.db.prepare(`INSERT OR REPLACE INTO weather_cache (location_id,kind,reading,fetched_at) VALUES (?,?,?,?)`);

    this._insAudit = this.db.prepare(`INSERT INTO audit_log (at,session_id,query,activity,citations,unsafe_hit,outcome) VALUES (?,?,?,?,?,?,?)`);
    this._recentAudit = this.db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`);
    this._countAudit = this.db.prepare(`SELECT COUNT(*) AS n FROM audit_log`);

    this._insUser = this.db.prepare(`INSERT OR REPLACE INTO users (id,name,role) VALUES (?,?,?)`);
    this._getUser = this.db.prepare(`SELECT * FROM users WHERE id = ?`);
    this._allUsers = this.db.prepare(`SELECT * FROM users ORDER BY id`);
    this._countUsers = this.db.prepare(`SELECT COUNT(*) AS n FROM users`);
    this._grant = this.db.prepare(`INSERT OR IGNORE INTO acl (user_id,zone) VALUES (?,?)`);
    this._revoke = this.db.prepare(`DELETE FROM acl WHERE user_id = ? AND zone = ?`);
    this._aclOf = this.db.prepare(`SELECT zone FROM acl WHERE user_id = ?`);

    this._insVer = this.db.prepare(`INSERT INTO trip_versions (trip_id,title,location_id,when_,party,note,confidential,at) VALUES (?,?,?,?,?,?,?,?)`);
    this._versOf = this.db.prepare(`SELECT * FROM trip_versions WHERE trip_id = ? ORDER BY id DESC`);

    this._setAct = this.db.prepare(`INSERT OR REPLACE INTO activities (name,profile) VALUES (?,?)`);
    this._allAct = this.db.prepare(`SELECT * FROM activities ORDER BY name`);
    this._countAct = this.db.prepare(`SELECT COUNT(*) AS n FROM activities`);
  }

  #now() { return new Date().toISOString(); }

  // ── locations ──────────────────────────────────────────────────────────────
  isEmpty() { return this._countLoc.get().n === 0; }
  #writeLoc(l, createdAt) {
    const now = this.#now();
    this._insLoc.run(l.id, l.name, l.country ?? "", l.zone, l.lat ?? null, l.lon ?? null, l.note ?? null, l.injected ? 1 : 0,
      l.severe ? JSON.stringify(l.severe) : null, JSON.stringify({ tHigh: l.tHigh ?? null, precip: l.precip ?? null }),
      createdAt ?? l.created_at ?? now, now);
  }
  seedLocations(locs) { this.db.exec("BEGIN"); try { for (const l of locs) this.#writeLoc(l); this.db.exec("COMMIT"); } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
  upsertLoc(l) { this.#writeLoc(l, this._getLoc.get(l.id)?.created_at); }
  deleteLoc(id) { return this._delLoc.run(id).changes > 0; }
  getLoc(id) { return this.#rowLoc(this._getLoc.get(id)); }
  allLocs() { return this._allLoc.all().map((r) => this.#rowLoc(r)); }
  #rowLoc(r) {
    if (!r) return undefined;
    const n = r.normals ? JSON.parse(r.normals) : {};
    return { id: r.id, name: r.name, country: r.country, zone: r.zone, lat: r.lat, lon: r.lon,
      note: r.note ?? undefined, injected: !!r.injected, severe: r.severe ? JSON.parse(r.severe) : undefined,
      tHigh: n.tHigh ?? undefined, precip: n.precip ?? undefined };
  }

  // ── trips ──────────────────────────────────────────────────────────────────
  #writeTrip(t, createdAt) {
    const now = this.#now();
    this._insTrip.run(t.id, t.location_id, t.title ?? "", t.when ?? t.when_ ?? null, t.party ?? null, t.owner ?? null,
      t.confidential ? 1 : 0, t.note ?? null, createdAt ?? t.created_at ?? now, now);
  }
  seedTrips(trips) { for (const t of trips) this.#writeTrip(t); }
  upsertTrip(t) { this.#writeTrip(t, this._getTrip.get(t.id)?.created_at); }
  deleteTrip(id) { return this._delTrip.run(id).changes > 0; }
  getTrip(id) { return this.#rowTrip(this._getTrip.get(id)); }
  allTrips() { return this._allTrip.all().map((r) => this.#rowTrip(r)); }
  #rowTrip(r) { return r ? { id: r.id, location_id: r.location_id, title: r.title, when: r.when_, party: r.party, owner: r.owner, confidential: !!r.confidential, note: r.note ?? undefined } : undefined; }

  // ── weather_cache ──────────────────────────────────────────────────────────
  getCache(locationId, kind) { const r = this._getCache.get(locationId, kind); return r ? { location_id: r.location_id, kind: r.kind, reading: JSON.parse(r.reading || "null"), fetched_at: r.fetched_at } : undefined; }
  setCache(locationId, kind, reading, fetchedAt) { this._setCache.run(locationId, kind, JSON.stringify(reading), fetchedAt ?? this.#now()); }

  // ── audit_log ──────────────────────────────────────────────────────────────
  logQuery(e) { this._insAudit.run(this.#now(), e.session_id ?? null, e.query ?? "", e.activity ?? null, JSON.stringify(e.citations ?? []), e.unsafe_hit ? 1 : 0, e.outcome ?? null); }
  #auditRow(r) { return { at: r.at, session_id: r.session_id, query: r.query, activity: r.activity, citations: JSON.parse(r.citations || "[]"), unsafe_hit: !!r.unsafe_hit, outcome: r.outcome }; }
  recentAudit(limit = 20) { return this._recentAudit.all(Math.min(Math.max(Number(limit) || 20, 1), 500)).map((r) => this.#auditRow(r)); }
  #auditWhere(f = {}) {
    const clauses = [], params = [];
    if (f.outcome) { clauses.push("outcome = ?"); params.push(String(f.outcome)); }
    if (f.session_id) { clauses.push("session_id = ?"); params.push(String(f.session_id)); }
    if (f.activity) { clauses.push("activity = ?"); params.push(String(f.activity)); }
    if (f.unsafe_hit !== undefined) { clauses.push("unsafe_hit = ?"); params.push(f.unsafe_hit ? 1 : 0); }
    if (f.since) { clauses.push("at >= ?"); params.push(String(f.since)); }
    if (f.until) { clauses.push("at <= ?"); params.push(String(f.until)); }
    return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
  }
  queryAudit(f = {}) {
    const { where, params } = this.#auditWhere(f);
    const limit = Math.min(Math.max(Math.floor(Number(f.limit)) || 20, 1), 500);
    const offset = Math.max(Math.floor(Number(f.offset)) || 0, 0);
    return this.db.prepare(`SELECT * FROM audit_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map((r) => this.#auditRow(r));
  }
  auditCount(f = {}) { const { where, params } = this.#auditWhere(f); return where ? this.db.prepare(`SELECT COUNT(*) AS n FROM audit_log${where}`).get(...params).n : this._countAudit.get().n; }

  // ── users + acl ────────────────────────────────────────────────────────────
  usersEmpty() { return this._countUsers.get().n === 0; }
  seedUsers(users) { for (const u of users) { this._insUser.run(u.id, u.name ?? u.id, u.role ?? "member"); for (const z of u.zones ?? []) this._grant.run(u.id, z); } }
  addUser(u) { this._insUser.run(u.id, u.name ?? u.id, u.role ?? "member"); }
  getUser(id) { const r = this._getUser.get(id); return r ? { id: r.id, name: r.name, role: r.role } : undefined; }
  allUsers() { return this._allUsers.all().map((r) => ({ id: r.id, name: r.name, role: r.role, zones: this.allowedZones(r.id) })); }
  grant(user, zone) { this._grant.run(user, zone); }
  revoke(user, zone) { return this._revoke.run(user, zone).changes > 0; }
  allowedZones(user) { return this._aclOf.all(user).map((r) => r.zone); }

  // ── trip_versions ──────────────────────────────────────────────────────────
  addVersion(t) { this._insVer.run(t.id, t.title ?? null, t.location_id, t.when ?? t.when_ ?? null, t.party ?? null, t.note ?? null, t.confidential ? 1 : 0, this.#now()); }
  versionsOf(id) { return this._versOf.all(id).map((r) => ({ version: r.id, title: r.title, location_id: r.location_id, when: r.when_, party: r.party, note: r.note ?? undefined, confidential: !!r.confidential, at: r.at })); }

  // ── activities ─────────────────────────────────────────────────────────────
  activitiesEmpty() { return this._countAct.get().n === 0; }
  seedActivities(acts) { for (const a of acts) this._setAct.run(a.name, JSON.stringify(a)); }
  setActivity(a) { this._setAct.run(a.name, JSON.stringify(a)); }
  allActivities() { return this._allAct.all().map((r) => JSON.parse(r.profile)); }

  clear() { this.db.exec("DELETE FROM trips; DELETE FROM trip_versions; DELETE FROM audit_log; DELETE FROM weather_cache; DELETE FROM locations;"); }

  // PRAGMA data_version increments when *another* connection commits — lets a
  // second live instance (HTTP + MCP) detect writes and refresh its hot state.
  dataVersion() { return this.db.prepare("PRAGMA data_version").get().data_version; }
  close() { this.db.close(); }
}
