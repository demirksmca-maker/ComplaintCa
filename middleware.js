// Live shield — Vercel Routing Middleware, runs at the edge before every
// request reaches a page or /api function.
//
// Small "agents" look at each request in order and the first one that
// objects blocks it with a 403:
//   ban     — IP was caught attacking recently (Upstash only)
//   probe   — path is a known scanner target (/.env, /wp-login.php, ...)
//   inject  — URL carries SQL injection / XSS / path traversal payloads
//   scanner — User-Agent is an attack tool (sqlmap, nikto, nuclei, ...)
//   trap    — opened the hidden honeypot link (/trap/), which only bots
//             that ignore robots.txt follow: banned for 6 hours (browser
//             prefetches, which carry Sec-Purpose, are only refused)
//   aibot   — bulk content-copying crawler (CCBot, Bytespider, ...);
//             blocked, never banned. AI search bots stay allowed (llms.txt)
//   scrape  — too many pages from one IP in a minute (Upstash only)
//   flood   — too many /api calls from one IP in a minute (Upstash only)
//   lockdown— emergency mode (shield:lockdown, set by the AI agent or from
//             /shield.html): tighter limits, no requests without User-Agent
// Search engine crawlers are never banned and never rate limited (a junk
// link crawled by Googlebot must never ban Google).
//
// Without UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) only the
// stateless agents run. Upstash errors or slowness fail open.

export const config = {
  matcher: ['/((?!assets/|icons/|vendor/|favicon.ico|og-image.png).*)']
};

const BAN_SECONDS = 3600;
const TRAP_BAN_SECONDS = 6 * 3600;
const LAND_SECONDS = 6 * 3600;
const API_LIMIT_PER_MIN = 120;
const SUSPECT_PER_MIN = 40;
const PAGE_LIMIT_PER_MIN = 60;
const LOCKDOWN_API_PER_MIN = 30;
const LOCKDOWN_PAGE_PER_MIN = 20;

const PROBE_RE = /(^|\/)(\.env|\.git(\/|$)|\.svn|\.hg|\.aws|\.ssh|\.htaccess|\.htpasswd|\.ds_store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|cgi-bin|server-status|actuator|vendor\/phpunit|boaform|hnap1|owa\/|\.well-known\/(?!security\.txt|assetlinks\.json|apple-app-site-association))|\.(php\d?|asp|aspx|jsp|cgi|sql|bak|old|swp)$/i;

const INJECT_RES = [
  /<\s*script/i,
  /<[^>]+\bon[a-z]+\s*=/i,
  /javascript\s*:/i,
  /\bunion(\s|\/\*.*?\*\/)+(all\s+)?select\b/i,
  /\b(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /\b(sleep|benchmark|pg_sleep)\s*\(/i,
  /;\s*(drop|delete|insert|update)\s+/i,
  /\.\.[\/\\]/,
  /\/etc\/(passwd|shadow|hosts)/i,
  /\0/,
  /\$\{jndi:/i,
  /\{\{.*\}\}/
];

const SCANNER_RE = /sqlmap|nikto|nmap|masscan|zgrab|acunetix|nuclei|wpscan|dirbuster|gobuster|ffuf|feroxbuster|hydra|netsparker|havij|w3af|openvas|nessus|jaeles|commix/i;

// Crawlers that copy pages in bulk for datasets. ChatGPT/Claude/Perplexity
// search bots are deliberately not here: the site publishes llms.txt to be
// found through them.
const AI_SCRAPER_RE = /CCBot|Bytespider|Meta-ExternalAgent|meta-externalfetcher|ImagesiftBot|Diffbot|omgili|Timpibot|cohere-training-data-crawler|PetalBot|img2dataset/i;

const SEARCH_BOT_RE = /googlebot|google-inspectiontool|adsbot-google|mediapartners-google|bingbot|duckduckbot|yandex|applebot|baiduspider/i;

function decodeAll(s) {
  let out = s;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(out.replace(/\+/g, ' '));
      if (next === out) break;
      out = next;
    } catch (e) {
      break;
    }
  }
  return out;
}

// Pure check, no I/O: returns the name of the agent that objects, or null.
export function inspect(url, userAgent = '') {
  const path = decodeAll(url.pathname);
  if (PROBE_RE.test(path)) return 'probe';
  const target = path + ' ' + decodeAll(url.search);
  if (INJECT_RES.some(re => re.test(target))) return 'inject';
  if (SCANNER_RE.test(userAgent)) return 'scanner';
  if (path === '/trap' || path.startsWith('/trap/')) return 'trap';
  if (AI_SCRAPER_RE.test(userAgent)) return 'aibot';
  return null;
}

async function redis(commands) {
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(800)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function blocked(agent) {
  return new Response('Forbidden', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-Shield': agent
    }
  });
}

// Visitor counter for the shield page (/shield.html): page views and unique
// IPs (HyperLogLog, so no IP list is stored) per site per Toronto day.
const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless|lighthouse/i;

