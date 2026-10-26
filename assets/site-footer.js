(function(){
  if(document.getElementById('cc-foot'))return;
  var s=document.createElement('style');
  s.textContent='#cc-foot{background:#0f2952;color:rgba(255,255,255,.72);font:13px/1.6 Inter,system-ui,sans-serif;text-align:center;padding:26px 16px 30px;margin-top:32px}'
   +'#cc-foot b{display:block;color:#fff;font:700 14px Cinzel,Georgia,serif;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}'
   +'#cc-foot nav{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 18px;margin-bottom:10px}'
   +'#cc-foot a{color:#fff;text-decoration:none;opacity:.9}#cc-foot a:hover{text-decoration:underline;opacity:1}'
   +'#cc-foot small{display:block;font-size:11.5px;opacity:.7;max-width:520px;margin:0 auto}';
  document.head.appendChild(s);
  var f=document.createElement('footer');f.id='cc-foot';
  f.innerHTML='<b lang="en">ComplaintCA</b><nav><a href="/">Home</a><a href="/about.html">About</a><a href="/guides/">Guides</a><a href="/blog/">Blog</a><a href="/privacy.html">Privacy Policy</a><a href="/terms.html">Terms of Service</a></nav>'
   +'<small>© '+new Date().getFullYear()+' ComplaintCA · complaintca.ca. General information, not legal advice. Not affiliated with any government body.</small>';
  document.body.appendChild(f);
  // On the app page ("/"), a plain href="/" is a no-op while a tab is open:
  // go back to the home screen instead.
  var h=f.querySelector('nav a[href="/"]');
  if(h)h.addEventListener('click',function(e){
    var p=location.pathname;
    if((p==='/'||p==='/index.html')&&typeof window.goHome==='function'){
      e.preventDefault();
      try{window.goHome();}catch(x){location.href='/';}
    }
  });
})();
