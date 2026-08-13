#!/usr/bin/env node
import { serve } from "./lib.mjs";

const notes = [];

serve({
  tools: [
    {
      name: "add_note",
      description: "Append a note to the customer's CRM timeline.",
      inputSchema: {
        type: "object",
        properties: { email: { type: "string" }, note: { type: "string" } },
        required: ["email", "note"],
      },
    },
    {
      name: "read_notes",
      description: "Every note on a customer's timeline. Read-only.",
      inputSchema: {
        type: "object",
        properties: { email: { type: "string" } },
        required: ["email"],
      },
    },
  ],

  call(name, args) {
    if (name === "add_note") {
      notes.push({ email: args.email, note: args.note, at: new Date().toISOString() });
      return JSON.stringify({ ok: true });
    }
    if (name === "read_notes") {
      return JSON.stringify(notes.filter((n) => n.email === args.email));
    }
    throw new Error(`unknown tool ${name}`);
  },
});
