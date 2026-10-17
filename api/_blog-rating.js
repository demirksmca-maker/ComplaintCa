import { isRateLimited } from './_rateLimit.js';
import { FS, fsAdmin } from './_gauth.js';

// GET|POST /api/blog-rating (rewritten to /api/route?blograting=1). Blog article ratings, counted per day (Toronto time) in Firestore
// blogRatings/{YYYY-MM-DD}: count, sum, r1..r5. No personal data is kept.
//   POST { path, rating }  -> adds one rating
//   GET                    -> today's { date, count, avg }
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

  const inc = n => ({ integerValue: String(n) });
  const body = { writes: [{ transform: { document: docName, fieldTransforms: [
    { fieldPath: 'count', increment: inc(1) },
    { fieldPath: 'sum', increment: inc(ok.rating) },
    { fieldPath: 'r' + ok.rating, increment: inc(1) }
  ] } }] };
  const r = await fsAdmin(`${FS}:commit`, { method: 'POST', body: JSON.stringify(body) });
  if (!r) return res.status(503).json({ error: 'Not configured' });
  if (!r.ok) return res.status(502).json({ error: 'Write failed' });
  return res.status(200).json({ ok: true });
}
