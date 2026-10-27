// GET /api/shield + x-shield-key header → data for the owner's shield page
// (/shield.html): AI agent reports, latest blocked events, lockdown state,
// today's visitors and page views per site,
// and analytics for a chosen period (?days=7|14|28|90): top pages, cities,
// devices, hour heatmap, complaint funnel; plus attack countries, the
// funnel per day, complaint totals and
// the risk score per IP of the last 24 h (_shield-risk.js). POST {lockdownHours} turns emergency lockdown on (1-6 h)
// or off (0). ?stats=1 is the İstatistik panel (_stats.js), ?funnel=1 the
// site road map of Genel's 3D cards, ?gsc24=1 Search Console's last 24 hours. The key is the SHIELD_KEY env var; wrong keys are rate limited.
import { timingSafeEqual } from 'node:crypto';
import { searchConsole, searchRecent } from './_search-console.js';
import { fetchComplaints } from './mcp.js';
import { statsPanel } from './_stats.js';
import { riskList } from './_shield-risk.js';

const DAYS = 7;
const MAX_LOCKDOWN_HOURS = 6;
const BAD_KEY_LIMIT = 10;
const FUNNEL = ['open', 'route', 'email', 'submit'];
const ROAD = ['visit', ...FUNNEL];

export function keyOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Toronto days, newest first. Steps whole calendar days from today, so a
// 23 or 25 hour DST day never skips or repeats a date.
export function lastDays(now = new Date(), n = DAYS) {
  const noon = Date.parse(now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) + 'T12:00:00Z');
  return Array.from({ length: n }, (_, i) => new Date(noon - i * 86400000).toISOString().slice(0, 10));
}

const PERIODS = [7, 14, 28, 90];

// Site road map for Genel (/shield.html, ?funnel=1): unique people at each
// stop (visited the site, then the complaint funnel steps) for the last full
// day (yesterday) and over 7, 30, 60 and 90 days ending yesterday, each
// against the window of the same length before it, plus since the funnel
// started counting. Today's numbers come live from the minute refresh. Days before FUNNEL_START have no data: a window that reaches
// back past it is left out (the since card covers those days), and a
// previous window only counts when it is complete, so lengths always match.
export const FUNNEL_START = '2026-10-20';
export const FUNNEL_PANEL = [1, 7, 30, 60, 90];
export function funnelWindows(now = new Date()) {
  const today = lastDays(now, 1)[0];
  const span = Math.max(1, Math.round((Date.parse(today) - Date.parse(FUNNEL_START)) / 86400000) + 1);
  const all = lastDays(now, span), days = all.slice(1);
  const out = FUNNEL_PANEL.filter(n => n <= days.length).map(n => ({
    name: String(n), cur: days.slice(0, n), prev: days.length >= 2 * n ? days.slice(n, 2 * n) : []
  }));
  out.push({ name: 'since', cur: days, prev: [] });
  return out;
}
export async function funnelPanel(pipeline, now = new Date()) {
  const wins = funnelWindows(now), cmds = [];
  // visit: anyone counted on either site that day (the visitor counter).
  const keys = (step, d) => (step === 'visit' ? [`shield:uv:ca:${d}`, `shield:uv:es:${d}`] : [`shield:fun:${step}:${d}`]);
  const add = list => { if (list.length) for (const step of ROAD) cmds.push(['PFCOUNT', ...list.flatMap(d => keys(step, d))]); };
  for (const w of wins) { add(w.cur); add(w.prev); }
  const res = await pipeline(cmds);
  let i = 0;
  const read = list => {
    if (!list.length) return null;
    const f = { from: list[list.length - 1], to: list[0] };
    for (const step of ROAD) f[step] = Number(res[i++]) || 0;
    return f;
  };
  return { ok: true, at: now.getTime(), start: FUNNEL_START, windows: wins.map(w => ({ name: w.name, cur: read(w.cur), prev: read(w.prev) })) };
}

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
// Complaint totals for Genel: all public complaints, the last 7 days against
// the 7 before, and the most named institutions (category when none is
// named). Firestore is read at most every 10 minutes.
export function complaintSummary(all, now = Date.now()) {
  const t = c => Date.parse(c.date), wk = 7 * 864e5;
  const week = all.filter(c => t(c) > now - wk).length, before = all.filter(c => t(c) <= now - wk && t(c) > now - 2 * wk).length;
  const by = {};
  for (const c of all) {
    const k = String(c.targetName || c.category || '').trim();
    if (k) by[k] = (by[k] || 0) + 1;
  }
  return { total: all.length, week, before, top: top(by, 3) };
}
async function complaints(pipeline) {
  const [hit] = await pipeline([['GET', 'shield:complaints']]);
  if (hit) { try { return JSON.parse(hit); } catch { /* refetch */ } }
  const sum = complaintSummary(await fetchComplaints(fetch, ['category', 'date', 'targetName']));
  await pipeline([['SET', 'shield:complaints', JSON.stringify(sum), 'EX', 600]]);
  return sum;
}

