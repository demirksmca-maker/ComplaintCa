// GET /api/shield + x-shield-key header → data for the owner's shield page
// (/shield.html): visitors per day, AI agent reports, latest blocked events,
// lockdown state, today's arrivals by search engine / social network. POST {lockdownHours} turns emergency lockdown on (1-6 h)
// or off (0). The key is the SHIELD_KEY env var; wrong keys are rate limited.
import { timingSafeEqual } from 'node:crypto';

const DAYS = 7;
const MAX_LOCKDOWN_HOURS = 6;
const BAD_KEY_LIMIT = 10;

export function keyOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function lastDays(now = new Date(), n = DAYS) {
  return Array.from({ length: n }, (_, i) =>
    new Date(now.getTime() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
}

const parse = list => (list || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

export async function shieldView(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!process.env.SHIELD_KEY) return res.status(503).json({ error: 'not_configured' });
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !token) return res.status(503).json({ error: 'no_upstash' });

  const pipeline = async cmds => {
    const r = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds)
    });
    if (!r.ok) throw new Error(`upstash ${r.status}`);
    return (await r.json()).map(x => x.result);
  };

  // Only wrong keys count toward the limit, so the panel's own refreshes
  // never lock the owner out; after BAD_KEY_LIMIT misses the IP waits
  // 10 minutes, even with the right key (no brute forcing).
  const badKey = `shield:badkey:${ip}`;
  let bad;
  try {
    [bad] = await pipeline([['GET', badKey]]);
  } catch {
    return res.status(502).json({ error: 'upstash' });
  }
  if (Number(bad) >= BAD_KEY_LIMIT) return res.status(429).json({ error: 'cooldown' });
  if (!keyOk(req.headers['x-shield-key'], process.env.SHIELD_KEY)) {
    await pipeline([['INCR', badKey], ['EXPIRE', badKey, 600]]).catch(() => {});
    return res.status(403).json({ error: 'forbidden' });
  }

  if (req.method === 'POST') {
    const hours = Math.min(Math.max(Math.round(Number((req.body || {}).lockdownHours) || 0), 0), MAX_LOCKDOWN_HOURS);
    await pipeline([hours ? ['SET', 'shield:lockdown', 'owner', 'EX', hours * 3600] : ['DEL', 'shield:lockdown']]);
    return res.status(200).json({ lockdown: hours * 3600 });
  }

  const days = lastDays();
  const cmds = [];
  for (const d of days) for (const site of ['ca', 'es']) cmds.push(['GET', `shield:views:${site}:${d}`], ['PFCOUNT', `shield:uv:${site}:${d}`]);
  cmds.push(['LRANGE', 'shield:reports', 0, 49], ['LRANGE', 'shield:events', 0, 49], ['TTL', 'shield:lockdown'], ['HGETALL', `shield:src:${days[0]}`]);
  let out;
  try {
    out = await pipeline(cmds);
  } catch {
    return res.status(502).json({ error: 'upstash' });
  }
  let i = 0;
  const visits = days.map(day => {
    const v = { day };
    for (const site of ['ca', 'es']) v[site] = { views: Number(out[i++]) || 0, visitors: Number(out[i++]) || 0 };
    return v;
  });
  const reports = parse(out[i++]), events = parse(out[i++]);
  const ttl = Number(out[i++]);
  const src = {};
  const flat = out[i++] || [];
  for (let k = 0; k + 1 < flat.length; k += 2) src[flat[k]] = Number(flat[k + 1]) || 0;
  const pick = keys => Object.fromEntries(keys.map(k => [k, src[k] || 0]));
  return res.status(200).json({
    visits, reports, events, lockdown: ttl > 0 ? ttl : 0,
    search: pick(['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia']),
    socials: pick(['facebook', 'instagram', 'x', 'tiktok', 'youtube'])
  });
}
