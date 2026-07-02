// Bu dosya Netlify Functions üzerinde çalışır.
// Anthropic API anahtarı burada, sunucu tarafında, Netlify Environment Variables üzerinden okunur.
// Tarayıcıya hiçbir zaman gönderilmez.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server not configured: ANTHROPIC_API_KEY missing' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  const { system, messages, max_tokens } = payload;
  if (!messages) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'messages is required' })
    };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 500,
        system: system || undefined,
        messages: messages
      })
    });

    // Anthropic'ten gelen ham yaniti once metin olarak al, sonra JSON'a cevirmeyi dene.
    // Boylece JSON olmayan bir hata sayfasi gelse bile fonksiyon cokmez.
    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      return {
        statusCode: resp.status || 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Anthropic returned non-JSON response',
          status: resp.status,
          raw: raw.slice(0, 500)
        })
      };
    }

    return {
      statusCode: resp.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Function crashed: ' + (e && e.message ? e.message : String(e)) })
    };
  }
};
