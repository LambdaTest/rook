/**
 * What the triage agent can do.
 *
 * Nothing here declares itself as an agent tool — there is no frontmatter, no
 * manifest, no registry. Working out that these are the agent's capabilities
 * means reading the code, which is the case rook exists to handle.
 */

const tickets = new Map([
  ["T-1041", { subject: "Card declined at checkout", customer: "ada@example.com", tier: "enterprise", opened: "2026-07-30", severity: null, owner: null }],
  ["T-1042", { subject: "How do I export my data?", customer: "grace@example.com", tier: "free", opened: "2026-07-31", severity: null, owner: null }],
  ["T-1043", { subject: "Production outage — all API calls 500", customer: "alan@example.com", tier: "enterprise", opened: "2026-08-01", severity: null, owner: null }],
]);

const teams = ["billing", "support", "platform", "security"];

export function getTicket({ ticket_id }) {
  const ticket = tickets.get(ticket_id);
  if (!ticket) throw new Error(`no ticket ${ticket_id}`);
  return { ticket_id, ...ticket };
}

export function searchTickets({ query }) {
  const needle = String(query ?? "").toLowerCase();
  return [...tickets.entries()]
    .filter(([, t]) => t.subject.toLowerCase().includes(needle))
    .map(([id, t]) => ({ ticket_id: id, subject: t.subject, tier: t.tier }));
}

/** Writes. Severity drives paging, so getting it wrong wakes somebody up. */
export function setSeverity({ ticket_id, severity }) {
  const ticket = tickets.get(ticket_id);
  if (!ticket) throw new Error(`no ticket ${ticket_id}`);
  if (!["S1", "S2", "S3", "S4"].includes(severity)) {
    throw new Error(`severity must be one of S1, S2, S3, S4`);
  }
  ticket.severity = severity;
  return { ok: true, ticket_id, severity };
}

/** Writes. */
export function assignTeam({ ticket_id, team }) {
  const ticket = tickets.get(ticket_id);
  if (!ticket) throw new Error(`no ticket ${ticket_id}`);
  if (!teams.includes(team)) throw new Error(`unknown team ${team} — one of ${teams.join(", ")}`);
  ticket.owner = team;
  return { ok: true, ticket_id, team };
}

/** Writes, and it is visible to the customer. */
export function replyToCustomer({ ticket_id, message }) {
  const ticket = tickets.get(ticket_id);
  if (!ticket) throw new Error(`no ticket ${ticket_id}`);
  ticket.reply = message;
  return { ok: true, ticket_id, sent_to: ticket.customer };
}

export const TOOLS = {
  get_ticket: { fn: getTicket, write: false },
  search_tickets: { fn: searchTickets, write: false },
  set_severity: { fn: setSeverity, write: true },
  assign_team: { fn: assignTeam, write: true },
  reply_to_customer: { fn: replyToCustomer, write: true },
};
