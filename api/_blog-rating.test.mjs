import { test } from 'node:test';
import assert from 'node:assert/strict';
import { today, validRating, summary, ratingMail } from './_blog-rating.js';

test('today uses Toronto date', () => {
  // 03:00 UTC on Oct 17 is still Oct 16 in Toronto.
  assert.equal(today(new Date('2026-10-17T03:00:00Z')), '2026-10-16');
  assert.equal(today(new Date('2026-10-17T15:00:00Z')), '2026-10-17');
});

test('validRating accepts 1-5 on blog paths only', () => {
  assert.deepEqual(validRating({ rating: 5, path: '/blog/report-a-teacher-canada.html' }), { rating: 5, path: '/blog/report-a-teacher-canada.html' });
  assert.equal(validRating({ rating: 0, path: '/blog/a.html' }), null);
  assert.equal(validRating({ rating: 6, path: '/blog/a.html' }), null);
  assert.equal(validRating({ rating: 4.5, path: '/blog/a.html' }), null);
  assert.equal(validRating({ rating: 4, path: '/index.html' }), null);
  assert.equal(validRating({ rating: 4, path: '/blog/../x.html' }), null);
  assert.equal(validRating(null), null);
});

test('summary averages to one decimal', () => {
  const doc = { fields: { count: { integerValue: '3' }, sum: { integerValue: '13' } } };
  assert.deepEqual(summary(doc, '2026-10-17'), { date: '2026-10-17', count: 3, avg: 4.3 });
  assert.deepEqual(summary(null, '2026-10-17'), { date: '2026-10-17', count: 0, avg: null });
});

test('ratingMail shows stars and page link', () => {
  const m = ratingMail({ rating: 4, path: '/blog/report-a-teacher-canada.html' });
  assert.equal(m.subject, 'New blog rating: 4/5 ★★★★☆');
  assert.match(m.body, /https:\/\/www\.complaintca\.ca\/blog\/report-a-teacher-canada\.html/);
});
