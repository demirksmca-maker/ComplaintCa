// Search Console numbers for the owner's shield panel: last 28 days of
// Google search clicks, impressions, CTR and average position (against the
// 28 days before), a daily trend, top queries, opportunities (queries just
// off the top results, with their page), top pages, rising/falling pages,
// countries, devices and sitemap health. Read with the site's Google
// service account (FIREBASE_SERVICE_ACCOUNT); it needs to be added as a user
// on the Search Console property and the Search Console API enabled on the
// Google Cloud project — until then the panel shows those two steps.
// Cached 6 hours in Upstash: the data only moves once a day.
import { accessToken, serviceAccount, PROJECT } from './_gauth.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
const CACHE_KEY = 'shield:gsc:v2', CACHE_SECONDS = 6 * 3600;

const ymd = t => new Date(t).toISOString().slice(0, 10);

// Prefer the whole-domain property, then the www URL property.
export function pickSite(entries) {
  const urls = (entries || []).filter(e => e.permissionLevel !== 'siteUnverifiedUser').map(e => e.siteUrl);
  return ['sc-domain:complaintca.ca', 'https://www.complaintca.ca/', 'https://complaintca.ca/'].find(u => urls.includes(u))
    || urls.find(u => u.includes('complaintca.ca')) || null;
}

export function windows(now = Date.now()) {
  // Search Console data lags about two days.
  const end = now - 2 * 86400000;
  return {
    cur: [ymd(end - 27 * 86400000), ymd(end)],
    prev: [ymd(end - 55 * 86400000), ymd(end - 28 * 86400000)]
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

// Pages whose Google clicks changed most against the previous 28 days.
export function movers(now, before, n = 3) {
  const was = new Map((before || []).map(r => [path(r.keys[0]), r.clicks]));
  const diff = (now || []).map(r => ({ key: path(r.keys[0]), clicks: r.clicks, change: r.clicks - (was.get(path(r.keys[0])) || 0) }));
  for (const [key, clicks] of was) if (!diff.some(d => d.key === key)) diff.push({ key, clicks: 0, change: -clicks });
  return {
    up: diff.filter(d => d.change > 0).sort((a, b) => b.change - a.change).slice(0, n),
    down: diff.filter(d => d.change < 0).sort((a, b) => a.change - b.change).slice(0, n)
  };
}

export async function searchConsole(redis, { fresh = false } = {}) {
  if (!fresh) {
    const [hit] = await redis([['GET', CACHE_KEY]]);
    if (hit) { try { return JSON.parse(hit); } catch { /* refetch */ } }
  }
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

  const w = windows();
  const q = (range, dims, limit) => fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: range[0], endDate: range[1], dimensions: dims, rowLimit: limit })
  }).then(r => (r.ok ? r.json() : { rows: [] })).then(j => j.rows || []);
  const [cur, prev, daily, queries, queryPages, pagesNow, pagesBefore, countries, devices, sitemaps] = await Promise.all([
    q(w.cur, [], 1), q(w.prev, [], 1), q(w.cur, ['date'], 40), q(w.cur, ['query'], 250), q(w.cur, ['query', 'page'], 500),
    q(w.cur, ['page'], 100), q(w.prev, ['page'], 100), q(w.cur, ['country'], 6), q(w.cur, ['device'], 3),
    fetch(`${API}/sites/${encodeURIComponent(site)}/sitemaps`, { headers: auth }).then(r => (r.ok ? r.json() : {})).then(j => j.sitemap || [])
  ]);
  const out = {
    ok: true, site, range: w.cur, at: Date.now(),
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
  await redis([['SET', CACHE_KEY, JSON.stringify(out), 'EX', CACHE_SECONDS]]);
  return out;
}
