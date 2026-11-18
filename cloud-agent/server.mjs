// Dias Ajan in the cloud: runs inside a Vercel Sandbox started by
// /api/agent (api/_agent.js). One Chrome, one job. The owner's phone (Dias
// Claude panel) talks to this server directly:
//   GET  /health                 → { ok, busy }
//   GET  /shot?k=                → JPEG of the page now (live view, ~1/s)
//   GET  /events?k=&since=n      → { events: [{ n, type, text, t }] }
//   POST /start  {task}          → begin a job
//   POST /reply  {text}          → answer the agent's question / "devam"
//   POST /tap    {x, y}          → owner taps the live view (0..1 of width/height)
//   POST /type   {text} | {key}  → owner types into the focused field
//   POST /stop                   → end the job
// Every call carries the per-sandbox token (?k=) the panel got from /api/agent.
// The agent fills fields only; final send/sign-up buttons are the owner's.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { PROXY, MAX_STEPS, SYSTEM_CLOUD, userTurn, parseReply, trimHistory, isFinalButton,
  isSensitive, isPasswordField, makePassword, readPage, fillFields, clickEl, siteOf, linkSites } from '../extension/core.js';

const TOKEN = process.env.AGENT_TOKEN || '';
const CLAUDE = process.env.AGENT_PROXY || PROXY; // tests point this at a mock
const PORT = Number(process.env.PORT || 3000);
const ORIGINS = ['https://complaintca.ca', 'https://www.complaintca.ca'];
const VIEW = { width: 390, height: 760 };
const IDLE_MS = 10 * 60 * 1000;

let browser = null, page = null, job = null, running = false, stopped = false, starting = false;
let events = [], seq = 0, lastSeen = Date.now(), lastShot = null, shotAt = 0;

function tell(type, text) {
  events.push({ n: ++seq, type, text: String(text).slice(0, 2000), t: Date.now() });
  if (events.length > 200) events = events.slice(-200);
}

async function launch() {
  if (page) return page;
  let pw, opts = { headless: true };
  // Sandbox: playwright-core + @sparticuz/chromium. Local test: the global Playwright (NODE_PATH, so require).
  try { pw = (await import('playwright-core')).chromium; } catch (e) { pw = createRequire(import.meta.url)('playwright').chromium; }
  try {
    const sc = (await import('@sparticuz/chromium')).default;
    opts = { ...opts, executablePath: await sc.executablePath(), args: [...sc.args, '--disable-blink-features=AutomationControlled'] };
  } catch (e) { /* local test: Playwright's own Chromium */ }
  browser = await pw.launch(opts);
  const ctx = await browser.newContext({ viewport: VIEW, ignoreHTTPSErrors: !!process.env.AGENT_DEV, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-CA',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' });
  page = await ctx.newPage();
  // A link that opens a new tab: follow it in the same view.
  ctx.on('page', async p => { const prev = page; page = p; try { await p.waitForLoadState('domcontentloaded', { timeout: 15000 }); } catch (e) {} if (prev !== p) prev.close().catch(() => {}); });
  return page;
}

async function settle(ms = 15000) {
  try { await page.waitForLoadState('domcontentloaded', { timeout: ms }); } catch (e) {}
  await page.waitForTimeout(900);
}

async function snapshot(job) {
  if (!page || page.url() === 'about:blank') return null;
  const p = await page.evaluate(readPage).catch(() => null);
  if (!p) return null;
  job.sites.add(siteOf(p.url));
  job.sensitive = p.fields.filter(f => isSensitive(f) && !isPasswordField(f)).map(f => f.id);
  job.pwFields = p.fields.filter(isPasswordField).map(f => f.id);
  p.fields.forEach(f => { if (isSensitive(f)) { f.value = isPasswordField(f) ? (f.value ? '(dolu)' : '') : '(gizli, dokunma)'; f.sensitive = true; } });
  job.buttons = Object.fromEntries(p.buttons.map(b => [b.id, b.text]));
  return p;
}

async function askClaude(turns) {
  const r = await fetch(CLAUDE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 1500, temperature: 0, system: SYSTEM_CLOUD, messages: turns })
  });
  if (r.status === 429) throw new Error('Claude meşgul, bir dakika sonra "devam" yaz.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && (d.error.message || d.error)) || 'Claude cevap vermedi (' + r.status + ')');
  return (d.content || []).map(c => c.text || '').join('');
}

