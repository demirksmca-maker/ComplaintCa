import { createHash } from 'node:crypto';
import { isRateLimited } from './_rateLimit.js';
import { FS, fsAdmin } from './_gauth.js';
import { SENDER, buildBrandedHtml } from './send-email.js';

// GET|POST /api/blog-rating (rewritten to /api/route?blograting=1). Blog article ratings, counted per day (Toronto time) in Firestore
// blogRatings/{YYYY-MM-DD}: count, sum, r1..r5. No personal data is kept.
//   POST { path, rating }  -> adds one rating
//   GET                    -> today's { date, count, avg }
// One counted rating per IP per 30 days. Repeats get a normal 200 but are not counted or mailed,
// so a single visitor cannot rate every day. Only a short hash of the IP is kept, in Redis, and it expires.
const REPEAT_SECONDS = 30 * 24 * 3600;
export const raterKey = ip => 'blograte:seen:' + createHash('sha256').update(String(ip)).digest('hex').slice(0, 20);

// true = this IP already rated in the last 30 days. Without Redis, or if it fails, every rating counts.
async function alreadyRated(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SET', raterKey(ip), '1', 'NX', 'EX', REPEAT_SECONDS]])
    });
    if (!r.ok) return false;
    const d = await r.json();
    return !!(d && d[0] && d[0].result === null);
  } catch { return false; }
}

const PATH_RE = /^\/blog\/[a-z0-9-]{1,120}(\.html)?$/;

export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validRating(body) {
  const rating = Number(body && body.rating);
  const path = body && body.path;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (typeof path !== 'string' || !PATH_RE.test(path)) return null;
  return { rating, path };
}

export function summary(doc, date) {
  const f = (doc && doc.fields) || {};
  const count = Number(f.count && f.count.integerValue) || 0;
  const sum = Number(f.sum && f.sum.integerValue) || 0;
  return { date, count, avg: count ? Math.round(sum / count * 10) / 10 : null };
}

export function ratingMail({ rating, path }) {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  return {
    subject: `New blog rating: ${rating}/5 ${stars}`,
    body: `A reader rated a blog article.\n\nRating: ${rating}/5 ${stars}\nPage: https://www.complaintca.ca${path}`
  };
}

// Tells the owner about each new rating. Never fails the rating itself.
async function notifyOwner(ok) {
  if (!process.env.BREVO_API_KEY) return;
  const { subject, body } = ratingMail(ok);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: SENDER, to: [{ email: SENDER.email }], subject, htmlContent: buildBrandedHtml(body), textContent: body })
    });
  } catch {}
}

export async function blogRating(req, res) {
  const date = today();
  const docName = `${FS.replace('https://firestore.googleapis.com/v1/', '')}/blogRatings/${date}`;

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    const r = await fsAdmin(`${FS}/blogRatings/${date}`);
    if (!r) return res.status(503).json({ error: 'Not configured' });
    if (r.status === 404) return res.status(200).json(summary(null, date));
    if (!r.ok) return res.status(502).json({ error: 'Read failed' });
    return res.status(200).json(summary(await r.json(), date));
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (await isRateLimited(ip, { limit: 5, windowMs: 60000, bucket: 'blog-rating' })) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  const ok = validRating(req.body);
  if (!ok) return res.status(400).json({ error: 'Bad rating' });
  if (await alreadyRated(ip)) return res.status(200).json({ ok: true });

  const inc = n => ({ integerValue: String(n) });
  const body = { writes: [{ transform: { document: docName, fieldTransforms: [
    { fieldPath: 'count', increment: inc(1) },
    { fieldPath: 'sum', increment: inc(ok.rating) },
    { fieldPath: 'r' + ok.rating, increment: inc(1) }
  ] } }] };
  const r = await fsAdmin(`${FS}:commit`, { method: 'POST', body: JSON.stringify(body) });
  if (!r) return res.status(503).json({ error: 'Not configured' });
  if (!r.ok) return res.status(502).json({ error: 'Write failed' });
  await notifyOwner(ok);
  return res.status(200).json({ ok: true });
}
