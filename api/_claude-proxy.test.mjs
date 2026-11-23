import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSonnet55, MODEL } from './claude-proxy.js';

test('proxy body: fixed model, no sampling params, thinking off', () => {
  const b = toSonnet55({ model: 'x', max_tokens: 400, temperature: 0, top_p: 1, top_k: 5, thinking: { type: 'disabled' }, system: 's', messages: [] });
  assert.equal(b.model, MODEL);
  assert.equal(MODEL, 'claude-sonnet-5-5');
  assert.deepEqual(b.thinking, { type: 'between_tools' });
  for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in b), k);
  assert.equal(b.system, 's');
  assert.equal(b.max_tokens, 400);
});

test('proxy body: forced tool_choice becomes auto + system instruction', () => {
  const b = toSonnet55({ system: 'sys', tools: [{ name: 'record_verification' }], tool_choice: { type: 'tool', name: 'record_verification' }, messages: [] });
  assert.deepEqual(b.tool_choice, { type: 'auto' });
  assert.match(b.system, /^sys\n\nAlways answer by calling the record_verification tool\.$/);
  const a = toSonnet55({ tool_choice: { type: 'any' }, messages: [] });
  assert.match(a.system, /one of the tools/);
  const auto = toSonnet55({ system: 'q', tool_choice: { type: 'auto' }, messages: [] });
  assert.equal(auto.system, 'q');
});

test('proxy body: effort clamped for between_tools, parallel flag kept', () => {
  const b = toSonnet55({ output_config: { effort: 'max' }, tool_choice: { type: 'tool', name: 't', disable_parallel_tool_use: true }, messages: [] });
  assert.equal(b.output_config.effort, 'high');
  assert.deepEqual(b.tool_choice, { type: 'auto', disable_parallel_tool_use: true });
});

test('proxy handler: retries once when forced tool is skipped, maps refusal to error', async () => {
  const { default: handler } = await import('./claude-proxy.js');
  const replies = [];
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; const d = replies.shift(); return { status: 200, json: async () => d }; };
  const run = async body => {
    const out = {};
    const res = { status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; } };
    await handler({ method: 'POST', headers: { 'x-forwarded-for': 't-' + Math.random() }, socket: {}, body }, res);
    return out;
  };
  try {
    replies.push({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'prose' }] },
                 { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', name: 't', input: { a: 1 } }] });
    let o = await run({ tools: [{ name: 't' }], tool_choice: { type: 'tool', name: 't' }, messages: [] });
    assert.equal(calls, 2);
    assert.equal(o.code, 200);
    assert.equal(o.body.content[0].type, 'tool_use');

    calls = 0;
    replies.push({ stop_reason: 'refusal', content: [] });
    o = await run({ messages: [] });
    assert.equal(calls, 1);
    assert.equal(o.code, 422);
    assert.equal(o.body.error.type, 'refusal');
  } finally { globalThis.fetch = realFetch; }
});
