// Dias Ajan — Gmail okuyucu (Google Apps Script web app).
// Ajan onay maillerini ve doğrulama kodlarını buradan okur. Sadece okur,
// mail göndermez, silmez. Sadece son 2 günün en fazla 5 mailini verir.
//
// Kurulum (bir kere):
// 1. script.google.com > Yeni proje > bu kodu yapıştır.
// 2. Proje ayarları > Script özellikleri > KEY = uzun rastgele bir şifre.
// 3. Dağıt > Yeni dağıtım > Web uygulaması: "Ben olarak çalıştır", erişim "Herkes".
// 4. Çıkan URL'yi ve KEY'i Vercel'e AGENT_MAIL_URL ve AGENT_MAIL_KEY olarak ekle.
function doGet(e) {
  var p = (e && e.parameter) || {};
  var key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || p.key !== key) return out({ ok: false, error: 'forbidden' });
  var q = String(p.q || '').slice(0, 200);
  if (!q) return out({ ok: false, error: 'q' });
  var threads = GmailApp.search(q + ' newer_than:2d', 0, 5);
  var messages = [];
  threads.forEach(function (t) {
    var m = t.getMessages().pop();
    var body = m.getPlainBody() || '';
    var links = (m.getBody().match(/https:\/\/[^"'<>\s]+/g) || []).filter(function (u) { return !/\.(png|jpe?g|gif|css)(\?|$)/i.test(u); }).slice(0, 15);
    messages.push({ from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(), text: body.slice(0, 1500), links: links });
  });
  return out({ ok: true, messages: messages });
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
