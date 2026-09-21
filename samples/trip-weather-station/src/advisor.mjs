import { monthName, MONTHS } from "./corpus.mjs";
import { climateReading } from "./weather.mjs";

/**
 * The advisor — turns a wish into a weather profile, scores fetched data against
 * it, and composes grounded advice. This is the one piece a deployment swaps for
 * a real model:
 *   · advise()       — the deterministic stand-in: reproducible, offline, no key
 *   · adviseLocal()  — a LOCAL, OpenAI-compatible LLM (Ollama / LM Studio / …),
 *                      fed ONLY the fetched data, then GROUND-CHECKED before it ships
 *
 * The model never fetches and never rules on safety — it only phrases readings
 * the pipeline already retrieved, and its output is validated back against the
 * fetched figures. So even a small local model stays grounded, or we fall back.
 */

const LLM = process.env.TWS_LLM ?? "off"; // "local" turns on the local model
const LLM_URL = process.env.TWS_LLM_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = process.env.TWS_LLM_MODEL ?? "llama3.2";

// ── request → weather profile ────────────────────────────────────────────────

function inferActivity(text) {
  if (/\bski|snowboard|slope|powder|piste\b/.test(text)) return "ski";
  if (/\bbeach|swim|snorkel|dive|sunbathe|sea\b/.test(text)) return "beach";
  if (/\baurora|northern lights\b/.test(text)) return "aurora";
  if (/\bhik|trek|trail|climb|walk\b/.test(text)) return "hike";
  if (/\bdesert|dune\b/.test(text)) return "desert";
  if (/\bcity|sightsee|museum|culture|break\b/.test(text)) return "city";
  return null;
}

// A free-form "warm and dry" wish → an ad-hoc profile, when no activity fits.
function parseDesired(text) {
  const p = { name: "your weather", temp: [15, 28], precipMax: 120, windMax: 45, blurb: "" };
  if (/\b(hot|tropical|warm)\b/.test(text)) p.temp = [24, 36];
  if (/\b(mild|temperate|pleasant|spring|autumn|fall)\b/.test(text)) p.temp = [14, 24];
  if (/\b(cold|chilly|freezing|snow|winter)\b/.test(text)) p.temp = [-15, 6];
  if (/\b(dry|arid|sunny|clear)\b/.test(text)) p.precipMax = 30;
  if (/\bsnow\b/.test(text)) { p.needSnow = true; p.temp = [-15, 4]; }
  if (/\b(aurora|northern lights)\b/.test(text)) { p.needDark = true; p.temp = [-25, 8]; }
  return p;
}

const SEASON = { spring: 4, summer: 7, autumn: 10, fall: 10, winter: 1 };

/** Pull a month (or season) out of free text; null if none named. */
export function parseWhen(text) {
  const t = String(text ?? "").toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) { const m = MONTHS[i].toLowerCase(); if (t.includes(m) || t.includes(m.slice(0, 3))) return i + 1; }
  for (const [s, m] of Object.entries(SEASON)) if (t.includes(s)) return m;
  return null;
}

/** Resolve {input, activity, desired} to a matched profile (or null). */
export function resolveRequest({ input, activity, desired }, activities) {
  const text = `${input ?? ""} ${desired ?? ""}`.toLowerCase();
  const byName = (n) => activities.find((a) => a.name === String(n ?? "").toLowerCase());
  if (activity && byName(activity)) { const p = byName(activity); return { profile: p, label: p.name, kind: "activity" }; }
  const inferred = inferActivity(text);
  if (inferred && byName(inferred)) { const p = byName(inferred); return { profile: p, label: p.name, kind: "activity" }; }
  if (desired || input) return { profile: parseDesired(text), label: parseDesired(text).name, kind: "weather" };
  return null;
}

// ── scoring (grounded on fetched data) ───────────────────────────────────────

function tempScore(profile, tHigh) {
  const [lo, hi] = profile.temp;
  if (tHigh >= lo && tHigh <= hi) return 1;
  const d = tHigh < lo ? lo - tHigh : tHigh - hi;
  return Math.max(0, 1 - d / 12);
}
function precipScore(profile, precip) {
  const soft = profile.precipMax ?? 120;
  if (precip <= soft) return 1 - 0.4 * (precip / soft); // 1.0 (bone dry) → 0.6 (at the ceiling)
  return Math.max(0, 0.6 - (precip - soft) / 300);      // over the ceiling → below 0.6
}

