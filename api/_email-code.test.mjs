import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from './_email-code.js';
import { mailSecret, checkPass } from './_mailcode.js';

let sent, ipN = 0, saved;
const call = body => new Promise(resolve => {
  const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
  handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.9.0.' + (++ipN) } }, res);
});
beforeEach(() => {
  saved = process.env.BREVO_API_KEY; process.env.BREVO_API_KEY = 'k'; sent = [];
  globalThis.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return new Response('{}', { status: 201 }); };
});
afterEach(() => { saved === undefined ? delete process.env.BREVO_API_KEY : (process.env.BREVO_API_KEY = saved); delete globalThis.fetch; });

test('send e-mails a code; the right code returns a pass for that address', async () => {
  const r = await call({ action: 'send', email: 'me@example.ca' });
  assert.equal(r.code, 200); assert.ok(r.data.token);
  assert.equal(sent[0].to[0].email, 'me@example.ca');
  const code = /(\d{6})/.exec(sent[0].subject)[1];
  const bad = await call({ action: 'check', email: 'me@example.ca', code: code === '000000' ? '000001' : '000000', token: r.data.token });
  assert.equal(bad.code, 400);
  const ok = await call({ action: 'check', email: 'me@example.ca', code, token: r.data.token });
  assert.equal(ok.code, 200); assert.equal(checkPass(mailSecret(), 'me@example.ca', ok.data.pass), true);
});
test('bad address is refused, no mail sent', async () => {
  const r = await call({ action: 'send', email: 'nope' });
  assert.equal(r.code, 400); assert.equal(sent.length, 0);
});

test('/api/email-code reaches the code handler through api/complaint.js (rewrite, one function)', async () => {
  const { default: complaint } = await import('./complaint.js');
  const r = await new Promise(resolve => {
    const res = { code: 0, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
    complaint({ method: 'POST', url: '/api/complaint?mailcode=1', query: { mailcode: '1' }, body: { action: 'send', email: 'me@example.ca' }, headers: { 'x-forwarded-for': '10.9.1.1' } }, res);
  });
  assert.equal(r.code, 200); assert.ok(r.data.token);
});
