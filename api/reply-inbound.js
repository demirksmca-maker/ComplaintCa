// Inbound institution replies → the complainant.
//
// A small Google Apps Script in the ComplaintCA mailbox (complaintcaca@gmail.com) posts every
// message addressed to a per-complaint alias (complaintca+TAG@…) here. We verify the alias
// signature, find the complaint, keep the reply in the server-only `replies` collection, mark the
// complaint "reply received" and email the person who filed it a notice with a link. The reply
// text itself is not emailed: it is shown at /?reply=REF once the person confirms their e-mail
// with a code (api/_reply-view.js). Firestore access uses the service account (api/_gauth.js).
//
// Auth: header x-inbound-secret must equal env INBOUND_SECRET.
import { timingSafeEqual, createHash } from 'node:crypto';
import { FS, fsAdmin, findByRef } from './_gauth.js';
import { SENDER, buildBrandedHtml } from './send-email.js';
import { parseReplyAddress } from './_complaint-core.js';

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

const timelineOf = doc => ((doc.fields || {}).timeline && doc.fields.timeline.arrayValue && doc.fields.timeline.arrayValue.values) || [];
const hasMid = (doc, mid) => timelineOf(doc).some(v => v.mapValue && v.mapValue.fields && sv(v.mapValue.fields.mid) === mid);

async function markReplied(doc, mid) {
  const f = doc.fields || {};
  const tl = timelineOf(doc);
  const entry = { mapValue: { fields: { status: { stringValue: 'reply' }, date: { stringValue: new Date().toISOString() }, note: { stringValue: 'Institution replied' }, mid: { stringValue: mid } } } };
  const status = sv(f.status) === 'received' ? 'review' : sv(f.status) || 'review';
  const url = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=status&updateMask.fieldPaths=timeline`;
  const r = await fsAdmin(url, { method: 'PATCH',
    body: JSON.stringify({ fields: { status: { stringValue: status }, timeline: { arrayValue: { values: [...tl, entry] } } } }) });
  return r && r.ok ? 'ok' : 'failed';
}

// One document per inbound message; the id makes a retried delivery a no-op (409).
export const replyDocId = (ref, mid) => ref + '_' + createHash('sha256').update(mid).digest('hex').slice(0, 16);
async function storeReply(ref, mid, m) {
  const fields = { ref: { stringValue: ref }, from: { stringValue: m.from }, date: { stringValue: m.date },
    text: { stringValue: m.text || '' }, attachments: { integerValue: String(m.attachments) }, createdAt: { stringValue: new Date().toISOString() } };
  const r = await fsAdmin(`${FS}/replies?documentId=${encodeURIComponent(replyDocId(ref, mid))}`, { method: 'POST', body: JSON.stringify({ fields }) });
  return !!r && (r.ok || r.status === 409);
}

// The notice only: the reply itself is read on the site after an e-mail code.
export function noticeEmail(c) {
  const link = 'https://www.complaintca.ca/?reply=' + encodeURIComponent(c.ref);
  const T = {
    en: { s: 'You have a reply — ' + c.ref, b: 'The institution replied to your complaint ' + c.ref + (c.title ? ' ("' + c.title + '")' : '') + '.\n\nFor your privacy the reply is not included in this e-mail. Open it securely here — we will send a short code to this address to confirm it is you:\n' },
    fr: { s: 'Vous avez une réponse — ' + c.ref, b: 'L\'organisme a répondu à votre plainte ' + c.ref + (c.title ? ' (« ' + c.title + ' »)' : '') + '.\n\nPour protéger votre vie privée, la réponse n\'est pas incluse dans ce courriel. Consultez-la en toute sécurité ici — nous enverrons un court code à cette adresse pour confirmer votre identité :\n' },
    tr: { s: 'Yanıt geldi — ' + c.ref, b: 'Kurum ' + c.ref + (c.title ? ' ("' + c.title + '")' : '') + ' numaralı şikâyetinize yanıt verdi.\n\nGizliliğiniz için yanıt bu e-postada yer almıyor. Güvenle buradan okuyun — siz olduğunuzu doğrulamak için bu adrese kısa bir kod göndereceğiz:\n' },
  }[c.lang === 'fr' ? 'fr' : c.lang === 'tr' ? 'tr' : 'en'];
  const all = { en: '\n\nAll your complaints: ', fr: '\n\nToutes vos plaintes : ', tr: '\n\nTüm şikâyetleriniz: ' }[c.lang === 'fr' ? 'fr' : c.lang === 'tr' ? 'tr' : 'en'];
  return { subject: (c.test ? '[TEST] ' : '') + T.s, body: T.b + link + all + 'https://www.complaintca.ca/account' };
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
    const doc = await findByRef(ref);
    if (!doc) return res.status(200).json({ ok: true, matched: false, reason: 'not_found', ref });
    const f = doc.fields || {};
    const c = { ref, title: sv(f.title), email: sv(f.email), name: sv(f.name), lang: sv(f.lang), test: !!(f.test && f.test.booleanValue) };
    const from = emailOf(b.from);
    // Never loop our own mail or the complainant's own writing back to them.
    if (!from || from === c.email.toLowerCase() || /(^|[@.])complaintcaca@|brevosend\.com$/.test(from)) return res.status(200).json({ ok: true, matched: true, ref, skipped: 'own_mail' });
    if (hasMid(doc, mid)) return res.status(200).json({ ok: true, matched: true, ref, skipped: 'duplicate' });
    const m = { from: String(b.from || '').slice(0, 200), date: String(b.date || new Date().toISOString()).slice(0, 40), text: cleanReply(b.text), attachments: Number.isInteger(b.attachments) ? b.attachments : 0 };
    // Keep the reply, then e-mail the notice, then stamp the timeline: a failure answers 502 and the script retries.
    if (!(await storeReply(ref, mid, m))) return res.status(502).json({ error: 'store_failed', ref });
    const mail = noticeEmail(c);
    const notified = await sendMail(c.email, c.name, mail.subject, mail.body);
    if (!notified) return res.status(502).json({ error: 'email_failed', ref });
    const status = await markReplied(doc, mid);
    return res.status(200).json({ ok: true, matched: true, ref, status, notified });
  } catch (err) {
    return res.status(500).json({ error: 'server', message: err.message });
  }
}
