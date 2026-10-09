// POST /api/verdict → ASYA Legal Verdict for a complaint (see _verdict.js).
// Body: {title, desc, category, location, targetName, ctype, anonymous, lang}
import { isRateLimited } from './_rateLimit.js';
import { runVerdict } from './_verdict.js';
import { isValidCategory, CTYPES } from './_complaint-core.js';

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  try {
    if (await isRateLimited(ip, { limit: 10, windowMs: 5 * 60 * 1000, bucket: 'verdict' })) return res.status(429).json({ error: 'cooldown' });
    const b = req.body || {};
    const desc = str(b.desc, 5000);
    if (desc.length < 10) return res.status(400).json({ error: 'invalid' }); // live: al_min10
    const v = await runVerdict({
      title: str(b.title, 200), desc, category: isValidCategory(b.category) ? b.category : '',
      location: str(b.location, 200), targetName: str(b.targetName, 200),
      ctype: CTYPES.includes(b.ctype) ? b.ctype : 'notice', anonymous: b.anonymous !== false, lang: b.lang === 'fr' ? 'fr' : 'en',
    });
    if (!v) return res.status(503).json({ error: 'unavailable' });
    return res.status(200).json(v);
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
}
