import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOk, lastDays, shieldView, funnelWindows, funnelPanel } from './_shield-view.js';

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

test('fillFromGsc fills empty days and pages from Search Console, keeps own counts', async () => {
  const { fillFromGsc } = await import('./_shield-view.js');
  const r = { visits: [{ day: '2026-10-20', ca: { views: 3, visitors: 2 }, es: { views: 0, visitors: 0 } }, { day: '2026-10-19', ca: { views: 0, visitors: 0 }, es: { views: 0, visitors: 0 } }], pages: [['/', 2]] };
  fillFromGsc(r, { ok: true, daily: [{ day: '2026-10-19', clicks: 18 }, { day: '2026-10-20', clicks: 9 }], totals: { clicks: 193 }, pages: [{ key: '/blog/a.html', clicks: 15 }] });
  assert.equal(r.visits[0].ca.visitors, 2);
  assert.equal(r.visits[1].ca.visitors, 18);
  assert.deepEqual(r.pages, [['/blog/a.html', 15]]);
});

test('complaintSummary counts weeks and top institutions', async () => {
  const { complaintSummary } = await import('./_shield-view.js');
  const now = Date.parse('2026-10-21T12:00:00Z');
  const s = complaintSummary([
    { date: '2026-10-20T10:00:00Z', targetName: 'Rogers', category: 'telecom' },
    { date: '2026-10-19T10:00:00Z', targetName: 'Rogers', category: 'telecom' },
    { date: '2026-10-10T10:00:00Z', targetName: '', category: 'housing' },
    { date: '2026-01-01T10:00:00Z', targetName: null, category: null }
  ], now);
  assert.equal(s.total, 4);
  assert.equal(s.week, 2);
  assert.equal(s.before, 1);
  assert.deepEqual(s.top, [['Rogers', 2], ['housing', 1]]);
});

test('funnelWindows: back-to-back windows, nothing before the funnel started', () => {
  const w = funnelWindows(new Date('2026-10-24T12:00:00Z'));
  assert.deepEqual(w.map(x => x.name), ['1', '7', '30', '60', '90', 'since']);
  assert.deepEqual(w[0].cur, ['2026-10-24']);
  assert.deepEqual(w[0].prev, ['2026-10-23']);
  assert.equal(w[1].cur.length, 5);
  assert.deepEqual(w[1].prev, []);
  assert.equal(w[5].cur[w[5].cur.length - 1], '2026-10-20');
});

test('funnelPanel: one PFCOUNT per step and window, empty windows null', async () => {
  let sent;
  const out = await funnelPanel(async cmds => { sent = cmds; return cmds.map((_, i) => i + 1); }, new Date('2026-10-24T12:00:00Z'));
  assert.ok(sent.every(c => c[0] === 'PFCOUNT' && c.length > 1));
  assert.deepEqual(out.windows[0].cur, { from: '2026-10-24', to: '2026-10-24', open: 1, route: 2, email: 3, submit: 4 });
  assert.equal(out.windows[0].prev.open, 5);
  assert.equal(out.windows[1].prev, null);
});

test('open panel: ?funnel=1 without a key needs no password; other reads still do', async () => {
  const env = { ...process.env };
  process.env.SHIELD_KEY = 'k'; process.env.UPSTASH_REDIS_REST_URL = 'https://u'; process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => ({ ok: true, json: async () => JSON.parse(o.body).map(() => ({ result: 0 })) });
  try {
    const open = mockRes();
    await shieldView({ query: { funnel: '1' }, headers: {}, socket: {} }, open);
    assert.equal(open.code, 200);
    assert.equal(open.body.ok, true);
    const locked = mockRes();
    await shieldView({ query: {}, headers: {}, socket: {} }, locked);
    assert.equal(locked.code, 403);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
});
