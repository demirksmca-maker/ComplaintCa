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
  if (a < 0 || b <= a) return { say: '', go: null, fill: [], click: null, ask: s.trim().slice(0, 500) || 'Cevap anlaşılmadı.', done: false };
  let o;
  try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { say: '', go: null, fill: [], click: null, ask: 'Cevap anlaşılmadı, tekrar dener misin?', done: false }; }
  return {
    say: typeof o.say === 'string' ? o.say : '',
    go: typeof o.go === 'string' && /^https:\/\//i.test(o.go) ? o.go : null,
    fill: Array.isArray(o.fill) ? o.fill.filter(x => x && typeof x.id === 'string' && x.value != null).map(x => ({ id: x.id, value: String(x.value) })) : [],
    click: typeof o.click === 'string' && o.click ? o.click : null,
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
