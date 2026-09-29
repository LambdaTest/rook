/**
 * Qdrant adapter (reference skeleton) — a self-host / cloud service vector DB.
 *
 * Namespace + metadata filtering is a payload `filter` with `must` matches, so
 * `{ domain:"Banking", confidential:false }` becomes two payload conditions.
 *
 * Wire it:  `npm i @qdrant/js-client-rest`, set QDRANT_URL (+ QDRANT_API_KEY),
 * pass a real `embed(text) -> number[]` (the SAME model at index and query time),
 * then `await store.add(DOCS.flatMap(indexDoc))` once. Syntax-checked here; needs
 * the SDK and a running Qdrant to execute.
 */
export class QdrantStore {
  constructor({ embed, url = process.env.QDRANT_URL, apiKey = process.env.QDRANT_API_KEY, collection = "vault" } = {}) {
    if (typeof embed !== "function") throw new Error("QdrantStore needs an embed(text) -> number[] function");
    if (!url) throw new Error("QdrantStore needs QDRANT_URL (and `npm i @qdrant/js-client-rest`)");
    this.backend = "qdrant";
    this.embed = embed;
    this.url = url;
    this.apiKey = apiKey;
    this.collection = collection;
  }

  async #client() {
    if (this._client) return this._client;
    let mod;
    try { mod = await import("@qdrant/js-client-rest"); }
    catch { throw new Error("QdrantStore: run `npm i @qdrant/js-client-rest`"); }
    this._client = new mod.QdrantClient({ url: this.url, apiKey: this.apiKey });
    return this._client;
  }

  async add(items) {
    const c = await this.#client();
    await c.upsert(this.collection, {
      points: items.map((it) => ({ id: it.id, vector: this.embed(it.text), payload: it.metadata })),
    });
  }

  async query(text, { topK = 50, filter = {} } = {}) {
    const c = await this.#client();
    const must = [];
    if (filter.domain) must.push({ key: "domain", match: { value: filter.domain } });
    if (filter.confidential !== undefined) must.push({ key: "confidential", match: { value: !!filter.confidential } });
    const res = await c.search(this.collection, {
      vector: this.embed(text),
      limit: topK,
      filter: must.length ? { must } : undefined,
      with_payload: true,
    });
    return res.map((r) => ({ id: r.id, score: r.score, metadata: r.payload }));
  }

  async size() {
    const c = await this.#client();
    return (await c.count(this.collection)).count;
  }
}
