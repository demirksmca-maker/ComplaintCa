#!/usr/bin/env node
// Sets <lastmod> for the /guides/ entries in sitemap.xml to each file's last git commit date.
//   node scripts/sitemap-lastmod.mjs          rewrite sitemap.xml
//   node scripts/sitemap-lastmod.mjs --check  exit 1 if any guide's lastmod is older than its last commit
// Needs full git history (actions/checkout with fetch-depth: 0).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sitemapPath = path.join(root, 'sitemap.xml');
const check = process.argv.includes('--check');
const ORIGIN = 'https://www.complaintca.ca';

function fileFor(loc) {
  const p = loc.slice(ORIGIN.length);
  return path.join(root, p.endsWith('/') ? p + 'index.html' : p);
}

function gitDate(file) {
  return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: root, encoding: 'utf8' }).trim();
}

let xml = readFileSync(sitemapPath, 'utf8');
const stale = [];
xml = xml.replace(/<loc>([^<]+)<\/loc>(\s*)<lastmod>([^<]+)<\/lastmod>/g, (all, loc, ws, lastmod) => {
  if (!loc.startsWith(ORIGIN + '/guides/')) return all;
  const file = fileFor(loc);
  if (!existsSync(file)) { stale.push(`${loc}: file not found`); return all; }
  const date = gitDate(file);
  if (!date) return all; // not committed yet
  if (lastmod < date) stale.push(`${loc}: lastmod ${lastmod}, last changed ${date}`);
  return `<loc>${loc}</loc>${ws}<lastmod>${date > lastmod ? date : lastmod}</lastmod>`;
});

if (check) {
  if (stale.length) {
    console.error('sitemap.xml is out of date — run: node scripts/sitemap-lastmod.mjs\n  ' + stale.join('\n  '));
    process.exit(1);
  }
  console.log('sitemap.xml guide dates are current');
} else {
  writeFileSync(sitemapPath, xml);
  console.log(stale.length ? `updated ${stale.length} entr${stale.length === 1 ? 'y' : 'ies'}` : 'already current');
}
