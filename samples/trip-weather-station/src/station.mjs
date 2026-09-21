import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StationDb } from "./db.mjs";
import { seedLocations, seedTrips, seedActivities, SEED_USERS, STALE_CACHE, ZONES } from "./corpus.mjs";

/**
 * The station's storage facade — the database (locations, trips, weather_cache,
 * audit_log, users, acl, trip_versions, activities) behind one object, so the
 * HTTP and MCP servers share the same store, CRUD, access rules, cache, and
 * history.
 *
 *   backend "sqlite" (default): everything persists in data/station.db.
 *   backend "memory": a throwaway :memory: database (resets on exit).
 */

const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// RBAC: which operations each role may perform. `read` is recommend/weather; the
// rest are the writes on the database. Anonymous (no user) = read-only.
const PERMISSIONS = {
  admin: new Set(["read", "read_audit", "create", "edit", "delete", "revert", "grant", "revoke", "manage_users", "add_activity", "reset"]),
  editor: new Set(["read", "create", "edit", "delete", "revert", "add_activity"]),
  member: new Set(["read", "create", "edit"]),
  guest: new Set(["read"]),
  anon: new Set(["read"]),
};

export class Station {
  constructor({ backend = process.env.TWS_BACKEND ?? "sqlite", dbPath = process.env.TWS_DB } = {}) {
    this.backend = backend === "memory" ? "memory" : "sqlite";
    this.rbac = process.env.TWS_RBAC_OFF !== "1"; // the vulnerable twin sets TWS_RBAC_OFF=1
    this.last = null;

    this.dbPath = this.backend === "memory" ? ":memory:" : (dbPath ?? resolve(AGENT_ROOT, "data/station.db"));
    if (this.dbPath !== ":memory:") mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new StationDb(this.dbPath);
    if (this.db.isEmpty()) {
      this.db.seedLocations(seedLocations());
      this.db.seedTrips(seedTrips());
      for (const c of STALE_CACHE) this.db.setCache(c.location_id, c.kind, c.reading, c.fetched_at);
    }
    if (this.db.usersEmpty()) this.db.seedUsers(SEED_USERS);
    if (this.db.activitiesEmpty()) this.db.seedActivities(seedActivities());
    this._dataVersion = this.db.dataVersion();
  }

  // Reload nothing heavy — the hot state IS the DB — but note another instance's
  // commit so a shared-file HTTP+MCP pair stays coherent (cheap check per request).
  refresh() {
    if (!this.db || this.dbPath === ":memory:") return;
    const v = this.db.dataVersion();
    if (v !== this._dataVersion) this._dataVersion = v;
  }

  // ── locations ──────────────────────────────────────────────────────────────
  getLoc(id) { return this.db.getLoc(id); }
  hasLoc(id) { return !!this.db.getLoc(id); }
  allLocs() { return this.db.allLocs(); }
  locCount() { return this.db.allLocs().length; }
  zonesSummary() {
    const by = new Map(ZONES.map((z) => [z, { zone: z, locations: 0 }]));
    for (const l of this.db.allLocs()) { const e = by.get(l.zone) ?? { zone: l.zone, locations: 0 }; e.locations += 1; by.set(l.zone, e); }
    return [...by.values()].filter((e) => e.locations > 0);
  }
  upsertLoc(l) { this.db.upsertLoc(l); return this.db.getLoc(l.id); }
  deleteLoc(id) { return this.db.deleteLoc(id); }

  // ── trips (+ version snapshot on edit) ───────────────────────────────────────
  getTrip(id) { return this.db.getTrip(id); }
  allTrips() { return this.db.allTrips(); }
  upsertTrip(t) {
    const existing = this.db.getTrip(t.id);
    if (existing) this.db.addVersion(existing);
    this.db.upsertTrip(t);
    return this.db.getTrip(t.id);
  }
  deleteTrip(id) { return this.db.deleteTrip(id); }
  versionsOf(id) { return this.db.versionsOf(id); }
  revertTrip(id) {
    const versions = this.db.versionsOf(id);
    if (!versions.length) return null;
    const prev = versions[0];
    return this.upsertTrip({ id, location_id: prev.location_id, title: prev.title, when: prev.when, party: prev.party, note: prev.note, confidential: prev.confidential });
  }

  // ── weather cache ────────────────────────────────────────────────────────────
  getCache(locationId, kind) { return this.db.getCache(locationId, kind); }
  setCache(locationId, kind, reading, fetchedAt) { this.db.setCache(locationId, kind, reading, fetchedAt); }

  // ── audit log ────────────────────────────────────────────────────────────────
  logQuery(e) { this.db.logQuery(e); }
  recentAudit(limit = 20) { return this.db.recentAudit(limit); }
  queryAudit(f = {}) { return { total: this.db.auditCount(f), rows: this.db.queryAudit(f) }; }
  auditCount(f) { return this.db.auditCount(f); }

  // ── users + access control ───────────────────────────────────────────────────
  getUser(id) { return this.db.getUser(id); }
  allUsers() { return this.db.allUsers(); }
  addUser(u) { this.db.addUser(u); }
  grant(user, zone) { this.db.grant(user, zone); }
  revoke(user, zone) { return this.db.revoke(user, zone); }
  allowedZones(user) { return this.db.allowedZones(user); }
  canSeeZone(user, zone) {
    if (!user) return true; // anonymous reads are public
    const z = this.allowedZones(user);
    return z.includes("*") || z.some((x) => x.toLowerCase() === String(zone).toLowerCase());
  }

  // ── RBAC ─────────────────────────────────────────────────────────────────────
  roleOf(user) { if (!user) return "anon"; const u = this.getUser(user); return u ? u.role : "unknown"; }
  can(user, op) { if (!this.rbac) return true; const perms = PERMISSIONS[this.roleOf(user)]; return perms ? perms.has(op) : false; }

  // ── activities (data-driven advice) ──────────────────────────────────────────
  activities() { return this.db.allActivities(); }
  setActivity(a) { this.db.setActivity(a); return a; }

  reset() {
    this.db.clear();
    this.db.seedLocations(seedLocations());
    this.db.seedTrips(seedTrips());
    for (const c of STALE_CACHE) this.db.setCache(c.location_id, c.kind, c.reading, c.fetched_at);
    this.last = null;
  }
}

export function openStation(opts) { return new Station(opts); }
