// Live shield — Vercel Routing Middleware, runs at the edge before every
// request reaches a page or /api function.
//
// Four small "agents" look at each request in order and the first one that
// objects blocks it with a 403:
//   1. ban    — IP was caught attacking in the last hour (Upstash only)
//   2. probe  — path is a known scanner target (/.env, /wp-login.php, ...)
//   3. inject — URL carries SQL injection / XSS / path traversal payloads
//   4. scanner— User-Agent is an attack tool (sqlmap, nikto, nuclei, ...)
//   5. flood  — too many /api calls from one IP in a minute (Upstash only)
// probe/inject/scanner hits also ban the IP for an hour, except for search
// engine crawlers (a junk link crawled by Googlebot must never ban Google).
//
// Without UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) only the stateless agents (probe,
// inject, scanner) run. Upstash errors or slowness fail open.

export const config = {
  matcher: ['/((?!assets/|icons/|vendor/|favicon.ico|og-image.png).*)']
};

const BAN_SECONDS = 3600;
const API_LIMIT_PER_MIN = 120;
const SUSPECT_PER_MIN = 40;

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

export function isPageView(request, url, ua) {
  return request.method === 'GET' && !!ua && !BOT_RE.test(ua) &&
    !/\.(?!html$)[a-z0-9]+$/i.test(url.pathname) && url.pathname !== '/shield.html';
}

export function visitDay(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

function countVisit(url, ip) {
  const site = url.pathname === '/es' || url.pathname.startsWith('/es/') ? 'es' : 'ca';
  const day = visitDay();
  const views = `shield:views:${site}:${day}`, uniq = `shield:uv:${site}:${day}`;
  return [['INCR', views], ['EXPIRE', views, 90 * 86400], ['PFADD', uniq, ip], ['EXPIRE', uniq, 90 * 86400]];
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const isApi = url.pathname.startsWith('/api/');
  const minute = Math.floor(Date.now() / 60000);
  const floodKey = `shield:api:${ip}:${minute}`;

  // Events feed the AI review agent (scripts/shield-agent.mjs).
  const logEvent = agent => [['LPUSH', 'shield:events', JSON.stringify({ t: Date.now(), ip, agent, path: url.pathname.slice(0, 200), ua: ua.slice(0, 200) })], ['LTRIM', 'shield:events', 0, 499]];

  const agent = inspect(url, ua);
  if (agent) {
    const cmds = logEvent(agent);
    if (!SEARCH_BOT_RE.test(ua)) cmds.push(['SET', `shield:ban:${ip}`, agent, 'EX', BAN_SECONDS]);
    await redis(cmds);
    return blocked(agent);
  }

  const cmds = [['GET', `shield:ban:${ip}`]];
  if (isApi) cmds.push(['INCR', floodKey], ['EXPIRE', floodKey, 120]);
  else if (isPageView(request, url, ua)) cmds.push(...countVisit(url, ip));
  const r = await redis(cmds);
  if (!r) return;
  if (r[0] && r[0].result) return blocked('ban');
  const count = isApi && r[1] && r[1].result;
  if (typeof count !== 'number') return;
  // Log once per IP per minute at each threshold, not on every call.
  if (count === API_LIMIT_PER_MIN + 1) await redis(logEvent('flood'));
  else if (count === SUSPECT_PER_MIN) await redis(logEvent('suspect-rate'));
  else if (count === 1 && !ua) await redis(logEvent('suspect-noua'));
  if (count > API_LIMIT_PER_MIN) return blocked('flood');
}
