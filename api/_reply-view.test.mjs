import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import handler from './_reply-view.js';
import { mailPass } from './_mailcode.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const KEYS = ['FIREBASE_SERVICE_ACCOUNT', 'MAIL_CODE_SECRET'];
let saved, calls;
beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); process.env.FIREBASE_SERVICE_ACCOUNT = SA; process.env.MAIL_CODE_SECRET = 'm'.repeat(32); });
afterEach(() => { KEYS.forEach(k => saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])); delete globalThis.fetch; });

const complaint = { document: { fields: { ref: { stringValue: 'VC-2026-ABC234' }, email: { stringValue: 'Me@Example.com' }, title: { stringValue: 'Heating' }, status: { stringValue: 'review' } } } };
const reply = (t, at) => ({ document: { fields: { from: { stringValue: 'Clerk <c@x.ca>' }, date: { stringValue: 'd' }, text: { stringValue: t }, attachments: { integerValue: '1' }, createdAt: { stringValue: at } } } });
function mock() {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); calls.push(u);
    if (u.includes('oauth2')) return Response.json({ access_token: 't', expires_in: 3600 });
    const q = JSON.parse(opts.body).structuredQuery.from[0].collectionId;
    return Response.json(q === 'complaints' ? [complaint] : [reply('second', '2026-10-02'), reply('first', '2026-10-01')]);
  };
}
const call = body => new Promise(resolve => {
  const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
  handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.0.0.' + Math.random() } }, res);
});
const sec = () => process.env.MAIL_CODE_SECRET;

test('the owner with a valid mail pass sees the replies, oldest first', async () => {
  mock();
  const { code, data } = await call({ ref: 'vc-2026-abc234', email: 'me@example.com', pass: mailPass(sec(), 'me@example.com') });
  assert.equal(code, 200);
  assert.deepEqual(data.replies.map(r => r.text), ['first', 'second']);
  assert.equal(data.replies[0].attachments, 1);
});
test('no valid pass: refused before any database read', async () => {
  mock();
  assert.equal((await call({ ref: 'VC-2026-ABC234', email: 'me@example.com', pass: 'x' })).code, 403);
  assert.equal(calls.length, 0);
});
test('someone else\'s e-mail gets not_found, never the replies', async () => {
  mock();
  const { code, data } = await call({ ref: 'VC-2026-ABC234', email: 'other@example.com', pass: mailPass(sec(), 'other@example.com') });
  assert.equal(code, 404); assert.equal(data.replies, undefined);
});
test('malformed reference is rejected', async () => {
  mock();
  assert.equal((await call({ ref: 'X', email: 'me@example.com', pass: 'x' })).code, 400);
});
test('GET is a health check: admin true when the service account works', async () => {
  mock();
  const r = await new Promise(resolve => { const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } }; handler({ method: 'GET', headers: {} }, res); });
  assert.equal(r.code, 200); assert.equal(r.data.admin, true);
});
