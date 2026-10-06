#!/usr/bin/env node
// Publishes due posts from social/queue.json to Facebook, Instagram and LinkedIn.
// Run daily by .github/workflows/social-post.yml. State lives in social/posted.json,
// so a post (or a single platform that failed) is retried on the next run but is
// never published twice.
//
// Env (GitHub secrets):
//   META_PAGE_ID, META_PAGE_TOKEN     Facebook Page id + non-expiring Page access token
//   IG_USER_ID                        Instagram business account id (uses META_PAGE_TOKEN)
//   LINKEDIN_TOKEN, LINKEDIN_AUTHOR   OAuth token + urn:li:organization:123 (or urn:li:person:abc)
// Optional: DRY_RUN=1, POST_ID (publish just this post now, ignoring its date),
//           SITE_BASE, GRAPH_VERSION, LINKEDIN_VERSION, MAX_POSTS_PER_RUN
// A platform whose secrets are missing is skipped (not an error).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE = path.join(ROOT, 'social/queue.json');
const POSTED = path.join(ROOT, 'social/posted.json');
const env = process.env;
const DRY = env.DRY_RUN === '1' || env.DRY_RUN === 'true';
const SITE = (env.SITE_BASE || 'https://www.complaintca.ca').replace(/\/$/, '');
const GRAPH = 'https://graph.facebook.com/' + (env.GRAPH_VERSION || 'v23.0');
const MAX = Number(env.MAX_POSTS_PER_RUN || 1);

export function torontoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// LinkedIn API versions are monthly (YYYYMM) and each stays live ~1 year; default to two months back.
export function linkedinVersion(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// LinkedIn "little text": reserved characters must be escaped; hashtags use the hashtag template.
export function linkedinCommentary(caption, hashtags) {
  const esc = (s) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => '\\' + c);
  const tags = (hashtags || '').split(/\s+/).filter(Boolean)
    .map((t) => t.replace(/^#/, '')).filter((t) => /^[\p{L}\p{N}_]+$/u.test(t))
    .map((t) => `{hashtag|\\#|${t}}`).join(' ');
  return esc(caption) + (tags ? '\n\n' + tags : '');
}

export function fullCaption(post) {
  return post.caption + (post.hashtags ? '\n\n' + post.hashtags : '');
}

export function duePosts(queue, posted, today, enabled, onlyId) {
  return queue.posts
    .filter((p) => (onlyId ? p.id === onlyId : p.date <= today))
    .map((p) => ({ post: p, todo: p.platforms.filter((pl) => enabled.includes(pl) && !(posted[p.id] || {})[pl]) }))
    .filter((x) => x.todo.length)
    .sort((a, b) => a.post.date.localeCompare(b.post.date));
}

async function api(url, opts = {}, label) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(`${label} HTTP ${r.status}: ${text.slice(0, 400)}`);
  return { body, headers: r.headers };
}

const form = (o) => new URLSearchParams(o);

async function postFacebook(post, imageUrl) {
  const { body } = await api(`${GRAPH}/${env.META_PAGE_ID}/photos`, {
    method: 'POST', body: form({ url: imageUrl, caption: fullCaption(post), access_token: env.META_PAGE_TOKEN }),
  }, 'facebook');
  return body.post_id || body.id;
}

async function postInstagram(post, imageUrl) {
  const tok = env.META_PAGE_TOKEN;
  const { body: c } = await api(`${GRAPH}/${env.IG_USER_ID}/media`, {
    method: 'POST', body: form({ image_url: imageUrl, caption: fullCaption(post), access_token: tok }),
  }, 'instagram create');
  for (let i = 0; i < 12; i++) {
    const { body: s } = await api(`${GRAPH}/${c.id}?fields=status_code&access_token=${encodeURIComponent(tok)}`, {}, 'instagram status');
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('instagram container ' + s.status_code);
    await new Promise((r) => setTimeout(r, 5000));
  }
  const { body } = await api(`${GRAPH}/${env.IG_USER_ID}/media_publish`, {
    method: 'POST', body: form({ creation_id: c.id, access_token: tok }),
  }, 'instagram publish');
  return body.id;
}

async function postLinkedIn(post, imageBytes) {
  const h = {
    Authorization: 'Bearer ' + env.LINKEDIN_TOKEN,
    'LinkedIn-Version': env.LINKEDIN_VERSION || linkedinVersion(),
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
  const { body: init } = await api('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST', headers: h, body: JSON.stringify({ initializeUploadRequest: { owner: env.LINKEDIN_AUTHOR } }),
  }, 'linkedin upload init');
  const up = await fetch(init.value.uploadUrl, {
    method: 'PUT', headers: { Authorization: h.Authorization, 'Content-Type': 'image/jpeg' }, body: imageBytes,
  });
  if (!up.ok) throw new Error(`linkedin image upload HTTP ${up.status}: ${(await up.text()).slice(0, 300)}`);
  const { headers } = await api('https://api.linkedin.com/rest/posts', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      author: env.LINKEDIN_AUTHOR,
      commentary: linkedinCommentary(post.caption, post.hashtags),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: init.value.image, altText: post.caption.split('\n')[0].slice(0, 300) } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  }, 'linkedin post');
  return headers.get('x-restli-id') || 'ok';
}

async function main() {
  const queue = JSON.parse(await readFile(QUEUE, 'utf8'));
  let posted = {};
  try { posted = JSON.parse(await readFile(POSTED, 'utf8')); } catch {}

  const enabled = [];
  if (env.META_PAGE_ID && env.META_PAGE_TOKEN) enabled.push('facebook');
  if (env.IG_USER_ID && env.META_PAGE_TOKEN) enabled.push('instagram');
  if (env.LINKEDIN_TOKEN && env.LINKEDIN_AUTHOR) enabled.push('linkedin');
  if (DRY) enabled.splice(0, enabled.length, 'facebook', 'instagram', 'linkedin');
  for (const pl of ['facebook', 'instagram', 'linkedin'])
    if (!enabled.includes(pl)) console.warn(`[skip] ${pl}: secrets not set`);

  const today = torontoToday();
  const onlyId = (env.POST_ID || '').trim();
  if (onlyId && !queue.posts.some((p) => p.id === onlyId)) { console.error(`✗ post "${onlyId}" not in queue`); process.exit(1); }
  const due = duePosts(queue, posted, today, enabled, onlyId).slice(0, MAX);
  console.log(`Today (Toronto): ${today} — ${due.length} post(s) to publish${DRY ? ' [DRY RUN]' : ''}`);

  let failed = 0;
  for (const { post, todo } of due) {
    const imageUrl = `${SITE}/${post.image}`;
    const res = await fetch(imageUrl);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/image\/jpe?g/.test(type)) {
      console.error(`✗ ${post.id}: image not reachable as JPEG at ${imageUrl} (HTTP ${res.status}, ${type})`);
      failed++; continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    for (const pl of todo) {
      if (DRY) { console.log(`• would post ${post.id} to ${pl}`); continue; }
      try {
        const id = pl === 'facebook' ? await postFacebook(post, imageUrl)
          : pl === 'instagram' ? await postInstagram(post, imageUrl)
          : await postLinkedIn(post, bytes);
        (posted[post.id] ||= {})[pl] = { id: String(id), at: new Date().toISOString() };
        console.log(`✓ ${post.id} → ${pl} (${id})`);
      } catch (e) {
        failed++;
        console.error(`✗ ${post.id} → ${pl}: ${e.message}`);
      }
    }
  }
  if (!DRY) await writeFile(POSTED, JSON.stringify(posted, null, 2) + '\n');
  if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
