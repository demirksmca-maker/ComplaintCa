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
      body: JSON.stringify({ error: 'Server not configured: ANTHROPIC_API_KEY missing' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { system, messages, max_tokens } = payload;
  if (!messages) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages is required' }) };
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

    const data = await resp.json();
    if (!resp.ok) {
      const keyHint = apiKey ? ('...' + apiKey.slice(-6)) : 'MISSING';
      const keyLen = apiKey ? apiKey.length : 0;
      data.debug_key_hint = keyHint;
      data.debug_key_length = keyLen;
    }
    return {
      statusCode: resp.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
