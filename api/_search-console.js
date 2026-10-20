// Search Console numbers for the owner's shield panel: last 28 days of
// Google search clicks, impressions, CTR and average position (against the
// 28 days before), top queries and top pages. Read with the site's Google
// service account (FIREBASE_SERVICE_ACCOUNT); it needs to be added as a user
// on the Search Console property and the Search Console API enabled on the
// Google Cloud project — until then the panel shows those two steps.
// Cached 6 hours in Upstash: the data only moves once a day.
import { accessToken, serviceAccount, PROJECT } from './_gauth.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
const CACHE_KEY = 'shield:gsc', CACHE_SECONDS = 6 * 3600;

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
  const [cur, prev, queries, pages] = await Promise.all([q(w.cur, [], 1), q(w.prev, [], 1), q(w.cur, ['query'], 8), q(w.cur, ['page'], 6)]);
  const row = r => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 });
  const out = {
    ok: true, site, range: w.cur, at: Date.now(),
    totals: total(cur), before: total(prev),
    queries: queries.map(row),
    pages: pages.map(r => ({ ...row(r), key: r.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/' }))
  };
  await redis([['SET', CACHE_KEY, JSON.stringify(out), 'EX', CACHE_SECONDS]]);
  return out;
}
