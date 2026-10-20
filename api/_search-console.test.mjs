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
  const w7 = windows(Date.parse('2026-10-20T12:00:00Z'), 7);
  assert.deepEqual(w7.cur, ['2026-10-12', '2026-10-18']);
  assert.deepEqual(w7.prev, ['2026-10-05', '2026-10-11']);
});

test('opportunities keep seen-but-not-top queries with their best page', async () => {
  const { opportunities, movers } = await import('./_search-console.js');
  const rows = [
    { keys: ['cta complaint', 'https://www.complaintca.ca/guides/a.html'], impressions: 300, clicks: 4, position: 8.2 },
    { keys: ['cta complaint', 'https://www.complaintca.ca/'], impressions: 40, clicks: 0, position: 12 },
    { keys: ['top already', 'https://www.complaintca.ca/b'], impressions: 500, clicks: 50, position: 1.5 },
    { keys: ['too rare', 'https://www.complaintca.ca/c'], impressions: 5, clicks: 0, position: 9 }
  ];
  assert.deepEqual(opportunities(rows), [{ query: 'cta complaint', page: '/guides/a.html', impressions: 300, clicks: 4, position: 8.2 }]);
  const m = movers([{ keys: ['https://www.complaintca.ca/a'], clicks: 10 }, { keys: ['https://www.complaintca.ca/b'], clicks: 2 }],
    [{ keys: ['https://www.complaintca.ca/b'], clicks: 7 }, { keys: ['https://www.complaintca.ca/gone'], clicks: 3 }]);
  assert.deepEqual(m.up.map(x => x.key), ['/a']);
  assert.deepEqual(m.down.map(x => [x.key, x.change]), [['/b', -5], ['/gone', -3]]);
});

test('summarizeRecent: last 24 h from hourly rows, since-start from daily rows', async () => {
  const { summarizeRecent, weekOf } = await import('./_search-console.js');
  const now = Date.parse('2026-10-20T18:00:00Z');
  const hours = [
    { keys: ['2026-10-19T10:00:00-07:00'], clicks: 9, impressions: 99 }, // 25 h ago, out
    { keys: ['2026-10-20T01:00:00-07:00'], clicks: 1, impressions: 40 },
    { keys: ['2026-10-20T09:00:00-07:00'], clicks: 2, impressions: 60 }
  ];
  const days = [
    { keys: ['2026-07-02'], clicks: 0, impressions: 3 }, { keys: ['2026-07-01'], clicks: 0, impressions: 0 },
    { keys: ['2026-07-06'], clicks: 1, impressions: 10 }, { keys: ['2026-07-07'], clicks: 2, impressions: 5 }
  ];
  const r = summarizeRecent(hours, days, now);
  assert.equal(r.day.impressions, 100); assert.equal(r.day.clicks, 3); assert.equal(r.day.hours.length, 2);
  assert.equal(r.since.start, '2026-07-02'); assert.equal(r.since.impressions, 18);
  assert.deepEqual(r.since.weeks.map(w => [w.week, w.impressions]), [['2026-06-29', 3], ['2026-07-06', 15]]);
  assert.equal(weekOf('2026-10-20'), '2026-10-19');
  assert.equal(summarizeRecent([], [], now).day, null);
});
