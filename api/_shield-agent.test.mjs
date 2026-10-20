import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { claimsOk, verifyGithubToken, cleanBans, AUDIENCE } from './_shield-agent.js';

const now = Math.floor(Date.now() / 1000);
const good = { iss: 'https://token.actions.githubusercontent.com', aud: AUDIENCE, repository: 'demirksmca-maker/ComplaintCa', ref: 'refs/heads/main', exp: now + 300, nbf: now - 10 };

test('claimsOk accepts only this repo on main, unexpired', () => {
  assert.equal(claimsOk(good), true);
  assert.equal(claimsOk({ ...good, repository: 'evil/ComplaintCa' }), false);
  assert.equal(claimsOk({ ...good, ref: 'refs/heads/feature' }), false);
  assert.equal(claimsOk({ ...good, aud: 'other' }), false);
  assert.equal(claimsOk({ ...good, exp: now - 1 }), false);
  assert.equal(claimsOk(null), false);
});

test('verifyGithubToken checks the RS256 signature against GitHub keys', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
  const fetchMock = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const make = (claims, key = privateKey) => {
    const data = enc({ alg: 'RS256', kid: 'k1' }) + '.' + enc(claims);
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
  };
  assert.equal(await verifyGithubToken(make(good), fetchMock), true);
  assert.equal(await verifyGithubToken(make({ ...good, repository: 'x/y' }), fetchMock), false);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.equal(await verifyGithubToken(make(good, other), fetchMock), false);
  assert.equal(await verifyGithubToken('garbage', fetchMock), false);
});

test('cleanBans keeps only logged IPs and clamps hours', () => {
  const events = [{ ip: '1.2.3.4' }];
  const out = cleanBans([{ ip: '1.2.3.4', hours: 99, reason: 'x' }, { ip: '9.9.9.9', hours: 2 }, { ip: 'not-an-ip', hours: 1 }], events);
  assert.deepEqual(out, [{ ip: '1.2.3.4', hours: 24, reason: 'x' }]);
  assert.deepEqual(cleanBans('nope', events), []);
});
