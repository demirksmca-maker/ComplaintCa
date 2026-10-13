// E-mail check for the complaint panel: a 6-digit code goes to the address, and a
// correct code earns a "mail pass" the device keeps for 30 days (no code next time).
// Nothing is stored on the server: the code token and the pass are HMAC-signed.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const PASS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEV_SECRET = 'dev-only-not-for-production';

export function mailSecret() {
  return process.env.MAIL_CODE_SECRET || process.env.REPLY_SECRET || (process.env.VERCEL_ENV === 'production' ? '' : DEV_SECRET);
}
const norm = e => String(e || '').trim().toLowerCase();
const sign = (sec, parts) => createHmac('sha256', sec).update(parts.join('|')).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const split = t => { const m = /^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(String(t || '')); return m ? [Number(m[1]), m[2]] : null; };

export function newCode() { return String(randomInt(0, 1000000)).padStart(6, '0'); }

export function codeToken(sec, email, code, now = Date.now()) {
  const exp = now + CODE_TTL_MS;
  return exp + '.' + sign(sec, ['code', norm(email), code, exp]);
}
export function checkCode(sec, email, code, token, now = Date.now()) {
  const t = split(token);
  if (!sec || !t || t[0] < now || !/^\d{6}$/.test(String(code || ''))) return false;
  return same(t[1], sign(sec, ['code', norm(email), String(code), t[0]]));
}
export function mailPass(sec, email, now = Date.now()) {
  const exp = now + PASS_TTL_MS;
  return exp + '.' + sign(sec, ['pass', norm(email), exp]);
}
export function checkPass(sec, email, pass, now = Date.now()) {
  const t = split(pass);
  if (!sec || !t || t[0] < now) return false;
  return same(t[1], sign(sec, ['pass', norm(email), t[0]]));
}

export function codeEmail(code) {
  return {
    subject: 'Your ComplaintCA code: ' + code,
    body: 'Your verification code is: ' + code + '\n\n'
      + 'Enter it on ComplaintCA to send your complaint. The code works for 15 minutes.\n\n'
      + 'If you did not ask for this code, you can ignore this email — nothing will be sent.',
  };
}
