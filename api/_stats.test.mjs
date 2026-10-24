import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodWindows, sumRange, dailyClicks, countComplaints, gaRanges, readGa, buildSite, gscFilter, gaFilter, PANEL_DAYS, growth, torontoDay } from './_stats.js';

test('periodWindows: back-to-back windows of the same length ending on the last data day', () => {
  assert.deepEqual(periodWindows('2026-10-20', 1), { cur: ['2026-10-20', '2026-10-20'], prev: ['2026-10-19', '2026-10-19'] });
  assert.deepEqual(periodWindows('2026-10-20', 3), { cur: ['2026-10-18', '2026-10-20'], prev: ['2026-10-15', '2026-10-17'] });
  assert.deepEqual(periodWindows('2026-10-20', 7), { cur: ['2026-10-14', '2026-10-20'], prev: ['2026-10-07', '2026-10-13'] });
  assert.deepEqual(periodWindows('2026-03-01', 1).prev, ['2026-02-28', '2026-02-28']);
  assert.deepEqual(PANEL_DAYS, [1, 3, 5, 7, 10, 14, 20, 30, 60, 90]);
});

test('sumRange: totals like Search Console, position weighted by impressions', () => {
  const rows = [
    { day: '2026-10-18', clicks: 2, impressions: 100, position: 10 },
    { day: '2026-10-19', clicks: 3, impressions: 300, position: 6 },
    { day: '2026-10-20', clicks: 5, impressions: 100, position: 2 }
  ];
  const r = sumRange(rows, '2026-10-19', '2026-10-20');
  assert.equal(r.clicks, 8); assert.equal(r.impressions, 400);
  assert.equal(r.ctr, 0.02); assert.equal(r.position, 5); // (6*300 + 2*100) / 400
  assert.deepEqual(sumRange(rows, '2026-01-01', '2026-01-02'), { clicks: 0, impressions: 0, ctr: 0, position: 0 });
  assert.deepEqual(dailyClicks(rows, '2026-10-17', '2026-10-20'), [0, 2, 3, 5]);
  assert.equal(dailyClicks(rows, '2026-07-23', '2026-10-20').length, 30);
});

test('countComplaints: per site by country, inside the window', () => {
  const list = [{ date: '2026-10-20T10:00:00Z' }, { date: '2026-10-20T11:00:00Z', country: 'ES' }, { date: '2026-10-10T01:00:00Z' }, { date: '' }];
  assert.equal(countComplaints(list, 'all', '2026-10-19', '2026-10-20'), 2);
  assert.equal(countComplaints(list, 'ca', '2026-10-19', '2026-10-20'), 1);
  assert.equal(countComplaints(list, 'es', '2026-10-19', '2026-10-20'), 1);
  assert.equal(countComplaints(list, 'ca', '2026-10-01', '2026-10-20'), 2);
});

test('filters: Spanish pages under /es only', () => {
  const re = new RegExp(gscFilter('es').dimensionFilterGroups[0].filters[0].expression);
  for (const u of ['https://www.complaintca.ca/es/', 'https://complaintca.ca/es', 'https://www.complaintca.ca/es/blog/x', 'https://www.complaintca.ca/es?x=1']) assert.ok(re.test(u), u);
  for (const u of ['https://www.complaintca.ca/', 'https://www.complaintca.ca/escalate', 'https://www.complaintca.ca/blog/es/x']) assert.ok(!re.test(u), u);
  assert.equal(gscFilter('ca').dimensionFilterGroups[0].filters[0].operator, 'excludingRegex');
  assert.deepEqual(gscFilter('all'), {});
  assert.ok(gaFilter('ca').dimensionFilter.notExpression);
  const gre = new RegExp(gaFilter('es').dimensionFilter.filter.stringFilter.value);
  assert.ok(gre.test('/es/') && gre.test('/es') && !gre.test('/escalate') && !gre.test('/'));
});

test('GA4: ranges named per period, answer read back as visitors and seconds per user', () => {
  const ranges = gaRanges('2026-10-20', '2026-03-12');
  assert.equal(ranges.length, 21);
  assert.deepEqual(ranges[0], { name: 'c1', startDate: '2026-10-20', endDate: '2026-10-20' });
  assert.deepEqual(ranges[ranges.length - 1], { name: 'since', startDate: '2026-03-12', endDate: '2026-10-20' });
  const ga = readGa([
    { rows: [{ dimensionValues: [{ value: 'c1' }], metricValues: [{ value: '40' }, { value: '4280' }] }, { dimensionValues: [{ value: 'p1' }], metricValues: [{ value: '0' }, { value: '0' }] }] },
    { rows: [{ metricValues: [{ value: '10' }, { value: '95' }] }] }
  ], [{ dateRanges: [{ name: 'c1' }, { name: 'p1' }] }, { dateRanges: [{ name: 'since' }] }]);
  assert.deepEqual(ga, { c1: { visitors: 40, eng: 107 }, p1: { visitors: 0, eng: 0 }, since: { visitors: 10, eng: 10 } });
});

test('buildSite: every period has this and the previous window; no GA → counter visitors, no time', () => {
  const rows = [{ day: '2026-10-19', clicks: 4, impressions: 40, position: 8 }, { day: '2026-10-20', clicks: 6, impressions: 60, position: 4 }];
  const s = buildSite({ end: '2026-10-20', rows, start: '2026-10-19', ga: null, counter: { c1: 9, p1: 7, since: 20 }, complaints: [{ date: '2026-10-20T00:00:00Z' }], site: 'ca', tops: { q1: { key: 'x', clicks: 2 } } });
  assert.equal(s.periods.length, 10);
  const one = s.periods[0];
  assert.deepEqual([one.cur.clicks, one.prev.clicks, one.cur.visitors, one.prev.visitors, one.cur.eng, one.cur.complaints], [6, 4, 9, 7, null, 1]);
  assert.deepEqual(one.query, { key: 'x', clicks: 2 });
  assert.deepEqual([s.since.clicks, s.since.impressions, s.since.visitors], [10, 100, 20]);
  const withGa = buildSite({ end: '2026-10-20', rows, start: null, ga: { c3: { visitors: 5, eng: 70 } }, complaints: [], site: 'all' });
  assert.equal(withGa.since, null);
  assert.deepEqual([withGa.periods[1].cur.visitors, withGa.periods[1].cur.eng, withGa.periods[1].prev.visitors], [5, 70, 0]);
});

test('growth: last 7 days a day against the first 14 days a day', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push({ day: new Date(Date.parse('2026-07-06') + i * 864e5).toISOString().slice(0, 10), clicks: 0, impressions: i < 14 ? 55 : i >= 23 ? 852 : 300, position: 9 });
  assert.equal(growth(rows, '2026-07-06', '2026-08-04'), 15.5); // 852 / 55
  assert.equal(growth(rows, '2026-07-06', '2026-07-20'), null); // under 21 days
  assert.equal(growth([], '2026-07-06', '2026-08-04'), null);
  assert.equal(growth(rows, null, '2026-08-04'), null);
});

test('torontoDay: the day in Toronto, not UTC', () => {
  assert.equal(torontoDay(Date.parse('2026-10-23T06:04:00Z')), '2026-10-23');
  assert.equal(torontoDay(Date.parse('2026-10-23T02:00:00Z')), '2026-10-22');
});
