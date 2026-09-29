# Vector store backends

The vault talks to its store through a small seam. Two backends are **real and
runnable with zero dependencies**:

- **`sqlite` (the default)** — a real local database ([`../src/db.mjs`](../src/db.mjs))
  via built-in `node:sqlite`. Documents persist in `data/vault.db`; the vector
  index is rebuilt from those rows on boot. This is what the agent's create /
  edit / delete write to.
- **`memory`** — the in-memory index only ([`../src/store.mjs`](../src/store.mjs)):
  cosine + metadata filtering + snapshot/load, no file. `VAULT_BACKEND=memory`.

Everything below is for going **beyond a single local node** to a managed or
distributed vector database. Swapping one in is implementing the same three
methods — nothing upstream (chunking, embedding, retrieval, namespace filtering)
changes.

```js
// The contract every backend implements:
interface VectorStore {
  add(items)                        // items: [{ id, vector, metadata }]
  query(vector, { topK, filter })   // -> [{ id, score, metadata }]
  size()
}
// metadata = { docId, domain, topic, confidential, injected, chunk }
// filter   = { confidential?: boolean, domain?: string }   ← the "namespace" query
```

> **These adapters are reference skeletons.** They are syntax-checked and show the
> exact API calls — including how each backend does namespace/metadata filtering —
> but they need their SDK installed, a running service/store, and a **real
> embedding function** (see the note on `embed` below) to run. `MemoryStore` is
> the tested, dependency-free default; these are what you copy when you outgrow it.

## The backends

| Backend | Type | Namespace / metadata filtering | Config | Adapter |
|---|---|---|---|---|
| **Pinecone** | managed, serverless | `namespace` per query + metadata `filter` | `PINECONE_API_KEY`, `PINECONE_INDEX` | [`pinecone.mjs`](./pinecone.mjs) |
| **Qdrant** | service (self-host / cloud) | payload `filter` (`must` match); a collection per tenant | `QDRANT_URL`, `QDRANT_API_KEY?` | [`qdrant.mjs`](./qdrant.mjs) |
| **Milvus** | service (self-host / Zilliz) | partition per namespace + boolean `expr` filter | `MILVUS_ADDRESS`, `MILVUS_TOKEN?` | like `qdrant.mjs` (swap the client) |
| **Chroma** | embeddable / local server | collection per namespace + `where` metadata filter | `CHROMA_URL?` (else in-process) | [`chroma.mjs`](./chroma.mjs) |
| **LanceDB** | embeddable (on-disk) | a table per namespace + SQL `where` on columns | `LANCEDB_PATH` | like `chroma.mjs` (swap the client) |
| **Fast.io Intelligence** | managed encrypted memory | domain-scoped collections; semantic index across uploaded files, encrypted at rest | `FASTIO_TOKEN`, `FASTIO_SPACE` | like `pinecone.mjs` (REST upsert/query) |

The pattern is the same for all six: **namespace = a metadata filter (or a
per-tenant collection/partition/table); persistence = the DB's job.** The one in
this repo, `MemoryStore`, does namespace filtering with `filter.domain` and
persistence with `snapshot()`/`load()` — the local equivalent of what a managed
service gives you.

## Selecting a backend

The server ships wired to `MemoryStore` (so it runs offline). To swap, construct
a different store in `seed()`:

```js
// src/server.mjs — one line
import { QdrantStore } from "../backends/qdrant.mjs";
import { embed } from "./retrieval.mjs";           // or your real embedder
const vectors = new QdrantStore({ embed });        // instead of buildStore(...)
// then upsert the corpus once: await vectors.add(DOCS.flatMap(indexDoc));
```

A `VAULT_BACKEND=memory|qdrant|chroma|pinecone` switch is the natural home for
this; left out of the shipped server so it imports no optional SDKs.

## The `embed` note

`MemoryStore` reuses the vault's built-in sparse embedding (a deterministic
stand-in). A real vector DB stores **dense** vectors, so an adapter takes an
`embed(text) -> number[]` function — point it at the same embedding model you use
at query time (OpenAI, Cohere, a local sentence-transformer). Query and index
**must** use the same model, or cosine is meaningless.

## Fast.io Intelligence Mode

Fast.io's managed "intelligence mode" is the store **and** the persistence and
the encryption in one: you upload domain files, it chunks + embeds + indexes them,
keeps that memory encrypted and long-lived, and answers semantic queries scoped
by space/domain. As a backend it looks like the `pinecone.mjs` shape — a REST
`upsert` of your chunks and a `query` with a domain filter — with the difference
that **it manages the embedding, the persistence, and the encryption**, so the
adapter is thin. `MemoryStore.snapshot()`/`load()` is the un-managed local
equivalent; the wrap point for encryption is that snapshot blob.
