// ASYA's guided questions in the guide step windows (guides/asya-step.js) and how their answers reach the
// complaint screen (index.html _applyGuideHandoff, assets/complaint-steps.js ccStepsPrefill).
// The windows themselves are checked in a browser, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const { splitCity, compose, clean, provCodes } = createRequire(import.meta.url)('../guides/asya-step.js');

test('splitCity: province code, name or none', () => {
  assert.deepEqual(splitCity('Ottawa, ON'), { city: 'Ottawa', pv: 'ON' });
  assert.deepEqual(splitCity('Ottawa ON'), { city: 'Ottawa', pv: 'ON' });
  assert.deepEqual(splitCity('Ottawa, Ontario'), { city: 'Ottawa', pv: 'ON' });
  assert.deepEqual(splitCity('Salmon Arm  bc.'), { city: 'Salmon Arm', pv: 'BC' });
  assert.deepEqual(splitCity('Montréal, Québec'), { city: 'Montréal', pv: 'QC' });
  assert.deepEqual(splitCity('Halifax, Nova Scotia'), { city: 'Halifax', pv: 'NS' });
  assert.deepEqual(splitCity('St. John’s, Newfoundland and Labrador'), { city: 'St. John’s', pv: 'NL' });
  assert.deepEqual(splitCity('Charlottetown, PEI'), { city: 'Charlottetown', pv: 'PE' });
  assert.deepEqual(splitCity('Yellowknife, NWT'), { city: 'Yellowknife', pv: 'NT' });
});

test('splitCity: a city alone stays a city, nothing is invented', () => {
  assert.deepEqual(splitCity('Hamilton'), { city: 'Hamilton', pv: '' });
  assert.deepEqual(splitCity('North Bay'), { city: 'North Bay', pv: '' });
  assert.deepEqual(splitCity(''), { city: '', pv: '' });
  assert.deepEqual(splitCity('  Toronto   '), { city: 'Toronto', pv: '' });
});

test('compose: the person’s words first, then the facts ASYA asked for', () => {
  const story = compose({ teacher: 'Ms. Brown', school: 'Maple Ridge Secondary School', city: 'Ottawa, ON', when: 'last Tuesday', what: 'She shouted at my daughter.' });
  assert.equal(story, 'She shouted at my daughter.\n\nTeacher or principal: Ms. Brown\nSchool: Maple Ridge Secondary School, Ottawa, ON\nWhen: last Tuesday');
});

test('compose: skipped answers leave no empty lines, the school stays', () => {
  assert.equal(compose({ teacher: '', school: 'Maple Ridge', city: '', when: '', what: 'It happened.' }), 'It happened.\n\nSchool: Maple Ridge');
});

test('compose: within the limit the facts stay and the narrative gives way', () => {
  const a = { teacher: 'Ms. Brown', school: 'Maple Ridge', city: 'Ottawa, ON', when: 'last week', what: 'y'.repeat(9000) };
  for (const max of [5000, 1500]) {
    const story = compose(a, max);
    assert.ok(story.length <= max, 'length ' + story.length + ' > ' + max);
    assert.ok(story.includes('Teacher or principal: Ms. Brown') && story.includes('School: Maple Ridge, Ottawa, ON') && story.endsWith('When: last week'));
  }
});

test('clean: control characters out, one line unless it is a story, capped', () => {
  assert.equal(clean('  Ms.\u0000 Brown \n\t ', 80), 'Ms. Brown');
  assert.equal(clean('a'.repeat(200), 80).length, 80);
  assert.equal(clean('line one  \n\n\n\nline two', 100, true), 'line one\n\nline two');
  assert.equal(clean(null, 10), '');
});

