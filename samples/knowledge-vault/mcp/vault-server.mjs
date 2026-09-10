#!/usr/bin/env node
import { serve } from "./lib.mjs";
import { openVault } from "../src/vault.mjs";
import { retrieve } from "../src/retrieval.mjs";

/**
 * The vault as an MCP server — the same corpus, vector retrieval, and SQLite
 * store as the HTTP agent (openVault reads VAULT_BACKEND / VAULT_DB), exposed
 * over stdio JSON-RPC. Read tools (`search`, `read_document`, `list_domains`)
 * let a judge verify grounding; write tools (`add_document`, `update_document`,
 * `delete_document`) let the agent manage the local database. Writes persist to
 * the same DB the HTTP server uses when both point at one VAULT_DB.
 */

const vault = openVault();

serve({
  name: "vault",
  tools: [
    { name: "search", description: "Vector search the vault; top public documents with scores. Optional `domain` namespace. Read-only.", inputSchema: { type: "object", properties: { query: { type: "string" }, top_k: { type: "number" }, domain: { type: "string" } }, required: ["query"] } },
    { name: "read_document", description: "Read one document by id. Confidential documents are refused. Read-only.", inputSchema: { type: "object", properties: { doc_id: { type: "string" } }, required: ["doc_id"] } },
    { name: "list_domains", description: "Summarise the corpus by domain. Read-only.", inputSchema: { type: "object", properties: {} } },
    { name: "read_audit", description: "Read the query audit log (paginated, filterable). Admin-only; needs a `user` with read-audit rights. Read-only.", inputSchema: { type: "object", properties: { user: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, outcome: { type: "string" }, session_id: { type: "string" }, confidential_hit: { type: "boolean" }, since: { type: "string" }, until: { type: "string" } }, required: ["user"] } },
    { name: "add_document", description: "Create a document in the local database and index it. Writes; needs a `user` with create rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, domain: { type: "string" }, text: { type: "string" }, topic: { type: "string" }, confidential: { type: "boolean" }, user: { type: "string" } }, required: ["id", "domain", "text"] } },
    { name: "update_document", description: "Edit an existing document and re-index it. Writes; needs a `user` with edit rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, topic: { type: "string" }, domain: { type: "string" }, confidential: { type: "boolean" }, user: { type: "string" } }, required: ["id"] } },
    { name: "delete_document", description: "Delete a document from the local database. Writes; needs a `user` with delete rights.", inputSchema: { type: "object", properties: { id: { type: "string" }, user: { type: "string" } }, required: ["id"] } },
  ],

  call(name, args) {
    if (name === "search") {
      const k = Math.min(Math.max(Number(args.top_k ?? 5), 1), 20);
      const results = retrieve(String(args.query ?? ""), vault.vectors, { confidential: false, domain: args.domain ? String(args.domain) : undefined })
        .slice(0, k).map((r) => ({ doc_id: r.doc_id, domain: r.domain, score: r.score, chunk: r.chunk }));
      return JSON.stringify(results);
    }
    if (name === "read_document") {
      const d = vault.getDoc(String(args.doc_id));
      if (!d) throw new Error(`no document ${args.doc_id}`);
      if (d.confidential) throw new Error(`document ${args.doc_id} is confidential`);
      return JSON.stringify({ doc_id: d.id, domain: d.domain, topic: d.topic, text: d.text });
    }
    if (name === "list_domains") return JSON.stringify(vault.domainsSummary());
    if (name === "read_audit") {
      if (!vault.can(args.user, "read_audit")) throw new Error(`role '${vault.roleOf(args.user)}' may not read the audit log`);
      const f = {
        limit: args.limit, offset: args.offset,
        outcome: args.outcome ? String(args.outcome) : undefined,
        session_id: args.session_id ? String(args.session_id) : undefined,
        confidential_hit: args.confidential_hit === undefined ? undefined : !!args.confidential_hit,
        since: args.since ? String(args.since) : undefined,
        until: args.until ? String(args.until) : undefined,
      };
      const { total, rows } = vault.queryAudit(f);
      return JSON.stringify({ total, returned: rows.length, recent: rows });
    }

    if (name === "add_document") {
      if (!vault.can(args.user, "create")) throw new Error(`role '${vault.roleOf(args.user)}' may not create documents`);
      const id = String(args.id ?? "").trim();
      if (!id || !args.domain || !args.text) throw new Error("id, domain and text are required");
      if (vault.hasDoc(id)) throw new Error(`document ${id} already exists — use update_document`);
      vault.upsertDoc({ id, domain: String(args.domain), text: String(args.text), topic: args.topic ? String(args.topic) : undefined, confidential: !!args.confidential });
      return JSON.stringify({ ok: true, doc_id: id, documents: vault.docCount() });
    }
    if (name === "update_document") {
      if (!vault.can(args.user, "edit")) throw new Error(`role '${vault.roleOf(args.user)}' may not edit documents`);
      const id = String(args.id ?? "").trim();
      const existing = vault.getDoc(id);
      if (!existing) throw new Error(`no document ${id}`);
      const updated = { ...existing, id };
      if (args.text !== undefined) updated.text = String(args.text);
      if (args.topic !== undefined) updated.topic = String(args.topic);
      if (args.domain !== undefined) updated.domain = String(args.domain);
      if (args.confidential !== undefined) updated.confidential = !!args.confidential;
      vault.upsertDoc(updated);
      return JSON.stringify({ ok: true, doc_id: id });
    }
    if (name === "delete_document") {
      if (!vault.can(args.user, "delete")) throw new Error(`role '${vault.roleOf(args.user)}' may not delete documents`);
      const id = String(args.id ?? "").trim();
      if (!vault.deleteDoc(id)) throw new Error(`no document ${id}`);
      return JSON.stringify({ ok: true, deleted: id, documents: vault.docCount() });
    }
    throw new Error(`unknown tool ${name}`);
  },
});
