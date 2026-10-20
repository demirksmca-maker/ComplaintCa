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
