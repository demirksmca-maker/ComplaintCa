import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskList, scoreIp, threatLevel } from './_shield-risk.js';

const ev = (agent, extra = {}) => ({ t: 1000, ip: '223.181.81.38', c: 'BE', agent, path: '/trap/', ua: 'curl/8', ...extra });

test('honeypot hit is Kritik and blocked', () => {
  const r = scoreIp([ev('trap')]);
  assert.equal(r.risk_score, 95);
  assert.equal(r.threat_level, 'Kritik');
  assert.equal(r.recommended_action, 'BLOCK');
  assert.deepEqual(Object.keys(r), ['ip_address', 'country', 'risk_score', 'threat_level', 'detected_behavior', 'recommended_action', 'analysis_summary']);
});

test('scraper is rate limited, extra events raise the score up to 100', () => {
  assert.equal(scoreIp([ev('scrape')]).recommended_action, 'RATE_LIMIT');
  assert.equal(scoreIp([ev('scrape')]).threat_level, 'Orta');
  assert.equal(scoreIp(Array(20).fill(ev('trap'))).risk_score, 100);
});

test('good bot is allowed unless it did something hostile', () => {
  const ua = 'Mozilla/5.0 (compatible; GPTBot/1.2)';
  const ok = scoreIp([ev('suspect-rate', { ua })]);
  assert.equal(ok.risk_score, 0);
  assert.equal(ok.recommended_action, 'ALLOW');
  assert.equal(scoreIp([ev('trap', { ua })]).recommended_action, 'BLOCK');
});

test('suspect only is monitored, levels split at 60 and 90', () => {
  assert.equal(scoreIp([ev('suspect-noua')]).recommended_action, 'MONITOR');
  assert.deepEqual([threatLevel(0), threatLevel(60), threatLevel(90)], ['Düşük', 'Orta', 'Kritik']);
});

test('riskList groups by IP, drops old events, sorts by risk', () => {
  const list = riskList([ev('suspect-noua', { ip: '1.1.1.1' }), ev('trap'), ev('probe', { ip: '2.2.2.2', t: 1 })], { since: 500 });
  assert.deepEqual(list.map(r => r.ip_address), ['223.181.81.38', '1.1.1.1']);
});
