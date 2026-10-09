// Shared complaint flow for the 3D theme studies.
// Follows the live form's engine: after "What happened?" ASYA classifies the
// complaint (category + risk) through /api/classify, exactly like
// suggestCategoryAI on complaintca.ca. The AI's risk level — not the user —
// sets the urgency; high risk, Legal Rights and Access to Information requests
// cannot be anonymous; workplace harassment opens the support screen first.
// Every change is announced as a `cc` CustomEvent on document so each page's
// 3D scene can react:
//   {type:'step', i, n, key}  {type:'pick', key, value, label}  {type:'type', key, len}
//   {type:'thinking'}  {type:'ai', group, category, label, icon, priority}
//   {type:'send'}  {type:'done', ref}
// Sending is still a local demo: nothing is stored or emailed.
(function(){
  const STEPS = [
    { k:'who',  q:'Who is it about?', kind:'chips', opts:[['business','Business'],['government','Government'],['health','Health'],['landlord','Landlord'],['municipality','Municipality'],['school','School'],['other','Other']] },
    { k:'what', q:'What happened?', kind:'text', ph:'Describe what happened, when and where.' },
    { k:'where',q:'Where did it happen?', kind:'line', ph:'City or postal code, e.g. Toronto or M5V 3L9' },
    { k:'ai',   q:'ASYA’s assessment', kind:'ai' },
    { k:'id',   q:'Your identity', kind:'cards', opts:[['anon','Anonymous','Your name is never shared.'],['named','With my name','Faster follow-up from the agency.']] },
    { k:'mail', q:'Your email', kind:'line', ph:'you@email.com', type:'email', note:'We send your tracking number here. It is never shared with the institution.' },
    { k:'ev',   q:'Any evidence?', kind:'files' },
    { k:'send', q:'Review & send', kind:'review' },
  ];
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];
  const RISK = { low:'🟢 Low', medium:'🟡 Medium', high:'🔴 High' };
  const TYPES = [
    ['notice','📢','Notify Institution','Formally report the issue and request resolution'],
    ['legal','⚖️','Assert Legal Rights','Notify of legal action & compensation rights'],
    ['access','📄','Access to Information Request','Request records or information from an institution'],
  ];
  const TYPE_NOTE = {
    legal:'This goes to our Open Case Feed for signed-in partner lawyers only — it is not published to the public feed. If you’d like a lawyer to review your case and discuss representing you, this is how they’ll find it.',
    access:'This request is processed under Access to Information / Freedom of Information law — a different legal process than a complaint. Institutions are usually required to respond within a set number of days, and you don’t need to give a reason for the request. A real name and contact are required so the institution can respond to you.',
  };
  const NAME_WHY = {
    high:'Your name is required for a high-priority complaint (cannot be sent anonymously).',
    legal:'Your name is required to assert legal rights (cannot be sent anonymously) — lawyers need to be able to reach you.',
    access:'Your name is required for an access to information request (cannot be sent anonymously) — the institution needs to be able to respond to you.',
  };
  const HINT = { what:'Please write a few words about what happened.', where:'Please enter a city or postal code.',
    mail:'Please enter a valid email address.', id:'Please choose one — and enter your name if you file with it.',
    ai:'Please wait for ASYA, or choose the urgency yourself.', send:'Please tick the confirmation above to send.' };
  const emit = d => document.dispatchEvent(new CustomEvent('cc', { detail:d }));
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

  function mount(root){
    const val = { ctype:'notice' }, lab = {};
    let cur = 0, ai = null, aiFor = '', aiState = 'idle';
    const wrap = el('div','cf');
    const top = el('div','cf-top'), dots = el('div','cf-dots'), count = el('div','cf-count');
    STEPS.forEach(() => dots.appendChild(el('i')));
    top.append(dots, count);
    const stage = el('div','cf-stage');
    const nav = el('div','cf-nav'), back = el('button','cf-btn ghost','Back'), next = el('button','cf-btn gold','Next');
    back.type = next.type = 'button';
    nav.append(back, next);
    const hint = el('p','cf-hint'); hint.setAttribute('role','status');
    const parts = {};

    const needName = () => val.urg === 'high' || val.ctype !== 'notice';
    const whyName = () => val.urg === 'high' ? NAME_WHY.high : NAME_WHY[val.ctype];

    const steps = STEPS.map((s, i) => {
      const sec = el('section','cf-step'); sec.dataset.k = s.k;
      sec.append(el('p','cf-kicker','Step ' + ROMAN[i]), el('h2','cf-q', s.q));
      const body = el('div','cf-body'); sec.appendChild(body);
      if (s.kind === 'chips' || s.kind === 'cards') {
        const g = el('div', s.kind === 'chips' ? 'cf-chips' : 'cf-cards');
        s.opts.forEach(([v, l, sub]) => {
          const b = el('button','cf-opt'); b.type = 'button'; b.dataset.v = v;
          b.appendChild(el('span', null, l)); if (sub) b.appendChild(el('small', null, sub));
          b.addEventListener('click', () => {
            if (b.disabled) return;
            g.querySelectorAll('.cf-opt').forEach(x => x.classList.toggle('sel', x === b));
            val[s.k] = v; lab[s.k] = l; emit({ type:'pick', key:s.k, value:v, label:l });
            if (s.k === 'id') { parts.name.hidden = v !== 'named'; if (v === 'named') { parts.name.focus(); refresh(); return; } }
            refresh(); setTimeout(go, 320, 1);
          });
          g.appendChild(b);
        });
        body.appendChild(g);
        if (s.k === 'id') {
          parts.idGroup = g;
          parts.idWhy = el('p','cf-note cf-warn'); parts.idWhy.hidden = true; body.appendChild(parts.idWhy);
          const name = el('input','cf-in'); name.placeholder = 'Your full name'; name.hidden = true; name.maxLength = 120;
          name.addEventListener('input', () => { val.name = name.value.trim(); refresh(); });
          body.appendChild(name); parts.name = name;
        }
      } else if (s.kind === 'text' || s.kind === 'line') {
        const f = el(s.kind === 'text' ? 'textarea' : 'input', 'cf-in'); f.placeholder = s.ph; f.maxLength = s.kind === 'text' ? 5000 : 200;
        if (s.type) f.type = s.type;
        f.addEventListener('input', () => { val[s.k] = f.value.trim(); lab[s.k] = val[s.k]; emit({ type:'type', key:s.k, len:f.value.length }); refresh(); });
        f.addEventListener('keydown', e => { if (e.key === 'Enter' && s.kind === 'line') { e.preventDefault(); go(1); } });
        body.appendChild(f);
        if (s.note) body.appendChild(el('p','cf-note', s.note));
      } else if (s.kind === 'ai') {
        // ── ASYA's assessment: AI category + risk, legal alert, complaint type ──
        const box = el('div','cf-ai'); body.appendChild(box); parts.ai = box;
        const types = el('div','cf-types');
        TYPES.forEach(([v, ic, l, d]) => {
          const b = el('button','cf-type'); b.type = 'button'; b.dataset.v = v;
          b.append(el('span','cf-type-ic', ic), el('b', null, l), el('small', null, d));
          b.addEventListener('click', () => setType(v));
          types.appendChild(b);
        });
        const tnote = el('p','cf-note cf-tnote');
        body.append(el('p','cf-sub','Complaint type'), types, tnote);
        parts.types = types; parts.tnote = tnote;
      } else if (s.kind === 'files') {
        const pick = el('label','cf-drop'); const inp = el('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,video/*';
        const t = el('span', null, 'Add photos or videos'); pick.append(inp, el('b', null, '+'), t);
        inp.addEventListener('change', () => { const n = Math.min(inp.files.length, 10); val.ev = n; lab.ev = n ? n + ' file' + (n > 1 ? 's' : '') : 'None'; t.textContent = n ? lab.ev + ' added' : 'Add photos or videos'; emit({ type:'pick', key:'ev', value:n, label:lab.ev }); refresh(); });
        body.append(pick, el('p','cf-note','Optional — up to 10 files. You can skip this.'));
      } else {
        const dl = el('dl','cf-sum'); body.appendChild(dl);
        const legal = el('label','cf-legal'); const cb = el('input'); cb.type = 'checkbox';
        legal.append(cb, el('span', null, 'I confirm this complaint is true and I accept full legal responsibility for it.'));
        cb.addEventListener('change', () => { val.legal = cb.checked; refresh(); });
        body.appendChild(legal);
        sec.fill = () => { dl.innerHTML = '';
          const rows = [['Who is it about?', lab.who], ['What happened?', lab.what], ['Where did it happen?', lab.where],
            ['ASYA’s assessment', ai ? ai.label + ' · ' + RISK[val.urg] : val.urg ? RISK[val.urg] : ''],
            ['Complaint type', TYPES.find(t => t[0] === val.ctype)[2]],
            ['Your identity', val.id === 'named' ? val.name : lab.id], ['Your email', lab.mail], ['Any evidence?', lab.ev]];
          rows.forEach(([q, v]) => dl.append(el('dt', null, q), el('dd', null, v ? (v.length > 60 ? v.slice(0, 57) + '…' : v) : '—'))); };
      }
      stage.appendChild(sec);
      return sec;
    });

    // ── Support screen (live: workplace harassment → trauma-informed support first) ──
    const sup = el('div','cf-support'); sup.hidden = true;
    sup.innerHTML = '<div class="cf-sup-card"><div class="cf-sup-badge">🤝</div><p class="cf-kicker">Support &amp; Safety</p><h2 class="cf-q">You Are Not Alone</h2>' +
      '<p class="cf-note">Describing what happened can be difficult and may bring up <b>distress or trauma</b>. If you’d like to continue, that choice is entirely yours — but please read this first.</p>' +
      '<p class="cf-note">🩺 <b>Our recommendation:</b> talk to a doctor or counsellor before filing.</p>' +
      '<a class="cf-sup-row danger" href="tel:911"><span>🚨 In immediate danger?</span><b>Call 911</b></a>' +
      '<a class="cf-sup-row" href="tel:988"><span>☎️ 9-8-8 Suicide Crisis Helpline</span><b>988</b></a>' +
      '<a class="cf-sup-row" href="tel:18668630511"><span>🌸 Assaulted Women’s Helpline</span><b>1-866-863-0511</b></a>' +
      '<a class="cf-sup-row" href="tel:18006686868"><span>📞 Kids Help Phone</span><b>1-800-668-6868</b></a>' +
      '<a class="cf-sup-row" href="tel:18552423310"><span>🪶 Hope for Wellness</span><b>1-855-242-3310</b></a>' +
      '<div class="cf-nav"><button type="button" class="cf-btn ghost" data-sup="back">← Get support</button><button type="button" class="cf-btn gold" data-sup="go">Continue</button></div>' +
      '<p class="cf-note">🔒 You can file <b>anonymously</b>, and you control what you share. You can stop at any point.</p></div>';
    let supSeen = false;
    sup.addEventListener('click', e => { const a = e.target.closest('[data-sup]'); if (!a) return; sup.hidden = true; supSeen = true;
      if (a.dataset.sup === 'back') { cur = 1; render(); } });

    const done = el('section','cf-done');
    done.append(el('div','cf-seal','✓'), el('h2','cf-q','Complaint received'), el('span','cf-test','Demo · nothing was sent'),
      el('p','cf-note','Your tracking number'), el('div','cf-ref'), el('p','cf-note','Keep this number to track your complaint.'));
    const again = el('button','cf-btn gold','Start again'); again.type = 'button'; done.appendChild(again);
    wrap.append(top, stage, nav, hint, done, sup);
    root.appendChild(wrap);

    function setType(v){
      val.ctype = v;
      parts.types.querySelectorAll('.cf-type').forEach(b => b.classList.toggle('sel', b.dataset.v === v));
      parts.tnote.textContent = TYPE_NOTE[v] || ''; parts.tnote.hidden = !TYPE_NOTE[v];
      drawAI(); lockId(); refresh(); emit({ type:'pick', key:'ctype', value:v });
    }
    function setUrg(p){ val.urg = p; lab.urg = RISK[p]; emit({ type:'pick', key:'urg', value:p, label:RISK[p] }); lockId(); }
    // Identity rule from doSubmit: high risk / legal / access → a name is required.
    function lockId(){
      const lock = needName(), anon = parts.idGroup.querySelector('[data-v="anon"]');
      anon.disabled = lock; parts.idWhy.textContent = lock ? whyName() : ''; parts.idWhy.hidden = !lock;
      if (lock && val.id === 'anon') { val.id = ''; lab.id = ''; anon.classList.remove('sel'); }
    }
    function drawAI(){
      const b = parts.ai; b.innerHTML = '';
      if (aiState === 'loading') { b.className = 'cf-ai loading'; b.append(el('span','cf-spin'), el('p','cf-note','ASYA is assessing your complaint…')); return; }
      if (aiState === 'off') {
        b.className = 'cf-ai off';
        b.append(el('p','cf-note','ASYA is unavailable right now — choose the urgency yourself.'));
        const g = el('div','cf-chips three');
        ['low','medium','high'].forEach(p => { const o = el('button','cf-opt' + (val.urg === p ? ' sel' : ''), RISK[p]); o.type = 'button';
          o.addEventListener('click', () => { setUrg(p); drawAI(); refresh(); }); g.appendChild(o); });
        b.appendChild(g); return;
      }
      if (!ai) { b.className = 'cf-ai'; return; }
      b.className = 'cf-ai on risk-' + ai.priority;
      const card = el('div','cf-ai-card');
      const txt = el('div','cf-ai-txt'); txt.append(el('small', null, '🤖 AI · ' + ai.groupLabel), el('b', null, ai.label));
      card.append(el('span','cf-ai-ic', ai.icon), txt, el('span','cf-risk ' + ai.priority, RISK[ai.priority]));
      b.appendChild(card);
      // live: medium/high nudge towards Assert Legal Rights unless already legal/access
      if ((ai.priority === 'high' || ai.priority === 'medium') && val.ctype === 'notice') {
        const al = el('div','cf-alert ' + ai.priority);
        al.append(el('span', null, ai.priority === 'high' ? 'This looks serious — you may have a legal claim.' : 'This may qualify as a legal-rights matter.'));
        const lb = el('button','cf-alert-btn','⚖️ Legal Rights'); lb.type = 'button'; lb.addEventListener('click', () => setType('legal'));
        al.appendChild(lb); b.appendChild(al);
      }
    }
    async function assess(){
      const d = val.what || '';
      if (!d || d === aiFor) return;
      aiFor = d; ai = null; aiState = 'loading'; drawAI(); refresh(); emit({ type:'thinking' });
      let r = null;
      try { const res = await fetch('/api/classify', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ desc:d }) });
        if (res.ok) r = await res.json(); } catch {}
      if (aiFor !== d) return; // the description changed meanwhile
      if (r && r.priority) { ai = r; aiState = 'on'; setUrg(r.priority); emit({ type:'ai', ...r });
        if (r.support && !supSeen) sup.hidden = false; }
      else { aiState = 'off'; val.urg = ''; emit({ type:'ai', priority:'' }); }
      drawAI(); refresh();
    }
    function ok(i){
      const k = STEPS[i].k, v = val[k];
      if (k === 'what') return (v || '').length >= 3;
      if (k === 'where') return !!v;
      if (k === 'ai') return aiState !== 'loading' && !!val.urg;
      if (k === 'mail') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
      if (k === 'id') return (v === 'anon' && !needName()) || (v === 'named' && !!val.name);
      if (k === 'ev') return true;
      if (k === 'send') return STEPS.slice(0, -1).every((_, j) => ok(j)) && !!val.legal;
      return !!v;
    }
    function refresh(){
      next.classList.toggle('wait', !ok(cur)); if (ok(cur)) hint.textContent = '';
      next.textContent = STEPS[cur].k === 'send' ? 'Send complaint' : STEPS[cur].k === 'ev' && !val.ev ? 'Skip' : 'Next';
      back.hidden = !cur; nav.classList.toggle('one', !cur);
    }
    function render(){
      steps.forEach((s, i) => { s.classList.toggle('on', i === cur); s.classList.toggle('past', i < cur); s.setAttribute('aria-hidden', i !== cur); s.inert = i !== cur; });
      [...dots.children].forEach((d, i) => d.className = i < cur ? 'done' : i === cur ? 'cur' : '');
      count.textContent = (cur + 1) + ' / ' + STEPS.length;
      if (steps[cur].fill) steps[cur].fill();
      if (STEPS[cur].k === 'ai') assess();
      refresh();
      emit({ type:'step', i:cur, n:STEPS.length, key:STEPS[cur].k });
      const f = steps[cur].querySelector('textarea, input.cf-in:not([hidden])');
      if (f && matchMedia('(pointer:fine)').matches) setTimeout(() => f.focus({ preventScroll:true }), 380);
    }
    function go(d){
      if (d > 0 && !ok(cur)){ hint.textContent = HINT[STEPS[cur].k] || 'Please choose one.'; hint.classList.remove('shake'); void hint.offsetWidth; hint.classList.add('shake'); return; }
      hint.textContent = '';
      if (d > 0 && STEPS[cur].k === 'what') assess(); // start ASYA early, while the user answers "Where"
      if (d > 0 && STEPS[cur].k === 'send') return send();
      cur = Math.max(0, Math.min(STEPS.length - 1, cur + d)); render();
    }
    function send(){
      next.disabled = true; next.classList.remove('wait'); next.textContent = 'Sending…'; emit({ type:'send' });
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = '';
      for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
      const ref = 'VC-' + new Date().getFullYear() + '-' + r;
      setTimeout(() => { done.querySelector('.cf-ref').textContent = ref; wrap.classList.add('sent'); emit({ type:'done', ref }); }, window.CC_SEND_DELAY || 1600);
    }
    // ── Auto-fill: types a sample story and walks through every step so the theme can be watched ──
    const STORY = 'On 2 October my landlord came into my apartment without the required 24-hour written notice and shouted threats at me when I asked him to leave. This is the third time this month and I no longer feel safe in my own home.';
    const auto = el('button','cf-auto','▶ Auto-fill demo'); auto.type = 'button';
    top.appendChild(auto);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const field = k => steps[STEPS.findIndex(x => x.k === k)].querySelector('.cf-in');
    async function typeInto(f, text, ms){ f.focus({ preventScroll:true }); f.value = '';
      for (const ch of text){ f.value += ch; f.dispatchEvent(new Event('input')); await wait(ms); } }
    async function autoplay(){
      auto.disabled = true; auto.textContent = 'Auto-filling…';
      cur = 0; render(); await wait(700);
      steps[0].querySelector('[data-v="landlord"]').click(); await wait(1100);
      await typeInto(field('what'), STORY, 22); await wait(500); go(1); await wait(900);
      await typeInto(field('where'), 'Toronto, ON', 70); await wait(500); go(1);
      while (aiState === 'loading' || aiState === 'idle') await wait(200);
      await wait(2600);
      if (aiState === 'off') { parts.ai.querySelector('.cf-opt:nth-child(3)').click(); await wait(900); }
      go(1); await wait(1000);
      const idg = steps[STEPS.findIndex(x => x.k === 'id')];
      if (needName()) { idg.querySelector('[data-v="named"]').click(); await wait(400); await typeInto(parts.name, 'Alex Martin', 60); await wait(500); go(1); }
      else { idg.querySelector('[data-v="anon"]').click(); }
      await wait(1100);
      await typeInto(field('mail'), 'demo@example.com', 45); await wait(500); go(1); await wait(1000);
      go(1); await wait(1200);
      const cb = steps[STEPS.length - 1].querySelector('.cf-legal input'); cb.checked = true; cb.dispatchEvent(new Event('change'));
      auto.textContent = 'Ready — tap Send'; refresh();
    }
    auto.addEventListener('click', autoplay);
    if (/[?&]demo=1\b/.test(location.search)) setTimeout(autoplay, 900);
    back.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    again.addEventListener('click', () => location.reload());
    setType('notice');
    render();
    return { values: val, labels: lab, steps: STEPS, get ai(){ return ai; } };
  }
  window.CCFlow = { mount, STEPS };
})();
