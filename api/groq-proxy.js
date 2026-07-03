export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY missing' });
  }

  const { messages, max_tokens, model } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: 'messages is required' });
  }

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        max_tokens: max_tokens || 500,
        messages: messages
      })
    });

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      return res.status(resp.status || 502).json({ error: 'Non-JSON response', status: resp.status, raw: raw.slice(0, 500) });
    }

    if (!resp.ok || data.error) {
      return res.status(resp.status || 502).json({ error: (data.error && data.error.message) || 'Groq API error' });
    }

    const outText = (data.choices && data.choices[0])
      ? data.choices[0].message.content
      : '';

    return res.status(200).json({ content: [{ type: 'text', text: outText }] });
  } catch (e) {
    return res.status(500).json({ error: 'Function crashed: ' + (e && e.message ? e.message : String(e)) });
  }
}
