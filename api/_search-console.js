// Search Console numbers for the owner's shield panel: the last 7, 14, 28
// or 90 days (default 28) of
// Google search clicks, impressions, CTR and average position (against the
// period before), a daily trend, top queries, opportunities (queries just
// off the top results, with their page), top pages, rising/falling pages,
// countries, devices and sitemap health. Read with the site's Google
// service account (FIREBASE_SERVICE_ACCOUNT); it needs to be added as a user
// on the Search Console property and the Search Console API enabled on the
// Google Cloud project — until then the panel shows those two steps.
// Cached 6 hours per period in Upstash (it only moves once a day); the
// last-24-hours / since-start part is cached 30 minutes.
import { accessToken, serviceAccount, PROJECT } from './_gauth.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
const CACHE_KEY = 'shield:gsc:v2', CACHE_SECONDS = 6 * 3600;
const RECENT_KEY = 'shield:gsc:recent:v3', RECENT_SECONDS = 1800; // last-24h view moves hourly

const ymd = t => new Date(t).toISOString().slice(0, 10);

// Prefer the whole-domain property, then the www URL property.
export function pickSite(entries) {
  const urls = (entries || []).filter(e => e.permissionLevel !== 'siteUnverifiedUser').map(e => e.siteUrl);
  return ['sc-domain:complaintca.ca', 'https://www.complaintca.ca/', 'https://complaintca.ca/'].find(u => urls.includes(u))
    || urls.find(u => u.includes('complaintca.ca')) || null;
}

export const PERIODS = [7, 14, 28, 90];

export function windows(now = Date.now(), days = 28) {
  // Search Console data lags about two days.
  const end = now - 2 * 86400000, D = 86400000;
  return {
    cur: [ymd(end - (days - 1) * D), ymd(end)],
    prev: [ymd(end - (2 * days - 1) * D), ymd(end - days * D)]
  };
}

const total = rows => {
  const r = (rows || [])[0] || {};
  return { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0 };
};

const row = r => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 });
const path = u => String(u).replace(/^https?:\/\/[^/]+/, '') || '/';

// Searches where the site is seen but sits just off the top results: shown
// often (20+), average position 4-20, so better content on that page can
// win clicks. One row per query, with the page Google shows for it.
export function opportunities(rows, n = 5) {
  const best = new Map();
  for (const r of rows || []) {
    const [query, page] = r.keys;
    if (r.impressions < 20 || r.position < 4 || r.position > 20) continue;
    const prev = best.get(query);
    if (!prev || r.impressions > prev.impressions) best.set(query, { query, page: path(page), impressions: r.impressions, clicks: r.clicks, position: Math.round(r.position * 10) / 10 });
  }
  return [...best.values()].sort((a, b) => b.impressions - a.impressions).slice(0, n);
}

// Pages whose Google clicks changed most against the previous period.
export function movers(now, before, n = 3) {
  const was = new Map((before || []).map(r => [path(r.keys[0]), r.clicks]));
  const diff = (now || []).map(r => ({ key: path(r.keys[0]), clicks: r.clicks, change: r.clicks - (was.get(path(r.keys[0])) || 0) }));
  for (const [key, clicks] of was) if (!diff.some(d => d.key === key)) diff.push({ key, clicks: 0, change: -clicks });
  return {
    up: diff.filter(d => d.change > 0).sort((a, b) => b.change - a.change).slice(0, n),
    down: diff.filter(d => d.change < 0).sort((a, b) => a.change - b.change).slice(0, n)
  };
}

// Connects as the service account and finds the property, or explains why not.
async function connect() {
  const sa = serviceAccount();
  const setup = {
    email: sa ? sa.client_email : null,
    apiUrl: `https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=${PROJECT}`,
    usersUrl: 'https://search.google.com/search-console/users'
  };
  const tok = sa && await accessToken(Date.now(), SCOPE);
  if (!tok) return { ok: false, reason: 'no_token', setup };
  const auth = { Authorization: `Bearer ${tok}` };
  const sites = await fetch(`${API}/sites`, { headers: auth });
  if (sites.status === 403) return { ok: false, reason: 'api_disabled', setup };
  if (!sites.ok) return { ok: false, reason: `sites_${sites.status}`, setup };
  const site = pickSite((await sites.json()).siteEntry);
  if (!site) return { ok: false, reason: 'no_access', setup };
  const q = (range, dims, limit, dataState) => fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: range[0], endDate: range[1], dimensions: dims, rowLimit: limit, ...(dataState ? { dataState } : {}) })
  }).then(r => (r.ok ? r.json() : { rows: [] })).then(j => j.rows || []);
  return { ok: true, site, auth, q };
}

