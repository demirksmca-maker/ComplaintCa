// New complaint engine: one server-side door for filing a complaint.
// Does what doSubmit() does in the browser today — validation, anti-bot,
// rate limit, reference number, Firestore record, confirmation email and the
// institution email — but on the server, so it can't be skipped or forged.
//
// SAFETY: test mode is the default. A complaint is "live" (institution gets
// emailed, record not marked test) only when BOTH the request sends
// test:false AND the env var COMPLAINT_LIVE=1 is set. Until then every filing
// is stored with test:true and only the complainant's own confirmation email
// is sent (subject prefixed [TEST]).
import { isRateLimited } from './_rateLimit.js';
import { SENDER, buildBrandedHtml } from './send-email.js';
import {
  validate, genRef, buildRecord, getAuthorities, getChain, confirmationEmail,
  institutionEmail, adminEmail, publicAuthority, toFirestore, categoryPrompt, isValidCategory, PRIORITIES
} from './_complaint-core.js';
import { _isMail } from './_engine-data.js';

const FIREBASE_PROJECT = 'ajan-d6070';
// Public web API key (already shipped in index.html). Writes still pass through
// firestore.rules (isValidNewComplaint), exactly like the browser's writes.
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDtK_bODD77BICh9O1DfhPMf2ENOcwWx8g';

async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET_KEY) return true; // same fail-open as api/verify-turnstile.js until configured
  if (!token) return false;
  const params = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
  if (ip && ip !== 'unknown') params.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    });
    return !!(await r.json()).success;
  } catch { return false; }
}

async function classify(desc) {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0, max_tokens: 80,
        messages: [{ role: 'system', content: categoryPrompt() }, { role: 'user', content: '<complaint>\n' + desc + '\n</complaint>' }] }),
    });
    const d = await r.json();
    const m = (d.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    return {
      category: isValidCategory(p.category) && !(typeof p.confidence === 'number' && p.confidence < 0.55) ? p.category : 'other',
      priority: PRIORITIES.includes(p.priority) ? p.priority : 'medium',
    };
  } catch { return null; }
}

async function saveToFirestore(record) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/complaints?key=${FIREBASE_API_KEY}`;
  const body = JSON.stringify({ fields: toFirestore(record).mapValue.fields });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (r.ok) return true;
      if (r.status < 500) return false; // rule rejection — retrying won't help
    } catch {}
    if (attempt < 3) await new Promise(res => setTimeout(res, 600 * attempt));
  }
  return false;
}

async function sendEmail(toEmail, toName, subject, body, replyTo) {
  if (!process.env.BREVO_API_KEY) return false;
  const payload = { sender: SENDER, to: [{ email: toEmail, name: toName || undefined }], subject, htmlContent: buildBrandedHtml(body), textContent: body };
  if (replyTo) payload.replyTo = { email: replyTo };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  try {
    if (await isRateLimited(ip, { limit: 3, windowMs: 5 * 60 * 1000, bucket: 'complaint' })) {
      return res.status(429).json({ error: 'cooldown' });
    }
    const body = req.body || {};
    const { ok, errors, input } = validate(body);
    if (!ok) return res.status(400).json({ error: 'invalid', fields: errors });
    if (!(await verifyTurnstile(body.turnstileToken, ip))) return res.status(403).json({ error: 'verification' });

    if (!input.category || !input.priority) {
      const ai = await classify(input.desc);
      input.category = input.category || ai?.category || 'other';
      input.priority = input.priority || ai?.priority || 'medium';
      if (input.priority === 'high' && !input.name) return res.status(400).json({ error: 'invalid', fields: ['name'], priority: 'high' });
      if (input.priority === 'high') input.anonymous = false;
    }

    const live = body.test === false && process.env.COMPLAINT_LIVE === '1';
    const record = buildRecord(input, { ref: genRef(), test: !live });
    const saved = await saveToFirestore(record);
    if (!saved) return res.status(502).json({ error: 'save_failed' });

    const conf = confirmationEmail(record);
    const confirmationSent = await sendEmail(record.email, record.name || '', conf.subject, conf.body);

    const auths = getAuthorities(record.category, record.location, record.targetAddress) || [];
    const top = auths[0];
    let institution = { status: 'none' };
    let instSent = false;
    if (top && _isMail(top.email)) {
      const m = institutionEmail(record, top.name, input.emailDraft);
      if (live) {
        instSent = await sendEmail(top.email, top.name, m.subject, m.body, m.replyTo);
        institution = { status: instSent ? 'sent' : 'failed', name: top.name };
        // Same fallback as the live form: the user can send it from their own mail app.
        if (!instSent) institution.fallback = { to: top.email, subject: m.subject, body: m.body };
      } else {
        // Test mode: show exactly what would have been sent, send nothing.
        institution = { status: 'test_skipped', name: top.name, preview: { to: top.email, subject: m.subject, body: m.body, replyTo: m.replyTo } };
      }
    } else if (top) {
      institution = { status: 'form_only', name: top.name };
    }

    // Admin heads-up for high-priority complaints (live only, like the institution email).
    let admin = 'none';
    if (record.priority === 'high') {
      if (live) {
        const a = adminEmail(record, top, instSent);
        admin = (await sendEmail(SENDER.email, 'ComplaintCA Admin', a.subject, a.body)) ? 'sent' : 'failed';
      } else admin = 'test_skipped';
    }

    return res.status(200).json({
      ref: record.ref, test: record.test, category: record.category, priority: record.priority,
      confirmationSent, institution, admin,
      authorities: auths.slice(0, 3).map(publicAuthority),
      chain: getChain(record.category, record.target, record.location, record.targetAddress),
    });
  } catch (err) {
    return res.status(500).json({ error: 'server', message: err.message });
  }
}
