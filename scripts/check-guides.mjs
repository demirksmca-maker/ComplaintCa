#!/usr/bin/env node
// Static checks for /guides/ — run: node scripts/check-guides.mjs
// Fails (exit 1) on anything that would silently break a guide page.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'guides');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

const guides = readdirSync(dir).filter((f) => f.endsWith('-guide.html')).sort();
const pages = ['index.html', ...guides];
const index = read('guides/index.html');
const sitemap = read('sitemap.xml');

// Categories defined in support-tools.js (top-level keys of CATS).
const tools = read('guides/support-tools.js');
const catsBlock = tools.slice(tools.indexOf('var CATS = {'), tools.indexOf('\n  };', tools.indexOf('var CATS = {')));
const cats = new Set([...catsBlock.matchAll(/^ {4}([a-z_]+): \{/gm)].map((m) => m[1]));
if (!cats.size) fail('guides/support-tools.js', 'could not read CATS');

for (const f of pages) {
  const html = read('guides/' + f);
  const rel = 'guides/' + f;

  // Internal links point at files that exist.
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const target = path.join(root, href);
    if (!existsSync(target) && !existsSync(path.join(target, 'index.html'))) fail(rel, `broken link ${href}`);
  }

  // JSON-LD parses.
  const ld = [];
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { ld.push(JSON.parse(body)); } catch (e) { fail(rel, `invalid JSON-LD: ${e.message}`); }
  }

  if (f === 'index.html') continue;
  const url = `https://www.complaintca.ca/guides/${f}`;

  for (const [, key] of html.matchAll(/data-dc="([^"]*)"/g)) {
    if (!cats.has(key)) fail(rel, `data-dc="${key}" has no entry in support-tools.js`);
  }
  if (!html.includes('href="/guides/guide.css"')) fail(rel, 'missing /guides/guide.css');
  if (!html.includes('src="/guides/guide.js"')) fail(rel, 'missing /guides/guide.js');
  if (!html.includes(`<link rel="canonical" href="${url}">`)) fail(rel, 'canonical does not match file name');
  if (!html.includes('id="info"')) fail(rel, 'missing #info section');
  if (!/href="\/blog\//.test(html)) fail(rel, 'no link to the blog');
  if (!index.includes(`/guides/${f}`)) fail(rel, 'not listed in guides/index.html');
  if (!sitemap.includes(`<loc>${url}</loc>`)) fail(rel, 'not in sitemap.xml');

  // FAQ schema matches the visible FAQ.
  const faq = ld.find((j) => j['@type'] === 'FAQPage');
  if (!faq) { fail(rel, 'missing FAQPage JSON-LD'); continue; }
  const visible = (html.match(/<details class="faq-item">/g) || []).length;
  if (faq.mainEntity.length !== visible) fail(rel, `FAQPage has ${faq.mainEntity.length} questions, page shows ${visible}`);
  if (!ld.some((j) => j['@type'] === 'BreadcrumbList')) fail(rel, 'missing BreadcrumbList JSON-LD');
}

if (errors.length) {
  console.error(`${errors.length} problem(s) in /guides/:\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`guides OK — ${guides.length} guides, ${cats.size} support-tool categories`);
