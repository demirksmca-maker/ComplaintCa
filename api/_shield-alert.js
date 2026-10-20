// E-mail alert to the site owner (SHIELD_ALERT_TO) when the AI shield agent
// bans IPs or turns on lockdown. At most one mail an hour; quietly does
// nothing when Brevo or the address is not configured.
import { SENDER, buildBrandedHtml } from './send-email.js';

export async function sendShieldAlert(report, redis) {
  const to = process.env.SHIELD_ALERT_TO;
  if (!to || !process.env.BREVO_API_KEY) return false;
  if (!report.bans.length && !report.lockdownHours) return false;
  const [gate] = await redis([['SET', 'shield:alert:gate', '1', 'NX', 'EX', 3600]]);
  if (gate !== 'OK') return false;
  const lines = [
    report.summary,
    '',
    ...(report.lockdownHours ? [`Acil kilit ${report.lockdownHours} saatliğine açıldı.`] : []),
    ...report.bans.map(b => `Ban: ${b.ip} · ${b.hours} saat · ${b.reason}`),
    '',
    'Panel: https://www.complaintca.ca/shield.html'
  ];
  const body = lines.join('\n');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to }],
      subject: report.lockdownHours ? '🛡️ Kalkan: acil kilit açıldı' : '🛡️ Kalkan: saldırgan banlandı',
      htmlContent: buildBrandedHtml(body),
      textContent: body
    })
  });
  return r.ok;
}
