import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOk, lastDays, shieldView } from './_shield-view.js';

function mockRes() {
  return { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test('keyOk compares exactly', () => {
  assert.equal(keyOk('abc', 'abc'), true);
  assert.equal(keyOk('abd', 'abc'), false);
  assert.equal(keyOk('ab', 'abc'), false);
  assert.equal(keyOk(undefined, 'abc'), false);
  assert.equal(keyOk('abc', ''), false);
});

test('lastDays gives 7 distinct days, newest first', () => {
  const d = lastDays(new Date('2026-10-20T12:00:00Z'));
  assert.equal(d.length, 7);
  assert.equal(d[0], '2026-10-20');
  assert.equal(d[6], '2026-10-14');
});

test('missing config is 503', async () => {
  delete process.env.SHIELD_KEY;
  const res = mockRes();
  await shieldView({ headers: { 'x-forwarded-for': '10.0.0.1' } }, res);
  assert.equal(res.code, 503);
});

test('only wrong keys count toward the lockout', async () => {
  const realFetch = globalThis.fetch;
  const kv = new Map();
  globalThis.fetch = async (_u, o) => ({ ok: true, json: async () => JSON.parse(o.body).map(([c, k]) => {
    if (c === 'GET') return { result: kv.get(k) ?? null };
    if (c === 'INCR') { kv.set(k, (kv.get(k) || 0) + 1); return { result: kv.get(k) }; }
    if (c === 'LRANGE') return { result: [] };
    return { result: 0 };
  }) });
  process.env.SHIELD_KEY = 'secret';
  process.env.KV_REST_API_URL = 'https://fake';
  process.env.KV_REST_API_TOKEN = 't';
  const call = async key => { const r = mockRes(); await shieldView({ method: 'GET', headers: { 'x-forwarded-for': '10.0.0.3', 'x-shield-key': key } }, r); return r.code; };
  try {
    for (let i = 0; i < 50; i++) assert.equal(await call('secret'), 200);
    for (let i = 0; i < 10; i++) assert.equal(await call('nope'), 403);
    assert.equal(await call('secret'), 429);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SHIELD_KEY;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});

test('periodStats adds up days and folds hours into weekdays', async () => {
  const { periodStats } = await import('./_shield-view.js');
  const pipeline = async cmds => cmds.map(([c, k]) => {
    if (c === 'GET') return k.startsWith('shield:period') ? null : '3';
    if (c === 'PFCOUNT') return 2;
    if (c === 'HGETALL') return ['p:/', '2', 'g:CA|Toronto', '1', 'd:mobile', '1', 'h:9', '4'];
    return 'OK';
  });
  const r = await periodStats(pipeline, 14, new Date('2026-10-20T15:00:00Z'));
  assert.equal(r.visits.length, 14);
  assert.deepEqual(r.pages, [['/', 28]]);
  assert.equal(r.devices.mobile, 14);
  assert.equal(r.hours.length, 7);
  assert.equal(r.hours[0][9], 8); // two Mondays in 14 days
  assert.equal(r.funnel.open, 2);
});
