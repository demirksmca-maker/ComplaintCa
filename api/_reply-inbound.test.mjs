import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { cleanReply } from './reply-inbound.js';
import { replyAddress } from './_complaint-core.js';

const ENV = ['INBOUND_SECRET', 'REPLY_SECRET', 'REPLY_DOMAIN', 'BREVO_API_KEY'];
let saved, calls;

const doc = (over = {}) => ({ document: { name: 'projects/p/databases/(default)/documents/complaints/abc', fields: {
  ref: { stringValue: 'VC-2026-ABC234' }, title: { stringValue: 'Heating' }, email: { stringValue: 'me@example.com' }, name: { nullValue: null },
  lang: { stringValue: 'en' }, test: { booleanValue: true }, status: { stringValue: 'received' },
  timeline: { arrayValue: { values: [{ mapValue: { fields: { status: { stringValue: 'received' }, date: { stringValue: 'x' } } } }] } }, ...over } } });

function mockFetch({ rows = [doc()], brevoOk = true } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); calls.push({ url: u, method: opts.method, body: opts.body });
    if (u.includes(':runQuery')) return Response.json(rows);
    if (u.includes('firestore.googleapis.com') && opts.method === 'PATCH') return new Response('{}', { status: 200 });
    if (u.includes('api.brevo.com')) return new Response('{}', { status: brevoOk ? 201 : 500 });
    throw new Error('unexpected fetch ' + u);
  };
}
function call(body, secret = 's3cret') {
  return new Promise(resolve => {
    const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
    handler({ method: 'POST', body, headers: { 'x-inbound-secret': secret } }, res);
  });
}
const msg = (over = {}) => ({ to: replyAddress('VC-2026-ABC234'), from: 'Clerk <clerk@school.ca>', subject: 'Re: complaint', date: '2026-10-12T21:50:00Z', text: 'We will act on this.\n\nOn Mon, ComplaintCA wrote:\n> old text', attachments: 0, messageId: 'm1', ...over });

beforeEach(() => { saved = Object.fromEntries(ENV.map(k => [k, process.env[k]])); process.env.INBOUND_SECRET = 's3cret'; process.env.REPLY_SECRET = 'r1'; process.env.BREVO_API_KEY = 'k'; delete process.env.REPLY_DOMAIN; });
afterEach(() => { ENV.forEach(k => saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])); delete globalThis.fetch; });

describe('cleanReply', () => {
  test('drops quoted history in English and Turkish', () => {
    assert.equal(cleanReply('Hello\n\nOn Mon, X wrote:\n> old'), 'Hello');
    assert.equal(cleanReply('Merhaba\n12 Eki 2026 Pzt tarihinde ComplaintCA <a@b.c> şunu yazdı:\n> eski'), 'Merhaba');
    assert.equal(cleanReply('Line\n> quoted\nNext'), 'Line\nNext');
  });
});

describe('POST /api/reply-inbound', () => {
  test('rejects a wrong or missing secret, and is off without INBOUND_SECRET', async () => {
    mockFetch();
    assert.equal((await call(msg(), 'nope')).code, 401);
    delete process.env.INBOUND_SECRET;
    assert.equal((await call(msg())).code, 503);
  });
  test('ignores mail that is not addressed to a valid signed alias', async () => {
    mockFetch();
    const forged = await call(msg({ to: 'complaintcaca+vc-2026-abc234-0000000000@gmail.com' }));
    assert.equal(forged.data.matched, false);
    assert.equal((await call(msg({ to: 'someone@else.com' }))).data.matched, false);
    assert.equal(calls.length, 0);
  });
  test('emails the reply to the complainant and stamps the timeline without the text', async () => {
    mockFetch();
    const { code, data } = await call(msg());
    assert.equal(code, 200); assert.equal(data.matched, true); assert.equal(data.notified, true);
    const mail = JSON.parse(calls.find(c => c.url.includes('brevo')).body);
    assert.equal(mail.to[0].email, 'me@example.com');
    assert.match(mail.subject, /^\[TEST\] The institution replied — VC-2026-ABC234/);
    assert.match(mail.textContent, /We will act on this\./);
    assert.ok(!mail.textContent.includes('old text'));
    const patch = calls.find(c => c.method === 'PATCH');
    assert.match(patch.url, /updateMask\.fieldPaths=status&updateMask\.fieldPaths=timeline/);
    const sent = JSON.parse(patch.body);
    assert.equal(sent.fields.status.stringValue, 'review');
    assert.ok(!patch.body.includes('We will act on this'), 'reply text must not be written to Firestore');
    assert.equal(sent.fields.timeline.arrayValue.values.length, 2);
  });
  test('the same message is not forwarded twice', async () => {
    const first = doc();
    first.document.fields.timeline.arrayValue.values.push({ mapValue: { fields: { status: { stringValue: 'reply' }, mid: { stringValue: 'm1' } } } });
    mockFetch({ rows: [first] });
    const { data } = await call(msg());
    assert.equal(data.skipped, 'duplicate');
    assert.equal(calls.filter(c => c.url.includes('brevo')).length, 0);
  });
  test('the complainant\'s own mail and our own mail are never looped back', async () => {
    mockFetch();
    assert.equal((await call(msg({ from: 'Me <me@example.com>' }))).data.skipped, 'own_mail');
    assert.equal((await call(msg({ from: 'ComplaintCA <complaintcaca@11550652.brevosend.com>' }))).data.skipped, 'own_mail');
    assert.equal(calls.filter(c => c.url.includes('brevo')).length, 0);
  });
  test('a failed email answers 502 and leaves the timeline alone so the script retries', async () => {
    mockFetch({ brevoOk: false });
    const { code } = await call(msg());
    assert.equal(code, 502);
    assert.equal(calls.filter(c => c.method === 'PATCH').length, 0);
  });
  test('unknown complaint is reported, not an error', async () => {
    mockFetch({ rows: [{ readTime: 'x' }] });
    const { code, data } = await call(msg());
    assert.equal(code, 200); assert.equal(data.reason, 'not_found');
  });
});
