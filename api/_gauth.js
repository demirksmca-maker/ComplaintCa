// Server-only Google access for Firestore, from the FIREBASE_SERVICE_ACCOUNT env
// (the service-account JSON). Requests made with this token are admin requests:
// they bypass the Firestore security rules, so they must never run on input a
// caller has not been checked for.
import { createSign } from 'node:crypto';

export const PROJECT = 'ajan-d6070';
export const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

let cached = null; // { token, exp }

export function serviceAccount() {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '');
    return sa && sa.client_email && sa.private_key ? sa : null;
  } catch { return null; }
}

const b64url = s => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function accessToken(now = Date.now()) {
  if (cached && cached.exp - 60000 > now) return cached.token;
  const sa = serviceAccount();
  if (!sa) return null;
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = createSign('RSA-SHA256').update(head + '.' + claims).sign(sa.private_key).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claims + '.' + sig
  });
  if (!r.ok) return null;
  const j = await r.json();
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// fetch() against Firestore REST as the service account.
export async function fsAdmin(url, opts = {}) {
  const tok = await accessToken();
  if (!tok) return null;
  return fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: 'Bearer ' + tok } });
}

// The complaint document with this reference, or null.
export async function findByRef(ref) {
  const body = { structuredQuery: { from: [{ collectionId: 'complaints' }], limit: 1,
    where: { fieldFilter: { field: { fieldPath: 'ref' }, op: 'EQUAL', value: { stringValue: ref } } } } };
  const r = await fsAdmin(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  if (!r || !r.ok) return null;
  const rows = await r.json();
  const hit = Array.isArray(rows) && rows.find(x => x.document);
  return hit ? hit.document : null;
}
