/**
 * The vector store — the seam a real vector database plugs into.
 *
 * `MemoryStore` is the runnable default: an in-memory index with cosine search
 * and **metadata / namespace filtering** (query one domain, e.g. Banking vs HR),
 * plus snapshot/load for persistence. A Pinecone / Qdrant / Milvus / Chroma /
 * LanceDB / Fast.io adapter implements the same three methods and everything
 * upstream — chunking, embedding, retrieval — is unchanged. See backends/ for
 * the adapter guide and skeletons.
 *
 *   interface VectorStore {
 *     add(items)                          // items: [{ id, vector, metadata }]
 *     query(vector, { topK, filter })     // -> [{ id, score, metadata }]
 *     size()
 *   }
 *
 * `metadata` carries { docId, domain, topic, confidential, injected, chunk };
 * `filter` narrows by any of them — `{ confidential:false, domain:"Banking" }`
 * is the "namespace" query real vector DBs expose as a metadata filter.
 */

/** Cosine similarity of two L2-normalised sparse vectors (Map token→weight). */
export function cosine(a, b) {
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, v] of small) { const w = large.get(k); if (w) dot += v * w; }
  return dot;
}

export class MemoryStore {
  constructor() {
    this.backend = "memory";
    this.items = [];
  }

  add(items) {
    for (const it of items) this.items.push(it);
    return this;
  }

  /** Drop every chunk of a document — used when a document is edited or deleted. */
  removeDoc(docId) {
    this.items = this.items.filter((it) => it.metadata.docId !== docId);
    return this;
  }

  query(vector, { topK = 50, filter = {} } = {}) {
    const out = [];
    for (const it of this.items) {
      const m = it.metadata;
      if (filter.confidential !== undefined && !!m.confidential !== !!filter.confidential) continue;
      if (filter.domain && String(m.domain).toLowerCase() !== String(filter.domain).toLowerCase()) continue;
      if (filter.domains && !filter.domains.some((d) => String(d).toLowerCase() === String(m.domain).toLowerCase())) continue;
      const score = cosine(vector, it.vector);
      if (score > 0) out.push({ id: it.id, score: Number(score.toFixed(4)), metadata: m });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, topK);
  }

  size() { return this.items.length; }

  /** The distinct namespaces (domains) in the store. */
  namespaces() { return [...new Set(this.items.map((it) => it.metadata.domain))]; }

  /**
   * Serialise the index for persistence — the local equivalent of a managed
   * "persistent memory" service. A real deployment would encrypt this blob at
   * rest (that is the wrap point); here it is plain JSON so the sample stays
   * inspectable and dependency-free.
   */
  snapshot() {
    return { backend: this.backend, items: this.items.map((it) => ({ id: it.id, vector: [...it.vector], metadata: it.metadata })) };
  }

  static load(snap) {
    const s = new MemoryStore();
    s.items = (snap.items ?? []).map((it) => ({ id: it.id, vector: new Map(it.vector), metadata: it.metadata }));
    return s;
  }
}
