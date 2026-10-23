// İstatistik panel at the top of the owner's Dias Panel (/shield.html):
// for 1, 3, 5, 7, 10, 14, 20, 30 and 90 days (and since the site's first day
// in Google), each against the period of the same length just before it:
// Google clicks and impressions (Search Console, the same numbers its
// Performance report shows for that date range and page filter), visitors
// and engagement time per user (Google Analytics 4: active users and
// "average engagement time per active user"), and complaints filed.
// Every window ends today (Toronto time): "3 days" is today, yesterday and
// the day before, so all columns cover the same calendar days. Sites: all (no filter, like Search Console's
// default view), ca (pages outside /es) and es (pages under /es).
// Without GA4 access the visitor column falls back to the site's own
// counter (it only started on 2026-10-20) and the time column stays empty.
// Cached 3 hours in Upstash.
import { accessToken, serviceAccount, PROJECT } from './_gauth.js';
import { fetchComplaints } from './mcp.js';
import { pickSite } from './_search-console.js';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GSC = 'https://www.googleapis.com/webmasters/v3';
const GA = 'https://analyticsdata.googleapis.com/v1beta';
const CACHE_KEY = 'shield:statspanel:v2', CACHE_SECONDS = 3 * 3600;
const D = 86400000;

export const PANEL_DAYS = [1, 3, 5, 7, 10, 14, 20, 30, 90];
export const SITES = ['all', 'ca', 'es'];

export const ymd = t => new Date(t).toISOString().slice(0, 10);
export const addDays = (day, n) => ymd(Date.parse(day + 'T00:00:00Z') + n * D);
// Today as YYYY-MM-DD in Toronto, the owner's day.
export const torontoDay = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / D) + 1;

// This period and the one before it, as [from, to] YYYY-MM-DD, ending on `end`.
export function periodWindows(end, days) {
  return { cur: [addDays(end, 1 - days), end], prev: [addDays(end, 1 - 2 * days), addDays(end, -days)] };
}

// Search Console page filters: Spanish pages live under /es.
const ES_PAGE = '^https?://[^/]+/es(/|\\?|$)';
export function gscFilter(site) {
  if (site === 'all') return {};
  return { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: site === 'es' ? 'includingRegex' : 'excludingRegex', expression: ES_PAGE }] }] };
}
const ES_PATH = '^/es(/.*)?$';
export function gaFilter(site) {
  if (site === 'all') return {};
  const f = { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'FULL_REGEXP', value: ES_PATH } } };
  return { dimensionFilter: site === 'es' ? f : { notExpression: f } };
}

// Clicks, impressions, CTR and average position over [from, to] from daily
// rows ({ day, clicks, impressions, position }). Search Console's average
// position is impression-weighted, so the days are weighted the same way.
export function sumRange(rows, from, to) {
  let clicks = 0, impressions = 0, pos = 0;
  for (const r of rows || []) {
    if (r.day < from || r.day > to) continue;
    clicks += r.clicks; impressions += r.impressions; pos += (r.position || 0) * r.impressions;
  }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? Math.round(pos / impressions * 10) / 10 : 0 };
}

// Daily clicks for the last min(days, 30) days of a window, missing days 0.
export function dailyClicks(rows, from, to) {
  const by = new Map((rows || []).map(r => [r.day, r.clicks]));
  const n = Math.min(daysBetween(from, to), 30), out = [];
  for (let i = n - 1; i >= 0; i--) out.push(by.get(addDays(to, -i)) || 0);
  return out;
}

// Complaints per window. Spanish complaints carry country ES.
export function countComplaints(list, site, from, to) {
  let n = 0;
  for (const c of list || []) {
    const day = String(c.date || '').slice(0, 10);
    if (!day || day < from || day > to) continue;
    if (site === 'es' ? c.country !== 'ES' : site === 'ca' ? c.country === 'ES' : false) continue;
    n++;
  }
  return n;
}

// The date ranges GA4 is asked for: every period and the one before, plus
// since-start. Named so the answer can be matched back.
export function gaRanges(end, start) {
  const out = [];
  for (const d of PANEL_DAYS) {
    const w = periodWindows(end, d);
    out.push({ name: `c${d}`, startDate: w.cur[0], endDate: w.cur[1] }, { name: `p${d}`, startDate: w.prev[0], endDate: w.prev[1] });
  }
  if (start) out.push({ name: 'since', startDate: start, endDate: end });
  return out;
}

