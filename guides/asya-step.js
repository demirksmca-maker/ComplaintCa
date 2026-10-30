/* ComplaintCA — ASYA's guided questions inside a guide step window (guide.js loads this for data-asya="school").
   While the person reads, ASYA asks a few short questions, then hands the answers to the complaint screen
   (assets/complaint-steps.js, ccStepsPrefill) through localStorage. Nothing is sent from this file. */
(function(root){
  var PROVS = [['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],['NL','Newfoundland(?: and|\\s*&)? Labrador|Newfoundland'],['NS','Nova Scotia'],
    ['NT','Northwest Territories|NWT'],['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island|PEI'],['QC','Qu[eé]bec'],['SK','Saskatchewan'],['YT','Yukon']];

  var FLOWS = {
    school: {
      from: 'guide-school',
      done: 'That’s everything I need. I’ll carry it into your complaint.',
      steps: [
        { k:'teacher', chip:'Teacher', ask:'Who is the teacher or principal?', ph:'Name, e.g. Ms. Brown', skip:'I don’t know', max:80, cap:'words' },
        { k:'school', chip:'School', ask:'Which school is it?', ph:'School name', need:'Please type the school’s name.', max:120, cap:'words' },
        { k:'city', chip:'City', ask:'Which city and province?', ph:'e.g. Ottawa, ON', skip:'Skip', max:80, cap:'words' },
        { k:'what', chip:'What', ask:'What happened? Tell it in your own words.', ph:'Short and factual…', long:true, min:10, need:'A little more detail helps. A sentence or two is enough.', max:3000, cap:'sentences' },
        { k:'when', chip:'When', ask:'When did it happen?', ph:'e.g. last Tuesday', skip:'Not sure', max:80 }
      ],
      labels: { school:'School', teacher:'Teacher or principal', city:'City', when:'When', what:'What happened' }
    }
  };

  // Text the person typed: no control characters, one line unless the step is a story, capped at the step's length.
  function clean(s, max, long){
    s = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r/g, '');
    s = long ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
    return s.trim().slice(0, max);
  }

  // "Ottawa, ON", "Ottawa ON" or "Ottawa, Ontario" → city and province code. Anything else stays a city.
  function splitCity(s){
    var t = clean(s, 80);
    for (var i = 0; i < PROVS.length; i++) {
      var m = new RegExp('^(.*?)[,\\s]+(?:' + PROVS[i][0] + '|' + PROVS[i][1] + ')\\.?$', 'i').exec(t);
      if (m) return { city: m[1].replace(/[,\s]+$/, ''), pv: PROVS[i][0] };
    }
    return { city: t, pv: '' };
  }

  // The story the complaint screen receives: the person's words, then the facts ASYA asked for.
  // Within `max` characters the facts always stay; it is the narrative that is cut when space is short.
  function compose(a, max){
    var facts = [];
    if (a.teacher) facts.push('Teacher or principal: ' + a.teacher);
    facts.push('School: ' + (a.school || '') + (a.city ? ', ' + a.city : ''));
    if (a.when) facts.push('When: ' + a.when);
    facts = facts.join('\n').slice(0, 600);
    return (String(a.what || '').slice(0, Math.max(0, (max || 5000) - facts.length - 2)).trim() + '\n\n' + facts).trim();
  }

  var CSS = [
    '.guide-app .step-modal[data-asya-ready]{position:relative;max-width:540px;max-height:88vh;max-height:88dvh;padding:34px 30px 26px;border:2px solid transparent;border-radius:24px;color:#f6ead2;background:linear-gradient(rgba(30,8,36,.9),rgba(22,6,30,.94)) padding-box,url(/assets/choice/marble.webp) center/cover padding-box,linear-gradient(135deg,#7a5418 0%,#f6dc8a 22%,#b8862c 45%,#fff0b8 62%,#9a6a1c 82%,#e9c56a 100%) border-box;box-shadow:0 0 0 6px rgba(20,4,26,.7),0 0 0 7px rgba(233,197,106,.35),0 30px 70px rgba(0,0,0,.75)}',
    '.guide-app .step-modal[data-asya-ready] h3{margin:0 46px 16px 0;font:700 1.35rem/1.25 Cinzel,Georgia,serif;letter-spacing:.02em;color:transparent;background:linear-gradient(180deg,#f7e7bd,#c99b4a 55%,#e8cf8e);-webkit-background-clip:text;background-clip:text}',
    '.guide-app .step-modal[data-asya-ready]>p{margin:0;font:500 1.14rem/1.55 "EB Garamond",Georgia,serif;color:rgba(246,234,210,.9)}',
    '.guide-app .step-modal[data-asya-ready] .mclose{position:absolute;top:26px;right:24px;float:none;width:38px;height:38px;padding:0;border:2px solid transparent;border-radius:11px;font-size:0;color:transparent;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.18),rgba(0,0,0,.25) 70%) padding-box,url(/assets/choice/walnut.webp) center/cover padding-box,linear-gradient(135deg,#7a5418 0%,#f6dc8a 22%,#b8862c 45%,#fff0b8 62%,#9a6a1c 82%,#e9c56a 100%) border-box;box-shadow:0 3px 8px rgba(0,0,0,.55)}',
    '.guide-app .step-modal[data-asya-ready] .mclose::before,.guide-app .step-modal[data-asya-ready] .mclose::after{content:"";position:absolute;left:50%;top:50%;width:15px;height:2px;border-radius:1px;background:linear-gradient(90deg,#b8862c,#fff0b8,#b8862c);transform:translate(-50%,-50%) rotate(45deg)}',
    '.guide-app .step-modal[data-asya-ready] .mclose::after{transform:translate(-50%,-50%) rotate(-45deg)}',
    '.ga{margin-top:6px;animation:gaIn .4s ease both}@keyframes gaIn{from{opacity:0;transform:translateY(6px)}}',
    '.ga *{box-sizing:border-box}',
    '.ga-hr{display:flex;align-items:center;justify-content:center;gap:10px;margin:22px 0 20px;font-size:13px;line-height:1;color:#e9c56a}',
    '.ga-hr i{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(233,197,106,.7))}.ga-hr i:last-child{transform:scaleX(-1)}',
    '.ga-hd{display:flex;align-items:center;gap:16px;margin-bottom:16px}',
    '.ga-orb{flex:none;width:64px;height:64px;margin:5px;border-radius:50%;background:url(/assets/asya-orb.webp) center/cover;box-shadow:0 0 0 2px #e9c56a,0 0 0 4px rgba(20,4,26,.8),0 0 0 5px rgba(233,197,106,.5),0 0 26px 5px rgba(255,255,255,.35)}',
    '.ga-nm{display:inline-block;font:700 28px/1.15 Cinzel,Georgia,serif;letter-spacing:.34em;color:transparent;background:linear-gradient(110deg,#b8862c 0%,#f6dc8a 22%,#fff0b8 38%,#c99b4a 54%,#f7e7bd 74%,#b8862c 100%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 0 12px rgba(233,197,106,.35));animation:gaWord 4s ease-in-out infinite}@keyframes gaWord{50%{background-position:100% 0}}',
    '.ga-sub{margin-top:2px;font:italic 400 17px/1.3 "EB Garamond",Georgia,serif;color:rgba(246,234,210,.7)}',
    '.ga-log{display:flex;flex-direction:column;min-height:56px}',
    '.ga-b{max-width:84%;margin:0 0 12px;padding:12px 17px;font:500 20px/1.4 "EB Garamond",Georgia,serif;overflow-wrap:anywhere}',
    '.ga-q{border:1px solid rgba(233,197,106,.3);border-radius:4px 16px 16px 16px;background:rgba(255,255,255,.04)}',
    '.ga-prev{opacity:.55}',
    '.ga-u{margin-left:auto;border-radius:16px 4px 16px 16px;font:600 17px/1.4 Inter,system-ui,sans-serif;color:#2a1206;background:linear-gradient(135deg,#7a5418 0%,#f6dc8a 22%,#b8862c 45%,#fff0b8 62%,#9a6a1c 82%,#e9c56a 100%);box-shadow:0 6px 16px -6px rgba(233,197,106,.6)}',
    '.ga-clip{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;white-space:pre-line}',
    '.ga-u.ga-none{font:italic 400 17px/1.4 "EB Garamond",Georgia,serif;color:#f6ead2;background:none;border:1px dashed rgba(233,197,106,.35);box-shadow:none}',
    '.ga-dots{display:inline-flex;gap:5px;margin:0 0 12px;padding:15px 17px;border:1px solid rgba(233,197,106,.3);border-radius:4px 16px 16px 16px;background:rgba(255,255,255,.04)}',
    '.ga-dots b{width:6px;height:6px;border-radius:50%;background:#e9c56a;opacity:.35;animation:gaDot 1s ease-in-out infinite}.ga-dots b:nth-child(2){animation-delay:.15s}.ga-dots b:nth-child(3){animation-delay:.3s}@keyframes gaDot{50%{opacity:1}}',
    '.ga-form{display:flex;gap:10px;align-items:flex-end;margin-top:6px}',
    '.ga-f{flex:1;min-width:0;display:block;resize:none;padding:13px 15px;font:500 18px/1.35 "EB Garamond",Georgia,serif;color:#f6ead2;border:1.5px solid transparent;border-radius:12px;background:linear-gradient(rgba(22,6,30,.9),rgba(22,6,30,.9)) padding-box,linear-gradient(135deg,rgba(246,220,138,.6),rgba(154,106,28,.4),rgba(255,240,184,.6)) border-box}',
    '.ga-f::placeholder{font-style:italic;color:rgba(246,234,210,.5)}.ga-f:focus{outline:2px solid rgba(246,220,138,.75);outline-offset:1px}',
    '.ga-send,.ga-go{border:0;cursor:pointer;font:700 14px/1.3 Cinzel,Georgia,serif;letter-spacing:.14em;color:#2a1206;background:linear-gradient(135deg,#7a5418 0%,#f6dc8a 22%,#b8862c 45%,#fff0b8 62%,#9a6a1c 82%,#e9c56a 100%);box-shadow:0 6px 16px -6px rgba(233,197,106,.6)}',
    '.ga-send{flex:none;padding:0 22px;height:50px;border-radius:12px}',
    '.ga-go{display:block;width:100%;margin-top:6px;padding:17px 20px;border-radius:14px}.ga-go:disabled{opacity:.7;cursor:default}',
    '.ga-send:focus-visible,.ga-go:focus-visible,.ga-skip:focus-visible,.ga-redo:focus-visible{outline:2px solid #fff0b8;outline-offset:3px}',
    '.ga-err{min-height:0;margin:8px 2px 0;font:italic 400 17px/1.3 "EB Garamond",Georgia,serif;color:#ffb4c2}.ga-err:empty{display:none}',
    '.ga-skip,.ga-redo{margin:10px 2px 0;padding:2px 0;border:0;background:none;cursor:pointer;font:italic 400 17px/1.3 "EB Garamond",Georgia,serif;color:rgba(246,234,210,.7);text-decoration:underline dotted;text-underline-offset:3px}',
    '.ga-chips[hidden]{display:none}.ga-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(233,197,106,.25)}',
    '.ga-c{display:flex;align-items:center;gap:7px;font:600 12px/1 Cinzel,Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:rgba(246,234,210,.45)}',
    '.ga-c em{display:grid;place-items:center;width:17px;height:17px;border:1px solid rgba(233,197,106,.5);border-radius:50%;font-size:10px;font-style:normal;color:#2a1206}',
    '.ga-c.on{color:rgba(246,234,210,.85)}.ga-c.on em{border-color:transparent;background:linear-gradient(135deg,#7a5418 0%,#f6dc8a 22%,#b8862c 45%,#fff0b8 62%,#9a6a1c 82%,#e9c56a 100%)}',
    '.ga-c.cur{color:#f1d27a}.ga-c.cur em{border-color:#f1d27a;box-shadow:0 0 8px rgba(241,210,122,.6)}',
    '.ga-sum{margin:6px 0 16px;padding:12px 16px;border:1.5px solid transparent;border-radius:14px;background:linear-gradient(rgba(22,6,30,.82),rgba(22,6,30,.82)) padding-box,linear-gradient(135deg,rgba(246,220,138,.75),rgba(154,106,28,.55),rgba(255,240,184,.75)) border-box}',
    '.ga-sum div{padding:7px 0;border-bottom:1px solid rgba(233,197,106,.2)}.ga-sum div:last-child{border:0}',
    '.ga-sum dt{font:700 11px/1.2 Cinzel,Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:#f1d27a}',
    '.ga-sum dd{margin:3px 0 0;font:500 18px/1.4 "EB Garamond",Georgia,serif;color:#f6ead2;overflow-wrap:anywhere;white-space:pre-line}.ga-sum dd.ga-clip{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}',
    '.ga-fine{margin:10px 2px 0;font:italic 400 16px/1.35 "EB Garamond",Georgia,serif;color:rgba(246,234,210,.7);text-align:center}',
    '.ga-done{text-align:center}.ga-done .ga-sum{text-align:left}',
    '@media (max-height:720px){.ga-prev{display:none}}',
    '@media (max-width:420px){.guide-app .step-modal[data-asya-ready]{padding:30px 20px 22px}.guide-app .step-modal[data-asya-ready] .mclose{right:16px}.ga-b{max-width:92%}.ga-send{padding:0 16px}}',
    '@media (prefers-reduced-motion:reduce){.ga,.ga-dots b,.ga-nm{animation:none}}'
  ].join('\n');

  function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function mount(modal){
    var cfg = FLOWS[modal.getAttribute('data-asya')];
    if (!cfg || modal.getAttribute('data-asya-ready')) return;
    modal.setAttribute('data-asya-ready', '1');
    if (!document.getElementById('ga-css')) {
      var st = el('style'); st.id = 'ga-css'; st.textContent = CSS; document.head.appendChild(st);
      var fl = el('link'); fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500&display=swap'; document.head.appendChild(fl);
    }

    var steps = cfg.steps, n = steps.length, KEY = 'cc_ga_' + modal.getAttribute('data-asya');
    try { var old = JSON.parse(localStorage.getItem('cc_handoff') || 'null'); if (old && !(Date.now() - old.t < 600000)) localStorage.removeItem('cc_handoff'); } catch (e) { try { localStorage.removeItem('cc_handoff'); } catch (e2) {} }
    var GO = 'Continue to my complaint\u00A0→', calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var S = restore(), run = 0, busy = false;

    // A reload (or a language change) keeps the answers for this tab.
    function restore(){
      try {
        var d = JSON.parse(sessionStorage.getItem(KEY) || 'null'), a = {}, i = 0;
        if (!d || typeof d.a !== 'object' || !d.a) return { i: 0, a: {} };
        steps.forEach(function(s, j){ if (typeof d.a[s.k] === 'string') a[s.k] = clean(d.a[s.k], s.max, s.long); if (j < d.i && s.k in a) i = j + 1; });
        return { i: Math.min(i, n), a: a };
      } catch (e) { return { i: 0, a: {} }; }
    }
    function save(){ try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    function forget(){ try { sessionStorage.removeItem(KEY); } catch (e) {} }

    var box = el('div', 'ga');
    box.innerHTML = '<div class="ga-hr" aria-hidden="true"><i></i>✦<i></i></div>' +
      '<div class="ga-hd"><div class="ga-orb" aria-hidden="true"></div><div><div class="ga-nm notranslate" translate="no">ASYA</div><div class="ga-sub">Let’s prepare your complaint together while you read.</div></div></div>' +
      '<div class="ga-log" aria-live="polite"></div>' +
      '<div class="ga-ask"><form class="ga-form" novalidate><textarea class="ga-f" rows="1" autocomplete="off"></textarea><button type="submit" class="ga-send">Send</button></form>' +
      '<div class="ga-err" role="alert"></div><button type="button" class="ga-skip" hidden></button></div>' +
      '<div class="ga-done" hidden></div>' +
      '<div class="ga-chips"></div>';
    modal.appendChild(box);
    var log = box.querySelector('.ga-log'), ask = box.querySelector('.ga-ask'), form = box.querySelector('.ga-form'), f = box.querySelector('.ga-f'),
      err = box.querySelector('.ga-err'), skip = box.querySelector('.ga-skip'), fin = box.querySelector('.ga-done'), chips = box.querySelector('.ga-chips');

    function bubble(cls, text, mine){
      var b = el('div', 'ga-b ' + cls);
      if (mine) { b.setAttribute('translate', 'no'); b.className += ' notranslate'; b.appendChild(el('span', 'ga-clip', text)); } else b.textContent = text;
      return b;
    }
    function drawLog(typing){
      log.innerHTML = '';
      if (S.i > 0 && S.i < n) {
        var p = steps[S.i - 1], v = S.a[p.k];
        var pq = bubble('ga-q ga-prev', p.ask), pa = v ? bubble('ga-u', v, true) : bubble('ga-u ga-none', 'Skipped');
        pq.setAttribute('aria-hidden', 'true'); pa.setAttribute('aria-hidden', 'true');
        log.appendChild(pq); log.appendChild(pa);
      }
      if (typing) { var d = el('div', 'ga-dots'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<b></b><b></b><b></b>'; log.appendChild(d); }
      else log.appendChild(bubble('ga-q', S.i < n ? steps[S.i].ask : cfg.done));
    }
    function drawChips(){
      chips.innerHTML = '';
      steps.forEach(function(s, j){
        var c = el('span', 'ga-c' + (j < S.i ? (S.a[s.k] ? ' on' : '') : j === S.i ? ' cur' : ''));
        c.appendChild(el('em', null, j < S.i && S.a[s.k] ? '✓' : ''));
        c.appendChild(document.createTextNode(s.chip));
        chips.appendChild(c);
      });
    }
    function drawAsk(){
      var s = steps[S.i];
      ask.hidden = false; fin.hidden = true; err.textContent = '';
      f.value = ''; f.placeholder = s.ph; f.maxLength = s.max; f.rows = s.long ? 3 : 1; f.setAttribute('aria-label', s.ask);
      f.setAttribute('autocapitalize', s.cap || 'off'); f.setAttribute('enterkeyhint', s.long ? 'enter' : 'send'); f.spellcheck = !!s.long;
      skip.hidden = !s.skip; skip.textContent = s.skip || '';
    }
    function drawDone(){
      var a = S.a;
      ask.hidden = true; fin.hidden = false; fin.innerHTML = '';
      var dl = el('dl', 'ga-sum');
      ['school', 'teacher', 'city', 'when', 'what'].forEach(function(k){
        if (!a[k]) return;
        var row = el('div'), dd = el('dd', k === 'what' ? 'ga-clip' : '', a[k]); dd.setAttribute('translate', 'no'); dd.className += ' notranslate';
        row.appendChild(el('dt', null, cfg.labels[k])); row.appendChild(dd); dl.appendChild(row);
      });
      var go = el('button', 'ga-go', GO); go.type = 'button'; go.onclick = handoff;
      var redo = el('button', 'ga-redo', 'Start over'); redo.type = 'button'; redo.onclick = restart;
      fin.appendChild(dl); fin.appendChild(go);
      fin.appendChild(el('p', 'ga-fine', 'You check everything and add your email there. Nothing is sent until you approve.'));
      fin.appendChild(redo);
      return go;
    }
    function draw(typing){
      drawLog(typing); drawChips();
      chips.hidden = S.i >= n && !typing;
      if (typing) return;
      if (S.i < n) drawAsk(); else drawDone();
    }

    function answer(v){
      var s = steps[S.i], mine = ask.contains(document.activeElement);
      S.a[s.k] = v; S.i++; save();
      var my = ++run; busy = true; f.readOnly = true; err.textContent = '';
      draw(true);
      setTimeout(function(){
        if (my !== run) return;
        busy = false; f.readOnly = false; draw(false);
        if (S.i >= n) {
          modal.scrollTo ? modal.scrollTo({ top: Math.max(0, box.offsetTop - 12), behavior: calm ? 'auto' : 'smooth' }) : (modal.scrollTop = Math.max(0, box.offsetTop - 12));
          var g = fin.querySelector('.ga-go'); if (mine && g) g.focus({ preventScroll: true });
        }
      }, calm ? 0 : 450);
    }
    function submit(){
      if (busy || S.i >= n) return;
      var s = steps[S.i], v = clean(f.value, s.max, s.long);
      if (!v && s.skip) return answer('');
      if (!v || (s.min && v.length < s.min)) { err.textContent = s.need; f.focus(); return; }
      answer(v);
    }
    function restart(){
      var mine = fin.contains(document.activeElement);
      run++; busy = false; f.readOnly = false; S = { i: 0, a: {} }; forget(); draw(false);
      if (mine) f.focus({ preventScroll: true });
    }

    // The answers wait in localStorage (never in the link) and the complaint screen picks them up with the id.
    function handoff(){
      var a = S.a, c = splitCity(a.city || ''), story = compose(a, 5000), id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), url;
      try {
        localStorage.setItem('cc_handoff', JSON.stringify({ v: 1, t: Date.now(), id: id, from: cfg.from, who: a.school || '', what: story, city: c.city, pv: c.pv }));
        url = '/?go=new&h=' + id;
      } catch (e) { url = '/?d=' + encodeURIComponent(compose(a, 1500)); }   // storage blocked: the older ?d= link, shortened
      forget();
      var g = fin.querySelector('.ga-go'); if (g) { g.disabled = true; g.textContent = 'Opening…'; }
      location.href = url;
    }

    form.addEventListener('submit', function(e){ e.preventDefault(); submit(); });
    f.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' || e.isComposing || e.shiftKey || !steps[S.i]) return;
      if (!steps[S.i].long || e.ctrlKey || e.metaKey) { e.preventDefault(); submit(); }
    });
    f.addEventListener('input', function(){ err.textContent = ''; });
    skip.addEventListener('click', function(){ if (!busy && S.i < n) answer(''); });
    // Back from the complaint screen restores this page from memory: the button must work again.
    window.addEventListener('pageshow', function(e){ if (e.persisted) { var g = fin.querySelector('.ga-go'); if (g && g.disabled) { g.disabled = false; g.textContent = GO; } } });
    draw(false);
  }

  var api = { mount: mount, splitCity: splitCity, compose: compose, clean: clean, provCodes: PROVS.map(function(p){ return p[0]; }) };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccGuideAsya = root.ccGuideAsya || api;
})(typeof window !== 'undefined' ? window : null);
