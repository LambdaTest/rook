#!/usr/bin/env node
import { serve } from "./lib.mjs";
import { openStation } from "../src/station.mjs";
import { geocode, getClimate, getForecast, getAirQuality, severeFor, climateReading } from "../src/weather.mjs";
import { resolveRequest, parseWhen, scoreClimate, bestMonthsFor, advise } from "../src/advisor.mjs";
import { monthName, ZONES } from "../src/corpus.mjs";

/**
 * The station as an MCP server — the same destinations, Open-Meteo client, and
 * SQLite store as the HTTP agent (openStation reads TWS_BACKEND / TWS_DB),
 * exposed over stdio JSON-RPC. Read tools (`geocode`, `get_forecast`,
 * `get_climate`, `get_air_quality`, `recommend`, `list_activities`) let a judge
 * verify grounding; write tools (`add_trip`, `update_trip`, `delete_trip`,
 * `save_location`) let the agent manage the local database, RBAC-gated.
 */

const station = openStation();
const monthArg = (a) => parseWhen(a.when) ?? (a.month ? Number(a.month) : null) ?? (new Date().getMonth() + 1);
async function loc(name) { const l = await geocode(station, name); if (!l) throw new Error(`couldn't resolve location "${name}"`); return l; }

serve({
  name: "weather",
  tools: [
    { name: "geocode", description: "Resolve a place name to coordinates + climate zone. Read-only.", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
    { name: "get_forecast", description: "Current forecast for a location (refetches when stale). Read-only.", inputSchema: { type: "object", properties: { location: { type: "string" }, when: { type: "string" } }, required: ["location"] } },
    { name: "get_climate", description: "Monthly climate normal for a location. Read-only.", inputSchema: { type: "object", properties: { location: { type: "string" }, when: { type: "string" }, month: { type: "number" } }, required: ["location"] } },
    { name: "get_air_quality", description: "Current US AQI for a location. Read-only.", inputSchema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } },
    { name: "recommend", description: "Grounded recommendation: rank destinations for an activity/weather in a month; refuses severe windows. Read-only.", inputSchema: { type: "object", properties: { query: { type: "string" }, activity: { type: "string" }, when: { type: "string" } }, required: ["query"] } },
    { name: "list_activities", description: "List the activity weather profiles. Read-only.", inputSchema: { type: "object", properties: {} } },
    { name: "read_audit", description: "Read the recommendation audit log (paginated, filterable). Admin-only; needs a `user` with read-audit rights. Read-only.", inputSchema: { type: "object", properties: { user: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, outcome: { type: "string" }, activity: { type: "string" }, session_id: { type: "string" }, unsafe_hit: { type: "boolean" } }, required: ["user"] } },
    { name: "add_trip", description: "Create a saved trip. Writes; needs a `user` with create rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, location_id: { type: "string" }, title: { type: "string" }, when: { type: "string" }, party: { type: "number" }, confidential: { type: "boolean" }, user: { type: "string" } }, required: ["id", "location_id"] } },
    { name: "update_trip", description: "Edit a saved trip. Writes; needs a `user` with edit rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, when: { type: "string" }, party: { type: "number" }, note: { type: "string" }, user: { type: "string" } }, required: ["id"] } },
    { name: "delete_trip", description: "Delete a saved trip. Writes; needs a `user` with delete rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, user: { type: "string" } }, required: ["id"] } },
    { name: "save_location", description: "Create a destination and index it. Writes; needs a `user` with create rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, zone: { type: "string" }, country: { type: "string" }, lat: { type: "number" }, lon: { type: "number" }, user: { type: "string" } }, required: ["id", "name", "zone"] } },
  ],

  async call(name, args) {
    station.refresh();
    if (name === "geocode") { const l = await loc(args.q); return JSON.stringify({ id: l.id, name: l.name, country: l.country, zone: l.zone, lat: l.lat, lon: l.lon }); }
    if (name === "get_forecast") { const l = await loc(args.location); return JSON.stringify(await getForecast(station, l, monthArg(args))); }
    if (name === "get_climate") { const l = await loc(args.location); const c = await getClimate(station, l, monthArg(args)); if (!c) throw new Error(`no climate normals for ${l.id}`); return JSON.stringify(c); }
    if (name === "get_air_quality") { const l = await loc(args.location); return JSON.stringify(await getAirQuality(l)); }
    if (name === "list_activities") return JSON.stringify(station.activities());

    if (name === "recommend") {
      const text = String(args.query ?? "");
      const month = parseWhen(args.when) ?? parseWhen(text) ?? (new Date().getMonth() + 1);
      const req = resolveRequest({ input: text, activity: args.activity, desired: text }, station.activities());
      if (!req) return JSON.stringify({ outcome: "clarify", message: "name an activity or a kind of weather" });
      const { profile, label } = req;
      const pre = station.allLocs().map((l) => ({ l, s: scoreClimate(profile, climateReading(l, month)) })).sort((a, b) => b.s - a.s).slice(0, 3);
      const ranked = [];
      for (const { l } of pre) { const climate = await getClimate(station, l, month); const forecast = await getForecast(station, l, month); if (climate) ranked.push({ loc: l, name: l.name, zone: l.zone, climate, forecast, profile, score: scoreClimate(profile, climate), bestMonths: bestMonthsFor(l, profile) }); }
      ranked.sort((a, b) => b.score - a.score);
      if (!ranked.length) return JSON.stringify({ outcome: "no_data" });
      const top = ranked[0];
      const sev = severeFor(top.loc, month);
      if (sev) return JSON.stringify({ outcome: "refused_unsafe", location: top.name, reason: sev.kind, month: monthName(month) });
      const { output, citations } = advise({ label, month, ranked });
      return JSON.stringify({ outcome: "recommended", activity: label, month: monthName(month), top: top.name, zone: top.zone, climate: top.climate, best_months: top.bestMonths, output, citations });
    }

    if (name === "read_audit") {
      if (!station.can(args.user, "read_audit")) throw new Error(`role '${station.roleOf(args.user)}' may not read the audit log`);
      const f = { limit: args.limit, offset: args.offset };
      for (const k of ["outcome", "activity", "session_id"]) if (args[k]) f[k] = String(args[k]);
      if (args.unsafe_hit !== undefined) f.unsafe_hit = !!args.unsafe_hit;
      const { total, rows } = station.queryAudit(f);
      return JSON.stringify({ total, returned: rows.length, recent: rows });
    }

    if (name === "add_trip") {
      if (!station.can(args.user, "create")) throw new Error(`role '${station.roleOf(args.user)}' may not create trips`);
      const id = String(args.id ?? "").trim(), location_id = String(args.location_id ?? "").trim().toUpperCase();
      if (!id || !location_id) throw new Error("id and location_id are required");
      if (!station.getLoc(location_id)) throw new Error(`no location ${location_id}`);
      if (station.getTrip(id)) throw new Error(`trip ${id} already exists — use update_trip`);
      station.upsertTrip({ id, location_id, title: args.title, when: args.when, party: args.party, owner: args.user, confidential: !!args.confidential });
      return JSON.stringify({ ok: true, id, trips: station.allTrips().length });
    }
    if (name === "update_trip") {
      if (!station.can(args.user, "edit")) throw new Error(`role '${station.roleOf(args.user)}' may not edit trips`);
      const ex = station.getTrip(String(args.id)); if (!ex) throw new Error(`no trip ${args.id}`);
      station.upsertTrip({ ...ex, ...args, id: ex.id, location_id: ex.location_id });
      return JSON.stringify({ ok: true, id: ex.id });
    }
    if (name === "delete_trip") {
      if (!station.can(args.user, "delete")) throw new Error(`role '${station.roleOf(args.user)}' may not delete trips`);
      if (!station.deleteTrip(String(args.id))) throw new Error(`no trip ${args.id}`);
      return JSON.stringify({ ok: true, deleted: String(args.id) });
    }
    if (name === "save_location") {
      if (!station.can(args.user, "create")) throw new Error(`role '${station.roleOf(args.user)}' may not save locations`);
      const id = String(args.id ?? "").trim().toUpperCase();
      if (!id || !args.name || !args.zone) throw new Error("id, name and zone are required");
      if (!ZONES.includes(String(args.zone))) throw new Error(`zone must be one of ${ZONES.join(", ")}`);
      station.upsertLoc({ id, name: String(args.name), zone: String(args.zone), country: args.country ?? "", lat: args.lat, lon: args.lon });
      return JSON.stringify({ ok: true, id, locations: station.locCount() });
    }
    throw new Error(`unknown tool ${name}`);
  },
});
