import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFinalButton, isSensitive, parseReply, trimHistory, userTurn } from './core.js';

test('final buttons are never pressed by the agent', () => {
  for (const t of ['Submit', 'Send complaint', 'File a complaint', 'Envoyer', 'Gönder', 'Pay now', 'Sign in', 'Confirm'])
    assert.ok(isFinalButton(t), t);
  for (const t of ['Next', 'Continue', 'Accept cookies', 'Suivant', 'Back'])
    assert.ok(!isFinalButton(t), t);
});

test('password, card and SIN fields are sensitive', () => {
  assert.ok(isSensitive({ type: 'password', name: 'p' }));
  assert.ok(isSensitive({ type: 'text', autocomplete: 'cc-number' }));
  assert.ok(isSensitive({ type: 'text', label: 'Social Insurance Number' }));
  assert.ok(!isSensitive({ type: 'text', label: 'First name', name: 'fname' }));
});

test('parseReply reads fenced JSON and rejects bad parts', () => {
  const a = parseReply('```json\n{"say":"ok","go":"http://x.com","fill":[{"id":"d1","value":5},{"bad":1}],"click":"d2","done":true}\n```');
  assert.equal(a.say, 'ok');
  assert.equal(a.go, null, 'only https');
  assert.deepEqual(a.fill, [{ id: 'd1', value: '5' }]);
  assert.equal(a.click, 'd2');
  assert.equal(a.done, true);
  assert.equal(parseReply('Hesap numaran ne?').ask, 'Hesap numaran ne?');
  assert.ok(parseReply('{bozuk').ask);
});

test('trimHistory keeps the task and the newest turns, starting with user', () => {
  const t = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
  const r = trimHistory(t, 8);
  assert.equal(r[0].content, '0');
  assert.equal(r[1].role, 'assistant');
  assert.equal(r[2].role, 'user');
  assert.equal(r.at(-1).content, '19');
  assert.ok(userTurn('', null, '').includes('go'));
});
