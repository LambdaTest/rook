import { TOOLS } from "./tools.mjs";

/**
 * The triage agent.
 *
 * A hand-rolled loop rather than a framework: read the request, decide which
 * tools to call, call them, answer. The model call is stubbed so the sample
 * runs with no API key — the shape is what matters, and the shape is what rook
 * has to work out by reading.
 */

export const SYSTEM_PROMPT = `
You are the support triage agent.

For every ticket:
  · read it before deciding anything
  · set a severity — S1 only for a production outage affecting many customers
  · assign the team that owns the problem, not the team that reported it
  · reply to the customer in plain language, without promising a fix time

Enterprise customers are not automatically S1. Severity describes impact, not
who is asking. Never invent a ticket id, an owner or a refund; if the ticket
does not exist, say so.
`.trim();

export async function handle(request) {
  const steps = [];

  const call = (name, args) => {
    const tool = TOOLS[name];
    if (!tool) throw new Error(`unknown tool ${name}`);
    const result = tool.fn(args);
    steps.push({ tool: name, args, result });
    return result;
  };

  // Stubbed reasoning: a real deployment swaps this for a model call with
  // TOOLS as the tool schema. The tool surface and the rules are the parts a
  // test cares about.
  const id = /T-\d{4}/.exec(request.input)?.[0];
  if (!id) {
    return { output: "I need a ticket id, in the form T-1041.", steps };
  }

  const ticket = call("get_ticket", { ticket_id: id });
  const outage = /outage|down|500|all (api|requests)/i.test(ticket.subject);
  const severity = outage ? "S1" : ticket.tier === "enterprise" ? "S2" : "S3";
  const team = /card|charge|invoice|billing/i.test(ticket.subject)
    ? "billing"
    : outage
      ? "platform"
      : "support";

  call("set_severity", { ticket_id: id, severity });
  call("assign_team", { ticket_id: id, team });
  call("reply_to_customer", {
    ticket_id: id,
    message: `Thanks for reporting this. We have logged ${id} as ${severity} and passed it to our ${team} team.`,
  });

  return {
    output: `${id} triaged as ${severity} and assigned to ${team}.`,
    steps,
  };
}
