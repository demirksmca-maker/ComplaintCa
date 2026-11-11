#!/usr/bin/env node
// Renders 7-second Reels (1080x1920 MP4) from social/videos.json.
// Background: purple smoke drawn by a WebGL shader that pulses on the drum beat.
// Text: a transparent HTML layer whose animations start on beats, laid over the smoke.
// Each frame is seeked to an exact time, so the output is identical on every run.
// Music: assets/brand/smoke-theme.mp3, beats: assets/brand/smoke-theme.beats.json.
//
//   node scripts/social-video.mjs            render every video that has no MP4 yet
//   node scripts/social-video.mjs v01-brand  render (or re-render) just this one
//
// Needs Playwright (Chromium) and ffmpeg. Output: social/videos/<id>.mp4

import { readFile, mkdir, rm, access } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'social/videos');
const FPS = 30, DUR = 7, W = 1080, H = 1920;
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); }
})();

const MUSIC = path.join(ROOT, 'assets/brand/smoke-theme.mp3');
const SW = 540, SH = 960; // smoke is soft, so it is drawn at half size and scaled up

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Beats inside this clip, as clip-local seconds.
export function clipBeats(all, start, dur) {
  return all.map((b) => +(b - start).toFixed(3)).filter((b) => b >= 0 && b < dur);
}

// First beat at or after t (falls back to t when the clip runs out of beats).
export function onBeat(beats, t) {
  return beats.find((b) => b >= t - 0.04) ?? t;
}

// 0..1 drum envelope: jumps to 1 on each beat and decays.
export function pulse(beats, t) {
  let p = 0;
  for (const b of beats) if (t >= b) p = Math.max(p, Math.exp(-(t - b) * 5));
  return p;
}

export function page(v, beats = [], dur = DUR) {
  const accent = { red: '#f0576a', green: '#2fd07a', yellow: '#e7b955', blue: '#a85bf5' }[v.accent || 'blue'];
  const B = (t) => onBeat(beats, t);
  const period = beats.length > 1 ? (beats.at(-1) - beats[0]) / (beats.length - 1) : 0.7;
  const tTitle = B(0.5), tLines = B(Math.max(2.0, tTitle + 1.2)), tCta = B(4.4);
  const words = v.title.split(' ').map((w, i) =>
    `<span class="w" style="animation-delay:${(tTitle + i * period / 4).toFixed(3)}s">${esc(w)}</span>`).join(' ');
  const lines = (v.lines || []).map((l, i) =>
    `<li style="animation-delay:${B(tLines + i * period - 0.05).toFixed(3)}s"><i></i>${esc(l)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:Inter,system-ui,sans-serif;color:#f3eef8}
@keyframes up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes pulse{0%{box-shadow:0 0 0 0 ${accent}88;transform:scale(1.08)}100%{box-shadow:0 0 0 30px ${accent}00;transform:scale(1)}}
@keyframes out{to{opacity:0;transform:scale(.96)}}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,#14031277 0%,#14031244 45%,#14031200 70%,#14031255 100%)}
main{position:absolute;inset:0;padding:220px 96px 0;display:flex;flex-direction:column;animation:out .45s ease-in ${(dur - 0.45).toFixed(2)}s both}
.kick{font-size:40px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${accent};animation:fade .4s ease-out ${B(0).toFixed(3)}s both}
.bar{height:8px;width:180px;background:${accent};border-radius:4px;margin:34px 0 46px;transform-origin:left;animation:grow .5s cubic-bezier(.2,.8,.2,1) ${B(0).toFixed(3)}s both}
h1{font-size:118px;line-height:1.04;font-weight:900;letter-spacing:-.03em;text-shadow:0 4px 40px #14031299}
.w{display:inline-block;animation:up .55s cubic-bezier(.2,.8,.2,1) both}
ul{list-style:none;margin-top:84px;display:flex;flex-direction:column;gap:38px}
li{font-size:50px;font-weight:600;color:#e4d9f0;text-shadow:0 2px 24px #140312aa;display:flex;gap:30px;align-items:center;animation:up .5s cubic-bezier(.2,.8,.2,1) both}
li i{flex:none;width:22px;height:22px;border-radius:50%;background:${accent}}
.cta{position:absolute;left:96px;right:96px;bottom:400px;display:flex;align-items:center;justify-content:space-between;padding:44px 52px;border-radius:36px;background:#2a0b25cc;border:2px solid #5a2f63;animation:up .6s cubic-bezier(.2,.8,.2,1) ${tCta.toFixed(3)}s both}
.cta b{font-size:62px;font-weight:800}
.cta span{display:block;font-size:34px;color:#cbb8dc;margin-top:8px;font-weight:500}
.go{width:120px;height:120px;border-radius:50%;background:${accent};display:grid;place-items:center;animation:pulse ${period.toFixed(3)}s ease-out ${B(tCta + 0.6).toFixed(3)}s 3 both}
.brand{position:absolute;top:96px;left:96px;font-size:40px;font-weight:800;letter-spacing:-.01em;animation:fade .5s ease-out both}
.brand em{font-style:normal;color:#f0576a}
</style></head><body>
<div class="scrim"></div>
<main>
  <div class="brand">Complaint<em>CA</em></div>
  <div class="kick">${esc(v.kicker)}</div>
  <div class="bar"></div>
  <h1>${words}</h1>
  <ul>${lines}</ul>
  <div class="cta"><div><b>complaintca.ca</b><span>${esc(v.cta || 'Free · 7 languages · Anonymous option')}</span></div>
    <div class="go"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#1a0517" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div></div>
</main></body></html>`;
}

// "story" template: echoes that dissolve like smoke, a problem line, then on a drum hit
// the smoke parts (storyClear) for the answer, three steps and the brand.
// Every entrance sits on a beat: b(i) is the i-th beat of the clip.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function storyClear(beats) {
  const b = (i) => beats[i] ?? i * 0.71;
  return (t) => smooth(b(8) - 0.05, b(8) + 0.5, t) - 0.45 * smooth(b(15), b(16), t);
}

