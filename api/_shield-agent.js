// /api/shield-agent — the bridge between the AI shield agent (GitHub Action,
// scripts/shield-agent.mjs) and the shield's Upstash store, so the Action
// needs no Upstash secret. The Action proves who it is with a GitHub OIDC
// token (short-lived, signed by GitHub, no stored secret): only workflows of
// this repository on main are accepted.
//   GET  → { events, last }       events newer than the last review
//   POST { bans, lockdownHours, summary, events, last, dryRun } → stores
//        bans, optional lockdown and the report, mails the owner
//   POST { copies: [{url, source}] } → copy watch finding (scripts/copy-watch.mjs)
import { createPublicKey, verify } from 'node:crypto';
import { sendShieldAlert } from './_shield-alert.js';

const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'complaintca-shield';
const REPO = 'demirksmca-maker/ComplaintCa';
const MAX_BAN_HOURS = 24;
const MAX_LOCKDOWN_HOURS = 6;
const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;

let jwks = null; // { keys, at }

const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function githubKey(kid, fetchImpl = fetch) {
  if (!jwks || Date.now() - jwks.at > 3600000 || !jwks.keys.some(k => k.kid === kid)) {
    const r = await fetchImpl(`${ISSUER}/.well-known/jwks`);
    if (!r.ok) return null;
    jwks = { keys: (await r.json()).keys || [], at: Date.now() };
  }
  return jwks.keys.find(k => k.kid === kid) || null;
}

// Claims check, split out so it can be tested without a signed token.
export function claimsOk(c, now = Date.now() / 1000) {
  return !!c && c.iss === ISSUER && c.aud === AUDIENCE && c.repository === REPO &&
    c.ref === 'refs/heads/main' && typeof c.exp === 'number' && c.exp > now && (c.nbf || 0) <= now + 60;
}

export async function verifyGithubToken(token, fetchImpl = fetch) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  try {
    const head = b64json(parts[0]);
    if (head.alg !== 'RS256') return false;
    const jwk = await githubKey(head.kid, fetchImpl);
    if (!jwk) return false;
    const ok = verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    return ok && claimsOk(b64json(parts[1]));
  } catch {
    return false;
  }
}

async function redis(commands) {
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const r = await fetch(`${base}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return (await r.json()).map(x => x.result);
}

export function cleanBans(bans, events) {
  const seen = new Set((events || []).map(e => e && e.ip));
  return (Array.isArray(bans) ? bans : []).filter(b => b && IP_RE.test(String(b.ip)) && seen.has(b.ip)).slice(0, 50)
    .map(b => ({ ip: b.ip, hours: Math.min(Math.max(Math.round(Number(b.hours) || 1), 1), MAX_BAN_HOURS), reason: String(b.reason || '').slice(0, 200) }));
}

export function cleanCopies(copies) {
  return (Array.isArray(copies) ? copies : []).filter(c => {
    try {
      return /^https?:$/.test(new URL(c.url).protocol) && new URL(c.source).hostname.endsWith('complaintca.ca');
    } catch { return false; }
  }).slice(0, 20).map(c => ({ url: String(c.url).slice(0, 300), source: String(c.source).slice(0, 300) }));
}

export async function shieldAgent(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)) return res.status(503).json({ error: 'no_upstash' });
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await verifyGithubToken(tok))) return res.status(403).json({ error: 'forbidden' });

  try {
    if (req.method === 'GET') {
      const [raw, lastRaw] = await redis([['LRANGE', 'shield:events', 0, 499], ['GET', 'shield:agent:last']]);
      const last = Number(lastRaw) || 0;
      const events = (raw || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(e => e && e.t > last);
      return res.status(200).json({ events, last });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (Array.isArray(b.copies)) {
      const copies = cleanCopies(b.copies);
      if (!copies.length) return res.status(400).json({ error: 'no_copies' });
      const report = { t: Date.now(), kind: 'copy', summary: `${copies.length} kopya bulundu, orijinaller arama motorlarına yeniden bildirildi.`, copies, bans: [] };
      await redis([['LPUSH', 'shield:reports', JSON.stringify(report)], ['LTRIM', 'shield:reports', 0, 199]]);
      const mailed = await sendShieldAlert(report, redis).catch(() => false);
      return res.status(200).json({ saved: true, mailed, report });
    }
    const [raw] = await redis([['LRANGE', 'shield:events', 0, 499]]);
    const known = (raw || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    const bans = cleanBans(b.bans, known);
    const last = Number(b.last) || 0;
    const lockdownHours = Math.min(Math.max(Math.round(Number(b.lockdownHours) || 0), 0), MAX_LOCKDOWN_HOURS);
    const report = { t: Date.now(), events: Number(b.events) || 0, summary: String(b.summary || '').slice(0, 600), bans, lockdownHours };
    if (b.dryRun) return res.status(200).json({ dryRun: true, report });
    const cmds = bans.map(x => ['SET', `shield:ban:${x.ip}`, 'ai', 'EX', x.hours * 3600]);
    if (lockdownHours) cmds.push(['SET', 'shield:lockdown', 'ai', 'EX', lockdownHours * 3600]);
    if (last) cmds.push(['SET', 'shield:agent:last', String(last)]);
    cmds.push(['LPUSH', 'shield:reports', JSON.stringify(report)], ['LTRIM', 'shield:reports', 0, 199]);
    await redis(cmds);
    const mailed = await sendShieldAlert(report, redis).catch(() => false);
    return res.status(200).json({ saved: true, mailed, report });
  } catch (err) {
    console.error('shield-agent error:', err && err.message);
    return res.status(502).json({ error: 'upstash' });
  }
}
