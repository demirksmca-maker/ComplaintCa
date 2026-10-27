// Web Push for the Dias Panel (/shield.html): a phone notification on every
// new deploy, even while the app is closed. Pushes carry no payload (the
// service worker shows a fixed text), so only a VAPID signature is needed, no
// encryption. The VAPID key pair is made once and kept in Redis; panels save
// their push subscriptions under shield:push:subs.
// GET /api/shield?deploy=1 (no key; the deploy-ping workflow calls it after
// each push to main) notifies once per new deployment and returns its commit.
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';

const VAPID = 'shield:push:vapid', SUBS = 'shield:push:subs', LAST = 'shield:push:last';
const b64u = buf => Buffer.from(buf).toString('base64url');

export async function vapidKeys(pipeline) {
  const [saved] = await pipeline([['GET', VAPID]]);
  if (saved) return JSON.parse(saved);
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
  // NX: two first calls at once still end up with the same pair.
  await pipeline([['SET', VAPID, JSON.stringify(jwk), 'NX']]);
  return JSON.parse((await pipeline([['GET', VAPID]]))[0]);
}

// Public key as the browser wants it: uncompressed point, base64url.
export const publicKey = jwk => b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));

export function vapidAuth(endpoint, jwk, now = Date.now()) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: 'https://www.complaintca.ca' }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey(jwk)}`;
}

export function validSub(s) {
  try { return !!s && typeof s.endpoint === 'string' && new URL(s.endpoint).protocol === 'https:' && s.endpoint.length < 1000; }
  catch { return false; }
}

export async function saveSub(pipeline, sub) {
  if (!validSub(sub)) return false;
  await pipeline([['HSET', SUBS, sub.endpoint, '1']]);
  return true;
}

// Sends one empty push to every saved subscription; drops the ones the push
// service says are gone (404/410).
export async function pushAll(pipeline) {
  const jwk = await vapidKeys(pipeline);
  const [subs] = await pipeline([['HKEYS', SUBS]]);
  let sent = 0;
  for (const endpoint of subs || []) {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'normal', Authorization: vapidAuth(endpoint, jwk), 'Content-Length': '0' } });
      if (r.status === 404 || r.status === 410) await pipeline([['HDEL', SUBS, endpoint]]);
      else if (r.ok) sent++;
    } catch { /* one dead endpoint must not stop the rest */ }
  }
  return sent;
}

export async function pushDeploy(pipeline, env = process.env) {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.VERCEL_DEPLOYMENT_ID || '';
  if (!sha) return { sha: '', sent: 0 };
  const [fresh] = await pipeline([['SET', LAST, sha, 'GET']]);
  return { sha, sent: fresh === sha ? 0 : await pushAll(pipeline) };
}
