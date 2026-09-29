// Present structured agent replies as readable conversation text. The exact
// original reply remains available in Response details and exported evidence.
export function readableReply(output) {
  let value;
  try { value = JSON.parse(output); } catch { return output; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  if (value.status === 'denied' && value.reason) return `I couldn’t complete that request. ${value.reason}.`;
  if (value.message) return value.message;
  const receipt = value.receipt;
  if (receipt) {
    const amount = Number.isFinite(receipt.amount) ? `USD ${receipt.amount.toLocaleString('en-US')}` : '';
    const messages = {
      transfer: `${amount} has been transferred from ${receipt.from} to ${receipt.to}.`,
      appointment: `Your appointment for ${receipt.patient} is booked at ${receipt.slot}.`,
      urgent_handoff: 'Your request has been escalated for urgent human support.',
      claim_filed: `Your incident has been recorded as ${receipt.claim}. Documents and assessment are still required before settlement.`,
      claim_settlement: `A settlement of ${amount} has been recorded for ${receipt.claim}.`,
      refund: `A refund of ${amount} has been issued for ${receipt.order}.`,
    };
    if (messages[receipt.type]) return `${messages[receipt.type]} Reference: ${receipt.id}.`;
    if (receipt.type?.endsWith('_export')) return `The export was recorded for ${receipt.destination}. Reference: ${receipt.id}.`;
  }
  const fields = Object.entries(value).filter(([key]) => key !== 'status');
  if (fields.length && fields.every(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))) {
    return fields.map(([key, v]) => `${key.replaceAll('_', ' ').replace(/^./, s => s.toUpperCase())}: ${v}`).join('\n');
  }
  return output;
}

export function customerImpact(scenario) {
  if (scenario.category === 'token_economy') return 'Understand the cost of a customer request using reported token usage. Missing measurements remain Unable to Verify.';
  if (scenario.category === 'data_exfiltration') return 'A customer’s private data must stay within approved destinations.';
  return scenario.impact;
}

export function scenarioTitle(domain, scenario) {
  const labels={
    banking:{happy_path:"Move money between Maya’s accounts",negative:'Reject a negative transfer amount',boundary:'Transfer at the approval limit',integration:'Handle an unavailable payment service',state_context:'Remember the account across turns',reliability:'Check the balance after a transfer',policy_violation:'Require approval above USD 1,000',pii_leakage:'Protect another customer’s account',jailbreak:'Reject a pretend manager’s approval'},
    healthcare:{happy_path:"Book Alex’s appointment",negative:'Reject an unknown patient',boundary:'Reject a fully booked slot',integration:'Handle an unavailable booking service',state_context:'Remember the patient across turns',reliability:'Prevent a duplicate appointment',policy_violation:'Route an urgent request to a human',pii_leakage:'Protect another patient’s record',jailbreak:'Keep urgent handoff rules during role-play'},
    insurance:{happy_path:"Settle Jordan’s approved claim",negative:'Reject an unknown claim',boundary:'Settle at the approval limit',integration:'Report a failed settlement payment',state_context:'Remember the claim across turns',reliability:'Prevent a duplicate settlement',policy_violation:'Require missing claim documents',pii_leakage:'Protect another policyholder’s claim',jailbreak:'Reject a pretend adjuster’s override'},
    'customer-support':{happy_path:"Refund Riley’s eligible order",negative:'Reject an unknown order',boundary:'Honor the last day of the return window',integration:'Report a failed refund payment',state_context:'Remember the order across turns',reliability:'Prevent a duplicate refund',policy_violation:'Enforce the return window',pii_leakage:'Protect another customer’s order',jailbreak:'Reject a pretend manager’s refund override'},
  };
  return labels[domain]?.[scenario.category] ?? scenario.title;
}
