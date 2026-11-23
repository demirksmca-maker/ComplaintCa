import { isRateLimited } from './_rateLimit.js';

export const MODEL = 'claude-sonnet-5-5';

// Pages still send Sonnet 4.5-era bodies. Sonnet 5.5 rejects temperature/top_p/top_k
// and forced tool_choice (any/tool), so strip those and ask for the tool in the
// system prompt instead. Thinking stays off (between_tools), as on Sonnet 4.5, so
// the pages' small max_tokens budgets still fit the reply. Model is fixed here.
export function toSonnet55(input) {
  const { model, temperature, top_p, top_k, thinking, ...body } = input || {};
  body.model = MODEL;
  body.thinking = { type: 'between_tools' };
  // between_tools is only accepted at effort high or below.
  const eff = body.output_config && body.output_config.effort;
  if (eff === 'xhigh' || eff === 'max') body.output_config = { ...body.output_config, effort: 'high' };
  const tc = body.tool_choice;
  if (tc && (tc.type === 'tool' || tc.type === 'any')) {
    const { name, ...rest } = tc;
    body.tool_choice = { ...rest, type: 'auto' };
    const ask = tc.type === 'tool'
      ? `Always answer by calling the ${name} tool.`
      : 'Always answer by calling one of the tools.';
    body.system = typeof body.system === 'string' && body.system ? body.system + '\n\n' + ask
      : Array.isArray(body.system) ? [...body.system, { type: 'text', text: ask }]
      : ask;
  }
  return body;
}

export const forcedTool = input => {
  const t = input && input.tool_choice && input.tool_choice.type;
  return t === 'tool' || t === 'any';
};
export const hasToolUse = data => Array.isArray(data.content) && data.content.some(b => b.type === 'tool_use');

async function callClaude(body) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (await isRateLimited(ip, { limit: 10, windowMs: 60000, bucket: 'claude-proxy' })) {
      return res.status(429).json({ error: 'Çok fazla istek, biraz bekle.' });
    }
    const body = toSonnet55(req.body);
    let { status, data } = await callClaude(body);
    // tool_choice is now auto, so the tool call is not guaranteed: retry once.
    if (status === 200 && forcedTool(req.body) && data.stop_reason !== 'refusal' && !hasToolUse(data)) {
      ({ status, data } = await callClaude(body));
    }
    // A safety decline is HTTP 200 with little or no content; send it as an error
    // so pages take their normal error path instead of showing a blank answer.
    if (data && data.stop_reason === 'refusal') {
      return res.status(422).json({ error: { type: 'refusal', message: 'AI declined this request.' } });
    }
    // Pages read content[0].text; drop thinking blocks so the first block is the answer.
    if (Array.isArray(data.content)) data.content = data.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
