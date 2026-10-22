#!/usr/bin/env node
// Renders 7-second dark-theme Reels (1080x1920 MP4) from social/videos.json.
// Each frame is a screenshot of an HTML animation seeked to an exact time, so
// the output is identical on every run. Music: assets/brand/complaintca-theme.mp3.
//
//   node scripts/social-video.mjs            render every video that has no MP4 yet
//   node scripts/social-video.mjs v01-brand  render (or re-render) just this one
//
// Needs Playwright (Chromium) and ffmpeg. Output: social/videos/<id>.mp4
//
// Optional "bg" puts real footage behind the text: "pexels:<search words>" pulls a
// free portrait clip from Pexels (needs PEXELS_API_KEY, cached in social/stock/),
// or a path like "assets/stock/city.mp4" uses a local clip.

import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'social/videos');
const FPS = 30, DUR = 7, W = 1080, H = 1920;
const STOCK = path.join(ROOT, 'social/stock');
const require = createRequire(import.meta.url);
const loadChromium = () => {
  try { return require('playwright').chromium; } catch { return require('/opt/node22/lib/node_modules/playwright').chromium; }
};
const exists = (f) => access(f).then(() => true, () => false);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function page(v) {
  const accent = { red: '#f0576a', green: '#2fd07a', yellow: '#e7b955', blue: '#5b9bf5' }[v.accent || 'blue'];
  const words = v.title.split(' ').map((w, i) =>
    `<span class="w" style="animation-delay:${0.5 + i * 0.12}s">${esc(w)}</span>`).join(' ');
  const lines = (v.lines || []).map((l, i) =>
    `<li style="animation-delay:${2.2 + i * 0.55}s"><i></i>${esc(l)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${v.bg ? 'transparent' : '#070d1a'};font-family:Inter,system-ui,sans-serif;color:#e9edf5}
@keyframes drift{from{transform:translate(-8%,-6%) scale(1)}to{transform:translate(8%,6%) scale(1.25)}}
@keyframes up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 ${accent}66}50%{box-shadow:0 0 0 28px ${accent}00}}
@keyframes out{to{opacity:0;transform:scale(.96)}}
.glow{position:absolute;width:1400px;height:1400px;border-radius:50%;filter:blur(160px);opacity:.3;animation:drift 7s ease-in-out both alternate}
.g1{background:${accent};top:-500px;left:-400px}
.g2{background:#2563c0;bottom:-600px;right:-500px;animation-direction:alternate-reverse}
.grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:90px 90px}
main{position:absolute;inset:0;padding:220px 96px 0;display:flex;flex-direction:column;animation:out .45s ease-in 6.55s both}
.kick{font-size:40px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${accent};animation:fade .5s ease-out .15s both}
.bar{height:8px;width:180px;background:${accent};border-radius:4px;margin:34px 0 46px;transform-origin:left;animation:grow .6s cubic-bezier(.2,.8,.2,1) .3s both}
h1{font-size:118px;line-height:1.04;font-weight:900;letter-spacing:-.03em}
.w{display:inline-block;animation:up .55s cubic-bezier(.2,.8,.2,1) both}
ul{list-style:none;margin-top:84px;display:flex;flex-direction:column;gap:38px}
li{font-size:50px;font-weight:600;color:#c9d2e3;display:flex;gap:30px;align-items:center;animation:up .5s cubic-bezier(.2,.8,.2,1) both}
li i{flex:none;width:22px;height:22px;border-radius:50%;background:${accent}}
.cta{position:absolute;left:96px;right:96px;bottom:400px;display:flex;align-items:center;justify-content:space-between;padding:44px 52px;border-radius:36px;background:#0f1a2ecc;border:2px solid #26334a;animation:up .6s cubic-bezier(.2,.8,.2,1) 4.6s both}
.cta b{font-size:62px;font-weight:800}
.cta span{display:block;font-size:34px;color:#a9b4c9;margin-top:8px;font-weight:500}
.go{width:120px;height:120px;border-radius:50%;background:${accent};display:grid;place-items:center;animation:pulse 1.4s ease-out 5.2s 2 both}
.brand{position:absolute;top:96px;left:96px;font-size:40px;font-weight:800;letter-spacing:-.01em;animation:fade .5s ease-out both}
.brand em{font-style:normal;color:#f0576a}
.scrim{position:absolute;inset:0;background:linear-gradient(#070d1ae6,#070d1a99 45%,#070d1acc)}
</style></head><body>
${v.bg ? '<div class="scrim"></div>' : '<div class="glow g1"></div><div class="glow g2"></div><div class="grid"></div>'}
<main>
  <div class="brand">Complaint<em>CA</em></div>
  <div class="kick">${esc(v.kicker)}</div>
  <div class="bar"></div>
  <h1>${words}</h1>
  <ul>${lines}</ul>
  <div class="cta"><div><b>complaintca.ca</b><span>${esc(v.cta || 'Free · 7 languages · Anonymous option')}</span></div>
    <div class="go"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#070d1a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div></div>
</main></body></html>`;
}

// Pexels file closest to 1080x1920 among portrait files, preferring >= 1080 wide.
export function pickFile(files) {
  const tall = files.filter((f) => f.file_type === 'video/mp4' && f.height > f.width);
  if (!tall.length) return null;
  const score = (f) => (f.width >= W ? 0 : 1e6) + Math.abs(f.width - W);
  return tall.sort((a, b) => score(a) - score(b))[0];
}

async function stockClip(bg) {
  if (!bg.startsWith('pexels:')) return path.join(ROOT, bg);
  const q = bg.slice(7).trim();
  const file = path.join(STOCK, q.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.mp4');
  if (await exists(file)) return file;
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error(`"${bg}" needs PEXELS_API_KEY (free at pexels.com/api)`);
  const res = await fetch(`https://api.pexels.com/videos/search?orientation=portrait&per_page=15&query=${encodeURIComponent(q)}`,
    { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels search "${q}": HTTP ${res.status}`);
  const hit = (await res.json()).videos.map((vid) => ({ vid, f: pickFile(vid.video_files) })).find((x) => x.f && x.vid.duration >= 4);
  if (!hit) throw new Error(`Pexels: no portrait clip for "${q}"`);
  await mkdir(STOCK, { recursive: true });
  await writeFile(file, Buffer.from(await (await fetch(hit.f.link)).arrayBuffer()));
  console.log(`  bg "${q}": ${hit.vid.url} by ${hit.vid.user.name} (Pexels)`);
  return file;
}

async function render(browser, v) {
  const tmp = path.join(OUT, '.frames-' + v.id);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  const bg = v.bg && await stockClip(v.bg);
  const ext = bg ? 'png' : 'jpg';
  await p.setContent(page(v));
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  for (let f = 0; f < FPS * DUR; f++) {
    const ms = (f * 1000) / FPS;
    await p.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), ms);
    const shot = path.join(tmp, String(f).padStart(4, '0') + '.' + ext);
    await p.screenshot(bg ? { path: shot, omitBackground: true } : { path: shot, type: 'jpeg', quality: 95 });
  }
  await p.close();
  const mp4 = path.join(OUT, v.id + '.mp4');
  // Footage is scaled and cropped to fill 9:16; the text frames (darkening scrim included) go on top.
  const video = bg
    ? ['-stream_loop', '-1', '-i', bg, '-framerate', String(FPS), '-i', path.join(tmp, '%04d.png'),
      '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}[b];[b][1:v]overlay=shortest=1,format=yuv420p[v]`]
    : ['-framerate', String(FPS), '-i', path.join(tmp, '%04d.jpg')];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...video,
    '-ss', String(v.musicStart ?? 0), '-i', path.join(ROOT, 'assets/brand/complaintca-theme.mp3'),
    ...(bg ? ['-map', '[v]', '-map', '2:a'] : []), '-t', String(DUR), '-af', `afade=t=in:d=0.4,afade=t=out:st=${DUR - 0.8}:d=0.8`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', '-shortest', mp4]);
  await rm(tmp, { recursive: true, force: true });
  console.log('✓', path.relative(ROOT, mp4));
}

async function main() {
  const { videos } = JSON.parse(await readFile(path.join(ROOT, 'social/videos.json'), 'utf8'));
  const only = process.argv[2];
  await mkdir(OUT, { recursive: true });
  const todo = [];
  for (const v of videos) {
    if (only ? v.id !== only : await exists(path.join(OUT, v.id + '.mp4'))) continue;
    todo.push(v);
  }
  if (!todo.length) return console.log('Nothing to render.');
  const browser = await loadChromium().launch();
  const queue = [...todo];
  const worker = async () => { while (queue.length) await render(browser, queue.shift()); };
  try { await Promise.all([worker(), worker(), worker()]); } finally { await browser.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