// The owner's Gmail, through the Apps Script web app in cloud-agent/gmail.gs.
async function readMail(q) {
  const said = text => ({ text, sites: [] });
  if (!process.env.MAIL_URL || !process.env.MAIL_KEY) return said('MAİL: bağlantı kurulu değil.');
  try {
    const u = process.env.MAIL_URL + '?key=' + encodeURIComponent(process.env.MAIL_KEY) + '&q=' + encodeURIComponent(q);
    const r = await fetch(u, { redirect: 'follow' });
    const d = await r.json();
    if (!d.ok) return said('MAİL: okunamadı (' + (d.error || r.status) + ')');
    if (!d.messages.length) return said('MAİL: "' + q + '" için mail yok (henüz gelmemiş olabilir).');
    return { text: 'MAİL SONUCU:\n' + JSON.stringify(d.messages).slice(0, 6000), sites: linkSites(d.messages) };
  } catch (e) { return said('MAİL: okunamadı (' + e.message + ')'); }
}

async function run(note) {
  if (!job) return;
  if (running) { job.pending = [job.pending, note].filter(Boolean).join('\n'); return; }
  const j = job; // /stop clears `job`; this run keeps its own and quits
  const alive = () => !stopped && job === j;
  running = true;
  let extra = note || '';
  try {
    for (let step = 0; step < MAX_STEPS && alive(); step++) {
      const snap = await snapshot(j);
      if (j.pending) { extra = [extra, j.pending].filter(Boolean).join('\n'); j.pending = ''; }
      j.turns.push({ role: 'user', content: userTurn(j.turns.length ? '' : j.task, snap, extra) });
      extra = '';
      j.turns = trimHistory(j.turns);
      const text = await askClaude(j.turns);
      j.turns.push({ role: 'assistant', content: text });
      if (!alive()) break;
      const a = parseReply(text);
      if (a.say) tell('log', a.say);

      if (a.go) {
        // Once mail has been read, a page could try to make the agent carry a
        // code or link elsewhere: then only sites already in play are allowed.
        if (j.mailRead && !j.sites.has(siteOf(a.go))) { j.offer = a.go; tell('ask', siteOf(a.go) + ' adresine gitmek istiyorum: ' + a.go + '\nGideyim mi? ("evet" yaz)'); break; }
        await page.goto(a.go, { timeout: 30000 }).catch(e => tell('log', 'Sayfa açılamadı: ' + e.message.split('\n')[0]));
        await settle(); continue;
      }
      if (!snap) { tell('ask', a.ask || 'Hangi sayfada çalışayım? Linki yaz.'); break; }

      const fill = a.fill.filter(f => !j.sensitive.includes(f.id) && !j.pwFields.includes(f.id));
      const pw = a.password.filter(id => j.pwFields.includes(id));
      if (pw.length) {
        if (!j.password) {
          j.password = makePassword();
          tell('secret', 'Bu site için şifre: ' + j.password + '\nKaydet (Google Şifre Yöneticisi). Bir daha göstermem.');
        }
        fill.push(...pw.map(id => ({ id, value: j.password })));
      }
      if (fill.length) {
        const miss = await page.evaluate(fillFields, fill).catch(() => []);
        tell('log', fill.length + ' alan dolduruldu.' + (miss && miss.length ? ' Sorun: ' + miss.join(', ') : ''));
      }
      if (a.mail) {
        tell('log', 'Mailine bakıyorum: ' + a.mail);
        const m = await readMail(a.mail);
        j.mailRead = true;
        m.sites.forEach(x => j.sites.add(x));
        extra = m.text; continue;
      }
      if (a.ask) { tell('ask', a.ask); break; }
      if (a.done) { tell('done', 'Kutular doldu ✅ Canlı ekrandan kontrol et, onay tuşuna sen bas.'); break; }
      if (a.click) {
        const label = j.buttons[a.click] || '';
        if (isFinalButton(label)) { tell('done', '"' + label + '" tuşuna ben basmam. Kontrol et, canlı ekrandan sen bas. ✅'); break; }
        await page.evaluate(clickEl, a.click).catch(() => {});
        await settle(6000);
        continue;
      }
      if (!fill.length && !pw.length) { tell('ask', 'Ne yapacağımı bilemedim. Biraz daha anlatır mısın?'); break; }
      if (step === MAX_STEPS - 1) tell('ask', 'Çok adım oldu, durdum. "devam" yazarsan sürdürürüm.');
    }
  } catch (e) {
    if (j.turns.length && j.turns.at(-1).role === 'user') j.turns.pop();
    if (alive()) tell('error', 'Hata: ' + (e && e.message || e));
  } finally {
    running = false;
  }
  // An answer that arrived while the agent was busy: go on with it.
  if (alive() && j.pending) { const n = j.pending; j.pending = ''; run(n); }
}

