import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyStats, weeklyText } from './_shield-weekly.js';

test('weekly stats add up the week and the text warns about the key', async () => {
  const now = new Date('2026-11-09T14:00:00Z');
  const redis = async cmds => cmds.map(([c, k]) => {
    if (c === 'GET') return k.includes(':ca:') ? '10' : '2';
    if (c === 'PFCOUNT') return k.includes(':ca:') ? 5 : 1;
    if (c === 'HGETALL') return ['google', '3', 'facebook', '1'];
    if (k === 'shield:events') return [JSON.stringify({ t: now - 1000, agent: 'probe' }), JSON.stringify({ t: now - 1000, agent: 'suspect-rate' })];
    return [JSON.stringify({ t: now - 1000, bans: [{ ip: '1.2.3.4' }], copies: [{ url: 'https://c.example', source: 'https://www.complaintca.ca/a' }] })];
  });
  const s = await weeklyStats(redis, now);
  assert.equal(s.ca, 35); assert.equal(s.es, 7); assert.equal(s.views, 84);
  assert.equal(s.sources.google, 21); assert.equal(s.blocked, 1); assert.equal(s.bans, 1); assert.equal(s.copies.length, 1);
  const text = weeklyText(s, '2026-11-19', now);
  assert.match(text, /Ziyaretçi: 42 \(Kanada 35, İspanya 7\)/);
  assert.match(text, /Google 21/);
  assert.match(text, /10 gün sonra/);
  assert.doesNotMatch(weeklyText(s, '2027-01-01', now), /anahtar/);
});
