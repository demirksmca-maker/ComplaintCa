import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from './complaint.js';
import { validate, genRef, getAuthorities, getChain, buildRecord, toFirestore, titleFromDesc } from './_complaint-core.js';

const ENV = ['TURNSTILE_SECRET_KEY', 'GROQ_API_KEY', 'BREVO_API_KEY', 'COMPLAINT_LIVE', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
let saved, calls, ipN = 0;

function mockFetch({ firestoreStatus = 200 } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body });
    if (String(url).includes('firestore.googleapis.com')) return new Response('{}', { status: firestoreStatus });
    if (String(url).includes('api.brevo.com')) return new Response('{"messageId":"x"}', { status: 201 });
    if (String(url).includes('api.groq.com')) return Response.json({ choices: [{ message: { content: '{"group":"landlord","category":"repairs","priority":"medium","confidence":0.9}' } }] });
    throw new Error('unexpected fetch ' + url);
  };
}
function call(body) {
  return new Promise(resolve => {
    const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
    handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.0.0.' + (++ipN) } }, res);
  });
}
const good = () => ({ desc: 'My landlord has not fixed the broken heating for three weeks.', email: 'me@example.com', legalAccepted: true, location: 'Toronto, ON', target: 'landlord' });

beforeEach(() => { saved = Object.fromEntries(ENV.map(k => [k, process.env[k]])); ENV.forEach(k => delete process.env[k]); });
afterEach(() => { ENV.forEach(k => saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])); delete globalThis.fetch; });

describe('core', () => {
  test('ref matches the Firestore rule format', () => {
    for (let i = 0; i < 50; i++) assert.match(genRef(), /^(VC|CY)-[0-9]{4}-[A-Z0-9]{6}$/);
  });
  test('title is derived from the first sentence', () => {
    assert.equal(titleFromDesc('Heating is broken. It is cold.'), 'Heating is broken.');
  });
  test('required fields and legal consent', () => {
    const r = validate({ desc: '', email: 'bad' });
    assert.deepEqual(r.errors.sort(), ['desc', 'email', 'legal', 'title'].sort());
  });
  test('high priority and legal requests need a name and are never anonymous', () => {
    assert.ok(validate({ ...good(), priority: 'high' }).errors.includes('name'));
    assert.ok(validate({ ...good(), ctype: 'legal' }).errors.includes('name'));
    const ok = validate({ ...good(), priority: 'high', name: 'Ana' });
    assert.equal(ok.ok, true); assert.equal(ok.input.anonymous, false);
  });
  test('routing matches the live site', () => {
    assert.ok(getAuthorities('noise', 'Toronto, ON')[0].name.includes('311 Toronto'));
    assert.ok(getAuthorities('noise', 'Mississauga')[0].name.includes('Mississauga'));
  });
  test('provinces without auto-email get the verified chain', () => {
    const ch = getChain('repairs', 'landlord', 'Winnipeg, MB');
    assert.equal(ch.province, 'MB'); assert.ok(ch.bodies.length > 0);
  });
  test('record has every field the rules require', () => {
    const rec = buildRecord(validate(good()).input, { ref: 'VC-2026-ABC234' });
    for (const k of ['ref', 'title', 'desc', 'category', 'status', 'date', 'timeline', 'anonymous', 'email']) assert.ok(k in rec, k);
    assert.equal(rec.test, true); assert.equal(rec.status, 'received');
    assert.equal(toFirestore(rec).mapValue.fields.anonymous.booleanValue, true);
  });
});

describe('POST /api/complaint', () => {
  test('saves a TEST record and never emails the institution by default', async () => {
    mockFetch(); process.env.BREVO_API_KEY = 'k';
    const { code, data } = await call({ ...good(), test: false });
    assert.equal(code, 200);
    assert.equal(data.test, true);
    assert.match(data.ref, /^VC-\d{4}-[A-Z0-9]{6}$/);
    const brevo = calls.filter(c => c.url.includes('brevo'));
    assert.equal(brevo.length, 1, 'only the confirmation email');
    assert.equal(JSON.parse(brevo[0].body).to[0].email, 'me@example.com');
    assert.match(JSON.parse(brevo[0].body).subject, /^\[TEST\]/);
    const fs = JSON.parse(calls.find(c => c.url.includes('firestore')).body).fields;
    assert.equal(fs.test.booleanValue, true); assert.equal(fs.source.stringValue, 'ui-new');
  });
  test('emails the institution only when COMPLAINT_LIVE=1 and test:false', async () => {
    mockFetch(); process.env.BREVO_API_KEY = 'k'; process.env.COMPLAINT_LIVE = '1';
    const { data } = await call({ ...good(), category: 'noise', test: false });
    assert.equal(data.test, false);
    assert.equal(calls.filter(c => c.url.includes('brevo')).length, 2);
    assert.equal(data.institution.status, 'sent');
  });
  test('rejects invalid input with field list', async () => {
    mockFetch();
    const { code, data } = await call({ desc: 'x' });
    assert.equal(code, 400); assert.ok(data.fields.includes('email'));
  });
  test('reports a failed save', async () => {
    mockFetch({ firestoreStatus: 403 });
    const { code, data } = await call(good());
    assert.equal(code, 502); assert.equal(data.error, 'save_failed');
  });
  test('classifies category with AI when not given', async () => {
    mockFetch(); process.env.GROQ_API_KEY = 'g';
    const { data } = await call(good());
    assert.equal(data.category, 'repairs');
  });
});
