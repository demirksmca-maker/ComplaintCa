// Bu dosya Netlify Functions üzerinde çalışır.
// Brevo API anahtarı burada, sunucu tarafında, Netlify Environment Variables üzerinden okunur.
// Tarayıcıya hiçbir zaman gönderilmez.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server not configured: BREVO_API_KEY missing' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { toEmail, toName, subject, body } = payload;
  if (!toEmail || !subject || !body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'toEmail, subject, body are required' }) };
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: 'ComplaintCA', email: 'kasimdemirca@gmail.com' },
        to: [{ email: toEmail, name: toName || toEmail }],
        subject: subject,
        textContent: body
      })
    });

    return {
      statusCode: resp.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: resp.ok })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
