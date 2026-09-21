import { LOCATIONS, ZONE_DEFAULTS } from "./corpus.mjs";

/**
 * The Open-Meteo client — the one piece that touches the network. Three real,
 * keyless endpoints (geocoding, forecast, archive) plus the shipped climate
 * normals. Two pieces a deployment tunes, both behind this interface:
 *   · WEATHER_SOURCE=live (default)  → real Open-Meteo calls, fixture fallback
 *   · WEATHER_SOURCE=fixture         → the corpus normals only (tests/demo use this)
 *
 * Every reading carries a `source` (e.g. open-meteo:climate:PHUKET) and an
 * `as_of` timestamp, and is cached in weather_cache. Freshness is a check on
 * that timestamp: a reading past its TTL is refetched — unless the TWS_STALE
 * twin serves the stale one as if it were current.
 */

const SOURCE = process.env.WEATHER_SOURCE ?? "live";
const GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

const FORECAST_TTL = 3 * 60 * 60 * 1000;      // a current forecast goes stale in ~3h
const CLIMATE_TTL = 30 * 24 * 60 * 60 * 1000; // monthly normals barely move

export function isStale(fetchedAt, ttl = FORECAST_TTL) {
  if (!fetchedAt) return true;
  return Date.now() - Date.parse(fetchedAt) > ttl;
}

const clampMonth = (m) => ((Number(m) - 1 + 12) % 12) + 1;
const round = (n) => Math.round(Number(n));

// Condition label from a temperature + monthly precipitation, so a reading has a
// human word ("clear" / "rain" / "snow") without a real weather-code lookup.
function conditionOf(temp, precipMm) {
  if (temp <= 1 && precipMm > 40) return "snow";
  if (precipMm > 150) return "rain";
  if (precipMm > 60) return "showers";
  if (precipMm > 25) return "cloudy";
  return "clear";
}

/** The shipped monthly normal for a location — the fixture + the fallback. */
export function climateReading(loc, month) {
  const m = clampMonth(month);
  const zd = ZONE_DEFAULTS[loc.zone] ?? { range: 8, wind: 15 };
  const tHigh = loc.tHigh?.[m - 1];
  const precip = loc.precip?.[m - 1];
  if (tHigh === undefined || precip === undefined) return null;
  return { t_high: tHigh, t_low: round(tHigh - zd.range), precip, wind: zd.wind, month: m };
}

// Best-effort live normals: average a recent archive year for the target month.
// Real Open-Meteo call; returns null on any failure so the caller falls back.
async function fetchArchiveNormals(loc, month) {
  const m = clampMonth(month);
  const mm = String(m).padStart(2, "0");
  const last = new Date(m === 12 ? "2024-12-31" : `2024-${mm}-28`).toISOString().slice(0, 10);
  const url = `${ARCHIVE_BASE}?latitude=${loc.lat}&longitude=${loc.lon}&start_date=2024-${mm}-01&end_date=${last}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json();
  const hi = j.daily?.temperature_2m_max ?? [], lo = j.daily?.temperature_2m_min ?? [], pr = j.daily?.precipitation_sum ?? [];
  const clean = (a) => a.filter((x) => x != null);
  if (!clean(hi).length) return null;
  const mean = (a) => { const c = clean(a); return c.reduce((s, x) => s + x, 0) / c.length; };
  const sum = (a) => clean(a).reduce((s, x) => s + x, 0);
  return { t_high: round(mean(hi)), t_low: round(mean(lo)), precip: round(sum(pr)), wind: (ZONE_DEFAULTS[loc.zone] ?? {}).wind ?? 15, month: m };
}

async function fetchCurrent(loc, month) {
  if (SOURCE === "live") {
    try {
      const url = `${FORECAST_BASE}?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const c = (await r.json()).current;
        if (c) return { temp: round(c.temperature_2m), precip: c.precipitation ?? 0, wind: round(c.wind_speed_10m ?? 0), code: conditionOf(c.temperature_2m, (c.precipitation ?? 0) * 30) };
      }
    } catch { /* fall through to the synthesised reading */ }
  }
  // fixture / fallback: a plausible "today" from the month's normal
  const n = climateReading(loc, month);
  if (!n) return { temp: null, precip: null, wind: null, code: "unknown" };
  return { temp: n.t_high, precip: round(n.precip / 30), wind: n.wind, code: conditionOf(n.t_high, n.precip) };
}

