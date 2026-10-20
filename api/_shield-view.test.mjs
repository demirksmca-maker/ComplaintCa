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

test('wrong key is refused, missing config is 503', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.SHIELD_KEY;
  let res = mockRes();
  await shieldView({ headers: { 'x-forwarded-for': '10.0.0.1' } }, res);
  assert.equal(res.code, 503);
  process.env.SHIELD_KEY = 'secret';
  res = mockRes();
  await shieldView({ headers: { 'x-forwarded-for': '10.0.0.2', 'x-shield-key': 'nope' } }, res);
  assert.equal(res.code, 403);
  delete process.env.SHIELD_KEY;
});
