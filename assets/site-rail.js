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
    {href:'/?go=new',    icon:'✎', label:'File a Complaint', short:'Complain', primary:true,
     line:'<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'},
    {href:'/?go=lawyer', svg:gavel, label:'Free Lawyer', short:'Lawyer',
     line:'<path d="M13 4l7 7M10 7l7 7M11.5 5.5l-4 4M18.5 12.5l-4 4"/><path d="M11 12l-6 6"/><path d="M3 21h9"/>'},
    {href:'/?go=rep',    icon:'⚑', label:'Find Your MP', short:'Your MP',
     line:'<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>'}
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
    // Mobile strip: the same three shortcuts as a row above the "In this guide" tiles.
    // Long translated labels wrap to two lines instead of spilling out.
    + '#cc-strip{display:none}'
    + '@media (max-width:1039px){'
    +   '#cc-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 8px}'
    +   '#cc-strip a{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:38px;padding:3px 8px;overflow:hidden;text-align:center;border-radius:12px;border:1px solid rgba(244,214,255,.25);background:rgba(255,255,255,.06);color:#f3e6ea;text-decoration:none;font:700 clamp(.54rem,2.6vw,.62rem)/1.15 Cinzel,Georgia,serif;text-transform:uppercase;letter-spacing:.02em;overflow-wrap:anywhere;box-shadow:inset 0 1px 0 rgba(255,230,250,.2);-webkit-tap-highlight-color:transparent}'
    +   '#cc-strip a.p{background:linear-gradient(135deg,#cfb0e8,#cfb1e7,#5b208a);color:#060206;border-color:transparent}'
    +   '#cc-strip a:active{transform:scale(.97)}'
    +   '#cc-strip svg{flex:none;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    +   m + '{transition:opacity .25s}'
    +   m + '.hide{opacity:0;pointer-events:none}'
    +   m + '.hide *{pointer-events:none!important}'
    + '}'
    + '@media print{#cc-rail,#cc-strip{display:none}}';
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

  // Mobile strip above the section tiles. While it is on screen the round
  // buttons step aside, so the same shortcuts never show twice.
  var kick = document.querySelector('.toc .kick');
  if (!kick) return;
  var strip = document.createElement('nav');
  strip.id = 'cc-strip';
  strip.setAttribute('aria-label', 'ComplaintCA shortcuts');
  links.forEach(function(l){
    var a = document.createElement('a');
    a.href = l.href;
    if (l.primary) a.className = 'p';
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + l.line + '</svg>';
    a.appendChild(document.createTextNode(l.short));
    a.setAttribute('aria-label', l.label);
    strip.appendChild(a);
  });
  kick.parentNode.insertBefore(strip, kick.nextSibling);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function(e){
      nav.classList.toggle('hide', e[0].isIntersecting);
    }).observe(strip);
  }
})();
