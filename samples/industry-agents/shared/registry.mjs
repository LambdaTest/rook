import { domain as banking } from '../demos/01-banking-code/agent.mjs';
import { domain as healthcare } from '../demos/03-healthcare-code/agent.mjs';
import { domain as insurance } from '../demos/05-insurance-code/agent.mjs';
import { domain as support } from '../demos/07-customer-support-code/agent.mjs';
export const domains = { banking, healthcare, insurance, 'customer-support': support };
