// POST /api/classify {desc} → the AI's category and risk level for a complaint,
// decided exactly like the live form (see _classify.js). The new complaint
// panels call this after "What happened?" and let the result drive the flow.
import { isRateLimited } from './_rateLimit.js';
import { classify } from './_classify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  try {
    if (await isRateLimited(ip, { limit: 20, windowMs: 5 * 60 * 1000, bucket: 'classify' })) return res.status(429).json({ error: 'cooldown' });
    const desc = typeof req.body?.desc === 'string' ? req.body.desc.trim().slice(0, 5000) : '';
    if (desc.length < 3) return res.status(400).json({ error: 'invalid' });
    const result = await classify(desc);
    if (!result) return res.status(503).json({ error: 'unavailable' });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
}
