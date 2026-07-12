import { isRateLimited } from './_rateLimit.js';

// Verifies a Cloudflare Turnstile token server-side before a complaint is
// allowed to submit. Get a real site key + secret key from
// dash.cloudflare.com -> Turnstile (free, no DNS/domain transfer needed):
// set TURNSTILE_SECRET_KEY here, and swap the data-sitekey in index.html's
// two .cf-turnstile widgets from the public test key to your real one.
//
// Without TURNSTILE_SECRET_KEY set, this fails open (returns success) so
// submissions aren't blocked before the key is configured — same pattern
// as api/send-email.js degrading gracefully without BREVO_API_KEY.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (await isRateLimited(ip, { limit: 20, windowMs: 60000, bucket: 'verify-turnstile' })) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: 'Missing token' });
    }

    if (!process.env.TURNSTILE_SECRET_KEY) {
      return res.status(200).json({ success: true, note: 'Turnstile not configured yet — see api/verify-turnstile.js' });
    }

    const params = new URLSearchParams();
    params.append('secret', process.env.TURNSTILE_SECRET_KEY);
    params.append('response', token);
    if (ip && ip !== 'unknown') params.append('remoteip', ip);

    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await r.json();
    res.status(200).json({ success: !!data.success });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
