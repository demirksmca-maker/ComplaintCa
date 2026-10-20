import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import middleware, { inspect } from './middleware.js';

const u = s => new URL(s, 'https://complaintca.ca');

test('every sitemap URL passes', () => {
  const xml = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length > 10);
  for (const loc of locs) assert.equal(inspect(new URL(loc), 'Googlebot'), null, loc);
});

test('normal app URLs pass', () => {
  for (const p of ['/', '/es/', '/?go=new&panel=new', '/api/route', '/api/complaint?my=1',
    '/.well-known/assetlinks.json', '/?q=noise+complaint+toronto&gclid=abc', '/blog/how-to-complain.html'])
    assert.equal(inspect(u(p), 'Mozilla/5.0'), null, p);
  assert.equal(inspect(u('/'), 'curl/8.5.0'), null);
});

test('probes are blocked', () => {
  for (const p of ['/.env', '/.git/config', '/wp-login.php', '/index.php', '/phpmyadmin/', '/backup.sql', '/%2e%65nv'])
    assert.equal(inspect(u(p), ''), 'probe', p);
});

test('injections are blocked', () => {
  for (const q of ['?q=<script>alert(1)</script>', '?q=%253Cscript%253E', "?id=1' OR 1=1", '?id=1 UNION SELECT pass',
    '?f=../../etc/passwd', '?x=${jndi:ldap://a}', '?u=javascript:alert(1)', '?q=<img src=x onerror=alert(1)>'])
    assert.equal(inspect(u('/' + q), ''), 'inject', q);
});

test('attack tools are blocked', () => {
  assert.equal(inspect(u('/'), 'sqlmap/1.7'), 'scanner');
  assert.equal(inspect(u('/'), 'Mozilla/5.0 Nuclei'), 'scanner');
});

test('middleware returns 403 for attacks, passes clean requests', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  const res = await middleware(new Request('https://complaintca.ca/.env'));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('x-shield'), 'probe');
  assert.equal(await middleware(new Request('https://complaintca.ca/')), undefined);
});

test('only real page views are counted', async () => {
  const { isPageView } = await import('./middleware.js');
  const req = (p, m = 'GET') => [new Request('https://complaintca.ca' + p, { method: m }), u(p)];
  const chrome = 'Mozilla/5.0 Chrome/130';
  assert.equal(isPageView(...req('/'), chrome), true);
  assert.equal(isPageView(...req('/es/'), chrome), true);
  assert.equal(isPageView(...req('/blog/x.html'), chrome), true);
  assert.equal(isPageView(...req('/sw.js'), chrome), false);
  assert.equal(isPageView(...req('/shield.html'), chrome), false);
  assert.equal(isPageView(...req('/'), 'Googlebot/2.1'), false);
  assert.equal(isPageView(...req('/'), ''), false);
});

test('honeypot and AI scrapers are caught statelessly', () => {
  assert.equal(inspect(u('/trap/archive'), 'Mozilla/5.0'), 'trap');
  assert.equal(inspect(u('/'), 'CCBot/2.0'), 'aibot');
  assert.equal(inspect(u('/'), 'Mozilla/5.0 (compatible; Bytespider)'), 'aibot');
  assert.equal(inspect(u('/'), 'Mozilla/5.0 (compatible; GPTBot/1.2)'), null);
  assert.equal(inspect(u('/'), 'ClaudeBot/1.0'), null);
});

// Minimal in-memory stand-in for the Upstash pipeline endpoint.
function fakeUpstash() {
  const kv = new Map();
  const run = ([cmd, key, ...a]) => {
    switch (cmd) {
      case 'GET': return kv.has(key) ? kv.get(key) : null;
      case 'SET': kv.set(key, a[0]); return 'OK';
      case 'INCR': kv.set(key, (Number(kv.get(key)) || 0) + 1); return kv.get(key);
      case 'LPUSH': kv.set(key, [a[0], ...(kv.get(key) || [])]); return kv.get(key).length;
      default: return 1;
    }
  };
  globalThis.fetch = async (_url, opts) => ({ ok: true, json: async () => JSON.parse(opts.body).map(c => ({ result: run(c) })) });
  process.env.KV_REST_API_URL = 'https://fake';
  process.env.KV_REST_API_TOKEN = 't';
  return kv;
}