export function isPage(request, url) {
  return request.method === 'GET' && !url.pathname.startsWith('/api/') &&
    !/\.(?!html$)[a-z0-9]+$/i.test(url.pathname) && url.pathname !== '/shield.html';
}

export function isPageView(request, url, ua) {
  return isPage(request, url) && !!ua && !BOT_RE.test(ua);
}

export function visitDay(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

// Where a visitor arrived from, for the panel's search / social rows: the
// Referer of an outside page, or the in-app browser of a social network.
const SOURCES = [
  ['google', /(^|\.)google\.[a-z.]+$/], ['bing', /(^|\.)bing\.com$/], ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['yahoo', /(^|\.)yahoo\.com$/], ['ecosia', /(^|\.)ecosia\.org$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.com|fb\.me)$/], ['instagram', /(^|\.)instagram\.com$/],
  ['x', /^(t\.co|(.+\.)?x\.com|(.+\.)?twitter\.com)$/], ['tiktok', /(^|\.)tiktok\.com$/], ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/]
];
const IN_APP = [['facebook', /FBAN|FBAV|FB_IAB/], ['instagram', /Instagram/], ['tiktok', /musical_ly|BytedanceWebview|TikTok/]];

export function visitSource(referer, ua = '') {
  let host = '';
  try { host = new URL(referer).hostname.toLowerCase(); } catch (e) { /* no referer */ }
  if (host && !host.endsWith('complaintca.ca')) {
    const hit = SOURCES.find(([, re]) => re.test(host));
    if (hit) return hit[0];
  }
  const app = IN_APP.find(([, re]) => re.test(ua));
  return app && !(host && host.endsWith('complaintca.ca')) ? app[0] : null;
}

export function deviceOf(ua) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  return /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop';
}

