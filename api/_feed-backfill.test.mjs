import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublishable } from './_feed-backfill.js';

const s = v => ({ stringValue: v }), b = v => ({ booleanValue: v });
test('only real, non-legal complaints go to the public list', () => {
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), test: b(false), date: s('2026-10-31') }), true);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), test: b(true), date: s('2026-10-31') }), false);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), test: b(false), isLegal: b(true) }), false);
  assert.equal(isPublishable({ ref: s('bad'), test: b(false) }), false);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), date: s('2026-10-29T10:00:00Z') }), true);
  assert.equal(isPublishable({ ref: s('VC-2026-5RD9UY'), date: s('2026-10-01T10:00:00Z') }), false);
});
