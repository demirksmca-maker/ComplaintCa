// Served at /api/reply-view through api/complaint.js (vercel.json rewrite; Hobby allows 12 functions).
// GET → { admin } health check.
// POST { ref, email, pass } → the institution replies to that complaint, once the caller has
// proved the e-mail it was filed with (pass = the 30-day mail pass from /api/email-code).
import { isRateLimited } from './_rateLimit.js';
import { mailSecret, checkPass } from './_mailcode.js';
import { FS, fsAdmin, findByRef, accessToken } from './_gauth.js';

export const REF_RE = /^(VC|CY)-\d{4}-[A-Z0-9]{6}$/;
const sv = f => (f && (f.stringValue ?? '')) || '';

async function repliesFor(ref) {
  const body = { structuredQuery: { from: [{ collectionId: 'replies' }], limit: 50,
    where: { fieldFilter: { field: { fieldPath: 'ref' }, op: 'EQUAL', value: { stringValue: ref } } } } };
  const r = await fsAdmin(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  if (!r || !r.ok) return null;
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    return { from: sv(f.from), date: sv(f.date), text: sv(f.text), attachments: Number((f.attachments && f.attachments.integerValue) || 0), at: sv(f.createdAt) };
  }).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export default async function handler(req, res) {
  // GET = health check for the uptime workflow: can the server reach Firestore as the service account?
  if (req.method === 'GET') { let admin = false; try { admin = !!(await accessToken()); } catch {} return res.status(admin ? 200 : 503).json({ admin }); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const b = req.body || {};
  const ref = String(b.ref || '').trim().toUpperCase();
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  if (!REF_RE.test(ref) || !email) return res.status(400).json({ error: 'invalid' });
  try {
    if (await isRateLimited(ip, { limit: 20, windowMs: 15 * 60 * 1000, bucket: 'replyview' })) return res.status(429).json({ error: 'cooldown' });
    const sec = mailSecret();
    if (!sec || !checkPass(sec, email, b.pass)) return res.status(403).json({ error: 'email_unverified' });
    const doc = await findByRef(ref);
    // Same answer for "no such complaint" and "not your complaint": nothing to learn by guessing refs.
    if (!doc || sv((doc.fields || {}).email).toLowerCase() !== email) return res.status(404).json({ error: 'not_found' });
    const replies = await repliesFor(ref);
    if (!replies) return res.status(502).json({ error: 'unavailable' });
    const f = doc.fields || {};
    return res.status(200).json({ ref, title: sv(f.title), status: sv(f.status), replies });
  } catch {
    return res.status(500).json({ error: 'server' });
  }
}
