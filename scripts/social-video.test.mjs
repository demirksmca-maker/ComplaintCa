import { test } from 'node:test';
import assert from 'node:assert/strict';
import { page, pickFile } from './social-video.mjs';

test('pickFile takes the portrait MP4 closest to 1080 wide', () => {
  const f = (width, height, file_type = 'video/mp4') => ({ width, height, file_type });
  assert.equal(pickFile([f(1920, 1080), f(720, 1280), f(1080, 1920), f(2160, 3840)]).width, 1080);
  assert.equal(pickFile([f(540, 960), f(720, 1280)]).width, 720);
  assert.equal(pickFile([f(1920, 1080), f(1080, 1920, 'video/webm')]), null);
});

test('page is transparent over footage, dark without it', () => {
  const v = { kicker: 'K', title: 'A <b>', lines: ['x'] };
  assert.match(page(v), /background:#070d1a/);
  assert.match(page(v), /class="glow g1"/);
  assert.match(page({ ...v, bg: 'pexels:city' }), /background:transparent/);
  assert.match(page({ ...v, bg: 'pexels:city' }), /class="scrim"/);
  assert.match(page(v), /&lt;b&gt;/);
});

test('videos.json is valid and every video has the fields page() needs', async () => {
  const { readFile } = await import('node:fs/promises');
  const { videos } = JSON.parse(await readFile(new URL('../social/videos.json', import.meta.url), 'utf8'));
  for (const v of videos) assert.ok(v.id && v.kicker && v.title, v.id);
});
