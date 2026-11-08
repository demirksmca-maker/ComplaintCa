// Site rail: three shortcuts into the ComplaintCA app (complain, free lawyer,
// find your MP) that stay on screen while the reader scrolls a blog post.
// Desktop: a vertical rail beside the article. Mobile: round buttons stacked at
// the middle of the right edge (the bottom edge stays free for anchor ads).
// Their labels show near the top of the page and fold away once the reader scrolls.
(function(){
  if (document.getElementById('cc-rail')) return;
  // Gavel icon: drawn inline so it looks the same on every phone.
  var gavel = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">'
    + '<g transform="rotate(-45 12 10)"><rect x="7" y="3.5" width="10" height="5" rx="1.2"/><rect x="5.6" y="2.8" width="2.2" height="6.4" rx=".8"/>'
    + '<rect x="16.2" y="2.8" width="2.2" height="6.4" rx=".8"/><rect x="11" y="8" width="2" height="9" rx="1"/></g>'
    + '<rect x="3" y="19.5" width="11" height="2.5" rx="1.1"/></svg>';
  var links = [
    {href:'/?go=new',    icon:'✎', label:'File a Complaint', primary:true},
    {href:'/?go=lawyer', svg:gavel, label:'Free Lawyer'},
    {href:'/?go=rep',    icon:'⚑', label:'Find Your MP'}
  ];
  // Colours and fonts match the blog: off-white cards, navy text, gold accent, Cinzel labels.
  // Pages can recolour the mobile buttons with the --rail-* variables (see blog-theme.css).
  var m = 'html body #cc-rail';
  var css = ''
    + '#cc-rail{position:fixed;z-index:50;display:flex;background:#fff;border:1px solid #dbeafe;box-shadow:0 4px 16px rgba(15,41,82,.10)}'
    + '#cc-rail .t{font-family:Cinzel,serif;font-size:.6rem;letter-spacing:2.5px;text-transform:uppercase;color:#c9a84c;font-weight:700;text-align:center}'
    + '#cc-rail a{display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f2952;background:#fff;border:1px solid #dbeafe;font-family:Cinzel,serif;font-weight:700;font-size:.74rem;letter-spacing:.3px;line-height:1.25}'
    + '#cc-rail a.p{background:#c9a84c;border-color:#c9a84c;color:#0f2952}'
    + '#cc-rail .i{display:inline-flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;font-size:1rem;line-height:1;color:#1a4fa0}'
    + '#cc-rail a.p .i{color:#0f2952}'
    + '@media (min-width:1040px){'
    +   '#cc-rail{top:50%;transform:translateY(-50%);right:max(16px,calc(50% - 520px));flex-direction:column;gap:8px;width:184px;padding:14px 12px;border-radius:12px}'
    +   '#cc-rail .t{margin:0 0 2px}'
    +   '#cc-rail a{padding:11px 12px;border-radius:8px}'
    +   '#cc-rail a:hover{border-color:#c9a84c}'
    + '}'
    + '@media (max-width:1039px){'
    +   m + '{top:50%;right:10px;transform:translateY(-50%);flex-direction:column;align-items:flex-end;gap:12px;padding:0;background:none!important;border:0!important;box-shadow:none}'
    +   m + ' .t{display:none}'
    +   m + ' a,' + m + ' a.p{flex-direction:row-reverse;gap:10px;padding:0;background:none!important;border:0!important;font-size:.72rem;letter-spacing:.2px}'
    +   m + ' .l{padding:7px 12px;border-radius:999px;white-space:nowrap;background:var(--rail-bg,#fff);color:var(--rail-text,#0f2952);border:1px solid var(--rail-line,#dbeafe);box-shadow:0 4px 12px rgba(0,0,0,.18);transition:opacity .25s,transform .25s}'
    +   m + '.fold a{pointer-events:none}'
    +   m + '.fold .i{pointer-events:auto}'
    +   m + '.fold .l{opacity:0;transform:translateX(8px)}'
    +   m + ' .i{flex:none;width:48px;height:48px;border-radius:50%;font-size:1.25rem;background:var(--rail-bg,#fff);color:var(--rail-icon,#1a4fa0)!important;border:2px solid var(--rail-ring,#c9a84c);box-shadow:0 6px 16px rgba(0,0,0,.28)}'
    +   m + ' a.p .i{background:var(--rail-primary,#c9a84c);color:var(--rail-primary-text,#0f2952)!important}'
    + '}'
    + '@media print{#cc-rail{display:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  var nav = document.createElement('nav');
  nav.id = 'cc-rail';
  nav.setAttribute('aria-label', 'ComplaintCA shortcuts');
  var t = document.createElement('div');
  t.className = 't';
  t.textContent = 'ComplaintCA';
  nav.appendChild(t);
  links.forEach(function(l){
    var a = document.createElement('a');
    a.href = l.href;
    if (l.primary) a.className = 'p';
    var i = document.createElement('span');
    i.className = 'i';
    i.setAttribute('aria-hidden', 'true');
    if (l.svg) i.innerHTML = l.svg; else i.textContent = l.icon;
    var s = document.createElement('span');
    s.className = 'l';
    s.textContent = l.label;
    a.appendChild(i);
    a.appendChild(s);
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
  // Fold the labels away after the first screen so they do not sit on the text.
  var fold = function(){ nav.classList.toggle('fold', (window.scrollY || 0) > 160); };
  window.addEventListener('scroll', fold, {passive:true});
  fold();
})();
