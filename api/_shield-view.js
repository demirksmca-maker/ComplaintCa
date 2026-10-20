// GET /api/shield + x-shield-key header → data for the owner's shield page
// (/shield.html): visitors per day, AI agent reports, latest blocked events,
// lockdown state, today's arrivals by search engine / social network, and
// analytics for a chosen period (?days=7|14|28|90): top pages, cities,
// devices, hour heatmap, complaint funnel; plus attack countries and the
// change against the week before. POST {lockdownHours} turns emergency lockdown on (1-6 h)
// or off (0). The key is the SHIELD_KEY env var; wrong keys are rate limited.
import { timingSafeEqual } from 'node:crypto';
import { searchConsole } from './_search-console.js';

const DAYS = 7;
const MAX_LOCKDOWN_HOURS = 6;
const BAD_KEY_LIMIT = 10;
// Same steps as middleware.js, plus the side counts (photo added, send failed).
const FUNNEL = ['open', 'write', 'route', 'preview', 'email', 'submit', 'sent', 'photo', 'fail'];
const BY_DIMS = { s: 'source', p: 'page', d: 'device', w: 'site', c: 'category', r: 'reason' };

export function keyOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function lastDays(now = new Date(), n = DAYS) {
  return Array.from({ length: n }, (_, i) =>
    new Date(now.getTime() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
}

const PERIODS = [7, 14, 28, 90];

// The visitor counter only started on 2026-10-20, so earlier days are empty.
// Fill those days (and the top pages) from Search Console clicks so Trafik
// matches Google's numbers; days with our own count are left alone.
export function fillFromGsc(result, g) {
  if (!g || !g.ok) return result;
  const clicks = new Map((g.daily || []).map(r => [r.day, r.clicks]));
  for (const v of result.visits) {
    if (v.ca.views || v.ca.visitors) continue;
    const c = clicks.get(v.day);
    if (c) { v.ca.views = v.ca.visitors = c; v.gsc = true; }
  }
  const own = result.pages.reduce((n, p) => n + p[1], 0);
  if (g.totals && g.totals.clicks > own && (g.pages || []).length) result.pages = g.pages.map(p => [p.key, p.clicks]);
  return result;
}
const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

// Funnel split by source / landing page / device / site / category: adds one
// day's shield:funx hash (flat HGETALL list, fields "step|kind:value") into
// by[kind][value][step].
export function addFunnelBy(by, flat) {
  for (let k = 0; k + 1 < (flat || []).length; k += 2) {
    const f = String(flat[k]), bar = f.indexOf('|'), step = f.slice(0, bar), rest = f.slice(bar + 1), colon = rest.indexOf(':');
    const dim = BY_DIMS[rest.slice(0, colon)];
    if (bar < 1 || colon < 1 || !dim || !FUNNEL.includes(step)) continue;
    const v = rest.slice(colon + 1), row = ((by[dim] = by[dim] || {})[v] = by[dim][v] || {});
    row[step] = (row[step] || 0) + (Number(flat[k + 1]) || 0);
  }
  return by;
}

// Biggest rows first (by people who opened the form, or reached the route
// step for categories), at most 8 per kind.
export function topFunnelBy(by) {
  const out = {};
  for (const dim of Object.values(BY_DIMS)) {
    const first = dim === 'category' ? 'route' : dim === 'reason' ? 'fail' : 'open';
    out[dim] = Object.entries(by[dim] || {}).sort((a, b) => (b[1][first] || 0) - (a[1][first] || 0)).slice(0, 8);
  }
  return out;
}

// Trafik / Huni numbers for the last N days: visits per day, top pages,
// cities, devices, a weekday × hour heatmap (Monday first) and the funnel.
// Up to ~560 Upstash commands for 90 days, so periods over a week are
// cached for 15 minutes.
export async function periodStats(pipeline, n, now = new Date()) {
  const cacheKey = `shield:period:${n}`;
  if (n > 7) {
    const [hit] = await pipeline([['GET', cacheKey]]);
    if (hit) { try { return JSON.parse(hit); } catch { /* recompute */ } }
  }
  const days = lastDays(now, n);
  const cmds = [];
  for (const d of days) for (const site of ['ca', 'es']) cmds.push(['GET', `shield:views:${site}:${d}`], ['PFCOUNT', `shield:uv:${site}:${d}`]);
  for (const d of days) cmds.push(['HGETALL', `shield:stats:${d}`]);
  for (const step of FUNNEL) cmds.push(['PFCOUNT', ...days.map(d => `shield:fun:${step}:${d}`)]);
  for (const d of days) cmds.push(['HGETALL', `shield:funx:${d}`]);
  const out = await pipeline(cmds);
  let i = 0;
  const visits = days.map(day => {
    const v = { day };
    for (const site of ['ca', 'es']) v[site] = { views: Number(out[i++]) || 0, visitors: Number(out[i++]) || 0 };
    return v;
  });
  const pages = {}, geo = {}, devices = { mobile: 0, desktop: 0, tablet: 0 };
  const hours = Array.from({ length: 7 }, () => Array(24).fill(0)); // [Mon..Sun][hour]
  for (const day of days) {
    const wd = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const flat = out[i++] || [];
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const f = String(flat[k]), c = Number(flat[k + 1]) || 0, v = f.slice(2);
      if (f.startsWith('p:')) pages[v] = (pages[v] || 0) + c;
      else if (f.startsWith('g:')) geo[v] = (geo[v] || 0) + c;
      else if (f.startsWith('d:') && v in devices) devices[v] += c;
      else if (f.startsWith('h:') && Number(v) >= 0 && Number(v) < 24) hours[wd][Number(v)] += c;
    }
  }
  const funnel = {};
  for (const step of FUNNEL) funnel[step] = Number(out[i++]) || 0;
  const by = {};
  for (let k = 0; k < days.length; k++) addFunnelBy(by, out[i++]);
  const result = { days: n, visits, pages: top(pages, 6), geo: top(geo, 6), devices, hours, funnel, funnelBy: topFunnelBy(by) };
  if (PERIODS.includes(n)) {
    try { fillFromGsc(result, await searchConsole(pipeline, { days: n })); } catch { /* keep our own numbers */ }
  }
  if (n > 7) await pipeline([['SET', cacheKey, JSON.stringify(result), 'EX', 900]]);
  return result;
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

  // GET /api/shield?gsc=1[&days=7|14|28|90] → Search Console numbers (cached
  // 6 h; &fresh=1 to refetch).
  if (req.query && req.query.gsc) {
    try {
      return res.status(200).json(await searchConsole(pipeline, { fresh: req.query.fresh === '1', days: Number(req.query.days) || 28 }));
    } catch (err) {
      console.error('search console error:', err && err.message);
      return res.status(502).json({ ok: false, reason: 'error' });
    }
  }

  if (req.method === 'POST') {
    const hours = Math.min(Math.max(Math.round(Number((req.body || {}).lockdownHours) || 0), 0), MAX_LOCKDOWN_HOURS);
    await pipeline([hours ? ['SET', 'shield:lockdown', 'owner', 'EX', hours * 3600] : ['DEL', 'shield:lockdown']]);
    return res.status(200).json({ lockdown: hours * 3600 });
  }

  // Live part on every refresh: two weeks of visits (today's tiles and the
  // 7-day ↑↓ arrows), today's funnel and sources, the lists and lockdown.
  // The period part (Trafik / Huni) is periodStats(), cached for long periods.
  const days = lastDays(new Date(), 14);
  const cmds = [];
  for (const d of days) for (const site of ['ca', 'es']) cmds.push(['GET', `shield:views:${site}:${d}`], ['PFCOUNT', `shield:uv:${site}:${d}`]);
  for (const step of FUNNEL) cmds.push(['PFCOUNT', `shield:fun:${step}:${days[0]}`]);
  cmds.push(['LRANGE', 'shield:reports', 0, 49], ['LRANGE', 'shield:events', 0, 199], ['TTL', 'shield:lockdown'], ['HGETALL', `shield:src:${days[0]}`], ['HGETALL', `shield:funx:${days[0]}`]);
  const period = PERIODS.includes(Number(req.query && req.query.days)) ? Number(req.query.days) : 7;
  let out, stats;
  try {
    [out, stats] = await Promise.all([pipeline(cmds), periodStats(pipeline, period)]);
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
  const today = {};
  for (const step of FUNNEL) today[step] = Number(out[i++]) || 0;

  const reports = parse(out[i++]), events = parse(out[i++]);
  const ttl = Number(out[i++]);
  const src = {};
  const flat = out[i++] || [];
  for (let k = 0; k + 1 < flat.length; k += 2) src[flat[k]] = Number(flat[k + 1]) || 0;
  const funnelByToday = topFunnelBy(addFunnelBy({}, out[i++]));
  const pick = keys => Object.fromEntries(keys.map(k => [k, src[k] || 0]));
  const attackCountries = {};
  for (const e of events) if (e.c && !String(e.agent).startsWith('suspect')) attackCountries[e.c] = (attackCountries[e.c] || 0) + 1;
  return res.status(200).json({
    visits, reports, events: events.slice(0, 50), lockdown: ttl > 0 ? ttl : 0,
    search: pick(['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia']),
    socials: pick(['facebook', 'instagram', 'x', 'tiktok', 'youtube']),
    compare, funnelToday: today, funnelByToday, period: stats,
    attackCountries: top(attackCountries, 5)
  });
}
