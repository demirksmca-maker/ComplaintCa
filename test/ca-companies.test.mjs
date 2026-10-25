// data/ca-companies.json: Canadian company complaint channels (same shape as data/es-companies.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHORITIES, _isMail } from '../api/_engine-data.js';

const { empresas } = JSON.parse(readFileSync(new URL('../data/ca-companies.json', import.meta.url), 'utf8'));

test('every company has the fields the site reads', () => {
  for (const c of empresas) {
    for (const k of ['ad', 'sector', 'category', 'alias', 'domain', 'url', 'canal', 'fuente']) assert.ok(k in c, `${c.ad}: ${k}`);
    assert.equal(typeof c.verificado, 'boolean', c.ad);
    assert.ok(AUTHORITIES[c.category], `${c.ad}: unknown category ${c.category}`);
    if (c.email) assert.ok(_isMail(c.email), `${c.ad}: bad email ${c.email}`);
    if (c.url) assert.match(c.url, /^https:\/\//, c.ad);
    if (c.telefono) assert.match(c.telefono, /^1-\d{3}-\d{3}-\d{4}$/, c.ad);
  }
});

test('names and aliases are unique, aliases lowercase', () => {
  const names = empresas.map(c => c.ad.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  const seen = new Map();
  for (const c of empresas) for (const a of c.alias) {
    assert.equal(a, a.toLowerCase(), `${c.ad}: ${a}`);
    assert.ok(!seen.has(a), `alias "${a}" used by ${seen.get(a)} and ${c.ad}`);
    seen.set(a, c.ad);
  }
});

test('wikidata ids are well formed and point to one company each', () => {
  const ids = empresas.map(c => c.wikidata).filter(Boolean);
  for (const id of ids) assert.match(id, /^Q\d+$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('a verified entry comes from the company itself', () => {
  for (const c of empresas.filter(c => c.verificado)) {
    assert.equal(c.fuente, 'oficial', c.ad);
    assert.ok(c.url || c.email, c.ad);
  }
});
