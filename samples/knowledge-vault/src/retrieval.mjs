import { MemoryStore } from "./store.mjs";

/**
 * Retrieval: semantic chunking + vector search — the real RAG architecture,
 * over a pluggable vector store (store.mjs). Two pieces a production deployment
 * replaces, both behind an interface:
 *   · `embed()`  — swap for a real embedding model (OpenAI, Cohere, local)
 *   · the store  — swap MemoryStore for Pinecone / Qdrant / Chroma / … (backends/)
 * Everything here — chunking, the index build, cosine top-k, metadata filtering
 * — is unchanged when you do.
 *
 * The embedding stand-in normalises tokens (lowercase, stem, a small synonym
 * map) into a sparse L2-normalised vector, so cosine behaves like a lexical-
 * semantic hybrid: exact terms match, and a few synonyms ("high blood pressure"
 * → hypertension) match without shared keywords. It is a stand-in, not a learned
 * model, and the README says so.
 */

// Words that carry no retrieval signal — dropped before embedding.
const STOPWORDS = new Set(["the", "and", "for", "are", "was", "with", "you", "your", "our", "his", "her", "its", "how", "what", "whats", "which", "who", "does", "did", "can", "will", "this", "that", "these", "those", "about", "into", "from", "tell", "show", "give", "please", "much", "many", "any", "all", "get", "have", "has", "had", "them", "they", "then", "than", "when", "where", "why", "here", "there"]);

// The synonym map — the only "semantic" seam, and now data-driven: seeded from
// these defaults, mirrored in the `synonyms` DB table, and extendable at runtime
// (POST /v1/synonyms), so adding a synonym changes what a query retrieves.
export const DEFAULT_SYNONYMS = [
  { term: "bp", canonical: "hypertension" }, { term: "pressure", canonical: "hypertension" },
  { term: "cholesterol", canonical: "statin" },
  { term: "remittance", canonical: "wire" }, { term: "remit", canonical: "wire" },
  { term: "pto", canonical: "vacation" },
];
let SYNONYMS = new Map(DEFAULT_SYNONYMS.map((s) => [s.term, s.canonical]));
export function getSynonyms() { return [...SYNONYMS].map(([term, canonical]) => ({ term, canonical })); }
export function addSynonym(term, canonical) { SYNONYMS.set(String(term).toLowerCase(), String(canonical).toLowerCase()); }
export function setSynonyms(entries) { SYNONYMS = new Map(entries.map((e) => [String(e.term).toLowerCase(), String(e.canonical).toLowerCase()])); }

function stem(t) {
  const s = t.replace(/(ing|ed|es|s)$/, "");
  return s.length >= 3 ? s : t;
}

/** Normalise text into retrieval tokens: drop short words + stopwords, stem, map synonyms. */
export function tokenize(text) {
  const out = [];
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    const t = stem(raw);
    out.push(SYNONYMS.get(t) ?? t);
  }
  return out;
}

/** Embed text into a sparse, L2-normalised term-frequency vector (Map token→weight). */
export function embed(text) {
  const vec = new Map();
  for (const t of tokenize(text)) vec.set(t, (vec.get(t) ?? 0) + 1);
  let norm = 0; for (const v of vec.values()) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (const [k, v] of vec) vec.set(k, v / norm);
  return vec;
}

/** Semantic chunking: split a document into sentence chunks. */
export function chunk(text) {
  return String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Turn one document into chunk-level store items (id, vector, metadata). */
export function indexDoc(d) {
  const items = [];
  let ci = 0;
  for (const c of chunk(d.text)) {
    items.push({
      id: `${d.id}#${ci++}`,
      vector: embed(`${d.domain} ${d.topic} ${c}`),
      metadata: { docId: d.id, domain: d.domain, topic: d.topic, confidential: !!d.confidential, injected: !!d.injected, chunk: c },
    });
  }
  return items;
}

/** Build a MemoryStore over the corpus — one entry per semantic chunk. */
export function buildStore(docs) {
  const store = new MemoryStore();
  for (const d of docs) store.add(indexDoc(d));
  return store;
}

/**
 * Vector search over the store: embed the query, ask the store for the top chunk
 * hits under a metadata filter, and aggregate to the best chunk per document.
 * `opts.domain` scopes to one namespace (Banking vs HR); `opts.confidential`
 * keeps the public and confidential views separate.
 */
export function retrieve(query, store, opts = {}) {
  const q = embed(query);
  const filter = { confidential: !!opts.confidential };
  if (opts.domain) filter.domain = opts.domain;
  if (opts.domains) filter.domains = opts.domains;
  const hits = store.query(q, { topK: 60, filter });
  const byDoc = new Map();
  for (const h of hits) {
    const m = h.metadata;
    const prev = byDoc.get(m.docId);
    if (!prev || h.score > prev.score) byDoc.set(m.docId, { doc_id: m.docId, domain: m.domain, topic: m.topic, injected: m.injected, chunk: m.chunk, score: h.score });
  }
  return [...byDoc.values()].sort((a, b) => b.score - a.score).slice(0, opts.topK ?? 20);
}

/** The content tokens of a query, for the ambiguity heuristic (bare "policy"). */
export function contentTokens(query) {
  return tokenize(query);
}
