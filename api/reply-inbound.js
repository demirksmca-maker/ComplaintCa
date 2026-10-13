// Inbound institution replies → the complainant.
//
// A small Google Apps Script in the ComplaintCA mailbox (complaintcaca@gmail.com) posts every
// message addressed to a per-complaint alias (complaintca+TAG@…) here. We verify the alias
// signature, find the complaint, mark it "reply received" and email the reply to the person who
// filed it. The reply text is only emailed to the complainant; it is never written to Firestore
// (complaint records are publicly readable), only "reply received · date" goes on the timeline.
//
// Auth: header x-inbound-secret must equal env INBOUND_SECRET.
import { timingSafeEqual } from 'node:crypto';
import { SENDER, buildBrandedHtml } from './send-email.js';
import { parseReplyAddress } from './_complaint-core.js';

const FIREBASE_PROJECT = 'ajan-d6070';
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDtK_bODD77BICh9O1DfhPMf2ENOcwWx8g';
const FS = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };
const sv = f => (f && (f.stringValue ?? '')) || '';
const emailOf = s => { const m = String(s || '').match(/[^\s<>"']+@[^\s<>"']+/); return m ? m[0].toLowerCase() : ''; };

// Drop quoted history ("> …", "On … wrote:", "… şunu yazdı:") and cap the length.
export function cleanReply(text) {
  const out = [];
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    if (/(\bwrote:|şunu yazdı:|a écrit\s*:)\s*$/i.test(line) || /^-{2,}\s*(original message|forwarded message)/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

async function findComplaint(ref) {
  // isLegal == false keeps the query inside the public-read rule (no sign-in on the server).
  const body = { structuredQuery: { from: [{ collectionId: 'complaints' }], limit: 1, where: { compositeFilter: { op: 'AND', filters: [
    { fieldFilter: { field: { fieldPath: 'ref' }, op: 'EQUAL', value: { stringValue: ref } } },
    { fieldFilter: { field: { fieldPath: 'isLegal' }, op: 'EQUAL', value: { booleanValue: false } } },
  ] } } } };
  const r = await fetch(`${FS}:runQuery?key=${FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  const rows = await r.json();
  const doc = Array.isArray(rows) && rows.find(x => x.document);
  return doc ? doc.document : null;
}

const timelineOf = doc => ((doc.fields || {}).timeline && doc.fields.timeline.arrayValue && doc.fields.timeline.arrayValue.values) || [];
const hasMid = (doc, mid) => timelineOf(doc).some(v => v.mapValue && v.mapValue.fields && sv(v.mapValue.fields.mid) === mid);

async function markReplied(doc, mid) {
  const f = doc.fields || {};
  const tl = timelineOf(doc);
  const entry = { mapValue: { fields: { status: { stringValue: 'reply' }, date: { stringValue: new Date().toISOString() }, note: { stringValue: 'Institution replied (sent to you by email)' }, mid: { stringValue: mid } } } };
  const status = sv(f.status) === 'received' ? 'review' : sv(f.status) || 'review';
  const url = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=status&updateMask.fieldPaths=timeline&key=${FIREBASE_API_KEY}`;
  const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { status: { stringValue: status }, timeline: { arrayValue: { values: [...tl, entry] } } } }) });
  return r.ok ? 'ok' : 'failed';
}

function forwardEmail(c, m) {
  const link = 'https://www.complaintca.ca/?track=' + encodeURIComponent(c.ref);
  const att = m.attachments > 0;
  const T = {
    en: { s: 'The institution replied — ' + c.ref, h: 'The institution replied to your complaint.', k: 'Complaint', f: 'From', d: 'Date', r: 'Reply', a: 'The reply had ' + m.attachments + ' attachment(s). They are not included here.', t: 'Track your complaint:' },
    fr: { s: 'L\'organisme a répondu — ' + c.ref, h: 'L\'organisme a répondu à votre plainte.', k: 'Plainte', f: 'De', d: 'Date', r: 'Réponse', a: 'La réponse contenait ' + m.attachments + ' pièce(s) jointe(s). Elles ne sont pas incluses ici.', t: 'Suivre votre plainte :' },
    tr: { s: 'Kurum yanıt verdi — ' + c.ref, h: 'Kurum şikâyetinize yanıt verdi.', k: 'Şikâyet', f: 'Kimden', d: 'Tarih', r: 'Yanıt', a: 'Yanıtta ' + m.attachments + ' ek dosya vardı. Bu e-postaya eklenmedi.', t: 'Şikâyetinizi takip edin:' },
  }[c.lang === 'fr' ? 'fr' : c.lang === 'tr' ? 'tr' : 'en'];
  const body = T.h + '\n\n' + T.k + ': ' + c.ref + (c.title ? ' — ' + c.title : '') + '\n' + T.f + ': ' + m.from + '\n' + T.d + ': ' + m.date + '\n\n— ' + T.r + ' —\n' + (m.text || '(empty)') + '\n' + (att ? '\n' + T.a + '\n' : '') + '\n' + T.t + '\n' + link;
  return { subject: (c.test ? '[TEST] ' : '') + T.s, body };
}

async function sendMail(to, name, subject, body) {
  if (!process.env.BREVO_API_KEY) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST',
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: SENDER, to: [{ email: to, name: name || undefined }], subject, htmlContent: buildBrandedHtml(body), textContent: body }) });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.INBOUND_SECRET;
  if (!secret) return res.status(503).json({ error: 'not_configured' });
  if (!same(req.headers['x-inbound-secret'], secret)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const b = req.body || {};
    const mid = String(b.messageId || '').slice(0, 80);
    if (!mid) return res.status(400).json({ error: 'invalid' });
    // Whichever address in the To/Cc list carries a valid signed alias.
    const ref = String(b.to || '').split(/[\s,;]+/).map(parseReplyAddress).find(Boolean);
    if (!ref) return res.status(200).json({ ok: true, matched: false, reason: 'no_alias' });
    const doc = await findComplaint(ref);
    if (!doc) return res.status(200).json({ ok: true, matched: false, reason: 'not_found', ref });
    const f = doc.fields || {};
    const c = { ref, title: sv(f.title), email: sv(f.email), name: sv(f.name), lang: sv(f.lang), test: !!(f.test && f.test.booleanValue) };
    const from = emailOf(b.from);
    // Never loop our own mail or the complainant's own writing back to them.
    if (!from || from === c.email.toLowerCase() || /(^|[@.])complaintcaca@|brevosend\.com$/.test(from)) return res.status(200).json({ ok: true, matched: true, ref, skipped: 'own_mail' });
    if (hasMid(doc, mid)) return res.status(200).json({ ok: true, matched: true, ref, skipped: 'duplicate' });
    const m = { from: String(b.from || '').slice(0, 200), date: String(b.date || new Date().toISOString()).slice(0, 40), text: cleanReply(b.text), attachments: Number.isInteger(b.attachments) ? b.attachments : 0 };
    const mail = forwardEmail(c, m);
    // Email first, then stamp the timeline: if the email fails we answer 502 and the script retries.
    const notified = await sendMail(c.email, c.name, mail.subject, mail.body);
    if (!notified) return res.status(502).json({ error: 'email_failed', ref });
    const status = await markReplied(doc, mid);
    return res.status(200).json({ ok: true, matched: true, ref, status, notified });
  } catch (err) {
    return res.status(500).json({ error: 'server', message: err.message });
  }
}