// ── The hand-over to the complaint screen ──
// _applyGuideHandoff lives in index.html's big inline script; it is cut out and run on its own with stand-ins.
function handoffFn(env) {
  const html = read('index.html');
  const at = html.indexOf('function _applyGuideHandoff(id){');
  assert.ok(at > 0, '_applyGuideHandoff not found in index.html');
  let depth = 0, end = -1;
  for (let i = html.indexOf('{', at); i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const store = new Map(Object.entries(env.store || {}));
  const calls = { prefill: [], desc: null, updateCC: 0, suggest: 0 };
  const desc = { value: '' };
  const ctx = vm.createContext({
    localStorage: env.throws
      ? { getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }
      : { getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: (k) => store.delete(k) },
    window: { ...(env.prefill ? { ccStepsPrefill: (h) => calls.prefill.push(h) } : {}), ...(env.fileOpen ? { ccFileOpen() {} } : {}) },
    document: { getElementById: (id) => (id === 'inp-desc' ? desc : null) },
    updateCC: () => { calls.updateCC++; }, suggestCategoryAI: () => { calls.suggest++; }, Date, JSON, String,
  });
  const fn = vm.runInContext(html.slice(at, end) + '; _applyGuideHandoff', ctx);
  return { run: fn, store, calls, desc };
}
const payload = (over = {}) => JSON.stringify({ v: 1, t: Date.now(), id: 'abc123', who: 'Maple Ridge SS', what: 'It happened.', city: 'Ottawa', pv: 'ON', ...over });

test('hand-over: the matching id fills the six steps once, then the entry is gone', () => {
  const e = handoffFn({ store: { cc_handoff: payload() }, prefill: true, fileOpen: true });
  e.run('abc123');
  assert.equal(e.calls.prefill.length, 1);
  assert.equal(e.calls.prefill[0].who, 'Maple Ridge SS');
  assert.equal(e.store.has('cc_handoff'), false);
});

test('hand-over: another id or no id fills nothing, a live entry is left alone', () => {
  for (const id of ['zzz999', '', null]) {
    const e = handoffFn({ store: { cc_handoff: payload() }, prefill: true, fileOpen: true });
    e.run(id);
    assert.equal(e.calls.prefill.length, 0, 'id ' + id);
    assert.equal(e.store.has('cc_handoff'), true, 'id ' + id);
  }
});

test('hand-over: expired, unknown-version or broken entries are dropped and fill nothing', () => {
  const bad = [payload({ t: Date.now() - 11 * 60 * 1000 }), payload({ v: 2 }), payload({ t: undefined }), '{not json', '"text"', 'null'];
  for (const raw of bad) {
    for (const id of ['abc123', '']) {
      const e = handoffFn({ store: { cc_handoff: raw }, prefill: true, fileOpen: true });
      assert.doesNotThrow(() => e.run(id));
      assert.equal(e.calls.prefill.length, 0, raw + ' / ' + id);
      assert.equal(e.store.has('cc_handoff'), false, raw + ' / ' + id);
    }
  }
});

test('hand-over: a hand-over just under 10 minutes old still works', () => {
  const e = handoffFn({ store: { cc_handoff: payload({ t: Date.now() - 9 * 60 * 1000 }) }, prefill: true, fileOpen: true });
  e.run('abc123');
  assert.equal(e.calls.prefill.length, 1);
});

test('hand-over: without the six-step screen the classic form gets the story; with it but no hook, nothing happens', () => {
  const classic = handoffFn({ store: { cc_handoff: payload() } });
  classic.run('abc123');
  assert.equal(classic.desc.value, 'It happened.');
  assert.equal(classic.calls.updateCC, 1);
  assert.equal(classic.calls.suggest, 1);
  const stale = handoffFn({ store: { cc_handoff: payload() }, fileOpen: true });
  stale.run('abc123');
  assert.equal(stale.desc.value, '');
});

test('hand-over: blocked storage never throws', () => {
  assert.doesNotThrow(() => handoffFn({ throws: true, prefill: true }).run('abc123'));
});

test('hand-over: the guide and the complaint screen agree on key, version, link and province codes', () => {
  const guide = read('guides/asya-step.js'), home = read('index.html'), steps = read('assets/complaint-steps.js');
  assert.match(guide, /localStorage\.setItem\('cc_handoff', JSON\.stringify\(\{ v: 1, t: Date\.now\(\), id: id,/);
  assert.ok(guide.includes("'/?go=new&h=' + id"));
  assert.ok(guide.includes('600000'), 'the guide drops an unused hand-over after 10 minutes');
  assert.ok(home.includes("_applyGuideHandoff(_q.get('h'))"));
  assert.ok(steps.includes('window.ccStepsPrefill = function'));
  const codes = [...steps.match(/var PROV = \[(.*?)\];/)[1].matchAll(/\['([A-Z]{2})'/g)].map((m) => m[1]).sort();
  assert.equal(codes.length, 13);
  assert.deepEqual([...provCodes].sort(), codes);
});
