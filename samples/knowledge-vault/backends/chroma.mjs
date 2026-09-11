/**
 * Chroma adapter (reference skeleton) — an embeddable / local-server vector DB,
 * good for local or modular multi-domain agents. LanceDB looks almost identical
 * (a table per namespace + a SQL `where`); swap the client and the query shape.
 *
 * Namespace + metadata filtering is a `where` clause on the stored metadata, so
 * `{ domain:"Banking", confidential:false }` becomes `where: { domain, confidential }`.
 *
 * Wire it:  `npm i chromadb`, optionally set CHROMA_URL (else it runs in-process),
 * pass a real `embed(text) -> number[]`, then `await store.add(DOCS.flatMap(indexDoc))`.
 * Syntax-checked here; needs the SDK to execute.
 */
export class ChromaStore {
  constructor({ embed, url = process.env.CHROMA_URL, collection = "vault" } = {}) {
    if (typeof embed !== "function") throw new Error("ChromaStore needs an embed(text) -> number[] function");
    this.backend = "chroma";
    this.embed = embed;
    this.url = url;
    this.collectionName = collection;
  }

  async #collection() {
    if (this._col) return this._col;
    let mod;
    try { mod = await import("chromadb"); }
    catch { throw new Error("ChromaStore: run `npm i chromadb`"); }
    const client = this.url ? new mod.ChromaClient({ path: this.url }) : new mod.ChromaClient();
    this._col = await client.getOrCreateCollection({ name: this.collectionName });
    return this._col;
  }

  async add(items) {
    const col = await this.#collection();
    await col.add({
      ids: items.map((i) => i.id),
      embeddings: items.map((i) => this.embed(i.text)),
      metadatas: items.map((i) => i.metadata),
      documents: items.map((i) => i.text),
    });
  }

  async query(text, { topK = 50, filter = {} } = {}) {
    const col = await this.#collection();
    const where = {};
    if (filter.domain) where.domain = filter.domain;
    if (filter.confidential !== undefined) where.confidential = !!filter.confidential;
    const res = await col.query({
      queryEmbeddings: [this.embed(text)],
      nResults: topK,
      where: Object.keys(where).length ? where : undefined,
    });
    // Chroma returns distances; turn them into a similarity-like score.
    return (res.ids?.[0] ?? []).map((id, i) => ({ id, score: 1 - (res.distances?.[0]?.[i] ?? 0), metadata: res.metadatas?.[0]?.[i] }));
  }

  async size() {
    const col = await this.#collection();
    return col.count();
  }
}
