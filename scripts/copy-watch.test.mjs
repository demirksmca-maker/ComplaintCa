import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesForDay, distinctiveSentence, parseCopies } from './copy-watch.mjs';

test('pagesForDay rotates through every page', () => {
  const urls = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(pagesForDay(urls, 0, 2), ['a', 'b']);
  assert.deepEqual(pagesForDay(urls, 2, 2), ['e', 'a']);
});

test('distinctiveSentence picks the longest plain sentence', () => {
  const html = '<nav>Menu item that is long enough to be picked if nav were not removed from the page text.</nav><p>Short one. ' +
    'If your landlord refuses to return the deposit, the provincial tenancy board can order it back to you quickly. ' +
    'It has 2026 numbers in it so it should be skipped even though it is quite long enough here.</p>';
  assert.equal(distinctiveSentence(html), 'If your landlord refuses to return the deposit, the provincial tenancy board can order it back to you quickly.');
  assert.equal(distinctiveSentence('<p>Too short.</p>'), null);
});

test('parseCopies keeps only foreign copies of checked pages', () => {
  const src = 'https://www.complaintca.ca/guides/a.html';
  const text = 'Searched.\n{"copies":[{"url":"https://copycat.example/a","source":"' + src + '"},{"url":"https://www.complaintca.ca/x","source":"' + src + '"},{"url":"https://other.example/b","source":"https://www.complaintca.ca/unchecked"}]}';
  assert.deepEqual(parseCopies(text, [src]), [{ url: 'https://copycat.example/a', source: src }]);
  assert.deepEqual(parseCopies('no json here', [src]), []);
});
