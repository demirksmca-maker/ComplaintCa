// Blog rating: a small fixed "Rate ★★★★★" pill on blog posts.
// Sends a GA4 event (article_rating) and adds one to today's anonymous counter
// (/api/blog-rating). No review/rating schema is added, so search results are not affected.
(function(){
  if (document.getElementById('cc-rate')) return;
  var path = location.pathname;
  var key = 'cc-rate:' + path;
  try { if (localStorage.getItem(key)) return; } catch (e) {}

  // Desktop: top-right of the article column. Mobile: just above the site rail bar.
  var css = ''
    + '#cc-rate{position:fixed;z-index:60;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #c9a84c;border-radius:999px;box-shadow:0 6px 20px rgba(15,41,82,.22);font:600 12px Inter,system-ui,sans-serif;color:#0f2952;transition:opacity .4s}'
    + '#cc-rate .t{font:700 13px Cinzel,serif;letter-spacing:2px;text-transform:uppercase;color:#0f2952;margin-right:4px}'
    + '#cc-rate button{background:none;border:0;cursor:pointer;font-size:26px;line-height:1;color:#d4a72c;padding:0 2px}'
    + '#cc-rate button.off{color:#cbd5e1}'
    + '#cc-rate button:focus-visible{outline:2px solid #1a4fa0;border-radius:4px}'
    + '@media (min-width:1040px){#cc-rate{top:16px;right:calc(50% - 296px);padding:8px 16px}}'
    + '@media (max-width:1039px){#cc-rate{left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));justify-content:center;padding:8px 12px}}'
    + '@media print{#cc-rate{display:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'cc-rate';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Rate this article');
  var t = document.createElement('span');
  t.className = 't';
  t.textContent = 'Rate';
  box.appendChild(t);

  // All five stars stay lit; hovering dims the ones above the pointer.
  var stars = [];
  function paint(n){ stars.forEach(function(b, i){ b.className = i < n ? '' : 'off'; }); }
  for (var i = 1; i <= 5; i++) (function(n){
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = '★';
    b.setAttribute('aria-label', n + ' out of 5');
    b.onmouseenter = function(){ paint(n); };
    b.onfocus = function(){ paint(n); };
    b.onclick = function(){
      if (typeof gtag === 'function') {
        gtag('event', 'article_rating', { rating: n, value: n, page_path: path, page_title: document.title });
      }
      // Also counted (no personal data) for the "rated today" line on the home page.
      try {
        fetch('/api/blog-rating', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path, rating: n }) }).catch(function(){});
      } catch (e) {}
      try { localStorage.setItem(key, String(n)); } catch (e) {}
      box.textContent = 'Thanks ✓';
      setTimeout(function(){ box.style.opacity = '0'; }, 2000);
      setTimeout(function(){ box.remove(); }, 2500);
    };
    stars.push(b);
    box.appendChild(b);
  })(i);
  box.onmouseleave = function(){ paint(5); };
  document.body.appendChild(box);
})();
