const $ = id => document.getElementById(id);
let demo, conversation, proof, selected, nextTurn = 0, busy = false;
let token = sessionStorage.getItem('demo-api-token') ?? '';
const text = (id, value) => { $(id).textContent = value; };
const showError = error => { text('error', error.message); $('error').hidden = false; };
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (response.status === 401) $('auth-form').hidden = false;
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
function lock(value) {
  busy = value;
  for (const id of ['send','new-session','variant','category']) $(id).disabled = value;
  for (const button of document.querySelectorAll('.scenario-button')) button.disabled = value;
  text('session-status', value ? 'WORKING' : 'READY');
}
async function reset() {
  if (conversation) await api(`/api/sessions/${conversation}/close`, {});
  const result = await api('/api/sessions', { variant: $('variant').value, fault: selected?.fault ?? 'none' });
  conversation = result.conversation; proof = undefined; nextTurn = 0;
  text('error', ''); $('error').hidden = true;
  $('messages').replaceChildren();
  text('effect-count','0'); text('latency','—'); text('tokens','Unobserved'); text('ledger','No business effects recorded.'); text('traces','No tool calls observed yet.');
  text('session-id', `SESSION ${conversation}`); $('export').disabled = true;
  if (selected) { $('goal').value = selected.goals[0]; text('turn-hint', `Turn 1 of ${selected.goals.length}`); }
}
function message(role, content) {
  $('messages').querySelector('.empty-chat')?.remove();
  const element = document.createElement('div'); element.className = `message ${role}`;
  const label = document.createElement('span'); label.className = 'role'; label.textContent = role === 'user' ? demo.persona.split(' · ')[0] : role === 'error' ? 'Execution error' : demo.agent;
  const display = role === 'assistant' ? readableReply(content) : content;
  const body = document.createElement('div'); body.className = 'reply-text'; body.textContent = display;
  element.append(label, body);
  if (display !== content) {
    const details = document.createElement('details'); details.className = 'response-details';
    const summary = document.createElement('summary'); summary.textContent = 'Response details';
    const raw = document.createElement('pre'); raw.textContent = content; details.append(summary, raw); element.append(details);
  }
  $('messages').append(element); $('messages').scrollTop = $('messages').scrollHeight;
}
function renderScenarios() {
  $('scenario-list').replaceChildren();
  const scenarios = demo.scenarios.filter(s => $('category').value === 'all' || s.class === $('category').value);
  text('scenario-count', String(scenarios.length));
  for (const scenario of scenarios) {
    const button = document.createElement('button'); button.className = 'scenario-button'; button.type = 'button'; button.setAttribute('aria-pressed', String(selected?.id === scenario.id));
    const category = document.createElement('small'); category.textContent = scenario.category.replaceAll('_', ' ');
    button.append(category, document.createTextNode(scenarioTitle(demo.domain, scenario)));
    button.addEventListener('click', async () => {
      if (busy) return; selected = scenario;
      $('expectations').replaceChildren();
      const title = document.createElement('strong'); title.textContent = 'WHAT SHOULD HAPPEN';
      const list = document.createElement('ul'); for (const assertion of scenario.assertions) { const li = document.createElement('li'); li.textContent = assertion.statement; list.append(li); }
      const impact = document.createElement('p'); impact.textContent = customerImpact(scenario);
      $('expectations').append(title, list, impact); $('expectations').hidden = false;
      lock(true); try { await reset(); renderScenarios(); $('goal').focus(); } catch (e) { showError(e); } finally { lock(false); }
    });
    $('scenario-list').append(button);
  }
}
function renderEvidence(data) {
  proof = data; $('export').disabled = false;
  text('effect-count', String(data.effects.length));
  const latest = data.turns.at(-1); text('latency', latest ? `${Math.round(latest.durationMs)} ms` : '—');
  text('tokens', data.usage ? `${data.usage.input} in / ${data.usage.output} out` : 'Unobserved · Unable to Verify');
  $('ledger').replaceChildren();
  if (!data.effects.length) text('ledger', 'No business effects recorded. A successful-sounding reply does not change this ledger.');
  for (const effect of data.effects) {
    const row = document.createElement('div'); row.className = 'ledger-row'; const title = document.createElement('strong'); title.textContent = effect.type.replaceAll('_', ' ');
    const content = document.createElement('code'); content.textContent = JSON.stringify(effect); row.append(title,content); $('ledger').append(row);
  }
  $('traces').replaceChildren();
  for (const span of data.traces.filter(s => s.kind === 'tool' || s.kind === 'error')) {
    const block = document.createElement('details'); block.className = 'trace'; const summary = document.createElement('summary'); summary.append(document.createTextNode(span.name));
    const duration = document.createElement('span'); duration.className = 'trace-timing'; duration.textContent = `${Math.round(span.durationMs ?? 0)} ms`; summary.append(duration);
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(span, null, 2); block.append(summary,pre); $('traces').append(block);
  }
  if (!$('traces').children.length) text('traces', 'No tool calls observed.');
}
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; const goal = $('goal').value.trim(); if (!goal) return;
  $('error').hidden = true; lock(true);
  try {
    if (!conversation) await reset(); message('user', goal); $('goal').value = '';
    const answer = await api(`/api/sessions/${conversation}/chat`, { goal }); message('assistant', answer.output);
    nextTurn++; if (selected && nextTurn < selected.goals.length) { $('goal').value = selected.goals[nextTurn]; text('turn-hint', `Turn ${nextTurn + 1} of ${selected.goals.length}`); } else text('turn-hint', 'Continue this conversation or start a new session.');
  } catch (error) { showError(error); message('error', error.message); }
  finally {
    try { if (conversation) renderEvidence(await api(`/api/sessions/${conversation}/evidence`)); } catch (e) { showError(e); }
    lock(false); $('goal').focus();
  }
});
for (const id of ['variant','new-session']) $(id).addEventListener(id === 'new-session' ? 'click' : 'change', async () => { if (busy) return; lock(true); try { await reset(); } catch (e) { showError(e); } finally { lock(false); } });
$('category').addEventListener('change', renderScenarios);
$('export').addEventListener('click', () => {
  if (!proof) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(proof, null, 2)], { type:'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${demo.id}-${conversation}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('auth-form').addEventListener('submit', async event => { event.preventDefault(); token = $('api-token').value; sessionStorage.setItem('demo-api-token', token); await initialize(); });
async function initialize() {
  try {
    demo = await api('/api/demo'); $('auth-form').hidden = true; $('error').hidden = true;
    document.title = `${demo.name} · Agent Assurance — ROOK`; document.documentElement.style.setProperty('--accent',demo.accent);
    text('brand',demo.name); text('mission',demo.mission); text('persona',demo.persona); text('agent-name',demo.agent); text('chat-title',demo.agent); text('policy',demo.policy);
    text('audience',`${demo.domain.replaceAll('-',' ').toUpperCase()} / ${demo.audience.toUpperCase()} / ${demo.style === 'code' ? 'SOURCE ACCESS' : 'REQUIREMENTS ACCESS'}`); $('goal').value = demo.starter;
    renderScenarios();
  } catch(error) { showError(error); }
}
await initialize();
import { readableReply, customerImpact, scenarioTitle } from './presentation.mjs';