/** Resolve a name/id to a location — the station's own list first, then live geocoding. */
export async function geocode(station, name) {
  const q = String(name ?? "").trim();
  if (!q) return null;
  const locs = station ? station.allLocs() : LOCATIONS;
  const hit = locs.find((l) => l.id.toLowerCase() === q.toLowerCase() || l.name.toLowerCase() === q.toLowerCase());
  if (hit) return { ...hit, seeded: true };
  if (SOURCE === "live") {
    try {
      const r = await fetch(`${GEO_BASE}?name=${encodeURIComponent(q)}&count=1`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const g = (await r.json()).results?.[0];
        if (g) return { id: q.toUpperCase().replace(/[^A-Z0-9]+/g, "-"), name: g.name, country: g.country ?? "", zone: "Unknown", lat: g.latitude, lon: g.longitude, seeded: false };
      }
    } catch { /* unknown place */ }
  }
  return null;
}

/** Monthly climate normal for a location, cached; live archive override in live mode. */
export async function getClimate(station, loc, month) {
  const m = clampMonth(month);
  const key = `climate:${m}`;
  const cached = station.getCache(loc.id, key);
  if (cached && cached.reading && !isStale(cached.fetched_at, CLIMATE_TTL)) {
    return { source: `open-meteo:climate:${loc.id}`, ...cached.reading, as_of: cached.fetched_at, stale: false };
  }
  let reading = climateReading(loc, m);
  if (SOURCE === "live") { const live = await fetchArchiveNormals(loc, m).catch(() => null); if (live) reading = live; }
  if (!reading) return null;
  const now = new Date().toISOString();
  station.setCache(loc.id, key, reading, now);
  return { source: `open-meteo:climate:${loc.id}`, ...reading, as_of: now, stale: false };
}

/** Current forecast for a location, cached with freshness. TWS_STALE serves stale. */
export async function getForecast(station, loc, month) {
  const STALE_TWIN = process.env.TWS_STALE === "1";
  const cached = station.getCache(loc.id, "forecast");
  if (cached && cached.reading) {
    const stale = isStale(cached.fetched_at);
    // Fresh → reuse. Stale → the good build refetches; the stale twin serves it anyway.
    if (!stale || STALE_TWIN) {
      return { source: `open-meteo:forecast:${loc.id}`, ...cached.reading, as_of: cached.fetched_at, stale: STALE_TWIN && stale };
    }
  }
  const reading = await fetchCurrent(loc, month);
  const now = new Date().toISOString();
  station.setCache(loc.id, "forecast", reading, now);
  return { source: `open-meteo:forecast:${loc.id}`, ...reading, as_of: now, stale: false };
}

/** Current air quality (US AQI) for a location — live, with a fixture fallback. */
export async function getAirQuality(loc) {
  if (SOURCE === "live") {
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}&current=us_aqi&timezone=auto`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (r.ok) { const aqi = (await r.json()).current?.us_aqi; if (aqi != null) return { source: `open-meteo:air-quality:${loc.id}`, us_aqi: round(aqi), band: aqiBand(aqi) }; }
    } catch { /* fall through */ }
  }
  // fixture: a plausible AQI from the zone (arid/continental dustier than coastal)
  const base = { Tropical: 30, Arid: 60, Mediterranean: 35, Temperate: 40, Continental: 55, Polar: 15 }[loc.zone] ?? 40;
  return { source: `open-meteo:air-quality:${loc.id}`, us_aqi: base, band: aqiBand(base) };
}
function aqiBand(a) { return a <= 50 ? "good" : a <= 100 ? "moderate" : a <= 150 ? "unhealthy for sensitive groups" : "unhealthy"; }

/** Is this location's window severe (declared window, or an extreme normal)? */
export function severeFor(loc, month) {
  const m = clampMonth(month);
  if (Array.isArray(loc.severe)) { const w = loc.severe.find((s) => s.months?.includes(m)); if (w) return { kind: w.kind, month: m }; }
  const th = loc.tHigh?.[m - 1];
  if (th !== undefined && th >= 42) return { kind: "extreme heat", month: m };
  if (th !== undefined && th <= -22) return { kind: "extreme cold", month: m };
  return null;
}

export const weatherSource = () => SOURCE;
