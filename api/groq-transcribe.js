const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const WINDOW_MS = 60000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > WINDOW_MS) {
    record.count = 0;
    record.start = now;
  }
  record.count++;
  rateLimitMap.set(ip, record);
  return record.count > RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Çok fazla istek, biraz bekle.' });
    }
    const { audio, mimeType } = req.body || {};
    if (!audio) {
      return res.status(400).json({ error: 'Missing audio' });
    }
    const buffer = Buffer.from(audio, 'base64');
    if (buffer.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: 'Audio too large' });
    }

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType || 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'verbose_json');
    // No `language` field on purpose — lets Whisper auto-detect the spoken language.

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: form
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
