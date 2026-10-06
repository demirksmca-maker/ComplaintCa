import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { handleRpc, callTool, stats, authorized } from './mcp.js';

const J = (o, init = {}) => new Response(JSON.stringify(o), { status: init.status || 200, headers: { 'content-type': 'application/json' } });
const doc = (category, date, extra = {}) => ({ document: { fields: { category: { stringValue: category }, date: { stringValue: date }, status: { stringValue: 'received' }, priority: { stringValue: 'normal' }, ctype: { stringValue: 'complaint' }, ...extra } } });

function mockRes() {
  const r = { code: 0, body: undefined, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

test('auth: refuses without secret, wrong key; accepts key or bearer', () => {
  assert.equal(authorized({ headers: {}, query: { key: 'x' } }, ''), false);
  assert.equal(authorized({ headers: {}, query: { key: 'nope' } }, 'secret123'), false);
  assert.equal(authorized({ headers: {}, query: { key: 'secret123' } }, 'secret123'), true);
  assert.equal(authorized({ headers: { authorization: 'Bearer secret123' }, query: {} }, 'secret123'), true);
});

test('handler: 503 when unconfigured, 401 when wrong key, 405 on GET', async () => {
  delete process.env.MCP_SECRET;
  let r = mockRes(); await handler({ method: 'POST', headers: {}, query: {}, body: {} }, r); assert.equal(r.code, 503);
  process.env.MCP_SECRET = 'secret123';
  r = mockRes(); await handler({ method: 'POST', headers: {}, query: { key: 'bad' }, body: {} }, r); assert.equal(r.code, 401);
  r = mockRes(); await handler({ method: 'GET', headers: {}, query: {} }, r); assert.equal(r.code, 405);
  r = mockRes(); await handler({ method: 'POST', headers: {}, query: { key: 'secret123' }, socket: {}, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }, r);
  assert.equal(r.code, 200); assert.deepEqual(r.body.result.tools.map((t) => t.name), ['complaint_stats', 'social_queue', 'add_social_post']);
  r = mockRes(); await handler({ method: 'POST', headers: {}, query: { key: 'secret123' }, socket: {}, body: { jsonrpc: '2.0', method: 'notifications/initialized' } }, r);
  assert.equal(r.code, 202);
});

test('initialize negotiates protocol', async () => {
  const a = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(a.result.protocolVersion, '2025-03-26');
  const b = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(b.result.protocolVersion, '2025-06-18');
  const c = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'nope' });
  assert.equal(c.error.code, -32601);
});

test('complaint_stats reads only public fields and compares periods', async () => {
  let sent;
  const now = Date.now(), day = 864e5, iso = (d) => new Date(now - d * day).toISOString();
  const fetchImpl = async (url, opts) => { sent = JSON.parse(opts.body); return J([doc('billing', iso(1)), doc('billing', iso(2)), doc('noise', iso(3)), doc('noise', iso(9)), { readTime: 'x' }]); };
  const out = await callTool('complaint_stats', { days: 7 }, fetchImpl);
  const s = JSON.parse(out.content[0].text);
  assert.equal(s.total, 3); assert.equal(s.previous_period_total, 1); assert.equal(s.change_pct, 200);
  assert.deepEqual(s.by_category, { billing: 2, noise: 1 });
  const fields = sent.structuredQuery.select.fields.map((f) => f.fieldPath);
  for (const pii of ['email', 'name', 'title', 'desc', 'location']) assert.ok(!fields.includes(pii), pii);
  assert.equal(sent.structuredQuery.where.fieldFilter.field.fieldPath, 'isLegal');
});

test('social_queue marks published platforms', async () => {
  const fetchImpl = async (url) => url.includes('queue.json')
    ? J({ posts: [{ id: 'a', date: '2026-10-13', image: 'social/images/a.jpg', platforms: ['facebook', 'instagram'], caption: 'A' }, { id: 'b', date: '2026-10-15', image: 'social/images/b.jpg', platforms: ['facebook'], caption: 'B' }] })
    : J({ a: { facebook: { id: '1' } }, b: { facebook: { id: '2' } } });
  const up = JSON.parse((await callTool('social_queue', {}, fetchImpl)).content[0].text).posts;
  assert.deepEqual(up.map((p) => p.id), ['a']); assert.deepEqual(up[0].published_on, ['facebook']);
  const done = JSON.parse((await callTool('social_queue', { filter: 'published' }, fetchImpl)).content[0].text).posts;
  assert.deepEqual(done.map((p) => p.id), ['b']);
});

test('add_social_post validates and commits queue', async () => {
  delete process.env.GITHUB_TOKEN;
  assert.ok((await callTool('add_social_post', { date: '2099-01-01', caption: 'x', image: 'a.jpg' })).isError);
  process.env.GITHUB_TOKEN = 't';
  const puts = [];
  const queue = { posts: [{ id: '2099-01-01-hello', date: '2099-01-01', image: 'social/images/a.jpg', platforms: ['facebook'], caption: 'old' }] };
  const fetchImpl = async (url, opts = {}) => {
    if (url.startsWith('https://www.complaintca.ca/social/images/')) return new Response('', { status: opts.method === 'HEAD' && url.endsWith('missing.jpg') ? 404 : 200 });
    if (url.includes('/contents/social/queue.json') && !opts.method) return J({ sha: 'abc', content: Buffer.from(JSON.stringify(queue)).toString('base64') });
    if (opts.method === 'PUT') { puts.push({ url, body: JSON.parse(opts.body) }); return J({ content: { sha: 'new' } }); }
    return J({}, { status: 404 });
  };
  assert.ok((await callTool('add_social_post', { date: '2000-01-01', caption: 'x', image: 'a.jpg' }, fetchImpl)).isError, 'past date');
  assert.ok((await callTool('add_social_post', { date: '2099-01-01', caption: 'x', image: 'missing.jpg' }, fetchImpl)).isError, 'missing image');
  assert.ok((await callTool('add_social_post', { date: '2099-01-01', caption: 'x' }, fetchImpl)).isError, 'no image');
  const ok = await callTool('add_social_post', { date: '2099-01-01', caption: 'Hello world', hashtags: '#Canada', image: 'a.jpg', platforms: ['facebook', 'tiktok'] }, fetchImpl);
  assert.ok(!ok.isError, ok.content[0].text);
  assert.equal(puts.length, 1); assert.equal(puts[0].body.sha, 'abc');
  const saved = JSON.parse(Buffer.from(puts[0].body.content, 'base64').toString());
  const added = saved.posts.at(-1);
  assert.equal(added.id, '2099-01-01-hello-world'); assert.deepEqual(added.platforms, ['facebook']);
  const again = await callTool('add_social_post', { date: '2099-01-01', caption: 'hello', image: 'a.jpg' }, fetchImpl);
  assert.equal(JSON.parse(Buffer.from(puts[1].body.content, 'base64').toString()).posts.at(-1).id, '2099-01-01-hello-2');
  assert.ok(!again.isError);
});
