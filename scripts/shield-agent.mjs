// AI shield agent — run by .github/workflows/shield-agent.yml every 10 min.
//
// Fetches the newest events the edge shield (middleware.js) logged, asks
// Claude whether any IP is running an attack the rules alone did not stop
// (slow scans, many suspect hits, rotating paths), and sends the verdict back
// so the site bans those IPs (max 24 h) and shows a report on /shield.html.
// The site is reached through /api/shield-agent with a GitHub OIDC token, so
// the only secret this needs is ANTHROPIC_API_KEY.
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

export function needsReview(events) {
  const perIp = {};
  for (const e of events) perIp[e.ip] = (perIp[e.ip] || 0) + 1;
  return events.length >= 5 || Object.values(perIp).some(n => n >= 2) ||
    events.some(e => ['flood', 'scrape', 'lockdown'].includes(e.agent));
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
    },
    lockdown_hours: { type: 'integer' }
  },
  required: ['summary', 'bans', 'lockdown_hours'],
  additionalProperties: false
};

const SYSTEM = `You are the security analyst for complaintca.ca, a public complaint-filing site (Canada, plus a Spanish site under /es/).
An edge filter logs events as JSON lines. "agent" is why it logged: probe/inject/scanner were already blocked and the IP already banned for 1 hour; flood means an IP passed 120 API calls in a minute; suspect-rate means 40+ API calls in a minute (not blocked); suspect-noua means an API call with no User-Agent (not blocked).
More agents: trap means an IP opened a hidden honeypot link only bots follow (already banned 6 h); scrape means an IP opened more than 60 pages in a minute (already banned 1 h); lockdown means a request was refused while emergency lockdown was on.
Decide which IPs need a longer or new ban (1-${MAX_BAN_HOURS} hours).
Set lockdown_hours (1-6) only for a large ongoing attack: many different IPs flooding, scraping or probing within the last few minutes, more than bans of single IPs can stop. Lockdown keeps the site open but tightens limits for everyone, so otherwise return 0. Ban only on clear evidence of attack or abuse: repeated blocked attempts, sustained floods, or many suspect events from one IP. A single suspect event is not enough. Never ban search engine crawlers (Googlebot, Bingbot and similar) or uptime checkers. Normal visitors filing one complaint must never be banned.
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

  // Claude is only asked when there is a pattern to judge; single blocked
  // hits are already handled by the edge rules. Otherwise just move on.
  if (!needsReview(events)) {
    await site('POST', token, { quiet: true, last: Math.max(...events.map(e => e.t)), dryRun: DRY_RUN });
    report(`Shield agent: ${events.length} routine event(s), no review needed.`);
    return;
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
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
    bans: verdict.bans, lockdownHours: verdict.lockdown_hours, summary: verdict.summary, events: events.length,
    last: Math.max(...events.map(e => e.t)), dryRun: DRY_RUN
  });
  report(`### Shield agent${DRY_RUN ? ' (dry run)' : ''}\n${saved.report.summary}`);
  for (const b of saved.report.bans) report(`- ban ${b.ip} ${b.hours}h: ${b.reason}`);
  if (saved.report.lockdownHours) report(`- lockdown ${saved.report.lockdownHours}h`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
