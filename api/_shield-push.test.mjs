import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { vapidKeys, publicKey, vapidAuth, validSub, pushDeploy } from './_shield-push.js';

function fakeRedis() {
  const db = new Map(), h = new Map();
  return async cmds => cmds.map(([op, k, v, ...rest]) => {
    if (op === 'GET') return db.get(k) ?? null;
    if (op === 'SET') { const old = db.get(k) ?? null; if (rest.includes('NX') && db.has(k)) return null; db.set(k, v); return rest.includes('GET') ? old : 'OK'; }
    if (op === 'HKEYS') return [...h.keys()];
    if (op === 'HSET') { h.set(v, rest[0]); return 1; }
    return null;
  });
}

test('VAPID key is made once and signs a valid ES256 JWT', async () => {
  const r = fakeRedis(), a = await vapidKeys(r), b = await vapidKeys(r);
  assert.deepEqual(a, b);
  assert.equal(Buffer.from(publicKey(a), 'base64url').length, 65);
  const m = vapidAuth('https://fcm.googleapis.com/fcm/send/x', a).match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=/);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: a.x, y: a.y }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')));
});

test('only https subscriptions are kept', () => {
  assert.ok(validSub({ endpoint: 'https://push.example/abc' }));
  assert.ok(!validSub({ endpoint: 'http://push.example/abc' }));
  assert.ok(!validSub(null));
});

test('deploy pushes once per commit', async () => {
  const r = fakeRedis(), env = { VERCEL_GIT_COMMIT_SHA: 'abc' };
  assert.deepEqual(await pushDeploy(r, env), { sha: 'abc', sent: 0 }); // no subscriptions yet
  assert.deepEqual(await pushDeploy(r, env), { sha: 'abc', sent: 0 });
  assert.deepEqual(await pushDeploy(r, {}), { sha: '', sent: 0 });
});
