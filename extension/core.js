// Dias Ajan: pure logic shared by the service worker (background.js) and the
// tests (core.test.mjs). No chrome.* calls here.

export const PROXY = 'https://complaintca.ca/api/claude-proxy';
export const MAX_STEPS = 12;

// Buttons the agent never presses: the owner sends, pays or signs in himself.
const FINAL_RE = /\b(submit|send|file (a |my |the )?complaint|confirm|pay|purchase|place order|sign in|log ?in|envoyer|soumettre|confirmer|payer|enviar|confirmar|pagar)\b|gönder|onayla|öde/i;
export function isFinalButton(text) {
  return FINAL_RE.test(String(text || '').trim());
}

// Fields whose value never leaves the page and is never typed by the agent.
const SENSITIVE_RE = /pass(word)?|pwd|card|cvv|cvc|security code|expir|\bsin\b|social insurance|\bpin\b/i;
export function isPasswordField(f) {
  return f.type === 'password' || /new-password|current-password/.test(f.autocomplete || '');
}

export function isSensitive(f) {
  return f.type === 'password' || /^cc-/.test(f.autocomplete || '') ||
    SENSITIVE_RE.test([f.name, f.label, f.autocomplete].join(' '));
}

export const SYSTEM = `Sen "Dias Ajan"sın. complaintca.ca sahibinin kendi Chrome tarayıcısında çalışıyorsun.
Görev: sahibin verdiği işi yapmak için doğru resmi sayfaya gitmek ve formu onun bilgileriyle doldurmak.
Her adımda sana sayfanın özeti gelir (alanlar, butonlar, metin). SADECE tek bir JSON nesnesiyle cevap ver:
{"say":"Türkçe kısa not (1 cümle)","go":"https://... (sadece sayfa değiştirmen gerekiyorsa)","fill":[{"id":"d3","value":"..."}],"click":"d7 veya null","ask":"sahibine soru veya null","done":false}
Kurallar:
- Bilmediğin bilgiyi UYDURMA (ad, hesap no, tarih, adres). Eksikse "ask" ile sor ve o alanı boş bırak.
- "go" ile sadece resmi kurum/şirket sitelerine git (CCTS, CRTC, OBSI, ADRBO, CTA, Competition Bureau, şirketin kendi sitesi). Emin değilsen sor.
- Final gönderme, ödeme, giriş (login) butonlarına ASLA basma. Form hazır olunca "done":true yap ve "say" ile kontrol etmesini söyle.
- "click" sadece İleri/Next/Continue, çerez kabul, sekme açma gibi ara adımlar için.
- Şifre, kart, SIN alanlarına dokunma.
- Şikayet metnini kısa, net, kibar yaz; sayfanın dilinde (İngilizce/Fransızca).`;

// Cloud agent (cloud-agent/server.mjs): runs in a Chrome on a Vercel Sandbox,
// watched live from the owner's phone. It may fill password fields, but only
// with a password the server generates, and it may read the owner's mail.
export const SYSTEM_CLOUD = `Sen "Dias Ajan"sın. complaintca.ca sahibi için bulutta bir Chrome'u yönetiyorsun; sahibi seni telefonundan canlı izliyor.
Görev: sahibin verdiği işi yapmak için doğru sayfaya gitmek ve formu onun bilgileriyle doldurmak (şikayet, kayıt, başvuru).
Her adımda sana sayfanın özeti gelir (alanlar, butonlar, metin). SADECE tek bir JSON nesnesiyle cevap ver:
{"say":"Türkçe kısa not (1 cümle)","go":"https://... veya null","fill":[{"id":"d3","value":"..."}],"password":["d5","d6"],"mail":"gmail arama sorgusu veya null","click":"d7 veya null","ask":"sahibine soru veya null","done":false}
Kurallar:
- Bilmediğin bilgiyi UYDURMA (ad, hesap no, tarih, adres, telefon). Eksikse "ask" ile sor, o alanı boş bırak.
- "go" ile sahibin söylediği siteye veya resmi kurum sitesine git. Linki bilmiyorsan sor.
- Şifre alanlarını "fill" ile ASLA doldurma. Şifre gerekiyorsa o alanların id'lerini "password" listesine yaz; sistem güçlü bir şifre üretip yazar ve sahibine gösterir (şifre tekrarı alanı da aynı listeye).
- Onay maili, doğrulama kodu gerekiyorsa "mail" ile ara (ör. "from:adsterra subject:confirm"). Sonuç sonraki adımda gelir; içindeki linke "go" ile git veya kodu "fill" ile yaz.
- Final gönderme, kayıt ol, ödeme butonlarına ASLA basma ("click" verme). Form hazır olunca "done":true yap; sahibi canlı ekrandan kendisi basar.
- "click" sadece İleri/Next/Continue, çerez kabul, sekme açma gibi ara adımlar için.
- Kart, banka, SIN alanlarına dokunma. CAPTCHA çıkarsa "ask" ile sahibinden canlı ekranda çözmesini iste.
- Metinleri kısa, net, kibar yaz; sayfanın dilinde.`;

