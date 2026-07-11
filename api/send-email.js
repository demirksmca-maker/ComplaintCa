import { isRateLimited } from './_rateLimit.js';

const SENDER = { name: 'ComplaintCA', email: 'complaintcaca@gmail.com' };

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBrandedHtml(body) {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7ff;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7ff;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:600px;width:100%">
<tr><td style="background:#0f2952;padding:24px 32px">
<span style="font-size:20px;font-weight:bold;color:#ffffff">Complaint<span style="color:#c8102e">CA</span></span>
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c9a84c;margin-top:4px">Canada's Complaint Platform</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:14px;line-height:1.7;color:#1e293b">
${safeBody}
</td></tr>
<tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.6">
Sent via ComplaintCA (complaintca.ca) · Verification: complaintcaca@gmail.com
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (await isRateLimited(ip, { limit: 10, windowMs: 60000, bucket: 'send-email' })) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    const { toEmail, toName, subject, body, replyTo } = req.body || {};
    if (!toEmail || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!process.env.BREVO_API_KEY) {
      return res.status(503).json({ error: 'Email sending is not configured' });
    }

    const payload = {
      sender: SENDER,
      to: [{ email: toEmail, name: toName || undefined }],
      subject,
      htmlContent: buildBrandedHtml(body),
      textContent: body
    };
    if (replyTo) payload.replyTo = { email: replyTo };

    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: errText });
    }
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
