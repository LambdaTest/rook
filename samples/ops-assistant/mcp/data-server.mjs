// data-server: structured JSON (get_order) and plain text (summarize_incident).
// Unknown IDs return isError: true.
import { errorResult, serveTools, textResult } from "./lib.mjs";

const ORDERS = {
  "A-100": {
    order_id: "A-100",
    customer: "Northwind Traders",
    status: "shipped",
    carrier: "UPS",
    eta: "2026-10-09",
    items: 3,
    total_usd: 249.0,
  },
  "A-200": {
    order_id: "A-200",
    customer: "Contoso Ltd",
    status: "processing",
    carrier: null,
    eta: "2026-10-12",
    items: 1,
    total_usd: 89.5,
  },
  "A-300": {
    order_id: "A-300",
    customer: "Fabrikam Inc",
    status: "cancelled",
    carrier: null,
    eta: null,
    items: 2,
    total_usd: 120.0,
  },
};

const INCIDENTS = {
  "INC-2041": [
    "INC-2041 (SEV-2, resolved): checkout latency spike on 2026-10-03 from 14:05 to 14:47 UTC (42 minutes).",
    "Cause: a slow inventory reservation query after a schema change.",
    "Impact: p95 checkout latency rose to 2.1 s; about 3% of carts timed out.",
    "Fix: the query index was restored and the change was rolled back.",
  ].join(" "),
  "INC-2042": [
    "INC-2042 (SEV-1, monitoring): payments webhook deliveries failing since 2026-10-06 08:55 UTC.",
    "Cause: the payment provider is timing out after 10 s.",
    "Impact: error rate 2.4%; captures succeed on retry.",
    "Next step: provider ticket open; retries are holding.",
  ].join(" "),
};

const ORDER_SCHEMA = {
  type: "object",
  properties: {
    order_id: { type: "string" },
    customer: { type: "string" },
    status: { type: "string", enum: ["processing", "shipped", "cancelled"] },
    carrier: { type: ["string", "null"] },
    eta: { type: ["string", "null"], description: "expected delivery date, YYYY-MM-DD" },
    items: { type: "integer" },
    total_usd: { type: "number" },
  },
  required: ["order_id", "customer", "status", "carrier", "eta", "items", "total_usd"],
};

function orderSummary(order) {
  if (order.status === "cancelled") return `Order ${order.order_id} for ${order.customer} was cancelled.`;
  const carrier = order.carrier ? ` via ${order.carrier}` : "";
  return `Order ${order.order_id} for ${order.customer} is ${order.status}${carrier}, expected delivery ${order.eta}.`;
}

await serveTools("data-server", {
  get_order: {
    description: "Look up an order by ID (for example A-100). Returns the order as structured JSON plus a one-line summary.",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID such as A-100" } },
      required: ["order_id"],
    },
    outputSchema: ORDER_SCHEMA,
    handler: async ({ order_id }) => {
      const order = ORDERS[String(order_id).toUpperCase()];
      if (!order) return errorResult(`Order ${order_id} not found. Known orders: ${Object.keys(ORDERS).join(", ")}.`);
      return { content: [{ type: "text", text: orderSummary(order) }], structuredContent: order };
    },
  },
  summarize_incident: {
    description: "Summarize an incident by ID (for example INC-2041) as plain text: severity, state, cause, impact and fix.",
    inputSchema: {
      type: "object",
      properties: { incident_id: { type: "string", description: "Incident ID such as INC-2041" } },
      required: ["incident_id"],
    },
    handler: async ({ incident_id }) => {
      const summary = INCIDENTS[String(incident_id).toUpperCase()];
      if (!summary) return errorResult(`Incident ${incident_id} not found. Known incidents: ${Object.keys(INCIDENTS).join(", ")}.`);
      return textResult(summary);
    },
  },
});
