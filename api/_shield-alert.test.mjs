import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendShieldAlert } from './_shield-alert.js';

const report = { summary: 's', bans: [{ ip: '1.2.3.4', hours: 2, reason: 'r' }], lockdownHours: 0 };

test('no mail without address/Brevo or when nothing happened', async () => {
  delete process.env.SHIELD_ALERT_TO;
  assert.equal(await sendShieldAlert(report, async () => ['OK']), false);
  process.env.SHIELD_ALERT_TO = 'owner@example.com';
  process.env.BREVO_API_KEY = 'k';
  assert.equal(await sendShieldAlert({ ...report, bans: [] }, async () => ['OK']), false);
});

test('one mail an hour', async () => {
  const realFetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async () => { sent++; return { ok: true }; };
  try {
    assert.equal(await sendShieldAlert(report, async () => ['OK']), true);
    assert.equal(await sendShieldAlert(report, async () => [null]), false);
    assert.equal(sent, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SHIELD_ALERT_TO;
    delete process.env.BREVO_API_KEY;
  }
});