export function storyPage(v, beats = [], dur = 14) {
  const accent = { red: '#f0576a', green: '#2fd07a', yellow: '#e7b955', blue: '#a85bf5' }[v.accent || 'blue'];
  const b = (i) => (beats[i] ?? i * 0.71).toFixed(3);
  const echoes = (v.echoes || []).map((e, i) =>
    `<p class="echo" style="top:${560 + i * 210}px;left:${[110, 330, 190][i % 3]}px;animation-delay:${b(i)}s">${esc(e)}</p>`).join('');
  const [p1 = '', p2 = ''] = v.problem || [];
  const w2 = p2.split(' ');
  const last = w2.pop();
  const lines = (v.lines || []).map((l, i) =>
    `<li style="animation-delay:${b(10 + i)}s"><i>${i + 1}</i>${esc(l)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:Inter,system-ui,sans-serif;color:#f3eef8;text-align:center}
@keyframes echo{0%{opacity:0;filter:blur(14px);transform:translateY(30px)}15%{opacity:.95;filter:blur(0);transform:none}45%{opacity:.85;filter:blur(1px)}100%{opacity:0;filter:blur(28px);transform:translate(40px,-220px) scale(1.25)}}
@keyframes up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes hit{0%{opacity:0;transform:scale(1.6);filter:blur(18px)}60%{opacity:1;transform:scale(.97);filter:blur(0)}100%{opacity:1;transform:none}}
@keyframes vanish{to{opacity:0;filter:blur(30px);letter-spacing:.4em;transform:translateY(-140px)}}
@keyframes out{to{opacity:0;transform:scale(.94);filter:blur(10px)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes ring{0%{box-shadow:0 0 0 0 ${accent}88;transform:scale(1.08)}100%{box-shadow:0 0 0 34px ${accent}00;transform:none}}
.scene{position:absolute;inset:0}
.scrim{position:absolute;inset:0;background:radial-gradient(ellipse 70% 45% at 50% 48%,#14031288,#14031200)}
.echo{position:absolute;font-size:84px;font-weight:300;font-style:italic;color:#e9dcf5;text-shadow:0 0 40px #a85bf5aa;opacity:0;animation:echo 2s ease-out both}
.s2{top:620px;animation:out .4s ease-in ${b(8)}s both}
.s2 h2{font-size:104px;font-weight:900;letter-spacing:-.03em;line-height:1.08;text-shadow:0 4px 40px #140312}
.s2 .a{display:block;animation:up .5s cubic-bezier(.2,.8,.2,1) ${b(4)}s both}
.s2 .b{display:block;animation:up .5s cubic-bezier(.2,.8,.2,1) ${b(5)}s both}
.s2 .smk{display:inline-block;color:${accent};animation:fade .2s ${b(5)}s both,vanish 1.3s ease-in ${b(7)}s forwards}
.s3{top:540px;animation:out .4s ease-in ${b(15)}s both}
.turn{font-size:150px;font-weight:900;letter-spacing:-.04em;color:#fff;text-shadow:0 0 60px ${accent}cc;animation:hit .6s cubic-bezier(.2,.8,.2,1) ${b(8)}s both}
ul{list-style:none;margin:120px auto 0;width:880px;display:flex;flex-direction:column;gap:40px;text-align:left}
li{display:flex;gap:34px;align-items:center;font-size:52px;font-weight:650;padding:30px 40px;border-radius:30px;background:#2a0b25b3;border:2px solid #5a2f63;animation:up .45s cubic-bezier(.2,.8,.2,1) both}
li i{flex:none;width:72px;height:72px;border-radius:50%;background:${accent};color:#1a0517;font-style:normal;font-weight:900;font-size:40px;display:grid;place-items:center}
.s4{top:640px}
.logo{font-size:140px;font-weight:900;letter-spacing:-.03em;animation:hit .6s cubic-bezier(.2,.8,.2,1) ${b(16)}s both}
.logo em{font-style:normal;color:#f0576a}
.tag{margin-top:26px;font-size:54px;font-weight:600;color:#e4d9f0}
.tag span{display:inline-block;margin:0 12px;animation:up .4s cubic-bezier(.2,.8,.2,1) both}
.cta{margin:110px auto 0;width:860px;display:flex;align-items:center;justify-content:space-between;padding:44px 52px;border-radius:36px;background:#2a0b25cc;border:2px solid #5a2f63;text-align:left;animation:up .6s cubic-bezier(.2,.8,.2,1) ${b(18)}s both}
.cta b{font-size:62px;font-weight:800}
.cta small{display:block;font-size:34px;color:#cbb8dc;margin-top:8px;font-weight:500}
.go{width:120px;height:120px;border-radius:50%;background:${accent};display:grid;place-items:center;animation:ring ${(+b(1) - +b(0)).toFixed(3)}s ease-out ${b(19)}s 2 both}
.all{position:absolute;inset:0;animation:fade .45s ease-in ${(dur - 0.45).toFixed(2)}s reverse both}
</style></head><body><div class="scrim"></div><div class="all">
<div class="scene">${echoes}</div>
<div class="scene s2"><h2><span class="a">${esc(p1)}</span><span class="b">${esc(w2.join(' '))} <span class="smk">${esc(last)}</span></span></h2></div>
<div class="scene s3"><div class="turn">${esc(v.turn)}</div><ul>${lines}</ul></div>
<div class="scene s4"><div class="logo">Complaint<em>CA</em></div>
  <div class="tag">${(v.tagline || '').split(' ').map((w, i) => `<span style="animation-delay:${b(16 + i)}s">${esc(w)}</span>`).join('')}</div>
  <div class="cta"><div><b>complaintca.ca</b><small>${esc(v.cta || 'Free · 7 languages · Anonymous option')}</small></div>
  <div class="go"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#1a0517" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div></div></div>
</div></body></html>`;
}

// Realistic smoke: domain-warped fBm with a fake light for self-shadowing, in the
// site's purples. P (0..1) is the drum envelope: brighter, denser smoke and a small zoom.
export function smokePage() {
  return `<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" width="${SW}" height="${SH}"></canvas><script>
const gl = document.getElementById('c').getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
const fs = \`precision highp float;
uniform vec2 R; uniform float T, P, S, C;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;mat3 m=mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64);
 for(int i=0;i<6;i++){s+=a*n(p);p=m*p*2.03;a*=.5;}return s;}
float smoke(vec2 uv,float off,float spd){
 vec3 t=vec3(0.,-T*spd*.05,T*spd*.03);
 vec3 p=vec3(uv*1.6,off+S)+t;
 vec2 q=vec2(fbm(p+vec3(0.,0.,1.7)),fbm(p+vec3(5.2,1.3,2.8)));
 vec2 r=vec2(fbm(p+vec3(4.*q,0.)+vec3(1.7,9.2,0.)+t*.6),fbm(p+vec3(4.*q,0.)+vec3(8.3,2.8,0.)-t*.4));
 return fbm(p+vec3(3.5*r,0.));}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*R)/R.x*1.1*(1.-.035*P);
 vec2 su=uv*vec2(1.,.75);
 float f1=smoke(su,0.,1.),f2=smoke(su*1.8+vec2(3.1,1.7),11.,1.6);
 float d=smoothstep(.3-.08*P,.88,f1),w=smoothstep(.45,.9,f2)*.55;
 float den=clamp(d*.9+w*d*1.4+w*.25,0.,1.);
 float rc=length((uv-vec2(0.,.08))*vec2(1.,.8));
 den*=1.-.9*C*(1.-smoothstep(.12+.2*C,.5+.25*C,rc));
 float lit=clamp((f1-smoke(su+vec2(-.035,.035),0.,1.))*6.+.55,0.,1.);
 vec3 bg=mix(vec3(.045,.008,.04),vec3(.19,.04,.165),smoothstep(-.9,.9,uv.y+.25*uv.x));
 vec3 sc=mix(vec3(.38,.08,.36),vec3(.66,.24,.86),lit);
 sc=mix(sc,vec3(.81,.69,.91),pow(lit,3.)*smoothstep(.5,1.,den)*(.8+.6*P));
 vec3 col=mix(bg,sc,den*(.9+.1*P))*(1.+.35*P);
 col+=vec3(.6,.3,.9)*(.06+.10*P)*exp(-2.5*length(uv-vec2(0.,-.35)));
 col+=vec3(.55,.3,.85)*.22*C*exp(-3.5*rc);
 col*=1.-.3*pow(length(uv*vec2(1.3,.9)),2.2);
 col+=(h(vec3(gl_FragCoord.xy,T*60.))-.5)*.018;
 gl_FragColor=vec4(max(col,0.),1.);}\`;
function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; }
const pr = gl.createProgram();
gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const u = (k) => gl.getUniformLocation(pr, k), buf = new Uint8Array(${SW * SH * 4});
window.frame = (t, p, seed, c = 0) => {
  gl.uniform2f(u('R'), ${SW}, ${SH}); gl.uniform1f(u('T'), t); gl.uniform1f(u('P'), p); gl.uniform1f(u('S'), seed); gl.uniform1f(u('C'), c);
  gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, ${SW}, ${SH}, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
};
</script></body></html>`;
}

const seedOf = (id) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) / 10;