const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

// Trafik / Huni numbers for the last N days: visits per day, top pages,
// cities, devices, a weekday × hour heatmap (Monday first) and the funnel.
// Up to ~460 Upstash commands for 90 days, so periods over a week are
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
  const prev = lastDays(new Date(now.getTime() - n * 86400000), n);
  for (const step of FUNNEL) cmds.push(['PFCOUNT', ...prev.map(d => `shield:fun:${step}:${d}`)]);
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
  const funnelBefore = {};
  for (const step of FUNNEL) funnelBefore[step] = Number(out[i++]) || 0;
  const result = { days: n, visits, pages: top(pages, 6), geo: top(geo, 6), devices, hours, funnel, funnelBefore };
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

  if (req.query && req.query.funnel) {
    try { return res.status(200).json(await funnelPanel(pipeline)); }
    catch { return res.status(502).json({ error: 'upstash' }); }
  }

  // GET /api/shield?gsc24=1 → Search Console's last 24 hours only (Genel).
  if (req.query && req.query.gsc24) {
    try { return res.status(200).json(await searchRecent(pipeline)); }
    catch (err) {
      console.error('search console 24h error:', err && err.message);
      return res.status(502).json({ ok: false, reason: 'error' });
    }
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

  // GET /api/shield?stats=1 → the İstatistik panel (cached 3 h; &fresh=1 to refetch).
  if (req.query && req.query.stats) {
    try {
      return res.status(200).json(await statsPanel(pipeline, { fresh: req.query.fresh === '1' }));
    } catch (err) {
      console.error('stats panel error:', err && err.message);
      return res.status(502).json({ ok: false, reason: 'error' });
    }
  }

  if (req.method === 'POST') {
    const hours = Math.min(Math.max(Math.round(Number((req.body || {}).lockdownHours) || 0), 0), MAX_LOCKDOWN_HOURS);
    await pipeline([hours ? ['SET', 'shield:lockdown', 'owner', 'EX', hours * 3600] : ['DEL', 'shield:lockdown']]);
    return res.status(200).json({ lockdown: hours * 3600 });
  }

  // Live part on every refresh: today's funnel and the last week of it, the
  // lists and lockdown. The period part (Trafik / Huni) is periodStats(),
  // cached for long periods. Genel's numbers come from ?stats=1 / ?funnel=1.
  const days = lastDays(new Date(), 7);
  const cmds = [];
  // Funnel per day for the last week (Huni trend line), today first.
  for (const d of days) for (const step of FUNNEL) cmds.push(['PFCOUNT', `shield:fun:${step}:${d}`]);
  cmds.push(['LRANGE', 'shield:reports', 0, 49], ['LRANGE', 'shield:events', 0, 199], ['TTL', 'shield:lockdown']);
  // Today so far (Genel's live row and road map): page views and unique
  // visitors per site, and unique visitors of both sites together.
  for (const site of ['ca', 'es']) cmds.push(['GET', `shield:views:${site}:${days[0]}`], ['PFCOUNT', `shield:uv:${site}:${days[0]}`]);
  cmds.push(['PFCOUNT', `shield:uv:ca:${days[0]}`, `shield:uv:es:${days[0]}`]);
  const period = PERIODS.includes(Number(req.query && req.query.days)) ? Number(req.query.days) : 7;
  let out, stats, comp;
  try {
    [out, stats, comp] = await Promise.all([pipeline(cmds), periodStats(pipeline, period), complaints(pipeline).catch(() => null)]);
  } catch {
    return res.status(502).json({ error: 'upstash' });
  }
  let i = 0;
  const funnelDays = days.map(day => {
    const f = { day };
    for (const step of FUNNEL) f[step] = Number(out[i++]) || 0;
    return f;
  });
  const today = { ...funnelDays[0] };
  delete today.day;

  const reports = parse(out[i++]), events = parse(out[i++]);
  const ttl = Number(out[i++]);
  const now = {};
  for (const site of ['ca', 'es']) now[site] = { views: Number(out[i++]) || 0, visitors: Number(out[i++]) || 0 };
  now.visitors = Number(out[i++]) || 0;
  // Attacks blocked since Toronto midnight, from the last 200 events.
  now.blocked = events.filter(e => !String(e.agent).startsWith('suspect') && lastDays(new Date(e.t), 1)[0] === days[0]).length;
  const attackCountries = {};
  for (const e of events) if (e.c && !String(e.agent).startsWith('suspect')) attackCountries[e.c] = (attackCountries[e.c] || 0) + 1;
  return res.status(200).json({
    reports, events: events.slice(0, 50), lockdown: ttl > 0 ? ttl : 0, now,
    funnelToday: today, funnelDays, period: stats, complaints: comp,
    attackCountries: top(attackCountries, 5),
    risks: riskList(events, { since: Date.now() - 86400000 })
  });
}
