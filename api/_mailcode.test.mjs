import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCode, codeToken, checkCode, mailPass, checkPass, CODE_TTL_MS, PASS_TTL_MS } from './_mailcode.js';

const S = 'test-secret';

test('code: right code, same address (any case) passes', () => {
  const c = newCode(); assert.match(c, /^\d{6}$/);
  const t = codeToken(S, 'Ali@Example.ca', c);
  assert.equal(checkCode(S, 'ali@example.ca', c, t), true);
});
test('code: wrong code, other address, other secret, expired or junk token fail', () => {
  const now = Date.now(), t = codeToken(S, 'a@b.ca', '123456', now);
  assert.equal(checkCode(S, 'a@b.ca', '123457', t, now), false);
  assert.equal(checkCode(S, 'x@b.ca', '123456', t, now), false);
  assert.equal(checkCode('other', 'a@b.ca', '123456', t, now), false);
  assert.equal(checkCode(S, 'a@b.ca', '123456', t, now + CODE_TTL_MS + 1), false);
  assert.equal(checkCode(S, 'a@b.ca', '123456', 'nope', now), false);
  assert.equal(checkCode('', 'a@b.ca', '123456', t, now), false);
});
test('pass: valid for its address for 30 days only', () => {
  const now = Date.now(), p = mailPass(S, 'a@b.ca', now);
  assert.equal(checkPass(S, 'A@B.CA', p, now), true);
  assert.equal(checkPass(S, 'c@b.ca', p, now), false);
  assert.equal(checkPass(S, 'a@b.ca', p, now + PASS_TTL_MS + 1), false);
  assert.equal(checkPass(S, 'a@b.ca', undefined, now), false);
});
test('a code token is not a pass', () => {
  const t = codeToken(S, 'a@b.ca', '123456');
  assert.equal(checkPass(S, 'a@b.ca', t), false);
});
