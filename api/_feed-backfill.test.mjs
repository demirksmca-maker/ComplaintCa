import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublishable } from './_feed-backfill.js';

const s = v => ({ stringValue: v }), b = v => ({ booleanValue: v });
test('only real, non-legal complaints go to the public list', () => {
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), test: b(false), date: s('2026-10-31') }), true);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), test: b(true), date: s('2026-10-31') }), false);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), test: b(false), isLegal: b(true) }), false);
  assert.equal(isPublishable({ ref: s('bad'), test: b(false) }), false);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), date: s('2026-10-01T10:00:00Z') }), true);
});

import { poolComplaint, backfillFeed } from './_feed-backfill.js';
const doc = fields => async (url, opts = {}) => {
  calls.push([opts.method || 'GET', url, opts.body]);
  if (!opts.method) return { ok: true, status: 200, json: async () => ({ fields }) };
  if (opts.method === 'POST') return { ok: true, status: 200, json: async () => [{ document: { fields } }, {}] };
  return { ok: true, status: 200 };
};
let calls = [];
test('pool toggle writes or removes the summary only', async () => {
  calls = [];
  const f = { ref: s('VC-2026-5RD9UY'), title: s('Canadian Tire billed more'), desc: s('Topic: Consumer & Business · Hidden fee\n\nStory'), email: s('a@b.ca'), name: s('H'), location: s('Dieppe, NB'), category: s('billing'), date: s('2026-10-31T09:04:00Z') };
  assert.deepEqual(await poolComplaint('doc1', true, doc(f)), { ok: true, pool: true });
  const w = calls.find(c => c[0] === 'PATCH');
  assert.ok(w[1].endsWith('/publicFeed/VC-2026-5RD9UY'));
  assert.ok(/Canadian Tire billed more/.test(w[2]) && !/a@b\.ca|Story|"H"/.test(w[2]));
  calls = [];
  assert.deepEqual(await poolComplaint('doc1', false, doc(f)), { ok: true, pool: false });
  assert.ok(calls.some(c => c[0] === 'DELETE' && c[1].endsWith('/publicFeed/VC-2026-5RD9UY')));
  assert.equal((await poolComplaint('../x', true, doc(f))).reason, 'bad_id');
});
test('backfill rewrites every real complaint (fills missing titles)', async () => {
  calls = [];
  const r = await backfillFeed(doc({ ref: s('VC-2026-5RD9UY'), title: s('T'), test: b(false) }));
  assert.equal(r.written, 1);
  assert.equal(calls.filter(c => c[0] === 'PATCH').length, 1);
});