/** Score a fetched monthly reading against the profile — 0..1. */
export function scoreClimate(profile, reading) {
  if (!reading) return 0;
  let s = 0.6 * tempScore(profile, reading.t_high) + 0.4 * precipScore(profile, reading.precip);
  if (profile.needSnow) { const snow = reading.t_high <= 2 && reading.precip >= 30 ? 1 : 0; s = 0.5 * s + 0.5 * snow; }
  if (profile.needDark) { s = 0.85 * s + 0.15 * precipScore(profile, reading.precip); }
  return s;
}

/** Best months for a location + profile, read off the shipped normals. */
export function bestMonthsFor(loc, profile) {
  const scored = [];
  for (let m = 1; m <= 12; m++) { const r = climateReading(loc, m); if (r) scored.push({ m, s: scoreClimate(profile, r) }); }
  scored.sort((a, b) => b.s - a.s);
  return scored.filter((x) => x.s >= 0.55).slice(0, 3).sort((a, b) => a.m - b.m).map((x) => monthName(x.m));
}

// ── composition ──────────────────────────────────────────────────────────────

function packTip(profile, c) {
  if (c.t_low <= 2) return "Pack warm layers — nights are cold.";
  if (c.t_high >= 33) return "It runs hot — bring sun cover and water.";
  if (c.precip > (profile.precipMax ?? 120)) return "Bring rain gear.";
  return "Pack light layers.";
}

/**
 * The deterministic stand-in. Grounded by construction: it only prints the
 * fetched figures and always cites the source. The HALLUCINATE twin instead
 * invents a figure it never fetched and drops the citation.
 */
export function advise({ label, month, ranked }, { hallucinate = false } = {}) {
  const top = ranked[0];
  const nm = monthName(month);
  const phrase = label && label !== "your weather" ? `a ${label} trip` : "a trip";
  if (hallucinate) {
    const fake = (top.climate?.t_high ?? 20) + 9; // a plausible number it never fetched
    return { output: `For ${phrase} in ${nm}, ${top.name} is perfect — expect around ${fake}°C and clear skies all week. Have a great trip!`, citations: [] };
  }
  const c = top.climate, f = top.forecast;
  const season = c.precip <= 40 ? " (a dry month)" : c.precip >= 200 ? " (wet season)" : "";
  const best = top.bestMonths?.length ? `Best months: ${top.bestMonths.join(", ")}.` : "";
  const alts = ranked.slice(1, 3).map((r) => `${r.name} (~${r.climate.t_high}°C, ${r.climate.precip}mm)`).join("; ");
  const altLine = alts ? ` Runners-up: ${alts}.` : "";
  const output = `For ${phrase} in ${nm}, ${top.name} (${top.zone}) is the best match: ${nm} averages about ${c.t_high}°C with ~${c.precip}mm of rain${season}, and today is ${f.temp}°C ${f.code}. ${best} ${packTip(top.profile ?? {}, c)}${altLine} [source: ${c.source}; ${f.source}; as-of ${String(c.as_of).slice(0, 10)}]`;
  return { output, citations: [c.source, f.source] };
}

// ── the local LLM path ───────────────────────────────────────────────────────

export function localEnabled() { return LLM === "local"; }

async function callLocalLLM(system, user) {
  try {
    const r = await fetch(`${LLM_URL}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: LLM_MODEL, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

/**
 * Ask a local model to phrase the advice — but only over the fetched data, and
 * only if the result passes the same ground check (the top location's fetched
 * temperature must appear, and a source must be cited). Otherwise return null so
 * the caller falls back to the deterministic, guaranteed-grounded stand-in.
 */
export async function adviseLocal({ label, month, ranked }) {
  const top = ranked[0];
  const system = "You are a trip weather advisor. Use ONLY the JSON data provided. Never invent a number. State the destination, its typical temperature and rainfall for the month, and the best months. Cite the source ids in brackets. Two sentences.";
  const payload = {
    activity: label, month: monthName(month),
    top: { name: top.name, zone: top.zone, climate: top.climate, forecast: top.forecast, best_months: top.bestMonths },
    alternatives: ranked.slice(1, 3).map((r) => ({ name: r.name, climate: r.climate })),
  };
  const text = await callLocalLLM(system, `Data:\n${JSON.stringify(payload)}\n\nRecommend where to go and the best months, grounded only in this data.`);
  if (text && text.includes(String(top.climate.t_high)) && /open-meteo:/.test(text)) {
    return { output: text.trim(), citations: [top.climate.source, top.forecast.source], model: LLM_MODEL };
  }
  return null; // ground check failed (or model unreachable) → deterministic fallback
}
