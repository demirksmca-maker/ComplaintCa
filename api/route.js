// POST /api/route {category, target, location, targetAddress, targetName, place} → where the
// complaint will go, before sending (live: _refreshAuthBox / showAuthorities).
import { isRateLimited } from './_rateLimit.js';
import { getAuthorities, getChain, publicAuthority, isValidCategory, withSchool } from './_complaint-core.js';

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  try {
    if (await isRateLimited(ip, { limit: 40, windowMs: 5 * 60 * 1000, bucket: 'route' })) return res.status(429).json({ error: 'cooldown' });
    const b = req.body || {};
    const category = isValidCategory(b.category) ? b.category : 'other';
    const location = str(b.location, 200), targetAddress = str(b.targetAddress, 300);
    const target = str(b.target, 40);
    const { auths, school } = withSchool(getAuthorities(category, location, targetAddress) || [],
      { category, target, targetName: str(b.targetName, 200), location, targetAddress, place: str(b.place, 300) });
    return res.status(200).json({
      authorities: auths.slice(0, 3).map(publicAuthority),
      school,
      chain: getChain(category, target, location, targetAddress),
    });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
}
