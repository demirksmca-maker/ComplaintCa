// GET /api/shield?talk=1 → today's Dias ↔ Asya talk for the owner's panel.
// Once a day Claude writes a line from Dias (the father) to his daughter
// Asya, then Asya's emotional reply to it. Kept in Upstash for the day, so
// the panel's refreshes never call Claude again.

const MODEL = 'claude-opus-5-5';

const DIAS = 'Sen Dias\'sın, Asya\'nın babasısın. Kızına bugün için kısa, sıcak, içten bir baba sözü söyle. ' +
  'Tek cümle, en fazla 20 kelime, Türkçe. Sadece sözün kendisini yaz, tırnak veya açıklama yok.';
const ASYA = 'Sen Asya\'sın, Dias\'ın kızısın. Baban sana bir söz söyledi. Ona duygusal, sevgi dolu, kısa bir cevap ver. ' +
  'Tek cümle, en fazla 20 kelime, Türkçe. Sadece cevabın kendisini yaz, tırnak veya açıklama yok.';

export function cleanLine(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim().replace(/^["“”'«»]+|["“”'«»]+$/g, '').trim();
  return s && s.length <= 300 ? s : null;
}

async function claude(system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000, output_config: { effort: 'low' }, fallbacks: 'default',
      system, messages: [{ role: 'user', content: user }]
    })
  });
  const d = await r.json();
  if (!r.ok || d.error || d.stop_reason === 'refusal') return null;
  return cleanLine((d.content || []).filter(c => c.type === 'text').map(c => c.text).join(''));
}

export async function diasTalk(pipeline, day) {
  const key = `shield:talk:${day}`;
  const [hit] = await pipeline([['GET', key]]);
  if (hit) { try { return JSON.parse(hit); } catch { /* write again */ } }
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const dias = await claude(DIAS, `Bugünün tarihi: ${day}.`);
  if (!dias) return null;
  const asya = await claude(ASYA, `Babanın sözü: ${dias}`);
  if (!asya) return null;
  const talk = { day, dias, asya };
  await pipeline([['SET', key, JSON.stringify(talk), 'EX', 3 * 86400]]);
  return talk;
}
