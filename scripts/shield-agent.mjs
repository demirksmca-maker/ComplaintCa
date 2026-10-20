// AI shield agent — run by .github/workflows/shield-agent.yml every 10 min.
//
// Fetches the newest events the edge shield (middleware.js) logged, asks
// Claude whether any IP is running an attack the rules alone did not stop
// (slow scans, many suspect hits, rotating paths), and sends the verdict back
// so the site bans those IPs (max 24 h) and shows a report on /shield.html.
// The site is reached through /api/shield-agent with a GitHub OIDC token, so
// the only secret this needs is ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://www.complaintca.ca';
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_BAN_HOURS = 24;

function report(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}

async function githubToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tok = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tok) throw new Error('no OIDC token (workflow needs permissions: id-token: write)');
  const r = await fetch(`${url}&audience=complaintca-shield`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`OIDC ${r.status}`);
  return (await r.json()).value;
}

async function site(method, token, body) {
  const r = await fetch(`${SITE}/api/shield-agent`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`site ${method} ${r.status}: ${await r.text()}`);
  return r.json();
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
  if (!process.env.ANTHROPIC_API_KEY) {
    report('Shield agent: ANTHROPIC_API_KEY secret missing, skipped.');
    return;
  }
  const token = await githubToken();
  const { events } = await site('GET', token);
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

  const saved = await site('POST', token, {
    bans: verdict.bans, summary: verdict.summary, events: events.length,
    last: Math.max(...events.map(e => e.t)), dryRun: DRY_RUN
  });
  report(`### Shield agent${DRY_RUN ? ' (dry run)' : ''}\n${saved.report.summary}`);
  for (const b of saved.report.bans) report(`- ban ${b.ip} ${b.hours}h: ${b.reason}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
