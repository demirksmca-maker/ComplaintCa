export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
  }

  const { system, messages, max_tokens } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: 'messages is required' });
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

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      return res.status(resp.status || 502).json({ error: 'Non-JSON response', status: resp.status, raw: raw.slice(0, 500) });
    }

    return res.status(resp.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Function crashed: ' + (e && e.message ? e.message : String(e)) });
  }
}
