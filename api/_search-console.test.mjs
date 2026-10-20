import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSite, windows } from './_search-console.js';

test('pickSite prefers the domain property, skips unverified', () => {
  assert.equal(pickSite([{ siteUrl: 'https://www.complaintca.ca/', permissionLevel: 'siteFullUser' }, { siteUrl: 'sc-domain:complaintca.ca', permissionLevel: 'siteRestrictedUser' }]), 'sc-domain:complaintca.ca');
  assert.equal(pickSite([{ siteUrl: 'sc-domain:complaintca.ca', permissionLevel: 'siteUnverifiedUser' }, { siteUrl: 'https://www.complaintca.ca/', permissionLevel: 'siteRestrictedUser' }]), 'https://www.complaintca.ca/');
  assert.equal(pickSite([]), null);
});

test('windows are two back-to-back 28-day ranges ending 2 days ago', () => {
  const w = windows(Date.parse('2026-10-20T12:00:00Z'));
  assert.deepEqual(w.cur, ['2026-09-21', '2026-10-18']);
  assert.deepEqual(w.prev, ['2026-08-24', '2026-09-20']);
});
