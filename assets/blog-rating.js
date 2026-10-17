// Blog rating: "Was this article helpful?" 1-5 stars at the end of a post.
// Only sends a GA4 event (article_rating). Nothing is stored on a server and
// no review/rating schema is added, so search results are not affected.
(function(){
  if (document.getElementById('cc-rate')) return;
  var main = document.querySelector('main');
  if (!main) return;
  var path = location.pathname;
  var key = 'cc-rate:' + path;
  var done = null;
  try { done = localStorage.getItem(key); } catch (e) {}

  var css = ''
    + '#cc-rate{margin:28px 0 8px;padding:18px 16px;background:#fff;border:1px solid #dbeafe;border-radius:12px;text-align:center}'
    + '#cc-rate .t{font-family:Cinzel,serif;font-size:.62rem;letter-spacing:2.5px;text-transform:uppercase;color:#c9a84c;font-weight:700;margin-bottom:6px}'
    + '#cc-rate p{margin:0 0 10px;color:#0f2952;font-weight:600;font-size:.95rem}'
    + '#cc-rate .s{display:inline-flex;gap:4px}'
    + '#cc-rate button{background:none;border:0;cursor:pointer;font-size:1.9rem;line-height:1;color:#cbd5e1;padding:2px 4px}'
    + '#cc-rate button.on{color:#c9a84c}'
    + '#cc-rate button:focus-visible{outline:2px solid #1a4fa0;border-radius:4px}'
    + '@media print{#cc-rate{display:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('section');
  box.id = 'cc-rate';
  box.setAttribute('aria-label', 'Rate this article');
  var t = document.createElement('div');
  t.className = 't';
  t.textContent = 'Your Rating';
  var q = document.createElement('p');
  box.appendChild(t);
  box.appendChild(q);

  function thanks(n){
    q.textContent = 'Thanks for your feedback! You rated this article ' + n + '/5.';
  }

  if (done) {
    thanks(done);
  } else {
    q.textContent = 'Was this article helpful?';
    var row = document.createElement('div');
    row.className = 's';
    var stars = [];
    function paint(n){ stars.forEach(function(b, i){ b.className = i < n ? 'on' : ''; }); }
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
        try { localStorage.setItem(key, String(n)); } catch (e) {}
        row.remove();
        thanks(n);
      };
      stars.push(b);
      row.appendChild(b);
    })(i);
    row.onmouseleave = function(){ paint(0); };
    box.appendChild(row);
  }
  main.appendChild(box);
})();