// GA4 batchRunReports answer → { rangeName: { visitors, eng } }, eng in whole
// seconds per active user (GA4's "average engagement time per active user").
// With several date ranges GA4 adds a dateRange dimension holding the range
// name; a request with one range has none, so its name comes from `requests`.
export function readGa(reports, requests = []) {
  const out = {};
  for (const [i, rep] of (reports || []).entries()) {
    const only = requests[i] && requests[i].dateRanges.length === 1 ? requests[i].dateRanges[0].name : null;
    for (const row of rep.rows || []) {
      const name = (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || only;
      const users = Number(row.metricValues[0].value) || 0, secs = Number(row.metricValues[1].value) || 0;
      if (name) out[name] = { visitors: users, eng: users ? Math.round(secs / users) : 0 };
    }
  }
  return out;
}

// Growth since opening: daily impressions over the last 7 days against the
// first 14 days in Google (averages, so different lengths compare fairly).
// Null until there are 21 days of data or while the first days had none.
export function growth(rows, start, end) {
  if (!start || addDays(start, 20) > end) return null;
  const first = sumRange(rows, start, addDays(start, 13)).impressions / 14;
  const last = sumRange(rows, addDays(end, -6), end).impressions / 7;
  return first ? Math.round(last / first * 10) / 10 : null;
}

// One site's panel from the fetched pieces.
export function buildSite({ end, rows, start, ga, counter, complaints, site, tops }) {
  const visitors = name => (ga ? (ga[name] || { visitors: 0, eng: 0 }) : { visitors: counter ? counter[name] || 0 : null, eng: null });
  const part = (name, from, to) => ({ from, to, ...sumRange(rows, from, to), ...visitors(name), complaints: countComplaints(complaints, site, from, to) });
  const periods = PANEL_DAYS.map(d => {
    const w = periodWindows(end, d);
    return {
      days: d, cur: part(`c${d}`, ...w.cur), prev: part(`p${d}`, ...w.prev),
      daily: d > 1 ? dailyClicks(rows, ...w.cur) : [],
      query: (tops && tops[`q${d}`]) || null, page: (tops && tops[`g${d}`]) || null
    };
  });
  return { start, since: start ? { ...part('since', start, end), growth: growth(rows, start, end) } : null, periods };
}

const path = u => String(u).replace(/^https?:\/\/[^/]+/, '') || '/';

async function pool(tasks, n = 8) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

async function gscConnect() {
  const sa = serviceAccount();
  const setup = { email: sa ? sa.client_email : null, apiUrl: `https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=${PROJECT}`, usersUrl: 'https://search.google.com/search-console/users' };
  const tok = sa && await accessToken(Date.now(), GSC_SCOPE);
  if (!tok) return { ok: false, reason: 'no_token', setup };
  const auth = { Authorization: `Bearer ${tok}` };
  const r = await fetch(`${GSC}/sites`, { headers: auth });
  if (r.status === 403) return { ok: false, reason: 'api_disabled', setup };
  if (!r.ok) return { ok: false, reason: `sites_${r.status}`, setup };
  const site = pickSite((await r.json()).siteEntry);
  if (!site) return { ok: false, reason: 'no_access', setup };
  // dataState all: the latest days too, as the Performance report shows them.
  const q = (body) => fetch(`${GSC}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ dataState: 'all', ...body })
  }).then(x => (x.ok ? x.json() : { rows: [] })).then(j => j.rows || []);
  return { ok: true, site, q };
}

async function gaConnect() {
  const id = String(process.env.GA4_PROPERTY_ID || '').trim();
  const sa = serviceAccount();
  const setup = { email: sa ? sa.client_email : null, apiUrl: `https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=${PROJECT}` };
  if (!/^\d+$/.test(id)) return { ok: false, reason: 'no_property', setup };
  const tok = sa && await accessToken(Date.now(), GA_SCOPE);
  if (!tok) return { ok: false, reason: 'no_token', setup };
  return { ok: true, id, auth: { Authorization: `Bearer ${tok}` }, setup };
}

async function gaSite(c, site, ranges) {
  const requests = [];
  for (let i = 0; i < ranges.length; i += 4) {
    requests.push({ dateRanges: ranges.slice(i, i + 4), metrics: [{ name: 'activeUsers' }, { name: 'userEngagementDuration' }], ...gaFilter(site) });
  }
  const r = await fetch(`${GA}/properties/${c.id}:batchRunReports`, {
    method: 'POST', headers: { ...c.auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests })
  });
  if (!r.ok) throw Object.assign(new Error('ga'), { status: r.status });
  return readGa((await r.json()).reports, requests);
}

// Own counter fallback: unique visitors per window (HyperLogLog union of the
// per-day keys, Toronto days).
async function counterVisitors(redis, site, ranges) {
  const keys = (from, to) => {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) for (const s of site === 'all' ? ['ca', 'es'] : [site]) out.push(`shield:uv:${s}:${d}`);
    return out;
  };
  const res = await redis(ranges.map(r => ['PFCOUNT', ...keys(r.startDate, r.endDate)]));
  return Object.fromEntries(ranges.map((r, i) => [r.name, Number(res[i]) || 0]));
}

async function build(redis) {
  const gsc = await gscConnect();
  const today = torontoDay();
  const dateRows = {};
  if (gsc.ok) {
    // Search Console keeps 16 months; the first day with impressions is the start.
    const all = await Promise.all(SITES.map(s => gsc.q({ startDate: addDays(today, -480), endDate: today, dimensions: ['date'], rowLimit: 1000, ...gscFilter(s) })));
    SITES.forEach((s, i) => { dateRows[s] = all[i].map(r => ({ day: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })).sort((a, b) => (a.day < b.day ? -1 : 1)); });
  }
  const end = today;
  const startOf = s => ((dateRows[s] || []).find(r => r.impressions > 0) || {}).day || null;

  // Top search and page per period, by clicks (Search Console's default order).
  const tops = Object.fromEntries(SITES.map(s => [s, {}]));
  if (gsc.ok) {
    const jobs = [];
    for (const s of SITES) for (const d of PANEL_DAYS) {
      const w = periodWindows(end, d);
      for (const [k, dim] of [['q', 'query'], ['g', 'page']]) {
        jobs.push(async () => {
          const [r] = await gsc.q({ startDate: w.cur[0], endDate: w.cur[1], dimensions: [dim], rowLimit: 1, ...gscFilter(s) });
          if (r && r.clicks > 0) tops[s][k + d] = { key: dim === 'page' ? path(r.keys[0]) : r.keys[0], clicks: r.clicks };
        });
      }
    }
    await pool(jobs);
  }

  let ga = await gaConnect();
  const gaData = {}, counter = {};
  for (const s of SITES) {
    const ranges = gaRanges(end, startOf(s));
    if (ga.ok) {
      try { gaData[s] = await gaSite(ga, s, ranges); }
      catch (e) { ga = { ok: false, reason: e.status === 403 ? 'no_access' : `ga_${e.status || 'error'}`, setup: ga.setup }; }
    }
  }
  // GA4 off (or it failed part way): every site falls back to the counter.
  if (!ga.ok) for (const s of SITES) counter[s] = await counterVisitors(redis, s, gaRanges(end, startOf(s))).catch(() => null);

  const complaints = await fetchComplaints(fetch, ['date', 'country']).catch(() => []);
  const sites = {};
  for (const s of SITES) {
    sites[s] = buildSite({ end, rows: dateRows[s] || [], start: startOf(s), ga: ga.ok ? gaData[s] : null, counter: counter[s], complaints, site: s, tops: tops[s] });
  }
  return {
    ok: true, at: Date.now(), end, sites,
    gsc: gsc.ok ? { ok: true } : { ok: false, reason: gsc.reason, setup: gsc.setup },
    ga: ga.ok ? { ok: true } : { ok: false, reason: ga.reason, setup: ga.setup },
    visitors: ga.ok ? 'ga' : 'counter'
  };
}

export async function statsPanel(redis, { fresh = false } = {}) {
  if (!fresh) {
    const [hit] = await redis([['GET', CACHE_KEY]]);
    // A new day starts new windows, so yesterday's answer is not reused.
    if (hit) { try { const out = JSON.parse(hit); if (out.end === torontoDay()) return out; } catch { /* rebuild */ } }
  }
  const out = await build(redis);
  await redis([['SET', CACHE_KEY, JSON.stringify(out), 'EX', CACHE_SECONDS]]);
  return out;
}
