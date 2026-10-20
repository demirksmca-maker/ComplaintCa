// AI shield agent — run by .github/workflows/shield-agent.yml every 10 min.
//
// Reads the newest events the edge shield (middleware.js) wrote to the
// Upstash list `shield:events`, asks Claude whether any IP is running an
// attack the rules alone did not stop (slow scans, many suspect hits,
// rotating paths), and bans those IPs in the same `shield:ban:<ip>` keys
// middleware.js already checks on every request. Nothing is deleted;
// a ban simply expires (max 24 h).
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync } from 'node:fs';

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_BAN_HOURS = 24;
const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;

function report(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}

async function redis(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return res.json();
}

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    bans: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ip: { type: 'string' },
          hours: { type: 'integer' },
          reason: { type: 'string' }
        },
        required: ['ip', 'hours', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['summary', 'bans'],
  additionalProperties: false
};

const SYSTEM = `You are the security analyst for complaintca.ca, a public complaint-filing site (Canada, plus a Spanish site under /es/).
An edge filter logs events as JSON lines. "agent" is why it logged: probe/inject/scanner were already blocked and the IP already banned for 1 hour; flood means an IP passed 120 API calls in a minute; suspect-rate means 40+ API calls in a minute (not blocked); suspect-noua means an API call with no User-Agent (not blocked).
Decide which IPs need a longer or new ban (1-${MAX_BAN_HOURS} hours). Ban only on clear evidence of attack or abuse: repeated blocked attempts, sustained floods, or many suspect events from one IP. A single suspect event is not enough. Never ban search engine crawlers (Googlebot, Bingbot and similar) or uptime checkers. Normal visitors filing one complaint must never be banned.
Write the summary in Turkish, at most 3 short sentences, for a non-technical site owner. If nothing needs doing, return an empty bans list and say the site looks quiet.`;

async function main() {
  if (!URL_ || !TOKEN || !process.env.ANTHROPIC_API_KEY) {
    report('Shield agent: Upstash or ANTHROPIC_API_KEY secret missing, skipped.');
    return;
  }
  const [{ result: raw }, { result: lastRaw }] = await redis([['LRANGE', 'shield:events', 0, 499], ['GET', 'shield:agent:last']]);
  const last = Number(lastRaw) || 0;
  const events = (raw || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } })
    .filter(e => e && e.t > last);
  if (!events.length) {
    report('Shield agent: no new events.');
    return;
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `New events (${events.length}), oldest last:\n` + events.map(e => JSON.stringify(e)).join('\n') }]
  });
  if (response.stop_reason === 'refusal') {
    report('Shield agent: model declined this batch, no action taken.');
    return;
  }
  const text = response.content.find(b => b.type === 'text');
  const verdict = JSON.parse(text.text);

  const bans = verdict.bans.filter(b => IP_RE.test(b.ip) && events.some(e => e.ip === b.ip));
  const cmds = bans.map(b => ['SET', `shield:ban:${b.ip}`, 'ai', 'EX', Math.min(Math.max(b.hours, 1), MAX_BAN_HOURS) * 3600]);
  cmds.push(['SET', 'shield:agent:last', String(Math.max(...events.map(e => e.t)))]);
  // Shown as a notification on /shield.html.
  cmds.push(['LPUSH', 'shield:reports', JSON.stringify({ t: Date.now(), events: events.length, summary: verdict.summary, bans })], ['LTRIM', 'shield:reports', 0, 199]);
  if (!DRY_RUN) await redis(cmds);

  report(`### Shield agent${DRY_RUN ? ' (dry run)' : ''}\n${verdict.summary}`);
  for (const b of bans) report(`- ban ${b.ip} ${b.hours}h: ${b.reason}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
