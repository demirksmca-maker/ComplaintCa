// Shared complaint flow for the 3D theme studies (visual prototypes only).
// Renders one focused step at a time and announces every change as a
// `cc` CustomEvent on document, so each page's 3D scene can react:
//   {type:'step', i, n, key}   {type:'pick', key, value, label}
//   {type:'type', key, len}    {type:'send'}   {type:'done', ref}
// Nothing is sent anywhere: the reference number is generated locally.
(function(){
  const STEPS = [
    { k:'who',  q:'Who is it about?', kind:'chips', opts:[['business','Business'],['government','Government'],['health','Health'],['landlord','Landlord'],['municipality','Municipality'],['school','School'],['other','Other']] },
    { k:'what', q:'What happened?', kind:'text', ph:'Describe what happened, when and where.' },
    { k:'where',q:'Where did it happen?', kind:'line', ph:'City or postal code, e.g. Toronto or M5V 3L9' },
    { k:'urg',  q:'How urgent is it?', kind:'chips', opts:[['low','Low'],['medium','Medium'],['high','High']] },
    { k:'id',   q:'Your identity', kind:'cards', opts:[['anon','Anonymous','Your name is never shared.'],['named','With my name','Faster follow-up from the agency.']] },
    { k:'mail', q:'Your email', kind:'line', ph:'you@email.com', type:'email', note:'We send your tracking number here. It is never shared with the institution.' },
    { k:'ev',   q:'Any evidence?', kind:'files' },
    { k:'send', q:'Review & send', kind:'review' },
  ];
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];
  const HINT = { what:'Please write a few words about what happened.', where:'Please enter a city or postal code.',
    mail:'Please enter a valid email address.', id:'Please choose one — and enter your name if you file with it.',
    send:'Please tick the confirmation above to send.' };
  const emit = d => document.dispatchEvent(new CustomEvent('cc', { detail:d }));
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

  function mount(root){
    const val = {}, lab = {};
    let cur = 0;
    const wrap = el('div','cf');
    const top = el('div','cf-top'), dots = el('div','cf-dots'), count = el('div','cf-count');
    STEPS.forEach(() => dots.appendChild(el('i')));
    top.append(dots, count);
    const stage = el('div','cf-stage');
    const nav = el('div','cf-nav'), back = el('button','cf-btn ghost','Back'), next = el('button','cf-btn gold','Next');
    back.type = next.type = 'button';
    nav.append(back, next);
    const hint = el('p','cf-hint'); hint.setAttribute('role','status');

    const steps = STEPS.map((s, i) => {
      const sec = el('section','cf-step'); sec.dataset.k = s.k;
      sec.append(el('p','cf-kicker','Step ' + ROMAN[i]), el('h2','cf-q', s.q));
      const body = el('div','cf-body'); sec.appendChild(body);
      if (s.kind === 'chips' || s.kind === 'cards') {
        const g = el('div', s.kind === 'chips' ? 'cf-chips' + (s.opts.length === 3 ? ' three' : '') : 'cf-cards');
        s.opts.forEach(([v, l, sub]) => {
          const b = el('button','cf-opt'); b.type = 'button'; b.dataset.v = v;
          if (s.k === 'urg') b.appendChild(el('span','cf-dot ' + v));
          b.appendChild(el('span', null, l)); if (sub) b.appendChild(el('small', null, sub));
          b.addEventListener('click', () => {
            g.querySelectorAll('.cf-opt').forEach(x => x.classList.toggle('sel', x === b));
            val[s.k] = v; lab[s.k] = l; emit({ type:'pick', key:s.k, value:v, label:l });
            if (s.k === 'id') { name.hidden = v !== 'named'; if (v === 'named') { name.focus(); refresh(); return; } }
            refresh(); setTimeout(go, 320, 1);
          });
          g.appendChild(b);
        });
        body.appendChild(g);
        let name;
        if (s.k === 'id') {
          name = el('input','cf-in'); name.placeholder = 'Your full name'; name.hidden = true; name.maxLength = 120;
          name.addEventListener('input', () => { val.name = name.value.trim(); refresh(); });
          body.appendChild(name);
        }
      } else if (s.kind === 'text' || s.kind === 'line') {
        const f = el(s.kind === 'text' ? 'textarea' : 'input', 'cf-in'); f.placeholder = s.ph; f.maxLength = s.kind === 'text' ? 5000 : 200;
        if (s.type) f.type = s.type;
        f.addEventListener('input', () => { val[s.k] = f.value.trim(); lab[s.k] = val[s.k]; emit({ type:'type', key:s.k, len:f.value.length }); refresh(); });
        f.addEventListener('keydown', e => { if (e.key === 'Enter' && s.kind === 'line' && ok(i)) { e.preventDefault(); go(1); } });
        body.appendChild(f);
        if (s.note) body.appendChild(el('p','cf-note', s.note));
      } else if (s.kind === 'files') {
        const pick = el('label','cf-drop'); const inp = el('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,video/*';
        const t = el('span', null, 'Add photos or videos'); pick.append(inp, el('b', null, '+'), t);
        inp.addEventListener('change', () => { const n = inp.files.length; val.ev = n; lab.ev = n ? n + ' file' + (n > 1 ? 's' : '') : 'None'; t.textContent = n ? lab.ev + ' added' : 'Add photos or videos'; emit({ type:'pick', key:'ev', value:n, label:lab.ev }); refresh(); });
        body.append(pick, el('p','cf-note','Optional — you can skip this.'));
      } else {
        const dl = el('dl','cf-sum'); body.appendChild(dl);
        const legal = el('label','cf-legal'); const cb = el('input'); cb.type = 'checkbox';
        legal.append(cb, el('span', null, 'I confirm this complaint is true and I accept full legal responsibility for it.'));
        cb.addEventListener('change', () => { val.legal = cb.checked; refresh(); });
        body.appendChild(legal);
        sec.fill = () => { dl.innerHTML = ''; STEPS.slice(0, -1).forEach((x, j) => {
          const v = x.k === 'id' && val.id === 'named' ? val.name : lab[x.k];
          dl.append(el('dt', null, x.q), el('dd', null, v ? (v.length > 60 ? v.slice(0, 57) + '…' : v) : '—')); }); };
      }
      stage.appendChild(sec);
      return sec;
    });

    const done = el('section','cf-done');
    done.append(el('div','cf-seal','✓'), el('h2','cf-q','Complaint received'), el('span','cf-test','Demo · nothing was sent'),
      el('p','cf-note','Your tracking number'), el('div','cf-ref'), el('p','cf-note','Keep this number to track your complaint.'));
    const again = el('button','cf-btn gold','Start again'); again.type = 'button'; done.appendChild(again);
    wrap.append(top, stage, nav, hint, done);
    root.appendChild(wrap);

    function ok(i){
      const k = STEPS[i].k, v = val[k];
      if (k === 'what') return (v || '').length >= 3;
      if (k === 'where') return !!v;
      if (k === 'mail') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
      if (k === 'id') return v === 'anon' || (v === 'named' && !!val.name);
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
      refresh();
      emit({ type:'step', i:cur, n:STEPS.length, key:STEPS[cur].k });
      const f = steps[cur].querySelector('textarea, input.cf-in:not([hidden])');
      if (f && matchMedia('(pointer:fine)').matches) setTimeout(() => f.focus({ preventScroll:true }), 380);
    }
    function go(d){
      if (d > 0 && !ok(cur)){ hint.textContent = HINT[STEPS[cur].k] || 'Please choose one.'; hint.classList.remove('shake'); void hint.offsetWidth; hint.classList.add('shake'); return; }
      hint.textContent = '';
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
    back.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    again.addEventListener('click', () => location.reload());
    render();
    return { values: val, labels: lab, steps: STEPS };
  }
  window.CCFlow = { mount, STEPS };
})();
