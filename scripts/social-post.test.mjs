import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textFor, instagramCaption, linkedinCommentary } from './social-post.mjs';

const base = { caption: 'Shared text\n\ncomplaintca.ca', hashtags: '#A #B' };

test('textFor falls back to the shared caption and hashtags', () => {
  assert.deepEqual(textFor(base, 'linkedin'), { caption: base.caption, hashtags: '#A #B', title: undefined });
});

test('per-platform text overrides the shared text', () => {
  const post = { ...base, instagram: { caption: 'IG only', hashtags: '#I' }, linkedin: { caption: 'LI only', title: 'T' } };
  assert.equal(instagramCaption(post), 'IG only\n\n#I');
  assert.deepEqual(textFor(post, 'linkedin'), { caption: 'LI only', hashtags: '#A #B', title: 'T' });
});

test('queued posts fit Instagram and LinkedIn limits', () => {
  const { posts } = JSON.parse(readFileSync(new URL('../social/queue.json', import.meta.url)));
  for (const p of posts) {
    const ig = instagramCaption(p);
    assert.ok(ig.length <= 2200, `${p.id}: Instagram caption over 2200`);
    assert.ok((ig.match(/(^|\s)#\w+/g) || []).length <= 5, `${p.id}: more than 5 hashtags`);
    const li = textFor(p, 'linkedin');
    assert.ok(linkedinCommentary(li.caption, li.hashtags).length <= 3000, `${p.id}: LinkedIn text over 3000`);
  }
});
