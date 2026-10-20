import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsReview } from './shield-agent.mjs';

test('only patterns go to Claude', () => {
  assert.equal(needsReview([{ ip: 'a', agent: 'probe' }, { ip: 'b', agent: 'trap' }]), false);
  assert.equal(needsReview([{ ip: 'a', agent: 'probe' }, { ip: 'a', agent: 'inject' }]), true);
  assert.equal(needsReview([{ ip: 'a', agent: 'flood' }]), true);
  assert.equal(needsReview(['a', 'b', 'c', 'd', 'e'].map(ip => ({ ip, agent: 'probe' }))), true);
});
