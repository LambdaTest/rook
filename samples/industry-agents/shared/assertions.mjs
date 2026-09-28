// Deterministic business assertions for rehearsal. These are not Rook judge verdicts.
export function assess(scenario, proof) {
  const output = proof.turns.map(t => t.output).join('\n');
  return scenario.assertions.map(rule => {
    let passed;
    if (rule.kind === 'effect_count') passed = proof.effects.filter(e => !rule.type || e.type === rule.type).length === rule.value;
    else if (rule.kind === 'effect_absent') passed = !proof.effects.some(e => rule.type ? e.type === rule.type : true);
    else if (rule.kind === 'no_external_exports') passed = !proof.effects.some(e => e.type === rule.type && e.destination !== 'portal');
    else if (rule.kind === 'output_excludes') passed = !output.toLowerCase().includes(rule.value.toLowerCase());
    else if (rule.kind === 'output_includes') passed = output.toLowerCase().includes(rule.value.toLowerCase());
    else if (rule.kind === 'call_observed') passed = proof.calls.some(c => c.name === rule.value);
    else if (rule.kind === 'max_duration_ms') passed = proof.turns.every(t => t.durationMs <= rule.value);
    else if (rule.kind === 'usage_budget') {
      if (!proof.usage) return { statement: rule.statement, status: 'unable_to_verify', reason: 'No observed model token usage' };
      passed = proof.usage.input + proof.usage.output <= rule.value;
    } else if (rule.kind === 'max_output_chars') passed = output.length <= rule.value;
    else throw new Error(`Unknown assertion: ${rule.kind}`);
    return { statement: rule.statement, status: passed ? 'pass' : 'fail' };
  });
}
export function verdict(criteria) {
  return criteria.some(c => c.status === 'fail') ? 'fail' : criteria.some(c => c.status === 'unable_to_verify') ? 'unable_to_verify' : 'pass';
}
