// Language picker, loaded on every Canada page by /ga-init.js.
// A gold "EN" button opens a framed "Choose Your Language" card (same frame as
// the home page's "How can we help?" card). On the home page the site's own
// languages switch via selectLangDD; everywhere else, and for Tagalog and
// "More languages", the Google Translate website widget does the work.
// The choice follows the visitor from page to page (cc_lang + Google's googtrans cookie).
(function(){
  if (window.ccLangOpen || /^\/es(\/|$)/.test(location.pathname)) return;
  var SITE = [['en','EN','English'],['fr','FR','Français'],['tr','TR','Türkçe'],['zh','ZH','中文'],['es','ES','Español'],['ar','AR','العربية'],['pa','PA','ਪੰਜਾਬੀ']];
  var GT = [['tl','TL','Tagalog']];
  // Site language code <-> Google Translate code
  function toG(c){ return c === 'zh' ? 'zh-CN' : c; }
  function fromG(g){ g = g === 'zh-CN' ? 'zh' : g; return SITE.some(function(l){ return l[0] === g; }) ? g : ''; }
  // Pages with their own translations (the home page app) expose selectLangDD and its menu.
  function isHome(){ return typeof siteSelect === 'function' && !!document.querySelector('.lang-dd-item'); }

  function star(cx, cy, r, f){
    var p = [];
    for (var i = 0; i < 10; i++){ var a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * .4 : r; p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1)); }
    return '<polygon fill="' + f + '" points="' + p.join(' ') + '"/>';
  }
  var LEAF = '<path fill="#d52b1e" transform="translate(135 52) scale(.016)" d="m-90 2030 45-863a95 95 0 0 0-111-98l-859 151 116-320a65 65 0 0 0-20-73l-941-762 212-99a65 65 0 0 0 34-79l-186-572 542 115a65 65 0 0 0 73-38l105-247 423 454a65 65 0 0 0 111-57l-204-1052 327 189a65 65 0 0 0 91-27l332-652 332 652a65 65 0 0 0 91 27l327-189-204 1052a65 65 0 0 0 111 57l423-454 105 247a65 65 0 0 0 73 38l542-115-186 572a65 65 0 0 0 34 79l212 99-941 762a65 65 0 0 0-20 73l116 320-859-151a95 95 0 0 0-111 98l45 863z"/>';
  // 270x100 flag art shown behind the selected language
  var FLAG = {
    en: '<rect width="270" height="100" fill="#c8102e"/><rect x="67" width="136" height="100" fill="#f4f1ee"/>' + LEAF,
    fr: '<rect width="90" height="100" fill="#0a3d91"/><rect x="90" width="90" height="100" fill="#f4f1ee"/><rect x="180" width="90" height="100" fill="#d0202e"/>',
    tr: '<rect width="270" height="100" fill="#d70a17"/><circle cx="205" cy="50" r="24" fill="#fff"/><circle cx="211" cy="50" r="19.3" fill="#d70a17"/>' + star(240, 50, 13, '#fff'),
    zh: '<rect width="270" height="100" fill="#de2910"/>' + star(45, 35, 20, '#ffde00') + star(82, 15, 7, '#ffde00') + star(96, 32, 7, '#ffde00') + star(96, 55, 7, '#ffde00') + star(82, 72, 7, '#ffde00'),
    es: '<rect width="270" height="100" fill="#c60b1e"/><rect y="25" width="270" height="50" fill="#ffc400"/>',
    ar: '<rect width="270" height="100" fill="#0b6b3a"/><path d="M130 72h100" stroke="#f4f1ee" stroke-width="3"/><path d="M230 72l12-4v8z" fill="#f4f1ee"/>',
    pa: '<rect width="270" height="100" fill="#ff9933"/><rect y="33" width="270" height="34" fill="#f4f1ee"/><rect y="67" width="270" height="33" fill="#138808"/><circle cx="225" cy="50" r="13" fill="none" stroke="#000080" stroke-width="2.5"/><circle cx="225" cy="50" r="3" fill="#000080"/>',
    tl: '<rect width="270" height="50" fill="#0038a8"/><rect y="50" width="270" height="50" fill="#ce1126"/><path d="M0 0L87 50 0 100z" fill="#f4f1ee"/><circle cx="29" cy="50" r="10" fill="#fcd116"/>' + star(10, 12, 5, '#fcd116') + star(10, 88, 5, '#fcd116') + star(70, 50, 5, '#fcd116')
  };
  var GOLD = 'linear-gradient(135deg,#7a5418 0%,#f6dc8a 22%,#b8862c 45%,#fff0b8 62%,#9a6a1c 82%,#e9c56a 100%) border-box';
  var GLOBE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><ellipse cx="12" cy="12" rx="4.2" ry="9.5"/><path d="M2.5 12h19M4 7h16M4 17h16"/></svg>';

  function cookieLang(){ var m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^\/;]*\/([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function siteLang(){ var l = 'en'; try { l = localStorage.getItem('cc_lang') || document.documentElement.lang || 'en'; } catch(e){} return l; }
  function gLang(){ var g = cookieLang(); return g && g !== 'en' ? g : ''; }
  function current(){ return gLang() || siteLang(); }
  function clearGoogle(){
    var exp = '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/', h = location.hostname, root = h.split('.').slice(-2).join('.');
    document.cookie = 'googtrans' + exp; document.cookie = 'googtrans' + exp + ';domain=' + h; document.cookie = 'googtrans' + exp + ';domain=.' + root;
  }

  // Google's widget renders a hidden <select> in #cc-gt; we drive it and never move it.
  var gtReady = null, gtInited = false;
  function combo(){ var s = document.querySelector('#cc-gt select.goog-te-combo'); return s && s.options.length > 1 ? s : null; }
  function loadGoogle(){
    if (gtReady) return gtReady;
    gtReady = new Promise(function(res, rej){
      if (combo()) return res(combo());
      var box = document.getElementById('cc-gt');
      if (!box){ box = document.createElement('div'); box.id = 'cc-gt'; document.body.appendChild(box); }
      function wait(){
        var n = 0, t = setInterval(function(){
          var s = combo();
          if (s){ clearInterval(t); res(s); }
          else if (++n > 100){ clearInterval(t); rej(new Error('gt timeout')); }
        }, 100);
      }
      window.ccGtInit = function(){
        if (!gtInited){
          try { new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'cc-gt'); gtInited = true; } catch(e){ return rej(e); }
        }
        wait();
      };
      if (window.google && google.translate && google.translate.TranslateElement) return window.ccGtInit();
      var sc = document.createElement('script');
      sc.src = 'https://translate.google.com/translate_a/element.js?cb=ccGtInit';
      sc.onerror = function(){ sc.remove(); rej(new Error('gt load')); };
      document.head.appendChild(sc);
    });
    // A failed or slow load can be retried on the next tap.
    gtReady.catch(function(){ gtReady = null; });
    return gtReady;
  }


  // The dialog reuses the "How can we help?" card styles, renamed to its own id.
  var cssReady = null;
  function loadCss(){
    if (!cssReady) cssReady = fetch('/assets/cc-choice.css?v=20261029a').then(function(r){ return r.ok ? r.text() : ''; }).catch(function(){ return ''; }).then(function(t){
      var st = document.createElement('style'); st.textContent = t.replace(/#cc-choice/g, '#cc-lang') + '\n' + CSS; document.head.appendChild(st);
    });
    return cssReady;
  }
  var CSS = [
    '#cc-lang .cc-hero{width:min(30vw,120px)!important}',
    '#cc-lang .cc-title{margin-bottom:14px!important;border:0!important;padding:0!important;background:none!important}',
    '#cc-lang nav.cc-bars{grid-template-columns:1fr 1fr!important;gap:10px!important}',
    '#cc-lang .cc-bar{min-height:50px!important;gap:8px!important;padding:7px 8px 7px 7px!important}',
    '#cc-lang .cc-bar.cc-more{grid-column:1/-1}',
    '#cc-lang .cc-med{width:32px!important;height:32px!important;font:700 13px Cinzel,Georgia,serif;letter-spacing:.06em}',
    '#cc-lang .cc-txt b{font:600 14.5px Inter,sans-serif!important;letter-spacing:0!important}',
    '#cc-lang .cc-more .cc-txt b{font:700 14px Cinzel,Georgia,serif!important;letter-spacing:.08em!important}',
    '#cc-lang .cc-more small{font:400 11.5px Inter,sans-serif;letter-spacing:0;opacity:.7}',
    '#cc-lang .cc-bar.on{box-shadow:0 0 0 1px rgba(255,240,184,.6),0 0 18px rgba(246,220,138,.55),0 8px 18px -8px rgba(0,0,0,.7)!important}',
    '#cc-lang .cc-gtbox{grid-column:1/-1;display:none}#cc-lang .cc-gtbox.on{display:block}',
    '#cc-lang .cc-gtbox select{width:100%;padding:12px;border-radius:12px;border:2px solid #b8862c;background:#2a1408;color:#f6ead2;font:600 15px Inter,sans-serif}',
    '#cc-lang .cc-err{grid-column:1/-1;margin:0;text-align:center;font:13px Inter,sans-serif;color:#ffd2d2}',
    '#cc-gt{position:absolute;left:-9999px;top:0}',
    // Hide Google's own top bar, tooltips and hover highlight
    'body>.skiptranslate,iframe.goog-te-banner-frame,#goog-gt-tt,.goog-te-balloon-frame{display:none!important}',
    'body{top:0!important}.goog-text-highlight{background:none!important;box-shadow:none!important}'
  ].join('\n');

  // Button on pages other than the home page (the home page places its own)
  var FLOAT_CSS = [
    '#lang-fab.cc-float{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:12px;left:auto;z-index:9990;display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;cursor:pointer;background:rgba(22,8,28,.82);border:1px solid rgba(230,191,94,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.35)}',
    '#lang-fab.cc-float b{font:700 11.5px/1 Cinzel,Georgia,serif;letter-spacing:.22em;background:linear-gradient(180deg,#fff1c1 0%,#e6bf5e 40%,#9c7424 70%,#f3d27a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}'
  ].join('\n');

  var root, nav;
  function bar(code, label, name, g){
    return '<button type="button" class="cc-bar cc-info" data-l="' + code + '"' + (g ? ' data-g="1"' : '') + '><span class="cc-med">' + label + '</span><span class="cc-txt"><b>' + name + '</b></span><span></span></button>';
  }
  function build(){
    root = document.createElement('div'); root.id = 'cc-lang'; root.className = 'notranslate'; root.setAttribute('translate', 'no');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'cc-lang-t');
    root.innerHTML = '<div class="cc-card"><div class="cc-hero"><img src="/assets/emblem-clear.webp" alt="" width="400" height="400" decoding="async"></div>' +
      '<h2 class="cc-title" id="cc-lang-t">Choose Your Language</h2><nav class="cc-bars">' +
      SITE.map(function(l){ return bar(l[0], l[1], l[2]); }).join('') + GT.map(function(l){ return bar(l[0], l[1], l[2], 1); }).join('') +
      '<button type="button" class="cc-bar cc-info cc-more" data-l="more"><span class="cc-med">' + GLOBE + '</span><span class="cc-txt"><b>More Languages</b><small>100+ languages · by Google</small></span><span class="cc-arr" aria-hidden="true">›</span></button>' +
      '<div class="cc-gtbox"></div></nav><div class="cc-orn" aria-hidden="true"><i></i>✦<i></i></div></div>';
    document.body.appendChild(root);
    nav = root.querySelector('nav');
    root.addEventListener('click', function(e){
      if (e.target === root) return close();
      var b = e.target.closest('.cc-bar'); if (b) pick(b.dataset.l);
    });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && root.classList.contains('on')) close(); });
  }
  function mark(){
    var g = gLang(), cur = fromG(g) || g || siteLang();
    nav.querySelectorAll('.cc-bar[data-l]').forEach(function(b){
      var on = b.dataset.l === cur;
      b.classList.toggle('on', on);
      if (on && FLAG[cur]){
        var svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 100" preserveAspectRatio="xMidYMid slice">' + FLAG[cur] + '</svg>');
        b.style.setProperty('background', 'linear-gradient(90deg,rgba(20,4,8,.6),rgba(20,4,8,.3)) padding-box,url(/assets/choice/marble.webp) center/cover padding-box,url("' + svg + '") center/cover padding-box,' + GOLD, 'important');
        b.style.setProperty('background-blend-mode', 'normal,overlay,normal,normal', 'important');
      } else { b.style.removeProperty('background'); b.style.removeProperty('background-blend-mode'); }
    });
  }
  function err(msg){
    var p = nav.querySelector('.cc-err'); if (!p){ p = document.createElement('p'); p.className = 'cc-err'; nav.appendChild(p); }
    p.textContent = msg;
  }
  var FAIL = 'Google Translate could not be loaded. Please try again.';
  function remember(code){ try { localStorage.setItem('cc_lang', code); } catch(e){} }
  function ddItem(code){ return [].slice.call(document.querySelectorAll('.lang-dd-item')).filter(function(i){ return (i.getAttribute('onclick') || '').indexOf("'" + code + "'") > -1; })[0]; }
  // Every pick is applied the same way: the site's own language (cc_lang) for the parts the
  // site translates itself, plus Google (googtrans cookie) for everything else, then a reload.
  // Google always works from English, so a Google-only language keeps the site in English.
  function apply(code){
    remember(fromG(code) || 'en');
    clearGoogle();
    if (code !== 'en') document.cookie = 'googtrans=/en/' + toG(code) + ';path=/';
    location.reload();
  }
  function pick(code){
    if (code === 'more'){
      var box = nav.querySelector('.cc-gtbox'); box.classList.add('on');
      loadGoogle().then(function(src){
        // Our own copy of Google's language list
        var sel = document.createElement('select'); sel.setAttribute('aria-label', 'More languages');
        [].forEach.call(src.options, function(o){ sel.appendChild(new Option(o.text || 'Select a language…', o.value)); });
        box.innerHTML = ''; box.appendChild(sel); sel.focus();
        sel.onchange = function(){ if (sel.value) apply(fromG(sel.value) || sel.value); };
      }).catch(function(){ box.classList.remove('on'); err(FAIL); });
      return;
    }
    if (code === current() || toG(code) === gLang()) return close();
    apply(code);
  }
  var opener = null;
  function open(){
    loadCss().then(show);
  }
  function show(){
    if (!root) build();
    var box = nav.querySelector('.cc-gtbox'); box.classList.remove('on'); box.innerHTML = '';
    var e = nav.querySelector('.cc-err'); if (e) e.remove();
    mark();
    opener = document.activeElement;
    root.classList.add('on'); document.documentElement.style.overflow = 'hidden';
    var first = nav.querySelector('.cc-bar.on') || nav.querySelector('.cc-bar'); if (first) first.focus();
  }
  function close(){
    if (!root) return;
    root.classList.remove('on'); document.documentElement.style.overflow = '';
    if (opener && opener.focus) opener.focus(); opener = null;
  }
  function setLabel(code){
    var el = document.getElementById('lang-fab-l'); if (el) el.textContent = (fromG(code) || String(code || 'en').split('-')[0]).toUpperCase();
  }

  window.ccLangOpen = open;
  window.ccLangClose = close;
  var siteSelect = null;
  function addButton(){
    if (document.getElementById('lang-fab')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'lang-fab'; b.className = 'cc-float notranslate'; b.setAttribute('translate', 'no'); b.setAttribute('aria-label', 'Language');
    b.innerHTML = GLOBE.replace('width="20" height="20"', 'width="13" height="13"').replace('currentColor', '#e6bf5e') + '<b id="lang-fab-l">EN</b>';
    var st = document.createElement('style'); st.textContent = FLOAT_CSS; document.head.appendChild(st);
    b.onclick = open; document.body.appendChild(b);
  }
  function init(){
    siteSelect = window.selectLangDD;
    var pref = siteLang();
    if (isHome()){
      // The header dropdown picks languages the same way as the card.
      // The page itself also calls it on load to restore the saved language; that is not a
      // new pick and must not reload (or it would reload forever).
      window.selectLangDD = function(code){
        var same = code === siteLang() && (code === 'en' ? !gLang() : !gLang() || toG(code) === gLang());
        if (same) return siteSelect.apply(this, arguments);
        apply(code);
      };
      // A Google-only language needs the English page underneath.
      if (gLang() && !fromG(gLang()) && pref !== 'en'){ var en = ddItem('en'); if (en) siteSelect('en', 'EN', en); }
    } else addButton();
    // A site language also turns Google on, so text the site has no translation for
    // (forms, articles, other pages) is translated too.
    if (pref !== 'en' && fromG(pref) && (!gLang() || fromG(gLang()))) { clearGoogle(); document.cookie = 'googtrans=/en/' + toG(pref) + ';path=/'; }
    setLabel(current());
    try { new MutationObserver(function(){ setLabel(current()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch(e){}
    if (gLang()) loadGoogle().catch(function(){});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