// A strong random password: 18 chars with upper, lower, digit and symbol.
export function makePassword(rand = n => crypto.getRandomValues(new Uint32Array(n))) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_+?'];
  const all = sets.join('');
  const r = rand(18);
  const out = Array.from(r, (v, i) => (i < 4 ? sets[i] : all)[v % (i < 4 ? sets[i] : all).length]);
  // Move the four guaranteed characters to random places.
  const s = rand(18);
  for (let i = out.length - 1; i > 0; i--) { const j = s[i] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

// "site" = the last two labels of the host (ccts-cprst.ca, adsterra.com).
export function siteOf(u) {
  try { return new URL(u).hostname.toLowerCase().split('.').slice(-2).join('.'); } catch (e) { return ''; }
}
export function linkSites(messages) {
  const out = new Set();
  for (const m of messages || []) for (const l of m.links || []) { const s = siteOf(l); if (s) out.add(s); }
  return [...out];
}

export function userTurn(task, page, note) {
  const parts = [];
  if (task) parts.push('GÖREV: ' + task);
  if (note) parts.push('SAHİBİN NOTU: ' + note);
  parts.push(page ? 'SAYFA:\n' + JSON.stringify(page) : 'SAYFA: henüz açık sayfa yok. Önce "go" ile doğru adrese git.');
  return parts.join('\n\n');
}

// Pulls the JSON object out of the model's answer; tolerant of ```json fences
// and stray text around it.
export function parseReply(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  // Plain text instead of JSON: treat it as a question to the owner.
  if (a < 0 || b <= a) return { say: '', go: null, fill: [], click: null, password: [], mail: null, ask: s.trim().slice(0, 500) || 'Cevap anlaşılmadı.', done: false };
  let o;
  try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { say: '', go: null, fill: [], click: null, password: [], mail: null, ask: 'Cevap anlaşılmadı, tekrar dener misin?', done: false }; }
  return {
    say: typeof o.say === 'string' ? o.say : '',
    go: typeof o.go === 'string' && /^https:\/\//i.test(o.go) ? o.go : null,
    fill: Array.isArray(o.fill) ? o.fill.filter(x => x && typeof x.id === 'string' && x.value != null).map(x => ({ id: x.id, value: String(x.value) })) : [],
    click: typeof o.click === 'string' && o.click ? o.click : null,
    password: Array.isArray(o.password) ? o.password.filter(x => typeof x === 'string').slice(0, 4) : [],
    mail: typeof o.mail === 'string' && o.mail.trim() ? o.mail.trim().slice(0, 200) : null,
    ask: typeof o.ask === 'string' && o.ask.trim() ? o.ask.trim() : null,
    done: o.done === true
  };
}

// Model history is kept short: the newest page snapshot matters, old ones
// only cost tokens. Keeps the first turn (task) and the last `keep` turns.
export function trimHistory(turns, keep = 8) {
  if (turns.length <= keep + 1) return turns;
  let rest = turns.slice(-keep);
  if (rest[0].role !== 'user') rest = rest.slice(1);
  return [turns[0], { role: 'assistant', content: '{"say":"(önceki adımlar kısaltıldı)","done":false}' }, ...rest];
}

// --- Functions run inside the form page (chrome.scripting / page.evaluate):
// they must stay self-contained, no references to this module. ---
export function readPage() {
  window.__diasN = window.__diasN || 0;
  const tag = el => el.dataset.diasId || (el.dataset.diasId = 'd' + (++window.__diasN));
  const shown = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const labelOf = el => clean((el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') ||
    el.placeholder || (el.closest('label') && el.closest('label').innerText) || el.title || el.name || el.id);
  const fields = [], buttons = [];
  document.querySelectorAll('input, select, textarea').forEach(el => {
    const type = (el.type || el.tagName).toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type) || !shown(el) || el.disabled) return;
    const f = { id: tag(el), type, label: labelOf(el), name: el.name || '', autocomplete: el.autocomplete || '', required: el.required };
    if (type === 'checkbox' || type === 'radio') f.checked = el.checked;
    else if (el.tagName === 'SELECT') { f.value = el.value; f.options = [...el.options].slice(0, 40).map(o => clean(o.text)); }
    else f.value = String(el.value || '').slice(0, 300);
    fields.push(f);
  });
  document.querySelectorAll('button, input[type=submit], input[type=button], [role=button], a.btn, a.button').forEach(el => {
    if (!shown(el) || el.disabled) return;
    const text = clean(el.innerText || el.value || el.getAttribute('aria-label'));
    if (text) buttons.push({ id: tag(el), text });
  });
  return { url: location.href, title: document.title, fields: fields.slice(0, 80), buttons: buttons.slice(0, 40),
    text: String(document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 3500) };
}

export function fillFields(list) {
  const out = [];
  for (const { id, value } of list) {
    const el = document.querySelector('[data-dias-id="' + id + '"]');
    if (!el) { out.push(id + ': yok'); continue; }
    const type = (el.type || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      const want = !/^(false|0|no|hayır|)$/i.test(value.trim());
      if (el.checked !== want) el.click();
    } else if (el.tagName === 'SELECT') {
      const v = value.toLowerCase();
      const opt = [...el.options].find(o => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v) ||
        [...el.options].find(o => o.text.toLowerCase().includes(v));
      if (!opt) { out.push(id + ': seçenek yok'); continue; }
      el.value = opt.value;
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      // The native setter, so React/Vue forms see the change too.
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.outline = '2px solid #3ddc97';
  }
  return out;
}

export function clickEl(id) {
  const el = document.querySelector('[data-dias-id="' + id + '"]');
  if (el) el.click();
  return !!el;
}
