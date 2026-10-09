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

describe('institution email (live parity)', () => {
  test('replies go to the per-complaint alias, never the complainant', async () => {
    mockFetch(); process.env.BREVO_API_KEY = 'k'; process.env.COMPLAINT_LIVE = '1';
    await call({ ...good(), category: 'noise', test: false, anonymous: false, name: 'Ana' });
    const inst = calls.filter(c => c.url.includes('brevo')).map(c => JSON.parse(c.body)).find(b => b.to[0].email !== 'me@example.com');
    assert.match(inst.replyTo.email, /^complaintcaca\+VC-\d{4}-[A-Z0-9]{6}@gmail\.com$/);
    assert.match(inst.textContent, /PRIVACY NOTICE/);
    assert.match(inst.textContent, /Filed via ComplaintCA/);
  });
  test('uses the ASYA draft with the real reference', async () => {
    mockFetch();
    const { data } = await call({ ...good(), category: 'noise', emailDraft: 'Please act.\n\nComplainant — Ref: 2026-10-08-SAFETY-CA' });
    const p = data.institution.preview;
    assert.ok(p.body.startsWith('Please act.'));
    assert.ok(p.body.includes('Ref: ' + data.ref)); assert.ok(!p.body.includes('SAFETY-CA'));
  });
  test('French complaints get the French email', async () => {
    mockFetch();
    const { data } = await call({ ...good(), category: 'noise', lang: 'fr' });
    assert.match(data.institution.preview.subject, /^Plainte Officielle/);
    assert.match(data.institution.preview.body, /AVIS DE CONFIDENTIALITÉ/);
  });
  test('admin heads-up only for live high priority', async () => {
    mockFetch(); process.env.BREVO_API_KEY = 'k';
    let r = await call({ ...good(), priority: 'high', name: 'Ana' });
    assert.equal(r.data.admin, 'test_skipped');
    process.env.COMPLAINT_LIVE = '1';
    r = await call({ ...good(), category: 'noise', priority: 'high', name: 'Ana', test: false });
    assert.equal(r.data.admin, 'sent');
    assert.ok(calls.some(c => c.url.includes('brevo') && JSON.parse(c.body).to[0].email === 'complaintcaca@gmail.com'));
  });
});

describe('POST /api/classify (live classifier parity)', () => {
  const run = async body => { const { default: h } = await import('./classify.js');
    return new Promise(r => { const res = { code:0, status(c){ this.code = c; return this; }, json(d){ r({ code:this.code, data:d }); } };
      h({ method:'POST', body, headers:{ 'x-forwarded-for':'10.9.0.' + (++ipN) } }, res); }); };
  test('valid answer → group, label, icon and AI priority', async () => {
    mockFetch(); process.env.GROQ_API_KEY = 'g';
    const { code, data } = await run({ desc:'My landlord has not fixed the heating for weeks.' });
    assert.equal(code, 200); assert.equal(data.group, 'landlord'); assert.equal(data.category, 'repairs');
    assert.equal(data.label, 'Repairs'); assert.equal(data.priority, 'medium'); assert.equal(data.support, false);
  });
  test('low confidence falls back to Other, like the live form', async () => {
    calls = []; process.env.GROQ_API_KEY = 'g';
    globalThis.fetch = async () => Response.json({ choices:[{ message:{ content:'{"group":"landlord","category":"repairs","priority":"high","confidence":0.3}' } }] });
    const { data } = await run({ desc:'something odd happened' });
    assert.equal(data.group, 'other'); assert.equal(data.category, 'other'); assert.equal(data.priority, 'high');
  });
  test('workplace harassment asks for the support screen', async () => {
    process.env.GROQ_API_KEY = 'g';
    globalThis.fetch = async () => Response.json({ choices:[{ message:{ content:'{"group":"employer","category":"harassment","priority":"high","confidence":0.9}' } }] });
    const { data } = await run({ desc:'My manager harasses me every day.' });
    assert.equal(data.support, true);
  });
  test('no AI keys → 503 so the panel falls back to manual urgency', async () => {
    mockFetch();
    const { code } = await run({ desc:'My landlord has not fixed the heating.' });
    assert.equal(code, 503);
  });
});

describe('ASYA Legal Verdict (live runAI parity)', () => {
  test('prompt carries the live rules, anonymity and FOI framing', async () => {
    const { verdictPrompt } = await import('./_verdict.js');
    const a = verdictPrompt({ desc:'x', category:'repairs', ctype:'notice', anonymous:true });
    assert.match(a.system, /DO NOT hallucinate laws/); assert.match(a.system, /ANONYMOUS SUBMISSION/);
    assert.match(a.user, /VERIFIED_FACTS[\s\S]*Correct authority: Landlord & Tenant Board Ontario/);
    const f = verdictPrompt({ desc:'x', ctype:'access', anonymous:false, location:'Toronto, ON', lang:'fr' });
    assert.match(f.system, /ACCESS TO INFORMATION REQUEST/); assert.match(f.system, /ONLY in French/);
    assert.match(f.user, /Verified response deadline: 30 days/);
  });
  test('parsing strips markdown and grounds the deadline', async () => {
    const { parseVerdict } = await import('./_verdict.js');
    const out = parseVerdict('COMPLAINT:\n**Rewritten.**\n\nLAW:\nRTA s.20\n\nSANCTIONS:\nLTB order\n\nRESPONSE_DEADLINE:\n7 days\n\nEMAIL_DRAFT:\nDear...\nComplainant — Ref: [REF]\n\nCASE_POOL_SUGGEST:\nYES',
      { facts:{ deadline:'30 days' }, isAnon:false });
    assert.equal(out.complaint, 'Rewritten.'); assert.equal(out.deadline, '30 days'); assert.equal(out.poolSuggest, true);
    assert.match(out.emailDraft, /Ref: \[REF\]/);
  });
  test('endpoint: 503 without key, parsed verdict with key', async () => {
    const { default: h } = await import('./verdict.js');
    const run = body => new Promise(r => { const res = { code:0, status(c){ this.code = c; return this; }, json(d){ r({ code:this.code, data:d }); } };
      h({ method:'POST', body, headers:{ 'x-forwarded-for':'10.8.0.' + (++ipN) } }, res); });
    let r = await run({ desc:'My landlord entered without notice.' }); assert.equal(r.code, 503);
    process.env.ANTHROPIC_API_KEY = 'a';
    globalThis.fetch = async () => Response.json({ content:[{ text:'COMPLAINT:\nA.\n\nLAW:\nB\n\nSANCTIONS:\nC\n\nRESPONSE_DEADLINE:\nD\n\nEMAIL_DRAFT:\nE\n\nCASE_POOL_SUGGEST:\nNO' }] });
    r = await run({ desc:'My landlord entered without notice.', category:'noise', anonymous:false });
    assert.equal(r.code, 200); assert.equal(r.data.law, 'B'); assert.equal(r.data.poolSuggest, false);
    delete process.env.ANTHROPIC_API_KEY;
  });
});
