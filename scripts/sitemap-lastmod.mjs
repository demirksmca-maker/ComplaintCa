#!/usr/bin/env node
// Sets <lastmod> for the /guides/ entries in sitemap.xml to each file's last git commit date,
// and keeps each guide's Article JSON-LD (headline, description, dateModified) in step with it.
//   node scripts/sitemap-lastmod.mjs          rewrite sitemap.xml and the guide pages
//   node scripts/sitemap-lastmod.mjs --check  exit 1 if a lastmod or Article block is out of date
// Needs full git history (actions/checkout with fetch-depth: 0).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sitemapPath = path.join(root, 'sitemap.xml');
const check = process.argv.includes('--check');
const ORIGIN = 'https://www.complaintca.ca';
const today = new Date().toLocaleDateString('en-CA'); // local date, same as git's %cs

function fileFor(loc) {
  const p = loc.slice(ORIGIN.length);
  return path.join(root, p.endsWith('/') ? p + 'index.html' : p);
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const gitDate = (file) => git('log', '-1', '--format=%cs', '--', file);
const isDirty = (file) => git('status', '--porcelain', '--', file) !== '';

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ARTICLE_RE = /<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "Article"[\s\S]*?<\/script>\n/;

// Returns the page with its Article JSON-LD set to `date`; inserted before the first JSON-LD block if missing.
function withArticle(html, loc, date) {
  const title = html.match(/<title>([^<]*)<\/title>/);
  const desc = html.match(/<meta name="description" content="([^"]*)">/);
  if (!title || !desc) return html;
  const org = { '@type': 'Organization', name: 'Complaint CA', url: ORIGIN + '/' };
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: decode(title[1]),
    description: decode(desc[1]),
    url: loc,
    mainEntityOfPage: loc,
    inLanguage: 'en-CA',
    image: ORIGIN + '/og-image.png',
    dateModified: date,
    author: org,
    publisher: { ...org, logo: { '@type': 'ImageObject', url: ORIGIN + '/icons/icon-512.png' } },
  };
  const block = `<script type="application/ld+json">\n${JSON.stringify(article, null, 2)}\n</script>\n`;
  if (ARTICLE_RE.test(html)) return html.replace(ARTICLE_RE, () => block);
  const at = html.indexOf('<script type="application/ld+json">');
  return at < 0 ? html : html.slice(0, at) + block + html.slice(at);
}

let xml = readFileSync(sitemapPath, 'utf8');
const stale = [];
const pages = new Map();
xml = xml.replace(/<loc>([^<]+)<\/loc>(\s*)<lastmod>([^<]+)<\/lastmod>/g, (all, loc, ws, lastmod) => {
  if (!loc.startsWith(ORIGIN + '/guides/')) return all;
  const file = fileFor(loc);
  if (!existsSync(file)) { stale.push(`${loc}: file not found`); return all; }
  const committed = gitDate(file);
  let date = committed > lastmod ? committed : lastmod;
  if (!check && isDirty(file)) date = today;
  if (lastmod < committed) stale.push(`${loc}: lastmod ${lastmod}, last changed ${committed}`);

  if (file.endsWith('-guide.html')) {
    const html = readFileSync(file, 'utf8');
    let next = withArticle(html, loc, date);
    if (next !== html) {
      if (check) stale.push(`${loc}: Article JSON-LD missing or out of date`);
      else { date = today; next = withArticle(html, loc, date); pages.set(file, next); }
    }
  }
  if (!committed && !pages.has(file)) return all; // not committed yet
  return `<loc>${loc}</loc>${ws}<lastmod>${date}</lastmod>`;
});

if (check) {
  if (stale.length) {
    console.error('guide dates are out of date — run: node scripts/sitemap-lastmod.mjs\n  ' + stale.join('\n  '));
    process.exit(1);
  }
  console.log('sitemap.xml and Article dates are current');
} else {
  writeFileSync(sitemapPath, xml);
  for (const [file, html] of pages) writeFileSync(file, html);
  console.log(stale.length || pages.size ? `updated ${stale.length} sitemap entr${stale.length === 1 ? 'y' : 'ies'}, ${pages.size} guide page(s)` : 'already current');
}
