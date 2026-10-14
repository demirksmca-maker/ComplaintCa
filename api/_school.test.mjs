import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSchool, norm } from './_school.js';
import { withSchool, boardName } from './_complaint-core.js';

test('norm folds saint, possessive and accents', () => {
  assert.equal(norm("St. Anne's Catholic School"), 'st anne catholic school');
  assert.equal(norm('École Sainte-Marie'), 'ecole st marie');
});

test('finds St Anne Catholic School in Blenheim with its board (real data)', () => {
  const h = findSchool("St. Anne's Catholic School", 'Blenheim, Ontario');
  assert.ok(h, 'match');
  assert.equal(h.school.city, 'Blenheim');
  assert.match(h.board.name, /St(\.)? Clair/i);
  assert.ok(h.school.email.includes('@'));
});

test('same name in many cities without a place is not guessed', () => {
  assert.equal(findSchool('St Anne Catholic School', ''), null);
});

test('a place that does not match gives no school', () => {
  assert.equal(findSchool('St Anne Catholic School', 'Vancouver BC'), null);
});

test('withSchool puts school then board first, only for school complaints in Ontario', () => {
  const base = [{ name: 'Ontario Ministry of Education', email: 'x@ontario.ca' }];
  const r = withSchool(base, { category: 'education', target: 'school', targetName: "St. Anne's Catholic School", location: 'Blenheim, ON' });
  assert.match(r.auths[0].name, /St Anne Catholic School/);
  assert.match(r.auths[1].name, /Catholic District School Board/);
  assert.equal(r.auths[2].name, 'Ontario Ministry of Education');
  assert.equal(withSchool(base, { category: 'consumer', target: 'business', targetName: 'St Anne Catholic School', location: 'Blenheim, ON' }).auths, base);
  assert.equal(withSchool(base, { category: 'education', target: 'school', targetName: 'St Anne Catholic School', location: 'Calgary, AB' }).auths, base);
});

test('boardName expands abbreviations', () => {
  assert.equal(boardName('St. Clair CDSB'), 'St. Clair Catholic District School Board');
  assert.equal(boardName('Lambton Kent DSB'), 'Lambton Kent District School Board');
});

test('school level and Toronto boroughs are respected', () => {
  assert.equal(findSchool('Earl Haig Secondary School', 'Toronto, ON').school.name, 'Earl Haig Secondary School');
  assert.equal(findSchool('Earl Haig Public School', 'Toronto').school.name, 'Earl Haig Public School');
  assert.equal(findSchool('St. Annes school', 'Blenheim').school.name, 'St Anne Catholic School');
});
