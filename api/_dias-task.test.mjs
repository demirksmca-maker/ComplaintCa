import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueFor, claudeReply, diasTask } from './_dias-task.js';

const fakeRes = () => { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };

test('issueFor mentions @claude and keeps the title short', () => {
  const i = issueFor('Butonu mor yap\nikinci satır');
  assert.equal(i.title, 'Dias: Butonu mor yap');
  assert.match(i.body, /^@claude Butonu mor yap/);
});

test('claudeReply picks the latest Claude comment only', () => {
  const r = claudeReply([
    { user: { login: 'claude[bot]' }, body: 'eski', updated_at: '1' },
    { user: { login: 'someone' }, body: 'x' },
    { user: { login: 'claude[bot]' }, body: 'yeni', updated_at: '2' }
  ]);
  assert.deepEqual(r, { text: 'yeni', at: '2' });
  assert.equal(claudeReply([{ user: { login: 'someone' }, body: 'x' }]), null);
});

test('no token is 503, empty text is 400, POST opens an issue', async () => {
  delete process.env.GITHUB_TOKEN;
  let res = fakeRes();
  await diasTask({ method: 'POST', body: { text: 'x' }, query: {} }, res);
  assert.equal(res.code, 503);

  process.env.GITHUB_TOKEN = 't';
  res = fakeRes();
  await diasTask({ method: 'POST', body: { text: ' ' }, query: {} }, res);
  assert.equal(res.code, 400);

  const orig = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ number: 7, html_url: 'u' }) }; };
  res = fakeRes();
  await diasTask({ method: 'POST', body: { text: 'merhaba' }, query: { task: '1' } }, res);
  globalThis.fetch = orig;
  delete process.env.GITHUB_TOKEN;
  assert.deepEqual(res.body, { number: 7, url: 'u' });
  assert.match(sent.url, /\/issues$/);
  assert.match(JSON.parse(sent.init.body).body, /@claude merhaba/);
});
