/**
 * Pinecone adapter (reference skeleton) — a managed, serverless vector DB. The
 * same shape fits any managed "memory" REST service (e.g. Fast.io Intelligence
 * Mode): upsert chunks into a namespace, query a namespace with a metadata filter.
 *
 * Pinecone models a **namespace** as a first-class partition, so we map each
 * domain to its own namespace, and use a metadata `filter` for the rest (e.g.
 * confidential). Query one domain = query one namespace.
 *
 * Wire it:  `npm i @pinecone-database/pinecone`, set PINECONE_API_KEY +
 * PINECONE_INDEX, pass a real `embed(text) -> number[]`, then
 * `await store.add(DOCS.flatMap(indexDoc))`. Syntax-checked here; needs the SDK
 * and a live index to execute.
 */
export class PineconeStore {
  constructor({ embed, apiKey = process.env.PINECONE_API_KEY, index = process.env.PINECONE_INDEX } = {}) {
    if (typeof embed !== "function") throw new Error("PineconeStore needs an embed(text) -> number[] function");
    if (!apiKey || !index) throw new Error("PineconeStore needs PINECONE_API_KEY and PINECONE_INDEX (and `npm i @pinecone-database/pinecone`)");
    this.backend = "pinecone";
    this.embed = embed;
    this.apiKey = apiKey;
    this.indexName = index;
  }

  async #index() {
    if (this._index) return this._index;
    let mod;
    try { mod = await import("@pinecone-database/pinecone"); }
    catch { throw new Error("PineconeStore: run `npm i @pinecone-database/pinecone`"); }
    this._index = new mod.Pinecone({ apiKey: this.apiKey }).index(this.indexName);
    return this._index;
  }

  async add(items) {
    const idx = await this.#index();
    // Group by domain namespace, then upsert each namespace.
    const byNs = new Map();
    for (const it of items) {
      const ns = it.metadata.domain ?? "default";
      if (!byNs.has(ns)) byNs.set(ns, []);
      byNs.get(ns).push({ id: it.id, values: this.embed(it.text), metadata: it.metadata });
    }
    for (const [ns, vectors] of byNs) await idx.namespace(ns).upsert(vectors);
  }

  async query(text, { topK = 50, filter = {} } = {}) {
    const idx = await this.#index();
    const target = filter.domain ? idx.namespace(filter.domain) : idx;
    const metaFilter = filter.confidential !== undefined ? { confidential: { $eq: !!filter.confidential } } : undefined;
    const res = await target.query({ vector: this.embed(text), topK, includeMetadata: true, filter: metaFilter });
    return (res.matches ?? []).map((m) => ({ id: m.id, score: m.score, metadata: m.metadata }));
  }

  async size() {
    const idx = await this.#index();
    const stats = await idx.describeIndexStats();
    return stats.totalRecordCount ?? 0;
  }
}
