// Dias Ajan service worker. The Dias Claude panel (/dias-claude.html) talks to
// it through bridge.js. It opens the form in a tab of the owner's own Chrome,
// reads the page, asks Claude (through /api/claude-proxy) what to type, fills
// the fields and stops before the final send: the owner presses it himself.
import { PROXY, MAX_STEPS, SYSTEM, userTurn, parseReply, trimHistory, isFinalButton, isSensitive, readPage, fillFields, clickEl } from './core.js';

const ports = new Set();
let running = false, stopped = false;

function tell(type, text) {
  for (const p of ports) { try { p.postMessage({ type, text }); } catch (e) { ports.delete(p); } }
}

// The job survives the worker going to sleep while it waits for the owner.
async function getJob() { return (await chrome.storage.session.get('job')).job || null; }
async function setJob(job) { await chrome.storage.session.set({ job }); }


async function inPage(tabId, func, args = []) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r ? r.result : null;
}

function loaded(tabId, ms = 20000) {
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(on); setTimeout(resolve, 800); };
    const on = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') done(); }, done);
  });
}

async function askClaude(turns) {
  const r = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 1500, temperature: 0, system: SYSTEM, messages: turns })
  });
  if (r.status === 429) throw new Error('Claude meşgul, bir dakika sonra "devam" yaz.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && (d.error.message || d.error)) || 'Claude cevap vermedi (' + r.status + ')');
  return (d.content || []).map(c => c.text || '').join('');
}

async function snapshot(job) {
  if (!job.tabId) return null;
  try { await chrome.tabs.get(job.tabId); } catch (e) { job.tabId = null; return null; }
  const page = await inPage(job.tabId, readPage);
  if (!page) return null;
  job.sensitive = page.fields.filter(isSensitive).map(f => f.id);
  page.fields.forEach(f => { if (isSensitive(f)) { f.value = '(gizli, dokunma)'; f.sensitive = true; } });
  job.buttons = Object.fromEntries(page.buttons.map(b => [b.id, b.text]));
  return page;
}

async function run(note) {
  if (running) return tell('log', 'Zaten çalışıyorum, bekle.');
  const job = await getJob();
  if (!job) return tell('error', 'Görev yok. Önce bir iş ver.');
  running = true; stopped = false;
  try {
    for (let step = 0; step < MAX_STEPS && !stopped; step++) {
      const page = await snapshot(job);
      job.turns.push({ role: 'user', content: userTurn(step === 0 && !note ? job.task : '', page, step === 0 ? note : '') });
      job.turns = trimHistory(job.turns);
      const text = await askClaude(job.turns);
      job.turns.push({ role: 'assistant', content: text });
      const a = parseReply(text);
      if (a.say) tell('log', a.say);

      if (a.go) {
        if (job.tabId) await chrome.tabs.update(job.tabId, { url: a.go, active: true });
        else job.tabId = (await chrome.tabs.create({ url: a.go, active: true })).id;
        await setJob(job);
        await loaded(job.tabId);
        continue;
      }
      if (!job.tabId) { tell('ask', a.ask || 'Hangi sayfada çalışayım? Linki yaz.'); break; }

      const fill = a.fill.filter(f => !job.sensitive.includes(f.id));
      if (fill.length) {
        const miss = await inPage(job.tabId, fillFields, [fill]);
        tell('log', fill.length + ' alan dolduruldu.' + (miss && miss.length ? ' Sorun: ' + miss.join(', ') : ''));
      }
      if (a.ask) { tell('ask', a.ask); break; }
      if (a.done) { tell('done', 'Form hazır. Sekmeye bak, kontrol et, Gönder\'e sen bas. ✅'); break; }
      if (a.click) {
        const label = job.buttons[a.click] || '';
        if (isFinalButton(label)) { tell('done', '"' + label + '" butonuna ben basmam. Kontrol et, sen bas. ✅'); break; }
        await inPage(job.tabId, clickEl, [a.click]);
        await setJob(job);
        await loaded(job.tabId, 6000);
        continue;
      }
      if (!fill.length) { tell('ask', 'Ne yapacağımı bilemedim. Biraz daha anlatır mısın?'); break; }
      if (step === MAX_STEPS - 1) tell('ask', 'Çok adım oldu, durdum. "devam" yazarsan sürdürürüm.');
    }
  } catch (e) {
    // A failed call leaves a user turn without an answer; drop it so the
    // next try keeps the user/assistant order the API needs.
    if (job.turns.length && job.turns.at(-1).role === 'user') job.turns.pop();
    tell('error', 'Hata: ' + (e && e.message || e));
  } finally {
    running = false;
    if (!stopped) await setJob(job);
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'dias-panel') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  const hello = () => port.postMessage({ type: 'hello', text: chrome.runtime.getManifest().version });
  hello();
  port.onMessage.addListener(async msg => {
    if (!msg || typeof msg !== 'object') return;
    // The panel asks once its script is ready (it can miss the first hello).
    if (msg.type === 'ping') return hello();
    if (msg.type === 'start' && typeof msg.task === 'string' && msg.task.trim()) {
      if (running) return tell('log', 'Zaten çalışıyorum. Önce durdur.');
      const url = (msg.task.match(/https:\/\/[^\s<>"')]+/i) || [])[0];
      const job = { task: msg.task.trim().slice(0, 4000), turns: [], tabId: null, sensitive: [], buttons: {} };
      if (url) {
        job.tabId = (await chrome.tabs.create({ url, active: true })).id;
        await setJob(job);
        await loaded(job.tabId);
      } else await setJob(job);
      tell('log', 'Başladım.');
      run('');
    } else if (msg.type === 'reply' && typeof msg.text === 'string' && msg.text.trim()) {
      run(msg.text.trim().slice(0, 2000));
    } else if (msg.type === 'stop') {
      stopped = true;
      await chrome.storage.session.remove('job');
      tell('done', 'Ajan durdu.');
    }
  });
});
