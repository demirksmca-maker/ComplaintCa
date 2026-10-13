// Served at /api/email-code through api/complaint.js (vercel.json rewrite): the Hobby plan allows 12 functions.
// POST { action:'send', email }            → e-mails a 6-digit code, returns { token }
// POST { action:'check', email, code, token } → returns { pass } (30-day mail pass) or 400 { error:'code' }
import { isRateLimited } from './_rateLimit.js';
import { SENDER, buildBrandedHtml } from './send-email.js';
import { mailSecret, newCode, codeToken, checkCode, mailPass, codeEmail } from './_mailcode.js';

const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendMail(to, subject, body) {
  if (!process.env.BREVO_API_KEY) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: SENDER, to: [{ email: to }], subject, htmlContent: buildBrandedHtml(body), textContent: body }),
    });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const body = req.body || {};
  const email = String(body.email || '').trim().slice(0, 254);
  if (!MAIL_RE.test(email)) return res.status(400).json({ error: 'email' });
  const sec = mailSecret();
  if (!sec) return res.status(503).json({ error: 'unavailable' });
  try {
    if (body.action === 'send') {
      if (await isRateLimited(ip, { limit: 5, windowMs: 15 * 60 * 1000, bucket: 'mailcode' })
        || await isRateLimited(email.toLowerCase(), { limit: 3, windowMs: 15 * 60 * 1000, bucket: 'mailcode-to' })) {
        return res.status(429).json({ error: 'cooldown' });
      }
      const code = newCode(), m = codeEmail(code);
      if (!(await sendMail(email, m.subject, m.body))) return res.status(502).json({ error: 'send_failed' });
      return res.status(200).json({ token: codeToken(sec, email, code) });
    }
    if (body.action === 'check') {
      if (await isRateLimited(ip, { limit: 10, windowMs: 15 * 60 * 1000, bucket: 'mailcheck' })) return res.status(429).json({ error: 'cooldown' });
      if (!checkCode(sec, email, String(body.code || '').trim(), body.token)) return res.status(400).json({ error: 'code' });
      return res.status(200).json({ pass: mailPass(sec, email) });
    }
    return res.status(400).json({ error: 'action' });
  } catch {
    return res.status(500).json({ error: 'server' });
  }
}