async function fetchMain({ site, auth, q }, days) {
  const w = windows(Date.now(), days);
  const [cur, prev, daily, queries, queryPages, pagesNow, pagesBefore, countries, devices, sitemaps] = await Promise.all([
    q(w.cur, [], 1), q(w.prev, [], 1), q(w.cur, ['date'], 100), q(w.cur, ['query'], 250), q(w.cur, ['query', 'page'], 500),
    q(w.cur, ['page'], 100), q(w.prev, ['page'], 100), q(w.cur, ['country'], 6), q(w.cur, ['device'], 3),
    fetch(`${API}/sites/${encodeURIComponent(site)}/sitemaps`, { headers: auth }).then(r => (r.ok ? r.json() : {})).then(j => j.sitemap || [])
  ]);
  const out = {
    ok: true, site, days, range: w.cur, at: Date.now(),
    totals: total(cur), before: total(prev),
    daily: daily.map(r => ({ day: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    // By impressions: with few clicks, what Google shows the site for says more.
    queries: queries.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 8).map(row),
    opportunities: opportunities(queryPages),
    pages: pagesNow.slice(0, 6).map(r => ({ ...row(r), key: path(r.keys[0]) })),
    movers: movers(pagesNow, pagesBefore),
    countries: countries.map(r => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    devices: Object.fromEntries(devices.map(r => [r.keys[0].toLowerCase(), r.impressions])),
    sitemaps: sitemaps.map(m => ({
      path: path(m.path), lastDownloaded: m.lastDownloaded || null, pending: !!m.isPending,
      errors: Number(m.errors) || 0, warnings: Number(m.warnings) || 0,
      submitted: (m.contents || []).reduce((n, c) => n + (Number(c.submitted) || 0), 0)
    }))
  };
  return out;
}

// Monday of the week a YYYY-MM-DD day falls in.
export function weekOf(day) {
  const d = new Date(day + 'T00:00:00Z');
  return ymd(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
}

// Last 24 hours of data (Search Console's hourly data, includes not-yet-final
// numbers) and everything since the site's first day in Google search.
export function summarizeRecent(hourRows, dateRows, now = Date.now()) {
  // Like Search Console's "24 hours" view: the 24 hours ending at the latest
  // hour Google has data for (it runs a few hours behind), gaps filled with 0.
  const got = (hourRows || []).map(r => ({ t: Date.parse(r.keys[0]), clicks: r.clicks, impressions: r.impressions, position: r.position || 0 }))
    .filter(h => !isNaN(h.t) && h.t <= now);
  const lastT = got.length ? Math.max(...got.map(h => h.t)) : 0;
  const byT = new Map(got.map(h => [h.t, h]));
  const hours = lastT ? Array.from({ length: 24 }, (_, k) => {
    const t = lastT - (23 - k) * 3600000;
    return byT.get(t) || { t, clicks: 0, impressions: 0, position: 0 };
  }) : [];
  const days = (dateRows || []).filter(r => r.impressions > 0).sort((a, b) => (a.keys[0] < b.keys[0] ? -1 : 1));
  // Weekly and monthly totals; days counts the days with data so a running
  // (partial) week or month can be compared by its daily average.
  const group = (keyOf, name) => {
    const out = [];
    for (const r of days) {
      const k = keyOf(r.keys[0]), last = out[out.length - 1];
      if (last && last[name] === k) { last.impressions += r.impressions; last.clicks += r.clicks; last.days++; }
      else out.push({ [name]: k, impressions: r.impressions, clicks: r.clicks, days: 1 });
    }
    return out;
  };
  const weeks = group(weekOf, 'week'), months = group(d => d.slice(0, 7), 'month');
  const sum = (list, k) => list.reduce((n, x) => n + x[k], 0);
  // Hours without a position yet are left out rather than counted as 0.
  const avgPos = list => { const ok = list.filter(x => x.position > 0), imp = sum(ok, 'impressions'); return imp ? Math.round(ok.reduce((n, x) => n + x.position * x.impressions, 0) / imp * 10) / 10 : 0; };
  return {
    // Average position weighted by impressions, as Search Console averages it.
    day: hours.length ? { impressions: sum(hours, 'impressions'), clicks: sum(hours, 'clicks'), position: avgPos(hours), hours, last: lastT } : null,
    since: days.length ? { start: days[0].keys[0], impressions: sum(days, 'impressions'), clicks: sum(days, 'clicks'), weeks, months } : null
  };
}

async function fetchRecent({ q }) {
  const now = Date.now();
  const [hourRows, dateRows] = await Promise.all([
    q([ymd(now - 2 * 86400000), ymd(now)], ['hour'], 100, 'hourly_all'),
    // Search Console keeps 16 months; the first day with data is the start.
    q([ymd(now - 480 * 86400000), ymd(now)], ['date'], 1000, 'all')
  ]);
  return summarizeRecent(hourRows, dateRows, now);
}

// An empty answer (Google busy for a moment) is kept only 5 minutes.
const storeRecent = (redis, recent) => redis([['SET', RECENT_KEY, JSON.stringify(recent), 'EX', recent.day ? RECENT_SECONDS : 300]]);

// Only the last-24-hours totals (Genel's "Son 24 saat" line), same cache as
// the Google tab.
export async function searchRecent(redis) {
  const [hit] = await redis([['GET', RECENT_KEY]]);
  let recent = null;
  try { recent = hit ? JSON.parse(hit) : null; } catch { /* refetch */ }
  if (!recent) {
    const c = await connect();
    if (!c.ok) return { ok: false, reason: c.reason };
    recent = await fetchRecent(c);
    await storeRecent(redis, recent);
  }
  const d = recent.day;
  return { ok: true, day: d ? { impressions: d.impressions, clicks: d.clicks, position: d.position, last: d.last } : null };
}

export async function searchConsole(redis, { fresh = false, days = 28 } = {}) {
  if (!PERIODS.includes(days)) days = 28;
  const mainKey = `${CACHE_KEY}:${days}`;
  const read = async key => {
    if (fresh) return null;
    const [hit] = await redis([['GET', key]]);
    try { return hit ? JSON.parse(hit) : null; } catch { return null; }
  };
  let main = await read(mainKey), recent = await read(RECENT_KEY);
  if (!main || !recent) {
    const c = await connect();
    if (!c.ok) return c;
    if (!main) {
      main = await fetchMain(c, days);
      await redis([['SET', mainKey, JSON.stringify(main), 'EX', CACHE_SECONDS]]);
    }
    if (!recent) {
      recent = await fetchRecent(c);
      await storeRecent(redis, recent);
    }
  }
  return { ...main, recent };
}
