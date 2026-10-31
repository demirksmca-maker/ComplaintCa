import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from './complaint.js';
import { mailSecret, mailPass } from './_mailcode.js';
import { validate, genRef, getAuthorities, getChain, buildRecord, toFirestore, titleFromDesc, replyAddress, parseReplyAddress, adminEmail } from './_complaint-core.js';

const ENV = ['TURNSTILE_SECRET_KEY', 'GROQ_API_KEY', 'BREVO_API_KEY', 'COMPLAINT_LIVE', 'COMPLAINT_PILOT_TO', 'REPLY_SECRET', 'REPLY_DOMAIN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'MAIL_CODE_SECRET'];
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
// Every filing carries a mail pass for its address, as the panel sends after the e-mailed code; noPass leaves it out.
function call(body, { noPass = false } = {}) {
  if (!noPass && body && body.mailPass === undefined && body.email) body = { ...body, mailPass: mailPass(mailSecret(), body.email) };
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
  test('the chain lists federal bodies where the authority list stays empty', () => {
    assert.ok(getChain('transit', '', 'Halifax, NS').federal.some(a => a.name === 'Canadian Transportation Agency'));
    assert.ok(getChain('billing', '', 'Regina, SK').federal.every(a => !/ontario/i.test(a.name)));
    assert.deepEqual(getChain('transit', '', 'Vancouver, BC').federal, []);
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
    // confirmation + institution letter + "sent to the institution" email to the complainant
    assert.equal(calls.filter(c => c.url.includes('brevo')).length, 3);
    assert.equal(data.institution.status, 'sent'); assert.equal(data.userNotified, true);
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
    assert.match(inst.replyTo.email, /^complaintcaca\+vc-\d{4}-[a-z0-9]{6}-[0-9a-f]{10}@gmail\.com$/);
    assert.ok(!inst.textContent.includes('me@example.com'), 'the complainant\'s own address must not reach the institution');
    assert.ok(inst.textContent.includes(inst.replyTo.email));
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
  test('admin heads-up says "not sent", not "failed", when nothing was tried', async () => {
    mockFetch(); process.env.BREVO_API_KEY = 'k'; process.env.COMPLAINT_LIVE = '1';
    await call({ ...good(), category: 'service', location: 'Halifax, NS', targetName: 'Canadian Tire', priority: 'high', name: 'Ana', test: false });
    const body = calls.filter(c => c.url.includes('brevo')).map(c => JSON.parse(c.body)).find(b => /Yüksek Öncelik/.test(b.subject)).textContent;
    assert.match(body, /Şikayet edilen: Canadian Tire/);
    assert.match(body, /Kuruma gönderim: ℹ gönderilmedi/);
    assert.doesNotMatch(body, /başarısız/);
  });
  test('adminEmail: each routing outcome gets its own line', () => {
    const c = { ref: 'VC-1', category: 'service', targetName: 'Canadian Tire' };
    const line = (inst, a) => adminEmail(c, a, inst).body.split('Kuruma gönderim: ')[1];
    const mail = { name: 'X', email: 'x@y.ca' }, form = { name: 'X', email: 'www.x.ca/form' }, bare = { name: 'X', email: '' };
    assert.match(line({ status: 'sent' }, mail), /^✅/);
    assert.match(line({ status: 'failed' }, mail), /başarısız — gönderim denendi/);
    assert.match(line({ status: 'form_only' }, form), /resmi forma/);
    assert.match(line({ status: 'form_only' }, bare), /doğrudan iletişim/);
    assert.match(line({ status: 'none' }, undefined), /otomatik kurum yok/);
    assert.match(adminEmail(c, form, { status: 'form_only' }).body, /\(https:\/\/www\.x\.ca\/form\)/);
    assert.match(adminEmail(c, { email: 'x@y.ca' }, { status: 'sent' }).body, /Yönlendirilen kurum: — \(x@y\.ca\)/);
    assert.match(adminEmail({ ...c, anonymous: true }, mail, { status: 'sent' }).body, /Anonim şikayet \| Tarih: \d{4}-\d{2}-\d{2}$/);
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

describe('reply alias, consent and pilot mode', () => {
  test('alias round-trips and forged or altered addresses are rejected', () => {
    process.env.REPLY_SECRET = 's1';
    const a = replyAddress('VC-2026-ABC234');
    assert.equal(parseReplyAddress(a), 'VC-2026-ABC234');
    assert.equal(parseReplyAddress(a.replace(/-[0-9a-f]{10}@/, '-0000000000@')), null);
    assert.equal(parseReplyAddress('complaintcaca+vc-2026-abc234@gmail.com'), null);
    process.env.REPLY_SECRET = 's2';
    assert.equal(parseReplyAddress(a), null);
  });
  test('REPLY_DOMAIN switches to catch-all addresses', () => {
    process.env.REPLY_SECRET = 's1'; process.env.REPLY_DOMAIN = 'yanit.complaintca.ca';
    assert.match(replyAddress('VC-2026-ABC234'), /^vc-2026-abc234-[0-9a-f]{10}@yanit\.complaintca\.ca$/);
  });
  test('authorization is stored with a server timestamp', async () => {
    mockFetch();
    const { data } = await call({ ...good(), consent: { authorize: true, v: '2026-10' } });
    const body = JSON.parse(calls.find(c => c.url.includes('firestore')).body);
    assert.equal(body.fields.consent.mapValue.fields.authorize.booleanValue, true);
    assert.ok(body.fields.consent.mapValue.fields.ts.stringValue);
    assert.ok(data.ref);
  });
  test('pilot mode sends the letter to the pilot mailbox only, then tells the complainant', async () => {
    mockFetch(); process.env.BREVO_API_KEY = 'k'; process.env.COMPLAINT_PILOT_TO = 'pilot@example.org';
    const { data } = await call({ ...good(), category: 'noise' });
    assert.equal(data.test, true); assert.equal(data.institution.status, 'sent'); assert.equal(data.institution.pilot, true);
    const mails = calls.filter(c => c.url.includes('brevo')).map(c => JSON.parse(c.body));
    assert.equal(mails.length, 3);
    const letter = mails.find(m => m.to[0].email === 'pilot@example.org');
    assert.match(letter.subject, /^\[PILOT/);
    assert.match(letter.replyTo.email, /^complaintcaca\+vc-/);
    assert.equal(mails.filter(m => m.to[0].email === 'me@example.com').length, 2); // confirmation + "sent"
    assert.ok(mails.every(m => !m.to[0].email.includes('toronto.ca')));
  });
});

describe('e-mail check', () => {
  test('a filing without a valid mail pass is refused before anything is saved or sent', async () => {
    mockFetch();
    const r = await call(good(), { noPass: true });
    assert.equal(r.code, 403); assert.equal(r.data.error, 'email_unverified');
    const r2 = await call({ ...good(), mailPass: mailPass(mailSecret(), 'someone@else.ca') });
    assert.equal(r2.code, 403);
    assert.equal(calls.length, 0);
  });
});

describe('public summary (publicFeed)', () => {
  test('keeps a short title, category, a general place, date and status — no name, e-mail or story', async () => {
    const { publicSummary } = await import('./_complaint-core.js');
    const s = publicSummary({ ref: 'VC-2026-ABC123', category: 'education', location: '183 Snow Ave, Blenheim, ON', date: '2026-10-14T04:11:52Z', name: 'W', email: 'w@x.ca', desc: 'story', title: 't' });
    assert.deepEqual(Object.keys(s).sort(), ['category', 'city', 'date', 'ref', 'status', 'title']);
    assert.equal(s.title, 't');
    assert.equal(s.city, 'Blenheim, ON');
    assert.equal(publicSummary({ ref: 'VC-2026-ABC123', location: '' }).city, 'Canada');
  });
  test('title drops e-mails, links and phone numbers, and is cut to 80 characters', async () => {
    const { publicTitle, publicSummary } = await import('./_complaint-core.js');
    assert.equal(publicTitle('Call me at 519-555-0123 or a@b.ca see https://x.ca now'), 'Call me at or see now');
    assert.ok(publicTitle('x'.repeat(200)).length <= 80);
    assert.equal(publicSummary({ ref: 'VC-2026-ABC123', desc: 'Dealer kept my deposit. More text.' }).title, 'Dealer kept my deposit.');
    assert.ok(!('title' in publicSummary({ ref: 'VC-2026-ABC123' })));
  });
  test('panel test filings are not published; real filings are, in the pilot too', async () => {
    mockFetch();
    await call(good());
    assert.equal(calls.filter(c => c.url.includes('/publicFeed')).length, 0);
    mockFetch();
    await call({ ...good(), test: true });
    assert.equal(calls.filter(c => c.url.includes('/publicFeed')).length, 0);
    delete process.env.COMPLAINT_LIVE;
    mockFetch();
    const pilot = await call({ ...good(), test: false });
    assert.equal(pilot.data.test, true);
    assert.equal(calls.filter(c => c.url.includes('/publicFeed')).length, 1);
    process.env.COMPLAINT_LIVE = '1';
    mockFetch();
    await call({ ...good(), desc: good().desc + ' The tenant next door is Jane Roe.', test: false });
    const pub = calls.filter(c => c.url.includes('/publicFeed'));
    assert.equal(pub.length, 1);
    assert.ok(!/me@example\.com|Jane Roe/.test(pub[0].body));
  });
});

import { withOwnWords } from './_complaint-core.js';
import { emailDraftSpec } from './_verdict.js';
test('own words go in unedited, before the law section', () => {
  const d = 'Dear Principal,\nText.\n\nSUMMARY OF EVENTS\n- When: Oct 6\n\nAPPLICABLE LAW AND OBLIGATIONS\n- Education Act\n\nSincerely,';
  const out = withOwnWords(d, 'Kızım 1. sınıfta.', false);
  assert.ok(out.indexOf("IN THE COMPLAINANT'S OWN WORDS") < out.indexOf('APPLICABLE LAW'));
  assert.ok(out.includes('"Kızım 1. sınıfta."'));
  assert.ok(withOwnWords('Short letter.', 'My story', false).endsWith('"My story"'));
  assert.equal(withOwnWords(d, '', false), d);
});
test('letter layout asks for the sections in order', () => {
  const s = emailDraftSpec({ lang: 'en' });
  for (const h of ['SUMMARY OF EVENTS', 'APPLICABLE LAW AND OBLIGATIONS', 'REQUESTS', 'RESPONSE DEADLINE AND NEXT STEPS']) assert.ok(s.includes(h));
  assert.ok(emailDraftSpec({ lang: 'fr' }).includes('LOIS APPLICABLES ET OBLIGATIONS'));
  assert.ok(!emailDraftSpec({ isAnon: true, lang: 'en' }).includes('REQUESTS"'));
});

describe('Canadian law grounding (CA_LAWS)', () => {
  test('province comes from city names, last city wins', async () => {
    const { _detectProvince } = await import('./_engine-data.js');
    assert.equal(_detectProvince('Winnipeg'), 'MB'); assert.equal(_detectProvince('Hamilton'), 'ON');
    assert.equal(_detectProvince('12 Victoria St, Toronto'), 'ON'); assert.equal(_detectProvince('Richmond Hill'), 'ON');
    assert.equal(_detectProvince('Paris'), '');
  });
  test('verified facts follow the province, never Ontario bodies outside Ontario', async () => {
    const { _verifiedFactsFor } = await import('./_engine-data.js');
    const bc = _verifiedFactsFor('repairs', 'Vancouver, BC');
    assert.match(bc.act, /Residential Tenancy Act \(British Columbia\)/); assert.doesNotMatch(bc.authorities, /Ontario/);
    const mb = _verifiedFactsFor('wages', 'Winnipeg');
    assert.match(mb.act, /Employment Standards Code \(Manitoba\)/); assert.equal(mb.deadline, '');
    assert.match(_verifiedFactsFor('repairs', 'Toronto, ON').act, /Residential Tenancies Act, 2006/);
    assert.equal(_verifiedFactsFor('noise', 'Saskatoon'), null);
    assert.match(_verifiedFactsFor('police', 'Iqaluit').act, /RCMP polices Nunavut/);
    assert.equal(_verifiedFactsFor('repairs', '').act, '');
  });
  test('every province and territory has an access-to-information Act', async () => {
    const { _foiFactsFor, FOI_FACTS, CA_LAWS } = await import('./_engine-data.js');
    for (const pv of ['ON','BC','AB','QC','MB','SK','NS','NB','PE','NL','YT','NT','NU']) { assert.ok(FOI_FACTS[pv].act); assert.ok(CA_LAWS[pv].tenancy); }
    assert.match(_foiFactsFor('Hamilton').act, /FIPPA/);
    assert.match(_foiFactsFor('Ottawa', 'Canada Revenue Agency').act, /R\.S\.C\. 1985, c\. A-1/);
    assert.match(_foiFactsFor('Edmonton').deadline, /30 business days/);
    for (const pv of Object.keys(FOI_FACTS)) assert.ok(FOI_FACTS[pv].deadline, pv + ' has no deadline');
  });
  test('the letter prompt carries the Act', async () => {
    const { verdictPrompt } = await import('./_verdict.js');
    assert.match(verdictPrompt({ desc:'x', category:'repairs', location:'Halifax', anonymous:false }).user, /Correct Act: Residential Tenancies Act \(Nova Scotia\)/);
  });
});
