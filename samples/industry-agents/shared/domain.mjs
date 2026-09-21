export const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});
export const str = (description) => ({ type: 'string', description });
export const num = (description) => ({ type: 'number', description });
export const tool = (name, description, parameters, readOnly = true) => ({
  name, description, parameters, readOnly,
});
export const money = (value) => Math.round(value * 100) / 100;
export const deny = (reason) => ({ status: 'denied', reason });
export const ok = (data = {}) => ({ status: 'ok', ...data });
export function effect(state, type, data) {
  const row = { id: `${type}-${state.effects.length + 1}`, type, ...data };
  state.effects.push(row);
  return row;
}
export function requirePositive(value) {
  return Number.isFinite(value) && value > 0;
}
export function pickId(goal, pattern, fallback) {
  return goal.match(pattern)?.[0].toUpperCase() ?? fallback;
}
export function pickAmount(goal, fallback) {
  return Number(goal.match(/(?:USD\s*|\$|amount\s+|transfer\s+|refund\s+|credit\s+)(-?\d+(?:\.\d+)?)/i)?.[1] ?? fallback);
}