// Toronto hour 0-23, for the panel's hour heatmap.
export function visitHour(now = new Date()) {
  return Number(now.toLocaleString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23' }));
}

const PAGE_RE = /^\/(es\/)?([a-z0-9-]+\/)*([a-z0-9-]+(\.html)?)?$/;

function countVisit(request, url, ip, ua, source) {
  const site = url.pathname === '/es' || url.pathname.startsWith('/es/') ? 'es' : 'ca';
  const day = visitDay();
  const views = `shield:views:${site}:${day}`, uniq = `shield:uv:${site}:${day}`, stats = `shield:stats:${day}`;
  // No EXPIRE here: a few small keys a day, and it halves the Upstash calls.
  const cmds = [['INCR', views], ['PFADD', uniq, ip], ['HINCRBY', stats, `d:${deviceOf(ua)}`, 1], ['HINCRBY', stats, `h:${visitHour()}`, 1]];
  // Only real-looking paths, so junk URLs can't flood the top-pages list.
  if (url.pathname.length <= 80 && PAGE_RE.test(url.pathname)) cmds.push(['HINCRBY', stats, `p:${url.pathname}`, 1]);
  const country = request.headers.get('x-vercel-ip-country');
  if (country) {
    let city = '';
    try { city = decodeURIComponent(request.headers.get('x-vercel-ip-city') || '').slice(0, 40); } catch (e) { /* keep empty */ }
    cmds.push(['HINCRBY', stats, `g:${country}|${city}`, 1]);
  }
  if (source) cmds.push(['HINCRBY', `shield:src:${day}`, source, 1]);
  // First page of the visit, for the funnel's source / landing page rows.
  // Kept 6 hours under the IP (like the ban keys), then gone.
  const lp = url.pathname.length <= 80 && PAGE_RE.test(url.pathname) ? url.pathname : '(other)';
  cmds.push(['SET', `shield:land:${ip}`, `${landSource(request.headers.get('referer'), ua, source)}|${lp}`, 'NX', 'EX', LAND_SECONDS]);
  return cmds;
}

// Arrival kind for the funnel: a known engine / network, another site, or direct.
export function landSource(referer, ua, source) {
  if (source) return source;
  let host = '';
  try { host = new URL(referer).hostname.toLowerCase(); } catch (e) { /* no referer */ }
  return host && !host.endsWith('complaintca.ca') ? 'other' : 'direct';
}

// Complaint funnel: unique people per step per day, sent by the complaint
// panel as beacons (/api/beacon?e=step, answered here without a function).
// A step also counts the person in every step before it, so a later step can
// never show more people than an earlier one (a blocked or missed beacon used
// to give "%200"). The first time a person reaches a step that day, the step
// is also counted by arrival source, landing page, device, site and
// complaint category (shield:funx:day, fields "step|kind:value").
export const FUNNEL = ['open', 'write', 'route', 'preview', 'email', 'submit', 'sent'];
const SIDE_STEPS = ['photo', 'fail'];

export function funnelBeacon(url) {
  const e = url.searchParams.get('e') || '';
  if (!FUNNEL.includes(e) && !SIDE_STEPS.includes(e)) return null;
  const word = k => { const v = (url.searchParams.get(k) || '').toLowerCase(); return /^[a-z0-9_]{1,24}$/.test(v) ? v : ''; };
  return { step: e, cat: word('c'), reason: word('r') };
}

export function funnelCommands(b, ip, day, land, ctx, added) {
  const steps = FUNNEL.includes(b.step) ? FUNNEL.slice(0, FUNNEL.indexOf(b.step) + 1) : [b.step];
  if (!added) return steps.map(s => ['PFADD', `shield:fun:${s}:${day}`, ip]);
  const [src, lp] = String(land || '').split('|');
  const key = `shield:funx:${day}`, cmds = [];
  steps.forEach((s, i) => {
    if (!added[i]) return;
    const dims = [`s:${src || 'direct'}`, `p:${lp || '(other)'}`, `d:${ctx.device}`, `w:${ctx.site}`];
    if (b.cat) dims.push(`c:${b.cat}`);
    if (s === 'fail') dims.push(`r:${b.reason || 'error'}`);
    for (const d of dims) cmds.push(['HINCRBY', key, `${s}|${d}`, 1]);
  });
  return cmds;
}

async function countFunnel(request, url, ip, ua) {
  const b = funnelBeacon(url);
  if (!b) return;
  const day = visitDay();
  const marks = funnelCommands(b, ip, day);
  const r = await redis([['GET', `shield:land:${ip}`], ...marks]);
  if (!r) return;
  let site = 'ca';
  try { site = /^\/es(\/|$)/.test(new URL(request.headers.get('referer')).pathname) ? 'es' : 'ca'; } catch (e) { /* no referer */ }
  const added = marks.map((_, i) => r[i + 1] && r[i + 1].result === 1);
  const cmds = funnelCommands(b, ip, day, r[0] && r[0].result, { device: deviceOf(ua), site }, added);
  if (cmds.length) await redis(cmds);
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const isApi = url.pathname.startsWith('/api/');
  const searchBot = SEARCH_BOT_RE.test(ua);
  const minute = Math.floor(Date.now() / 60000);

  // Events feed the AI review agent (scripts/shield-agent.mjs).
  const logEvent = agent => [['LPUSH', 'shield:events', JSON.stringify({ t: Date.now(), ip, c: request.headers.get('x-vercel-ip-country') || '', agent, path: url.pathname.slice(0, 200), ua: ua.slice(0, 200) })], ['LTRIM', 'shield:events', 0, 499]];
  const ban = (agent, secs = BAN_SECONDS) => ['SET', `shield:ban:${ip}`, agent, 'EX', secs];

  const agent = inspect(url, ua);
  if (agent === 'aibot') return blocked(agent);
  if (agent === 'trap' && /prefetch|prerender/i.test(request.headers.get('sec-purpose') || request.headers.get('purpose') || '')) return blocked(agent);
  if (agent) {
    const cmds = logEvent(agent);
    if (!searchBot) cmds.push(ban(agent, agent === 'trap' ? TRAP_BAN_SECONDS : BAN_SECONDS));
    await redis(cmds);
    return blocked(agent);
  }
  if (url.pathname === '/api/beacon') {
    if (!searchBot) await countFunnel(request, url, ip, ua);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  // One round trip: ban? lockdown? then the per-minute counter for this kind
  // of request, then the visitor counter. Search crawlers get the ban check
  // only (a spoofed Googlebot from a banned IP stays banned), no limits.
  const page = isPage(request, url);
  const rateKey = searchBot ? null : isApi ? `shield:api:${ip}:${minute}` : page ? `shield:pv:${ip}:${minute}` : null;
  const cmds = [['GET', `shield:ban:${ip}`], ['GET', 'shield:lockdown']];
  if (rateKey) cmds.push(['INCR', rateKey], ['EXPIRE', rateKey, 120]);
  if (isPageView(request, url, ua)) cmds.push(...countVisit(request, url, ip, ua, visitSource(request.headers.get('referer'), ua)));
  const r = await redis(cmds);
  if (!r) return;
  if (r[0] && r[0].result) return blocked('ban');
  if (searchBot) return;
  const lockdown = !!(r[1] && r[1].result);
  if (lockdown && !ua) return blocked('lockdown');
  const count = rateKey && r[2] && r[2].result;
  if (typeof count !== 'number') return;

  if (isApi) {
    const limit = lockdown ? LOCKDOWN_API_PER_MIN : API_LIMIT_PER_MIN;
    // Log once per IP per minute at each threshold, not on every call.
    if (count === limit + 1) await redis(logEvent(lockdown ? 'lockdown' : 'flood'));
    else if (count === SUSPECT_PER_MIN && !lockdown) await redis(logEvent('suspect-rate'));
    else if (count === 1 && !ua) await redis(logEvent('suspect-noua'));
    if (count > limit) return blocked(lockdown ? 'lockdown' : 'flood');
    return;
  }
  const limit = lockdown ? LOCKDOWN_PAGE_PER_MIN : PAGE_LIMIT_PER_MIN;
  if (count === limit + 1) await redis([...logEvent('scrape'), ban('scrape')]);
  if (count > limit) return blocked('scrape');
}
