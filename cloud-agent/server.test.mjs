import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenOk } from './server.mjs';
import { makePassword, parseReply, isPasswordField } from '../extension/core.js';

test('sandbox token: exact, long enough, constant-time', () => {
  const t = 'f'.repeat(48);
  assert.ok(tokenOk(t, t));
  assert.ok(!tokenOk('f'.repeat(47), t));
  assert.ok(!tokenOk('', ''), 'an unset token never opens the server');
  assert.ok(!tokenOk('short', 'short'));
});

test('generated passwords are strong and differ', () => {
  const a = makePassword(), b = makePassword();
  assert.equal(a.length, 18);
  assert.notEqual(a, b);
  for (const re of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%*\-_+?]/]) assert.match(a, re);
});

test('cloud replies carry password ids and mail queries', () => {
  const r = parseReply('{"password":["d4","d5",3],"mail":" from:ccts ","fill":[]}');
  assert.deepEqual(r.password, ['d4', 'd5']);
  assert.equal(r.mail, 'from:ccts');
  assert.deepEqual(parseReply('düz metin').password, []);
  assert.ok(isPasswordField({ type: 'password' }));
  assert.ok(!isPasswordField({ type: 'text', autocomplete: 'email' }));
});
