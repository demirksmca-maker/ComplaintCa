// POST /api/vision → what ASYA reads in the complaint photos (see _vision.js).
// Body: {images: ["data:image/jpeg;base64,…", …]} (1–3, shrunk by the browser first)
import { isRateLimited } from './_rateLimit.js';
import { parseImages, runVision } from './_vision.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  try {
    if (await isRateLimited(ip, { limit: 8, windowMs: 10 * 60 * 1000, bucket: 'vision' })) return res.status(429).json({ error: 'cooldown' });
    const images = parseImages((req.body || {}).images);
    if (!images) return res.status(400).json({ error: 'invalid' });
    const v = await runVision(images);
    if (!v) return res.status(503).json({ error: 'unavailable' });
    return res.status(200).json(v);
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
}
