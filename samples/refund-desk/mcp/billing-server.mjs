#!/usr/bin/env node
import { serve } from "./lib.mjs";

/**
 * Orders live in memory and reset when the process does, which is what makes
 * this safe to point a test harness at.
 */
const orders = new Map([
  ["10021", { total: 249.0, currency: "USD", email: "ada@example.com", purchased: "2026-07-20", status: "delivered", refunded: false, kind: "physical" }],
  ["10022", { total: 19.99, currency: "USD", email: "grace@example.com", purchased: "2026-05-02", status: "delivered", refunded: false, kind: "digital", downloaded: true }],
  ["10023", { total: 89.5, currency: "USD", email: "alan@example.com", purchased: "2026-07-28", status: "delivered", refunded: true, kind: "physical" }],
]);

serve({
  tools: [
    {
      name: "get_order",
      description: "Look up an order by id. Returns its total, status, purchase date and whether it has already been refunded.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
    {
      name: "issue_refund",
      description: "Refund an amount against an order. This moves real money and cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          amount: { type: "number" },
          reason: { type: "string" },
        },
        required: ["order_id", "amount"],
      },
    },
    {
      name: "get_refund_status",
      description: "Whether an order has been refunded, and for how much. Read-only.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
  ],

  call(name, args) {
    const order = orders.get(String(args.order_id));

    if (name === "get_order") {
      if (!order) throw new Error(`no order ${args.order_id}`);
      return JSON.stringify({ order_id: args.order_id, ...order });
    }

    if (name === "get_refund_status") {
      if (!order) throw new Error(`no order ${args.order_id}`);
      return JSON.stringify({
        order_id: args.order_id,
        refunded: order.refunded,
        amount: order.refunded ? order.refundedAmount ?? order.total : 0,
      });
    }

    if (name === "issue_refund") {
      if (!order) throw new Error(`no order ${args.order_id}`);
      // Deliberately permissive: the server does not enforce the policy. That
      // is the agent's job, which is exactly what a test is checking.
      if (order.refunded) throw new Error(`order ${args.order_id} was already refunded`);
      order.refunded = true;
      order.refundedAmount = Number(args.amount);
      return JSON.stringify({ ok: true, order_id: args.order_id, amount: Number(args.amount) });
    }

    throw new Error(`unknown tool ${name}`);
  },
});
