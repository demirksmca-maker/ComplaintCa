// Dias Ajan widget for the Dias Panel (shield.html > Ajanlar). The owner writes
// a task; /api/agent starts a Chrome in a Vercel Sandbox (cloud-agent/server.mjs)
// and this widget shows it live: tap = click there, type, scroll, stop. The
// agent fills fields only; the final send/sign-up tap is the owner's.
// Mount: <div id="diasAjan"></div> + <script src="/assets/dias-ajan.js" defer></script>
(function () {
  var root = document.getElementById('diasAjan');
  if (!root) return;
  var LOG_KEY = 'diasAjanLog', CLOUD_KEY = 'diasCloud';
  var css = '' +
    '.dj{display:flex;flex-direction:column;gap:8px}' +
    '.dj textarea{width:100%;min-height:84px;resize:vertical;background:transparent;border:1px solid var(--line);border-radius:12px;color:var(--ink);font:inherit;font-size:.95rem;padding:10px}' +
    '.dj textarea:focus{outline:0;border-color:var(--edge)}' +
    '.dj-row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}' +
    '.dj-row small{color:var(--mute);font-size:.72rem}' +
    '.dj-go{background:linear-gradient(135deg,#3ddc97,#2bb47a);color:#08291b;font-weight:700;padding:10px 16px;border-radius:10px;white-space:nowrap}' +
    '.dj-go:disabled{opacity:.45}' +
    '.dj-log{display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow-y:auto}' +
    '.dj-log:empty{display:none}' +
    '.dj-m{font-size:.85rem;padding:7px 10px;border-radius:10px;white-space:pre-wrap;word-wrap:break-word;max-width:92%}' +
    '.dj-m.me{align-self:flex-end;background:#2a1838;border:1px solid var(--edge)}' +
    '.dj-m.bot{align-self:flex-start;border:1px solid #2bb47a}' +
    '.dj-m.ask,.dj-m.secret{border-color:#e7b955}.dj-m.secret{background:#2a2108;user-select:all}.dj-m.error{border-color:var(--bad)}' +
    '.dj-live{display:flex;flex-direction:column;gap:6px}.dj-live[hidden]{display:none}' +
    '.dj-head{display:flex;justify-content:space-between;gap:8px;font-size:.74rem;color:var(--mute)}.dj-head b{color:#ff6b6e}' +
    '.dj-view{position:relative;height:min(58vh,560px);display:flex;justify-content:center;background:#0b0710;border-radius:10px;overflow:hidden}' +
    '.dj-view img{height:100%;width:auto;max-width:100%;object-fit:contain;cursor:pointer;touch-action:manipulation}' +
    '.dj-wait{position:absolute;inset:0;display:grid;place-items:center;color:var(--mute);font-size:.85rem;text-align:center;padding:16px}.dj-wait[hidden]{display:none}' +
    '.dj-tools{display:flex;gap:6px}' +
    '.dj-tools input{flex:1;min-width:0;background:transparent;border:1px solid var(--line);border-radius:10px;color:var(--ink);font:inherit;font-size:.85rem;padding:7px 9px}' +
    '.dj-tools button{background:#1a1426;border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:.8rem;color:var(--ink)}' +
    '.dj-tools .kill{border-color:var(--bad);color:var(--bad);font-weight:700}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  root.innerHTML = '<div class="dj">' +
    '<div class="dj-live" id="djLive" hidden>' +
      '<div class="dj-head"><span><b>● CANLI</b> · <span id="djUrl">bulut Chrome</span></span><span id="djLeft"></span></div>' +
      '<div class="dj-view"><img id="djShot" alt="Bulut tarayıcının ekranı; dokunduğun yere tıklanır"><div class="dj-wait" id="djWait">☁️ Bulut Chrome açılıyor…</div></div>' +
      '<div class="dj-tools"><input id="djType" placeholder="Sayfaya yaz (dokunduğun kutuya)" autocomplete="off" aria-label="Sayfaya yaz">' +
        '<button type="button" data-key="Enter" aria-label="Enter">↵</button><button type="button" data-key="Backspace" aria-label="Sil">⌫</button>' +
        '<button type="button" data-dy="-500" aria-label="Yukarı">▲</button><button type="button" data-dy="500" aria-label="Aşağı">▼</button>' +
        '<button type="button" class="kill" id="djStop">■ Dur</button></div>' +
    '</div>' +
    '<div class="dj-log" id="djLog" aria-live="polite"></div>' +
    '<textarea id="djText" placeholder="Ajana işi yaz. Örn: https://www.ccts-cprst.ca/ şikayet formunu doldur, Rogers internetim 3 gündür yok." aria-label="Ajana iş"></textarea>' +
    '<div class="dj-row"><small>Ajan kutuları doldurur, son tuşa sen basarsın.</small><button type="button" class="dj-go" id="djGo" disabled>☁️ Bulutta yap</button></div>' +
  '</div>';

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function keep(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function shieldKey() { try { return localStorage.getItem('shieldKey') || ''; } catch (e) { return ''; } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var log = load(LOG_KEY) || [], cloud = null, busy = false, asking = false, evGen = 0, shotGen = 0;
  // Generated passwords (secret) are shown but never written to storage.
  function saveLog() { keep(LOG_KEY, log.filter(function (m) { return m.k !== 'secret'; }).slice(-40)); }
  function render() {
    $('djLog').innerHTML = log.slice(-40).map(function (m) { return '<div class="dj-m ' + (m.k === 'me' ? 'me' : 'bot ' + m.k) + '">' + esc(m.t) + '</div>'; }).join('');
    $('djLog').scrollTop = $('djLog').scrollHeight;
  }
  function say(k, t) {
    asking = k === 'ask';
    log.push({ k: k, t: (k === 'me' ? '' : k === 'secret' ? '🔑 ' : '🤖 ') + t });
    saveLog(); render(); label();
  }
  function label() { $('djGo').textContent = asking ? '🤖 Ajana cevap ver' : cloud ? '☁️ Ajana yaz' : '☁️ Bulutta yap'; }
  function sync() { $('djGo').disabled = !$('djText').value.trim() || busy; }

  function call(path, body) {
    return fetch(cloud.url + path + '?k=' + cloud.token, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || r.status); return d; }); });
  }
  function showLive(on) {
    $('djLive').hidden = !on;
    if (!on) { $('djShot').removeAttribute('src'); $('djWait').hidden = false; }
  }
  async function start(task) {
    var key = shieldKey();
    if (!key) return say('error', 'Önce panele anahtarınla giriş yap.');
    busy = true; sync(); showLive(true); $('djWait').textContent = '☁️ Bulut Chrome açılıyor… (ilk açılış 1 dakikayı bulabilir)';
    try {
      var r = await fetch('/api/agent', { method: 'POST', headers: { 'x-shield-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'start' }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.error === 'forbidden' ? 'Anahtar yanlış.' : d.error === 'cooldown' ? 'Çok deneme oldu, 10 dk bekle.' : d.error === 'no_oidc' ? 'Vercel OIDC kapalı.' : (d.error || r.status));
      cloud = { id: d.id, url: d.url, token: d.token, expires: Date.now() + (d.ttl || 40 * 60000), since: 0 }; keep(CLOUD_KEY, cloud); label();
      var c = cloud, up = false;
      for (var i = 0; i < 75 && !up && cloud === c; i++) {
        try { up = (await fetch(c.url + '/health', { cache: 'no-store' })).ok; } catch (e) { /* booting */ }
        if (!up) await wait(2000);
      }
      if (cloud !== c) { busy = false; sync(); return; } // Dur pressed while booting
      if (!up) throw new Error('Bulut Chrome açılmadı, tekrar dene.');
      await call('/start', { task: task });
      pollEvents(); pollShot();
    } catch (e) {
      say('error', 'Bulut açılamadı: ' + e.message);
      stop(true);
    }
    busy = false; sync();
  }
  async function stop(quiet) {
    var c = cloud; cloud = null; asking = false; keep(CLOUD_KEY, null); showLive(false); label();
    if (!c) return;
    try { await fetch(c.url + '/stop?k=' + c.token, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); } catch (e) { /* gone */ }
    try { await fetch('/api/agent', { method: 'POST', headers: { 'x-shield-key': shieldKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'stop', id: c.id }) }); } catch (e) { /* times out itself */ }
    if (!quiet) say('done', 'Bulut Chrome kapandı.');
  }
  async function pollEvents() {
    var gen = ++evGen;
    while (cloud && gen === evGen) {
      var c = cloud;
      try {
        var r = await fetch(c.url + '/events?k=' + c.token + '&since=' + c.since, { cache: 'no-store' });
        if (r.ok) {
          var d = await r.json();
          (d.events || []).forEach(function (ev) { c.since = Math.max(c.since, ev.n); say(ev.type, ev.text); });
          if (d.url) $('djUrl').textContent = d.url.replace(/^https?:\/\//, '').slice(0, 40);
          keep(CLOUD_KEY, c);
        }
      } catch (e) { /* blip */ }
      var left = Math.round((c.expires - Date.now()) / 60000);
      $('djLeft').textContent = left > 0 ? left + ' dk kaldı' : '';
      if (left <= 0) { say('done', 'Süre doldu, bulut Chrome kapandı.'); stop(true); break; }
      await wait(1500);
    }
  }
  function pollShot() {
    var img = $('djShot'), gen = ++shotGen;
    function next() {
      if (!cloud || gen !== shotGen) return;
      if (document.hidden || root.offsetParent === null) return setTimeout(next, 1500); // tab hidden or another section open
      img.src = cloud.url + '/shot?k=' + cloud.token + '&t=' + Date.now();
    }
    img.onload = function () { $('djWait').hidden = true; setTimeout(next, 700); };
    img.onerror = function () { setTimeout(next, 1500); };
    next();
  }
  $('djShot').addEventListener('click', function (e) {
    if (!cloud) return;
    // object-fit: contain can letterbox the picture inside the box.
    var r = this.getBoundingClientRect(), nw = this.naturalWidth || r.width, nh = this.naturalHeight || r.height;
    var k = Math.min(r.width / nw, r.height / nh), w = nw * k, h = nh * k;
    var x = (e.clientX - r.left - (r.width - w) / 2) / w, y = (e.clientY - r.top - (r.height - h) / 2) / h;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) call('/tap', { x: x, y: y }).catch(function () {});
  });
  $('djType').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !cloud) return;
    e.preventDefault();
    var t = this.value; this.value = '';
    if (t) call('/type', { text: t }).catch(function () {});
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-key],[data-dy]'), function (b) {
    b.addEventListener('click', function () {
      if (!cloud) return;
      if (b.dataset.key) {
        var t = $('djType').value; $('djType').value = '';
        (t ? call('/type', { text: t }) : Promise.resolve()).then(function () { return call('/type', { key: b.dataset.key }); }).catch(function () {});
      } else call('/scroll', { dy: Number(b.dataset.dy) }).catch(function () {});
    });
  });
  $('djStop').addEventListener('click', function () { stop(); });
  $('djText').addEventListener('input', sync);
  $('djGo').addEventListener('click', function () {
    var text = $('djText').value.trim();
    if (!text || busy) return;
    var wasCloud = !!cloud;
    say('me', text);
    $('djText').value = ''; sync();
    if (wasCloud) call('/reply', { text: text }).then(function (d) { if (d.queued) say('log', 'Not aldım, bu adım bitince bakacağım.'); }).catch(function (e) { say('error', 'Gönderilemedi: ' + e.message); });
    else start(text);
  });

  render();
  // A reload while the cloud Chrome is still running picks it up again.
  var saved = load(CLOUD_KEY);
  if (saved && saved.expires > Date.now()) { cloud = saved; showLive(true); pollEvents(); pollShot(); }
  else keep(CLOUD_KEY, null);
  label(); sync();
})();
