// Asks the site to e-mail the owner the weekly shield summary. Run by
// .github/workflows/shield-weekly.yml; authenticates with a GitHub OIDC
// token like the other agents, so it needs no secret.
const SITE = process.env.SITE_URL || 'https://www.complaintca.ca';

const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: tok } = process.env;
if (!url || !tok) throw new Error('no OIDC token (workflow needs permissions: id-token: write)');
const t = await fetch(`${url}&audience=complaintca-shield`, { headers: { Authorization: `Bearer ${tok}` } });
if (!t.ok) throw new Error(`OIDC ${t.status}`);
const r = await fetch(`${SITE}/api/shield-agent`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${(await t.json()).value}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ weekly: true, keyExpires: process.env.CLAUDE_KEY_EXPIRES })
});
const out = await r.text();
console.log(`weekly summary: ${r.status} ${out}`);
if (!r.ok || !JSON.parse(out).sent) process.exit(1);