async function shot() {
  if (!page) return null;
  if (lastShot && Date.now() - shotAt < 500) return lastShot;
  lastShot = await page.screenshot({ type: 'jpeg', quality: 55, scale: 'css', timeout: 5000 }).catch(() => lastShot);
  shotAt = Date.now();
  return lastShot;
}

export function tokenOk(given, want = TOKEN) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(String(want || ''));
  return b.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

function body(req) {
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
  });
}

const KEYS = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Space']);

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  if (ORIGINS.includes(origin) || process.env.AGENT_DEV) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  res.setHeader('Cache-Control', 'no-store');
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (url.pathname === '/health') return json(200, { ok: true, busy: running });
  if (!tokenOk(url.searchParams.get('k'))) return json(403, { error: 'forbidden' });
  lastSeen = Date.now();
  try {
    if (req.method === 'GET' && url.pathname === '/shot') {
      const img = await shot();
      if (!img) { res.writeHead(204); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(img);
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      const since = Number(url.searchParams.get('since') || 0);
      const out = events.filter(e => e.n > since);
      events = events.filter(e => !(e.type === 'secret' && e.n > since)); // a password is handed over once
      return json(200, { events: out, busy: running, url: page ? page.url() : '' });
    }
    if (req.method !== 'POST') return json(405, { error: 'method' });
    const b = await body(req);
    if (url.pathname === '/start') {
      if (running || starting) return json(409, { error: 'busy' });
      const task = String(b.task || '').trim().slice(0, 4000);
      if (!task) return json(400, { error: 'task' });
      starting = true;
      try {
        await launch();
        job = { task, turns: [], sensitive: [], pwFields: [], buttons: {}, password: null, pending: '', mailRead: false, sites: new Set(linkSites([{ links: task.match(/https:\/\/[^\s<>"')]+/gi) || [] }])) };
        const link = (task.match(/https:\/\/[^\s<>"')]+/i) || [])[0];
        stopped = false;
        tell('log', 'Başladım.');
        if (link) { await page.goto(link, { timeout: 30000 }).catch(e => tell('log', 'Sayfa açılamadı: ' + e.message.split('\n')[0])); await settle(); }
      } finally { starting = false; }
      run('');
      return json(200, { ok: true });
    }
    if (url.pathname === '/reply') {
      const text = String(b.text || '').trim().slice(0, 2000);
      if (!job || !text) return json(400, { error: 'nojob' });
      if (job.offer && /^(evet|e|ok|tamam|git|yes)\b/i.test(text)) { job.sites.add(siteOf(job.offer)); }
      job.offer = null;
      const queued = running;
      run(text);
      return json(200, { ok: true, queued });
    }
    if (url.pathname === '/tap') {
      if (!page) return json(400, { error: 'nopage' });
      const x = Math.min(1, Math.max(0, Number(b.x))), y = Math.min(1, Math.max(0, Number(b.y)));
      await page.mouse.click(x * VIEW.width, y * VIEW.height);
      lastShot = null;
      return json(200, { ok: true });
    }
    if (url.pathname === '/type') {
      if (!page) return json(400, { error: 'nopage' });
      if (KEYS.has(b.key)) await page.keyboard.press(b.key === 'Space' ? ' ' : b.key);
      else if (typeof b.text === 'string' && b.text) await page.keyboard.type(b.text.slice(0, 500));
      lastShot = null;
      return json(200, { ok: true });
    }
    if (url.pathname === '/scroll') {
      if (!page) return json(400, { error: 'nopage' });
      await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, Number(b.dy) || 0)));
      lastShot = null;
      return json(200, { ok: true });
    }
    if (url.pathname === '/stop') {
      stopped = true; job = null;
      tell('done', 'Ajan durdu.');
      return json(200, { ok: true });
    }
    return json(404, { error: 'not_found' });
  } catch (e) {
    return json(500, { error: String(e && e.message || e).slice(0, 300) });
  }
});

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  process.on('unhandledRejection', e => console.error('unhandled:', e && e.message));
  server.listen(PORT, () => console.log('dias-ajan on', PORT));
  // Nobody watching for a while: close Chrome and exit (the sandbox also has its own timeout).
  setInterval(() => { if (Date.now() - lastSeen > IDLE_MS) { console.log('idle, exiting'); process.exit(0); } }, 30000).unref();
}
