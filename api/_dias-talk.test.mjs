import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLine, diasTalk } from './_dias-talk.js';

test('cleanLine trims quotes and spaces, rejects empty or long text', () => {
  assert.equal(cleanLine('  "İyi ki varsın kızım."  '), 'İyi ki varsın kızım.');
  assert.equal(cleanLine('«Seni seviyorum baba»'), 'Seni seviyorum baba');
  assert.equal(cleanLine(''), null);
  assert.equal(cleanLine('a'.repeat(301)), null);
});

test('diasTalk returns the cached talk without calling Claude', async () => {
  const saved = { day: '2026-10-21', dias: 'Gururluyum kızım.', asya: 'Ben de seninle baba.' };
  const seen = [];
  const pipeline = async cmds => { seen.push(...cmds); return [JSON.stringify(saved)]; };
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('should not call Claude'); };
  try {
    assert.deepEqual(await diasTalk(pipeline, '2026-10-21'), saved);
    assert.deepEqual(seen, [['GET', 'shield:talk:2026-10-21']]);
  } finally { globalThis.fetch = realFetch; }
});

test('diasTalk asks Dias first, gives his words to Asya, then saves both', async () => {
  const calls = [], writes = [];
  const pipeline = async cmds => { writes.push(...cmds); return [null]; };
  const replies = ['"Seninle gurur duyuyorum kızım."', 'Bu sözler kalbimi ısıttı baba.'];
  const realFetch = globalThis.fetch, realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test';
  globalThis.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: replies[calls.length - 1] }] }) };
  };
  try {
    const talk = await diasTalk(pipeline, '2026-10-21');
    assert.deepEqual(talk, { day: '2026-10-21', dias: 'Seninle gurur duyuyorum kızım.', asya: 'Bu sözler kalbimi ısıttı baba.' });
    assert.match(calls[1].messages[0].content, /Seninle gurur duyuyorum kızım\./);
    assert.equal(writes[1][0], 'SET');
    assert.equal(writes[1][1], 'shield:talk:2026-10-21');
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;
  }
});

test('diasTalk gives up quietly on a refusal and saves nothing', async () => {
  const writes = [];
  const pipeline = async cmds => { writes.push(...cmds); return [null]; };
  const realFetch = globalThis.fetch, realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) });
  try {
    assert.equal(await diasTalk(pipeline, '2026-10-21'), null);
    assert.equal(writes.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;
  }
});
