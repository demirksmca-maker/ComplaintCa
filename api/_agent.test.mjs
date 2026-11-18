import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentApi, oidcClaims, bootScript, NAME_RE } from './_agent.js';

const jwt = c => 'x.' + Buffer.from(JSON.stringify(c)).toString('base64url') + '.y';
function res() {
  return { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test('OIDC claims give team and project', () => {
  assert.deepEqual(oidcClaims(jwt({ owner_id: 'team_1', project_id: 'prj_1' })), { teamId: 'team_1', projectId: 'prj_1' });
  assert.equal(oidcClaims('garbage'), null);
  assert.equal(oidcClaims(jwt({ owner_id: 'team_1' })), null);
});

test('boot script installs only when Chromium is missing and runs the server', () => {
  const s = bootScript();
  assert.match(s, /\[ -d node_modules\/@sparticuz\/chromium \] \|\|/);
  assert.match(s, /exec node cloud-agent\/server\.mjs$/);
  assert.ok(NAME_RE.test('dias-ajan-0a1b2c3d') && !NAME_RE.test('dias-ajan-../x'));
});

test('owner key required; no OIDC means 503', async () => {
  process.env.SHIELD_KEY = 'secret-key';
  let r = res();
  await agentApi({ method: 'POST', headers: { 'x-shield-key': 'nope' }, body: { op: 'start' }, socket: {} }, r);
  assert.equal(r.code, 403);
  r = res();
  delete process.env.VERCEL_OIDC_TOKEN;
  await agentApi({ method: 'POST', headers: { 'x-shield-key': 'secret-key' }, body: { op: 'start' }, socket: {} }, r);
  assert.equal(r.code, 503);
  r = res();
  await agentApi({ method: 'POST', headers: { 'x-shield-key': 'secret-key', 'x-vercel-oidc-token': jwt({ owner_id: 't', project_id: 'p' }) }, body: { op: 'stop', id: '../../x' }, socket: {} }, r);
  assert.equal(r.code, 400);
  delete process.env.SHIELD_KEY;
});

test('only a missing snapshot earns a clean retry', async () => {
  const { snapshotGone } = await import('./_agent.js');
  assert.ok(snapshotGone({ status: 404, message: 'sandbox 404:' }));
  assert.ok(snapshotGone({ status: 400, message: 'sandbox 400: snapshot not found' }));
  assert.ok(!snapshotGone({ status: 429, message: 'sandbox 429: rate limited' }));
  assert.ok(!snapshotGone({ status: 500, message: 'sandbox 500:' }));
});
