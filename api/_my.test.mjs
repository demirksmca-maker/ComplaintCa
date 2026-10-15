import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import handler, { place, stepOf } from './_my.js';
import { mailPass } from './_mailcode.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const KEYS = ['FIREBASE_SERVICE_ACCOUNT', 'MAIL_CODE_SECRET'];
let saved, queries;
beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); process.env.FIREBASE_SERVICE_ACCOUNT = SA; process.env.MAIL_CODE_SECRET = 'm'.repeat(32); });
afterEach(() => { KEYS.forEach(k => saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])); delete globalThis.fetch; });

const doc = (ref, date, tl, extra = {}) => ({ document: { fields: { ref: { stringValue: ref }, title: { stringValue: 'T ' + ref }, date: { stringValue: date }, status: { stringValue: 'received' },
  location: { stringValue: '203-451 Ellis st, Penticton, BC' }, routedTo: { stringValue: 'School' },
  timeline: { arrayValue: { values: tl.map(s => ({ mapValue: { fields: { status: { stringValue: s } } } })) } }, ...extra } } });
function mock() {
  queries = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('oauth2')) return Response.json({ access_token: 't', expires_in: 3600 });
    const q = JSON.parse(opts.body).structuredQuery; const f = q.where.fieldFilter;
    queries.push(q.from[0].collectionId + ':' + f.field.fieldPath);
    if (q.from[0].collectionId === 'replies') return Response.json(f.value.stringValue === 'VC-2026-AAAAAA' ? [{ document: { fields: { text: { stringValue: 'We will act' }, createdAt: { stringValue: '1' } } } }] : []);
    if (f.field.fieldPath === 'emailLower') return Response.json([doc('VC-2026-AAAAAA', '2026-10-14', ['received', 'sent', 'reply'])]);
    return Response.json([doc('VC-2026-AAAAAA', '2026-10-14', ['received']), doc('VC-2026-BBBBBB', '2026-09-30', ['received', 'form'])]);
  };
}
const call = body => new Promise(resolve => {
  const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
  handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.1.0.' + Math.random() } }, res);
});

test('lists the owner\'s complaints once each, newest first, with replies and steps', async () => {
  mock();
  const e = 'me@example.com';
  const { code, data } = await call({ email: 'Me@Example.com', pass: mailPass(process.env.MAIL_CODE_SECRET, e) });
  assert.equal(code, 200);
  assert.deepEqual(data.complaints.map(c => c.ref), ['VC-2026-AAAAAA', 'VC-2026-BBBBBB']);
  assert.equal(data.complaints[0].step, 2);
  assert.equal(data.complaints[0].replies[0].text, 'We will act');
  assert.equal(data.complaints[1].step, 1);
  assert.equal(data.complaints[0].place, 'Penticton, BC');
});
test('no valid pass: refused before any database query', async () => {
  mock();
  assert.equal((await call({ email: 'me@example.com', pass: 'nope' })).code, 403);
  assert.equal(queries.length, 0);
});
test('helpers', () => {
  assert.equal(place('12 King St W, Toronto, ON'), 'Toronto, ON');
  assert.equal(stepOf('resolved', []), 3);
  assert.equal(stepOf('received', [{ status: 'received' }]), 0);
});
