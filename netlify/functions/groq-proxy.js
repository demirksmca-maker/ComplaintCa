// Groq (Llama) proxy fonksiyonu.
// GROQ_API_KEY Netlify Environment Variables uzerinden okunur.
// Cikti, claude-proxy ile ayni formatta doner: { content: [ { text: "..." } ] }
// Boylece index.html tarafinda ayni kod calisir.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'GROQ_API_KEY missing' })
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

  // Claude mesaj formatini Groq (OpenAI uyumlu) formatina cevir.
  // Sadece metin destekleniyor (gorsel Groq ucretsiz katmanda sinirli).
  const groqMessages = [];
  if (system) {
    groqMessages.push({ role: 'system', content: system });
  }
  for (const m of messages) {
    let text = '';
    if (typeof m.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      // Gorsel bloklarini atla, sadece metni al
      text = m.content.map(function (b) {
        return (b && b.type === 'text') ? b.text : '';
      }).join(' ').trim();
    }
    groqMessages.push({ role: m.role, content: text });
  }

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: max_tokens || 500,
        messages: groqMessages
      })
    });

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      return {
        statusCode: resp.status || 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Groq non-JSON response', status: resp.status, raw: raw.slice(0, 500) })
      };
    }

    if (!resp.ok || data.error) {
      return {
        statusCode: resp.status || 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: (data.error && data.error.message) ? data.error.message : 'Groq error', status: resp.status })
      };
    }

    // Groq cevabini Claude formatina cevir.
    const outText = (data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content
      : '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text: outText }] })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Function crashed: ' + (e && e.message ? e.message : String(e)) })
    };
  }
};
