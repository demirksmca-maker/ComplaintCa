import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, raporPage } from './_rapor.js';

const basic = s => 'Basic ' + Buffer.from(s).toString('base64');
const fakeRes = () => {
  const r = { headers: {}, code: 0, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  return r;
};

test('authorized: only the right user and password', () => {
  assert.equal(authorized(basic('dias:asya')), true);
  assert.equal(authorized(basic('dias:wrong')), false);
  assert.equal(authorized(''), false);
  assert.equal(authorized('Bearer x'), false);
});

test('raporPage: 401 with a login prompt, 200 with the report, never indexed', async () => {
  const no = fakeRes();
  await raporPage({ headers: {} }, no);
  assert.equal(no.code, 401);
  assert.match(no.headers['WWW-Authenticate'], /^Basic/);
  assert.equal(no.headers['X-Robots-Tag'], 'noindex, nofollow');
  const ok = fakeRes();
  await raporPage({ headers: { authorization: basic('dias:asya') } }, ok);
  assert.equal(ok.code, 200);
  assert.equal(typeof ok.body, 'string');
  assert.ok(ok.body.startsWith('<!doctype html>'));
  assert.match(ok.body, /<title>Dias Panel Haftalık Rapor<\/title>/);
  assert.equal(ok.headers['Cache-Control'], 'private, no-store');
});
