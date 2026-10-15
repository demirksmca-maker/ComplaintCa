// Served at /api/my through api/complaint.js (vercel.json rewrite; Hobby allows 12 functions).
// POST { email, pass } → the complaints filed with that e-mail, for the "My account" page.
// pass is the 30-day mail pass from /api/email-code, so only the owner of the inbox gets the list.
// A signed-in site user (Google / Firebase) may send their ID token instead
// (Authorization: Bearer …); its e-mail must be verified.
import { isRateLimited } from './_rateLimit.js';
import { mailSecret, checkPass } from './_mailcode.js';
import { FS, fsAdmin } from './_gauth.js';

const sv = f => (f && (f.stringValue ?? '')) || '';
const bv = f => !!(f && f.booleanValue);

async function query(collection, field, value, limit = 50, withName = false) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], limit,
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } };
  const r = await fsAdmin(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  if (!r || !r.ok) return null;
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter(x => x.document)
    .map(x => (withName ? { name: x.document.name, fields: x.document.fields || {} } : x.document.fields || {}));
}

function backfill(name, email) {
  return fsAdmin(`https://firestore.googleapis.com/v1/${name}?updateMask.fieldPaths=emailLower`, { method: 'PATCH',
    body: JSON.stringify({ fields: { emailLower: { stringValue: email } } }) }).catch(() => {});
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

const WEB_KEY = 'AIzaSyDtK_bODD77BICh9O1DfhPMf2ENOcwWx8g'; // public Firebase web key (also in index.html)

// The verified e-mail behind a Firebase ID token, or ''.
export async function tokenEmail(idToken) {
  if (!idToken) return '';
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    if (!r.ok) return '';
    const u = ((await r.json()).users || [])[0];
    return u && u.email && u.emailVerified ? String(u.email) : '';
  } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const b = req.body || {};
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    if (await isRateLimited(ip, { limit: 30, windowMs: 15 * 60 * 1000, bucket: 'my' })) return res.status(429).json({ error: 'cooldown' });
    const typed = (bearer ? await tokenEmail(bearer) : String(b.email || '')).trim().slice(0, 254);
    const email = typed.toLowerCase();
    if (!email) return res.status(bearer ? 403 : 400).json({ error: bearer ? 'email_unverified' : 'invalid' });
    const sec = mailSecret();
    if (!bearer && (!sec || !checkPass(sec, email, b.pass))) return res.status(403).json({ error: 'email_unverified' });
    // New records carry emailLower; older ones only the e-mail as typed, often with a
    // capital first letter (phone keyboards), so those variants are looked up too.
    const variants = [...new Set([email, typed, email.charAt(0).toUpperCase() + email.slice(1)])];
    const found = await Promise.all([query('complaints', 'emailLower', email, 50, true), ...variants.map(v => query('complaints', 'email', v, 50, true))]);
    if (found.some(x => !x)) return res.status(502).json({ error: 'unavailable' });
    const byRef = new Map();
    const fixes = [];
    for (const { name, fields: f } of found.flat()) {
      const ref = sv(f.ref);
      if (!ref || byRef.has(ref)) continue;
      byRef.set(ref, f);
      if (!sv(f.emailLower)) fixes.push(backfill(name, email)); // so the next sign-in finds it by emailLower
    }
    const list = await Promise.all([...byRef.values()].map(async f => shape(f, (await query('replies', 'ref', sv(f.ref), 20)) || [])));
    await Promise.all(fixes);
    console.log('my: complaints', list.length, 'backfilled', fixes.length);
    list.sort((x, y) => String(y.date).localeCompare(String(x.date)));
    return res.status(200).json({ email, complaints: list });
  } catch (e) {
    console.error('my: failed:', e && e.message);
    return res.status(500).json({ error: 'server' });
  }
}
