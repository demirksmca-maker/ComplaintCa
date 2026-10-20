// ES site rail: shortcuts into the ComplaintES app (complain, free lawyer,
// representatives) that stay on screen while the reader scrolls a blog post (copy of /assets/site-rail.js).
// Desktop: a vertical rail beside the article. Mobile: a bar at the bottom.
(function(){
  if (document.getElementById('cc-rail')) return;
  var links = [
    {href:'/es/?go=new',    icon:'✎', label:'Presentar queja', primary:true},
    {href:'/es/?go=lawyer', icon:'⚖', label:'Abogado gratis'},
    {href:'/es/?go=rep',    icon:'⚑', label:'Mis representantes'}
  ];
  // Colours and fonts match the blog: off-white cards, navy text, gold accent, Cinzel labels.
  var css = ''
    + '#cc-rail{position:fixed;z-index:50;display:flex;background:#fff;border:1px solid #dbeafe;box-shadow:0 4px 16px rgba(15,41,82,.10)}'
    + '#cc-rail .t{font-family:Cinzel,serif;font-size:.6rem;letter-spacing:2.5px;text-transform:uppercase;color:#c9a84c;font-weight:700;text-align:center}'
    + '#cc-rail a{display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f2952;background:#fff;border:1px solid #dbeafe;font-family:Cinzel,serif;font-weight:700;font-size:.74rem;letter-spacing:.3px;line-height:1.25}'
    + '#cc-rail a.p{background:#c9a84c;border-color:#c9a84c;color:#0f2952}'
    + '#cc-rail .i{font-family:Inter,sans-serif;font-size:1rem;line-height:1;color:#1a4fa0}'
    + '#cc-rail a.p .i{color:#0f2952}'
    + '@media (min-width:1040px){'
    +   '#cc-rail{top:50%;transform:translateY(-50%);right:max(16px,calc(50% - 520px));flex-direction:column;gap:8px;width:184px;padding:14px 12px;border-radius:12px}'
    +   '#cc-rail .t{margin:0 0 2px}'
    +   '#cc-rail a{padding:11px 12px;border-radius:8px}'
    +   '#cc-rail a:hover{border-color:#c9a84c}'
    + '}'
    + '@media (max-width:1039px){'
    +   '#cc-rail{left:0;right:0;bottom:0;border-width:1px 0 0;padding:7px 8px calc(7px + env(safe-area-inset-bottom));gap:6px;box-shadow:0 -3px 12px rgba(15,41,82,.08)}'
    +   '#cc-rail .t{display:none}'
    +   '#cc-rail a{flex:1 1 0;justify-content:center;flex-direction:column;gap:3px;padding:7px 4px;border-radius:8px;font-size:.64rem;text-align:center}'
    +   'body{padding-bottom:calc(66px + env(safe-area-inset-bottom))}'
    + '}'
    + '@media print{#cc-rail{display:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  var nav = document.createElement('nav');
  nav.id = 'cc-rail';
  nav.setAttribute('aria-label', 'Accesos de ComplaintES');
  var t = document.createElement('div');
  t.className = 't';
  t.textContent = 'ComplaintES';
  nav.appendChild(t);
  links.forEach(function(l){
    var a = document.createElement('a');
    a.href = l.href;
    if (l.primary) a.className = 'p';
    var i = document.createElement('span');
    i.className = 'i';
    i.setAttribute('aria-hidden', 'true');
    i.textContent = l.icon;
    a.appendChild(i);
    a.appendChild(document.createTextNode(l.label));
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
})();
