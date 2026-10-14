import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify, foundUrls, parseList, normUrl } from './_precedents.js';

const U1 = 'https://www.canlii.org/en/on/onhrt/doc/2021/2021hrto123/2021hrto123.html';
const U2 = 'https://www.canlii.org/en/bc/bccrt/doc/2022/2022bccrt9/2022bccrt9.html';
const FAKE = 'https://www.canlii.org/en/on/onhrt/doc/2020/2020hrto999/2020hrto999.html';

test('only links that came back from the search are kept', () => {
  const found = foundUrls([{ search_results: { results: [{ url: U1 }, { url: U2 + '?q=x' }] } }]);
  const r = verify([
    { title: 'A v B', url: U1, outcome: 'complainant' },
    { title: 'C v D', url: U2, outcome: 'respondent' },
    { title: 'Invented', url: FAKE, outcome: 'complainant' },
    { title: 'Elsewhere', url: 'https://example.com/x', outcome: 'complainant' },
    { title: 'Dup', url: U1, outcome: 'complainant' }
  ], found);
  assert.deepEqual(r.decisions.map(d => d.title), ['A v B', 'C v D']);
  assert.equal(r.wins, 1);
  assert.equal(r.known, 2);
});

test('at most 10 decisions; unknown outcomes are not counted', () => {
  const urls = Array.from({ length: 14 }, (_, i) => `https://www.canlii.org/en/on/onsc/doc/2020/x${i}/x${i}.html`);
  const r = verify(urls.map((url, i) => ({ url, title: 't' + i, outcome: i % 2 ? 'unknown' : 'complainant' })), new Set(urls.map(normUrl)));
  assert.equal(r.decisions.length, 10);
  assert.equal(r.known, 5);
  assert.equal(r.wins, 5);
});

test('parseList reads the JSON array out of surrounding text', () => {
  assert.equal(parseList('Here: [{"url":"x"}] done').length, 1);
  assert.deepEqual(parseList('no json'), []);
});
