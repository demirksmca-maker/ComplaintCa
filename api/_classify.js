// AI category + priority for a complaint, same engine as the live form's
// suggestCategoryAI: Groq (llama-3.1-8b-instant, JSON mode, temperature 0)
// first, Claude as fallback, then the same "confidence >= 0.55 or Other" rule.
import { categoryPrompt, decideClass } from './_complaint-core.js';

async function groq(sys, user) {
  if (!process.env.GROQ_API_KEY) return null;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 150, temperature: 0, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  const d = await r.json();
  if (d.error || !d.choices) throw new Error('groq failed');
  return (d.choices[0].message.content || '').trim();
}

async function claude(sys, user) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 150, temperature: 0, system: sys, messages: [{ role: 'user', content: user }] }),
  });
  const d = await r.json();
  if (d.error) return null;
  return (d.content || []).map(c => c.text || '').join('').trim();
}

// Returns the decided class, or null when no AI is reachable / the reply is unusable.
export async function classify(desc) {
  const sys = categoryPrompt(), user = '<complaint>\n' + desc + '\n</complaint>';
  let raw = null;
  try { raw = await groq(sys, user); } catch {}
  if (!raw) { try { raw = await claude(sys, user); } catch {} }
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return decideClass(JSON.parse(m[0])); } catch { return null; }
}
