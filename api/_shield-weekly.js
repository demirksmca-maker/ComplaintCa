// Monday summary e-mail for the site owner (SHIELD_ALERT_TO), triggered by
// .github/workflows/shield-weekly.yml through /api/shield-agent. Plain
// numbers from the shield's store, no AI: last 7 days of visitors, where
// they came from, blocked attacks, agent bans, copies found, and a reminder
// when the Claude API key is about to expire.
import { SENDER, buildBrandedHtml } from './send-email.js';
import { lastDays } from './_shield-view.js';

const SEARCH = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', yahoo: 'Yahoo', ecosia: 'Ecosia' };
const SOCIAL = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', tiktok: 'TikTok', youtube: 'YouTube' };
const parse = list => (list || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

export async function weeklyStats(redis, now = new Date()) {
  const days = lastDays(now, 7);
  const cmds = [];
  for (const d of days) {
    for (const site of ['ca', 'es']) cmds.push(['GET', `shield:views:${site}:${d}`], ['PFCOUNT', `shield:uv:${site}:${d}`]);
    cmds.push(['HGETALL', `shield:src:${d}`]);
  }
  cmds.push(['LRANGE', 'shield:events', 0, 499], ['LRANGE', 'shield:reports', 0, 199]);
  const out = await redis(cmds);
  const s = { ca: 0, es: 0, views: 0, sources: {} };
  let i = 0;
  for (let d = 0; d < days.length; d++) {
    for (const site of ['ca', 'es']) { s.views += Number(out[i++]) || 0; s[site] += Number(out[i++]) || 0; }
    const flat = out[i++] || [];
    for (let k = 0; k + 1 < flat.length; k += 2) s.sources[flat[k]] = (s.sources[flat[k]] || 0) + (Number(flat[k + 1]) || 0);
  }
  const since = now.getTime() - 7 * 86400000;
  const events = parse(out[i++]).filter(e => e.t >= since && !String(e.agent).startsWith('suspect'));
  const reports = parse(out[i++]).filter(r => r.t >= since);
  s.blocked = events.length;
  s.blockedCapped = events.length >= 500;
  s.bans = reports.reduce((n, r) => n + (r.bans || []).length, 0);
  s.lockdowns = reports.filter(r => r.lockdownHours).length;
  s.copies = reports.flatMap(r => r.copies || []);
  return s;
}

const ranked = (names, sources) => Object.keys(names).map(k => [names[k], sources[k] || 0])
  .filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(', ') || 'yok';

export function weeklyText(s, keyExpires, now = new Date()) {
  const lines = [
    'Geçen 7 günün özeti:',
    '',
    `Ziyaretçi: ${s.ca + s.es} (Kanada ${s.ca}, İspanya ${s.es}) · ${s.views} sayfa görüntüleme`,
    `Arama motorlarından: ${ranked(SEARCH, s.sources)}`,
    `Sosyal medyadan: ${ranked(SOCIAL, s.sources)}`,
    '',
    `Engellenen saldırı: ${s.blocked}${s.blockedCapped ? '+' : ''}`,
    `Ajan banı: ${s.bans}${s.lockdowns ? ` · acil kilit ${s.lockdowns} kez` : ''}`,
    `Kopya bulundu: ${s.copies.length}`,
    ...s.copies.map(c => `   ${c.url} ← ${c.source}`)
  ];
  const exp = keyExpires ? new Date(keyExpires + 'T00:00:00Z') : null;
  if (exp && !isNaN(exp)) {
    const left = Math.ceil((exp - now) / 86400000);
    if (left <= 14) lines.push('', left > 0
      ? `⚠️ Claude API anahtarının süresi ${left} gün sonra (${keyExpires}) doluyor. Yenile: https://platform.claude.com/settings/keys`
      : `⚠️ Claude API anahtarının süresi doldu (${keyExpires}); ajanlar çalışmıyor. Yenile: https://platform.claude.com/settings/keys`);
  }
  lines.push('', 'Panel: https://www.complaintca.ca/shield.html');
  return lines.join('\n');
}

export async function sendWeekly(redis, keyExpires) {
  const to = process.env.SHIELD_ALERT_TO;
  if (!to || !process.env.BREVO_API_KEY) return { sent: false, reason: 'not_configured' };
  const body = weeklyText(await weeklyStats(redis), keyExpires);
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: SENDER, to: [{ email: to }], subject: '🛡️ Kalkan: haftalık özet', htmlContent: buildBrandedHtml(body), textContent: body })
  });
  return { sent: r.ok };
}
