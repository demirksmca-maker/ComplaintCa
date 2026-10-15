// Served at /api/my through api/complaint.js (vercel.json rewrite; Hobby allows 12 functions).
// POST { email, pass } → the complaints filed with that e-mail, for the "My account" page.
// pass is the 30-day mail pass from /api/email-code, so only the owner of the inbox gets the list.
import { isRateLimited } from './_rateLimit.js';
import { mailSecret, checkPass } from './_mailcode.js';
import { FS, fsAdmin } from './_gauth.js';

const sv = f => (f && (f.stringValue ?? '')) || '';
const bv = f => !!(f && f.booleanValue);

async function query(collection, field, value, limit = 50) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], limit,
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } };
  const r = await fsAdmin(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  if (!r || !r.ok) return null;
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => x.document.fields || {});
}

// City and province only: a street address never leaves the server.
export function place(loc) {
  const parts = String(loc || '').split(',').map(x => x.trim()).filter(Boolean);
  return parts.filter(x => !/\d/.test(x)).slice(-2).join(', ');
}

// I filed · II sent · III reply · IV closed
export function stepOf(status, timeline) {
  const seen = new Set(timeline.map(t => t.status));
  if (['resolved', 'closed', 'rejected'].includes(status) || seen.has('resolved') || seen.has('closed')) return 3;
  if (seen.has('reply')) return 2;
  if (seen.has('sent') || seen.has('form')) return 1;
  return 0;
}

export function shape(f, replies) {
  const timeline = ((f.timeline && f.timeline.arrayValue && f.timeline.arrayValue.values) || [])
    .map(v => (v.mapValue && v.mapValue.fields) || {}).map(t => ({ status: sv(t.status), date: sv(t.date) }));
  const status = sv(f.status) || 'received';
  return {
    ref: sv(f.ref), title: sv(f.title), category: sv(f.category), date: sv(f.date), status,
    step: stepOf(status, timeline), place: place(sv(f.location)),
    routedTo: sv(f.routedTo), routeStatus: sv(f.routeStatus), test: bv(f.test), legal: bv(f.isLegal),
    replies: replies.map(r => ({ from: sv(r.from), date: sv(r.date), text: sv(r.text), at: sv(r.createdAt) }))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)))
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  if (!email) return res.status(400).json({ error: 'invalid' });
  try {
    if (await isRateLimited(ip, { limit: 30, windowMs: 15 * 60 * 1000, bucket: 'my' })) return res.status(429).json({ error: 'cooldown' });
    const sec = mailSecret();
    if (!sec || !checkPass(sec, email, b.pass)) return res.status(403).json({ error: 'email_unverified' });
    // New records carry emailLower; older ones only the e-mail as typed (usually lower-case already).
    const [a, c] = await Promise.all([query('complaints', 'emailLower', email), query('complaints', 'email', email)]);
    if (!a || !c) return res.status(502).json({ error: 'unavailable' });
    const byRef = new Map();
    for (const f of [...a, ...c]) { const ref = sv(f.ref); if (ref && !byRef.has(ref)) byRef.set(ref, f); }
    const list = await Promise.all([...byRef.values()].map(async f => shape(f, (await query('replies', 'ref', sv(f.ref), 20)) || [])));
    list.sort((x, y) => String(y.date).localeCompare(String(x.date)));
    return res.status(200).json({ email, complaints: list });
  } catch {
    return res.status(500).json({ error: 'server' });
  }
}