async function renderSmoke(browser, v, beats, out, dur, clear) {
  const p = await browser.newPage();
  await p.setContent(smokePage());
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${SW}x${SH}`,
    '-r', String(FPS), '-i', '-', '-vf', 'vflip', '-c:v', 'libx264', '-crf', '8', '-preset', 'fast', '-pix_fmt', 'yuv444p', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, bad) => ff.on('close', (c) => (c ? bad(new Error('ffmpeg exited ' + c)) : ok())));
  done.catch(() => {}); // awaited below; this only stops an early exit from being "unhandled"
  ff.stdin.on('error', () => {}); // EPIPE after an early exit surfaces through `done`
  for (let f = 0; f < FPS * dur; f++) {
    const t = f / FPS;
    const px = await p.evaluate(([t, k, s, c]) => frame(t, k, s, c), [t, pulse(beats, t), seedOf(v.id), clear(t)]);
    if (!ff.stdin.write(Buffer.from(px, 'base64'))) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), done]);
  }
  ff.stdin.end();
  await done;
  await p.close();
}

async function render(browser, v, allBeats) {
  const tmp = path.join(OUT, '.frames-' + v.id);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const start = v.musicStart ?? 0;
  const dur = v.dur ?? DUR;
  const beats = clipBeats(allBeats, start, dur);
  const story = v.template === 'story';
  const smoke = path.join(tmp, 'smoke.mp4');
  await renderSmoke(browser, v, beats, smoke, dur, story ? storyClear(beats) : () => 0);
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.setContent(story ? storyPage(v, beats, dur) : page(v, beats, dur));
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  for (let f = 0; f < FPS * dur; f++) {
    const ms = (f * 1000) / FPS;
    await p.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), ms);
    await p.screenshot({ path: path.join(tmp, String(f).padStart(4, '0') + '.png'), omitBackground: true });
  }
  await p.close();
  const mp4 = path.join(OUT, v.id + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', smoke, '-framerate', String(FPS), '-i', path.join(tmp, '%04d.png'),
    '-ss', String(start), '-i', MUSIC,
    '-filter_complex', `[0:v]scale=${W}:${H}:flags=lanczos[bg];[bg][1:v]overlay=format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-map', '2:a', '-t', String(dur), '-af', `afade=t=in:d=0.3,afade=t=out:st=${dur - 0.8}:d=0.8`,
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', '-shortest', mp4]);
  await rm(tmp, { recursive: true, force: true });
  console.log('✓', path.relative(ROOT, mp4));
}

async function main() {
  const { videos } = JSON.parse(await readFile(path.join(ROOT, 'social/videos.json'), 'utf8'));
  const { beats } = JSON.parse(await readFile(path.join(ROOT, 'assets/brand/smoke-theme.beats.json'), 'utf8'));
  const only = process.argv[2];
  await mkdir(OUT, { recursive: true });
  const todo = [];
  for (const v of videos) {
    if (only ? v.id !== only : await access(path.join(OUT, v.id + '.mp4')).then(() => true, () => false)) continue;
    todo.push(v);
  }
  if (!todo.length) return console.log('Nothing to render.');
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const queue = [...todo];
  const worker = async () => { while (queue.length) await render(browser, queue.shift(), beats); };
  try { await Promise.all([worker(), worker(), worker()]); } finally { await browser.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
