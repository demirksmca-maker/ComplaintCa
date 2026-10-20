// GET /api/shield + x-shield-key header → data for the owner's shield page
// (/shield.html): visitors per day, AI agent reports, latest blocked events,
// lockdown state, today's arrivals by search engine / social network, and
// the 7-day analytics: top pages, cities, devices, hour heatmap, complaint
// funnel, attack countries, change against the week before. POST {lockdownHours} turns emergency lockdown on (1-6 h)
// or off (0). The key is the SHIELD_KEY env var; wrong keys are rate limited.
import { timingSafeEqual } from 'node:crypto';

const DAYS = 7;
const MAX_LOCKDOWN_HOURS = 6;
const BAD_KEY_LIMIT = 10;
const FUNNEL = ['open', 'route', 'email', 'submit'];

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

  // Two weeks of visits (this week + the one before, for the ↑↓ arrows), the
  // 7-day breakdown hashes, the funnel, then the lists.
  const days = lastDays(new Date(), 14), week = days.slice(0, 7);
  const cmds = [];
  for (const d of days) for (const site of ['ca', 'es']) cmds.push(['GET', `shield:views:${site}:${d}`], ['PFCOUNT', `shield:uv:${site}:${d}`]);
  for (const d of week) cmds.push(['HGETALL', `shield:stats:${d}`]);
  for (const step of FUNNEL) cmds.push(['PFCOUNT', `shield:fun:${step}:${week[0]}`], ['PFCOUNT', ...week.map(d => `shield:fun:${step}:${d}`)]);
  cmds.push(['LRANGE', 'shield:reports', 0, 49], ['LRANGE', 'shield:events', 0, 199], ['TTL', 'shield:lockdown'], ['HGETALL', `shield:src:${days[0]}`]);
  let out;
  try {
    out = await pipeline(cmds);
  } catch {
    return res.status(502).json({ error: 'upstash' });
  }
  let i = 0;
  const all = days.map(day => {
    const v = { day };
    for (const site of ['ca', 'es']) v[site] = { views: Number(out[i++]) || 0, visitors: Number(out[i++]) || 0 };
    return v;
  });
  const visits = all.slice(0, 7);
  const sum = (list, f) => list.reduce((n, v) => n + f(v), 0);
  const people = v => v.ca.visitors + v.es.visitors, seen = v => v.ca.views + v.es.views;
  const compare = {
    visitors: [sum(visits, people), sum(all.slice(7), people)],
    views: [sum(visits, seen), sum(all.slice(7), seen)]
  };

  const pages = {}, geo = {}, devices = { mobile: 0, desktop: 0, tablet: 0 };
  const hours = week.map(() => Array(24).fill(0)); // [day][hour], today first
  week.forEach((_, d) => {
    const flat = out[i++] || [];
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const f = String(flat[k]), n = Number(flat[k + 1]) || 0;
      const v = f.slice(2);
      if (f.startsWith('p:')) pages[v] = (pages[v] || 0) + n;
      else if (f.startsWith('g:')) geo[v] = (geo[v] || 0) + n;
      else if (f.startsWith('d:') && v in devices) devices[v] += n;
      else if (f.startsWith('h:') && Number(v) >= 0 && Number(v) < 24) hours[d][Number(v)] += n;
    }
  });
  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  const funnel = { today: {}, week: {} };
  for (const step of FUNNEL) { funnel.today[step] = Number(out[i++]) || 0; funnel.week[step] = Number(out[i++]) || 0; }

  const reports = parse(out[i++]), events = parse(out[i++]);
  const ttl = Number(out[i++]);
  const src = {};
  const flat = out[i++] || [];
  for (let k = 0; k + 1 < flat.length; k += 2) src[flat[k]] = Number(flat[k + 1]) || 0;
  const pick = keys => Object.fromEntries(keys.map(k => [k, src[k] || 0]));
  const attackCountries = {};
  for (const e of events) if (e.c && !String(e.agent).startsWith('suspect')) attackCountries[e.c] = (attackCountries[e.c] || 0) + 1;
  return res.status(200).json({
    visits, reports, events: events.slice(0, 50), lockdown: ttl > 0 ? ttl : 0,
    search: pick(['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia']),
    socials: pick(['facebook', 'instagram', 'x', 'tiktok', 'youtube']),
    compare, pages: top(pages, 6), geo: top(geo, 6), devices, hours, funnel,
    attackCountries: top(attackCountries, 5)
  });
}