test('scraping, trap bans and lockdown with a store', async () => {
  const realFetch = globalThis.fetch;
  const kv = fakeUpstash();
  const req = (p, ip, ua = 'Mozilla/5.0 Chrome/130') => new Request('https://complaintca.ca' + p, { headers: { 'x-forwarded-for': ip, 'user-agent': ua } });
  try {
    let last;
    for (let i = 0; i < 61; i++) last = await middleware(req('/blog/a.html', '7.7.7.7'));
    assert.equal(last.headers.get('x-shield'), 'scrape');
    assert.equal(kv.get('shield:ban:7.7.7.7'), 'scrape');
    assert.equal((await middleware(req('/', '7.7.7.7'))).headers.get('x-shield'), 'ban');

    // Googlebot: never rate limited, never banned by the trap.
    for (let i = 0; i < 80; i++) last = await middleware(req('/', '66.249.1.1', 'Googlebot/2.1'));
    assert.equal(last, undefined);
    await middleware(req('/trap/x', '66.249.1.1', 'Googlebot/2.1'));
    assert.equal(kv.get('shield:ban:66.249.1.1'), undefined);

    await middleware(req('/trap/x', '8.8.8.8'));
    assert.equal(kv.get('shield:ban:8.8.8.8'), 'trap');

    kv.set('shield:lockdown', '1');
    assert.equal((await middleware(req('/', '9.9.9.9', ''))).headers.get('x-shield'), 'lockdown');
    for (let i = 0; i < 21; i++) last = await middleware(req('/', '9.9.9.8'));
    assert.equal(last.headers.get('x-shield'), 'scrape');
    for (let i = 0; i < 31; i++) last = await middleware(req('/api/route', '9.9.9.7'));
    assert.equal(last.headers.get('x-shield'), 'lockdown');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});

test('visitSource reads referer and in-app browsers', async () => {
  const { visitSource } = await import('./middleware.js');
  assert.equal(visitSource('https://www.google.ca/', 'Chrome'), 'google');
  assert.equal(visitSource('https://www.bing.com/search?q=x'), 'bing');
  assert.equal(visitSource('https://l.facebook.com/l.php'), 'facebook');
  assert.equal(visitSource('https://t.co/abc'), 'x');
  assert.equal(visitSource('https://m.youtube.com/'), 'youtube');
  assert.equal(visitSource('', 'Mozilla/5.0 Instagram 300.0'), 'instagram');
  assert.equal(visitSource('https://www.complaintca.ca/blog/', 'Mozilla/5.0 FBAV/400'), null);
  assert.equal(visitSource('https://example.com/'), null);
  assert.equal(visitSource(null), null);
});

test('analytics helpers: device, hour, funnel step', async () => {
  const { deviceOf, visitHour, funnelStep } = await import('./middleware.js');
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-X710)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), 'desktop');
  assert.equal(visitHour(new Date('2026-10-20T16:30:00Z')), 12);
  const post = p => [new Request('https://complaintca.ca' + p, { method: 'POST' }), u(p)];
  assert.equal(funnelStep(...post('/api/route')), 'route');
  assert.equal(funnelStep(...post('/api/email-code')), 'email');
  assert.equal(funnelStep(...post('/api/complaint')), 'submit');
  assert.equal(funnelStep(...post('/api/complaint?my=1')), null);
  assert.equal(funnelStep(new Request('https://complaintca.ca/api/route'), u('/api/route')), null);
});

test('beacon is answered at the edge', async () => {
  delete process.env.KV_REST_API_URL;
  const res = await middleware(new Request('https://complaintca.ca/api/beacon?e=open', { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' } }));
  assert.equal(res.status, 204);
});

test('owner cookie skips counting, not security', async () => {
  const { isOwner } = await import('./middleware.js');
  const req = c => new Request('https://complaintca.ca/', { headers: { cookie: c } });
  assert.equal(isOwner(req('a=1; cc_owner=1')), true);
  assert.equal(isOwner(req('cc_owner=10')), false);
  assert.equal(isOwner(new Request('https://complaintca.ca/')), false);
  delete process.env.KV_REST_API_URL;
  const res = await middleware(new Request('https://complaintca.ca/.env', { headers: { cookie: 'cc_owner=1' } }));
  assert.equal(res.status, 403);
});
