#!/usr/bin/env node
/**
 * build-index — precompute the incident vectors behind search_incidents.
 *
 *   npm install                     once
 *   node scripts/build-index.mjs    after changing INCIDENTS in ops-directory.mjs
 *
 * Writes services/incidents.index.json — the model header plus one vector per
 * incident — and warms the local model cache in .models/, so the MCP server
 * itself never needs the network at query time, and every session's first
 * search pays seconds of model load, not a download.
 *
 * The model is ASSERTED here and in ops-directory.mjs as the same constant.
 * If the two ever disagree, the server refuses the index and falls back to
 * lexical mode rather than serving cross-model noise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INCIDENTS, incidentText } from "../services/ops-directory.mjs";
import { pipeline, env } from "@huggingface/transformers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(HERE, "..", ".models");
const INDEX_PATH = path.resolve(HERE, "..", "services", "incidents.index.json");
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2"; // keep in step with ops-directory.mjs
const EMBEDDING_DIM = 384;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

async function main() {
  console.log(`embedding ${INCIDENTS.length} incidents with ${EMBEDDING_MODEL} …`);
  env.cacheDir = MODELS_DIR;
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);

  const records = [];
  for (const incident of INCIDENTS) {
    const text = incidentText(incident);
    const out = await extractor(text, { pooling: "mean", normalize: true });
    if (out.data.length !== EMBEDDING_DIM) {
      throw new Error(
        `${incident.id}: got ${out.data.length} dims, expected ${EMBEDDING_DIM} — ` +
          "the asserted model has changed; update EMBEDDING_DIM in both scripts",
      );
    }
    records.push({ id: incident.id, service: incident.service, vector: Array.from(out.data) });
    console.log(`  ${incident.id}  ${incident.service.padEnd(15)} "${text.slice(0, 58)}…"`);
  }

  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(
    INDEX_PATH,
    JSON.stringify(
      { model: EMBEDDING_MODEL, dim: EMBEDDING_DIM, built: new Date().toISOString(), records },
      null,
      2,
    ),
  );
  console.log(`wrote ${INDEX_PATH} (${records.length} vectors, ${EMBEDDING_DIM} dims)`);
  console.log(`model cache warmed at ${MODELS_DIR} — the server needs no network at query time`);
}
