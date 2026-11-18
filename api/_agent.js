// /api/agent (rewritten to /api/route?agent=1): starts and stops the cloud
// Dias Ajan, a Chrome in a Vercel Sandbox that the owner watches live from
// the Dias Claude panel (/dias-claude.html). Owner only: x-shield-key.
//   POST {op:'start'} → { id, url, token }   the panel then talks to url directly
//   POST {op:'stop', id}                     stops that sandbox
// The sandbox API is called with the function's Vercel OIDC token (no stored
// secret). AGENT_SNAPSHOT (optional) is a snapshot with Chromium and its
// libraries installed; without it the sandbox installs them (~1 min).
// Optional AGENT_MAIL_URL / AGENT_MAIL_KEY: the Gmail reader (cloud-agent/gmail.gs).
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keyOk } from './_shield-view.js';
import { isRateLimited } from './_rateLimit.js';

const API = 'https://vercel.com/api';
const LIFE_MS = 40 * 60 * 1000; // Hobby sandboxes stop at 45 minutes
const DIR = '/vercel/sandbox';
const SETUP = 'dnf install -y -q nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr mesa-libgbm pango alsa-lib libXcursor libXi libXtst gtk3 >/dev/null 2>&1; ' +
  'npm i --silent --no-audit --no-fund playwright-core@1.48.2 @sparticuz/chromium@131.0.1 >/dev/null 2>&1';

export function oidcClaims(token) {
  try {
    const c = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return c && c.owner_id && c.project_id ? { teamId: c.owner_id, projectId: c.project_id } : null;
  } catch (e) { return null; }
}

// The command that runs in the sandbox: install if the snapshot lacks
// Chromium, unpack the agent's two files from env, start the server.
export function bootScript() {
  return `cd ${DIR} && ([ -d node_modules/@sparticuz/chromium ] || (${SETUP})) && mkdir -p cloud-agent extension && ` +
    'echo "$AGENT_SERVER" | base64 -d > cloud-agent/server.mjs && echo "$AGENT_CORE" | base64 -d > extension/core.js && ' +
    'exec node cloud-agent/server.mjs';
}

const read = p => readFileSync(join(process.cwd(), p));
export const snapshotGone = e => [404, 410].includes(e && e.status) || /snapshot/i.test(String(e && e.message));
export const NAME_RE = /^dias-ajan-[a-f0-9]{8}$/;

async function vercel(path, token, teamId, opts = {}) {
  const r = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(teamId)}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`sandbox ${r.status}: ${(d.error && (d.error.message || d.error.code)) || ''}`.trim()); e.status = r.status; throw e; }
  return d;
}

export async function agentApi(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.SHIELD_KEY) return res.status(503).json({ error: 'not_configured' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (await isRateLimited(ip, { limit: 10, windowMs: 10 * 60 * 1000, bucket: 'agent' })) return res.status(429).json({ error: 'cooldown' });
  if (!keyOk(req.headers['x-shield-key'], process.env.SHIELD_KEY)) return res.status(403).json({ error: 'forbidden' });

  const oidc = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const claims = oidc && oidcClaims(oidc);
  if (!claims) return res.status(503).json({ error: 'no_oidc' });
  const b = req.body || {};
  try {
    if (b.op === 'stop') {
      if (!NAME_RE.test(String(b.id || ''))) return res.status(400).json({ error: 'id' });
      const d = await vercel(`/v2/sandboxes/${b.id}`, oidc, claims.teamId);
      const sid = d.sandbox && d.sandbox.currentSessionId;
      if (sid) await vercel(`/v2/sandboxes/sessions/${sid}/stop`, oidc, claims.teamId, { method: 'POST' }).catch(() => {});
      return res.status(200).json({ ok: true });
    }
    if (b.op !== 'start') return res.status(400).json({ error: 'op' });

    const name = 'dias-ajan-' + randomBytes(4).toString('hex');
    const token = randomBytes(24).toString('hex');
    let snap = process.env.AGENT_SNAPSHOT;
    const create = source => vercel('/v2/sandboxes', oidc, claims.teamId, {
      method: 'POST',
      body: JSON.stringify({
        projectId: claims.projectId, name, persistent: false, runtime: 'node24', region: 'iad1',
        ports: [3000], timeout: LIFE_MS, resources: { vcpus: 2, memory: 4096 }, ...(source ? { source } : {})
      })
    });
    let created;
    // Snapshots expire (30 days): then start clean and let the boot script install.
    try { created = await create(snap ? { type: 'snapshot', snapshotId: snap } : null); }
    catch (e) {
      // Only a missing/expired snapshot earns a second try; quota or outages do not.
      if (!snap || !snapshotGone(e)) throw e;
      console.error('agent snapshot failed:', e.message); snap = null; created = await create(null);
    }
    const sid = created.session && created.session.id;
    const route = (created.routes || []).find(r => r.port === 3000);
    if (!sid || !route) throw new Error('sandbox: no session');
    await vercel(`/v2/sandboxes/sessions/${sid}/cmd`, oidc, claims.teamId, {
      method: 'POST',
      body: JSON.stringify({
        command: 'bash', args: ['-c', bootScript()], cwd: DIR, sudo: true,
        env: {
          AGENT_TOKEN: token, PORT: '3000',
          AGENT_SERVER: read('cloud-agent/server.mjs').toString('base64'),
          AGENT_CORE: read('extension/core.js').toString('base64'),
          MAIL_URL: process.env.AGENT_MAIL_URL || '', MAIL_KEY: process.env.AGENT_MAIL_KEY || ''
        }
      })
    });
    return res.status(200).json({ id: name, url: route.url, token, ttl: LIFE_MS, expires: Date.now() + LIFE_MS, warm: !!snap });
  } catch (e) {
    console.error('agent error:', e && e.message);
    return res.status(502).json({ error: String(e && e.message || e).slice(0, 200) });
  }
}
