// Blog theme guard: every Canadian blog post uses the shared theme, has six
// section tiles that point at real sections, and still carries its FAQ schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('./blog/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.html'));

test('blog index uses the shared theme', () => {
  const s = readFileSync(new URL('index.html', dir), 'utf8');
  assert.match(s, /<link rel="stylesheet" href="\/assets\/blog-theme\.css">/);
  assert.doesNotMatch(s, /blog-dark\.css/);
});

for (const f of files.filter((f) => f !== 'index.html')) {
  test(`blog/${f}: theme, tiles and schema`, () => {
    const s = readFileSync(new URL(f, dir), 'utf8');
    assert.match(s, /<link rel="stylesheet" href="\/assets\/blog-theme\.css">/);
    assert.doesNotMatch(s, /<style>/, 'styles belong in /assets/blog-theme.css');
    assert.doesNotMatch(s, /blog-dark\.css/);
    const tiles = [...s.matchAll(/<a class="tile" href="#([^"]+)">/g)].map((m) => m[1]);
    assert.equal(tiles.length, 6, 'six section tiles');
    const ids = new Set([...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const t of tiles) assert.ok(ids.has(t), `tile target #${t} exists`);
    assert.ok(ids.has('sections'), 'back-to-sections target exists');
    const labels = [...s.matchAll(/<span class="lb">([^<]+)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    assert.ok(labels.includes('FAQ'), 'FAQ tile');
    assert.ok(tiles.includes('sources') && labels.includes('Sources'), 'Sources tile');
    for (const l of labels) assert.ok(l.length <= 18, `short one-line label: ${l}`);
    // every H2 in the article is a section heading, except the one inside the Sources box
    const main = s.slice(s.indexOf('<main>'), s.indexOf('</main>'));
    const sections = (main.match(/<section class="sec" id="/g) || []).length;
    assert.equal(sections, (main.match(/<h2\b/g) || []).length - 1, 'each H2 opens a section.sec');
    assert.match(s, /"@type": "FAQPage"/);
    assert.match(s, /<link rel="canonical" href="https:\/\/www\.complaintca\.ca\/blog\//);
  });
}
