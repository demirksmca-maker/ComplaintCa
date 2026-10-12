// Site rail: three shortcuts into the ComplaintCA app (complain, free lawyer,
// find your MP) that stay on screen while the reader scrolls a blog post.
// Desktop: a vertical rail beside the article. Mobile: a bar at the bottom.
(function(){
  if (document.getElementById('cc-rail')) return;
  var links = [
    {href:'/?go=new',    icon:'✎', label:'File a Complaint'},
    {href:'/?go=lawyer', icon:'⚖', label:'Free Lawyer'},
    {href:'/?go=rep',    icon:'⚑', label:'Find Your MP'}
  ];
  var css = ''
    + '#cc-rail{position:fixed;z-index:50;display:flex;font-family:Inter,sans-serif}'
    + '#cc-rail a{display:flex;align-items:center;gap:8px;text-decoration:none;color:#fff;background:#0f2952;font-weight:700;font-size:.82rem;line-height:1.2}'
    + '#cc-rail a:first-child{background:#c9a84c;color:#0f2952}'
    + '#cc-rail .i{font-size:1.05rem;line-height:1}'
    + '@media (min-width:1040px){'
    +   '#cc-rail{top:50%;transform:translateY(-50%);right:max(16px,calc(50% - 520px));flex-direction:column;gap:10px}'
    +   '#cc-rail a{width:168px;padding:12px 14px;border-radius:10px;box-shadow:0 4px 14px rgba(15,41,82,.18)}'
    +   '#cc-rail a:hover{filter:brightness(1.1)}'
    + '}'
    + '@media (max-width:1039px){'
    +   '#cc-rail{left:0;right:0;bottom:0;background:#0f2952;padding:6px 6px calc(6px + env(safe-area-inset-bottom));gap:6px;box-shadow:0 -3px 12px rgba(15,41,82,.2)}'
    +   '#cc-rail a{flex:1 1 0;justify-content:center;flex-direction:column;gap:3px;padding:8px 4px;border-radius:8px;font-size:.72rem;text-align:center}'
    +   'body{padding-bottom:calc(64px + env(safe-area-inset-bottom))}'
    + '}'
    + '@media print{#cc-rail{display:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  var nav = document.createElement('nav');
  nav.id = 'cc-rail';
  nav.setAttribute('aria-label', 'ComplaintCA shortcuts');
  links.forEach(function(l){
    var a = document.createElement('a');
    a.href = l.href;
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
