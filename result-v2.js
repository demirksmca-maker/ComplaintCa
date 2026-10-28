// Result screen v2 (the /demo/sonuc.html theme) — a visual layer on top of the
// submit engine. doSubmit() saves, e-mails and fills the classic #scs-screen
// exactly as before; this only draws the 6-card screen over it from the same data.
// The classic screen stays underneath as the backup ("Classic view").
// On for everyone. /?new=0 switches back to the classic screen for this browser, /?new=1 undoes that.
(function(){
  var KEY = 'cc_rv2';
  try{
    var q = new URLSearchParams(location.search).get('new');
    if (q === '0') localStorage.setItem(KEY, '0');
    else if (q === '1') localStorage.removeItem(KEY);
  }catch(e){}
  function on(){ try{ return localStorage.getItem(KEY) !== '0'; }catch(e){ return true; } }

  var D = {
    en:{h:'Complaint Sent', sub:'Your complaint is on its way. Here is everything you can do next.', quote:'Justice delayed is justice denied.',
      s1:'Sent', s2:'Your Rights', s2s:'If there is no reply', s3:'Institutions', s4:'Your Letter', s4s:'View, copy', s5:'Free Lawyer', s5s:'Near you', s6:'Your MP', s6s:'Forward it',
      flag:'NEXT STEP', boost:'+{n} BACKUP ROUTES', bodies:'{n} bodies', note:'Keep your reference number. Institutions must reply to a formal complaint.',
      ref:'REFERENCE', copy:'Copy', copied:'Copied', keep:'Use this number to track your complaint from any device.',
      chainP:'If there is no reply in the usual time, these are your next steps, in order:',
      noChain:'Your options depend on your province and topic. A free lawyer can tell you exactly where you stand.',
      instP:'Where your complaint goes, and who to contact if needed.', sentTo:'SENT', form:'FORM', phone:'PHONE',
      letterP:'The letter sent with your complaint.', copyLetter:'Copy Letter',
      lawP:'Free and low-cost legal help for your situation:', lawGo:'Open Lawyer Finder',
      mpP:'Not required. An MP office can often speak to an institution directly. Find yours by postal code.', mpGo:'Find My MP',
      track:'Track My Complaint', another:'Submit Another', classic:'Classic view', close:'Close'},
    tr:{h:'Şikayetin Gönderildi', sub:'Şikayetin yola çıktı. Bundan sonra yapabileceğin her şey burada.', quote:'Geciken adalet, adalet değildir.',
      s1:'Gönderildi', s2:'Yasal Hakların', s2s:'Cevap gelmezse', s3:'Kurumlar', s4:'Mektubun', s4s:'Gör, kopyala', s5:'Ücretsiz Avukat', s5s:'Adresine yakın', s6:'Milletvekilin', s6s:'Ona da ilet',
      flag:'SIRADAKİ ADIM', boost:'+{n} YEDEK YOL', bodies:'{n} kurum', note:'Referans numaranı sakla. Kurumlar resmi bir şikayete cevap vermek zorundadır.',
      ref:'REFERANS', copy:'Kopyala', copied:'Kopyalandı', keep:'Bu numarayla şikayetini her cihazdan takip edebilirsin.',
      chainP:'Normal sürede cevap gelmezse sıradaki adımların bunlar:',
      noChain:'Seçeneklerin eyaletine ve konuna göre değişir. Ücretsiz bir avukat sana tam olarak nerede durduğunu söyler.',
      instP:'Şikayetinin gittiği yer ve gerekirse ulaşacağın kurumlar.', sentTo:'GİTTİ', form:'FORM', phone:'TELEFON',
      letterP:'Şikayetinle birlikte giden mektup.', copyLetter:'Mektubu Kopyala',
      lawP:'Durumun için ücretsiz ve ucuz hukuk yardımı:', lawGo:'Avukat Bulucuyu Aç',
      mpP:'Zorunlu değil. Milletvekili ofisleri kurumla çoğu zaman doğrudan konuşabilir. Posta kodunla bul.', mpGo:'Milletvekilimi Bul',
      track:'Şikayetimi Takip Et', another:'Yeni Şikayet', classic:'Klasik görünüm', close:'Kapat'},
    fr:{h:'Plainte envoyée', sub:'Votre plainte est en route. Voici tout ce que vous pouvez faire ensuite.', quote:'Justice différée est justice refusée.',
      s1:'Envoyée', s2:'Vos droits', s2s:'Sans réponse', s3:'Organismes', s4:'Votre lettre', s4s:'Voir, copier', s5:'Avocat gratuit', s5s:'Près de chez vous', s6:'Votre député', s6s:'Lui transmettre',
      flag:'PROCHAINE ÉTAPE', boost:'+{n} RECOURS', bodies:'{n} organismes', note:'Gardez votre numéro de référence. Les organismes doivent répondre à une plainte officielle.',
      ref:'RÉFÉRENCE', copy:'Copier', copied:'Copié', keep:'Ce numéro permet de suivre votre plainte depuis n’importe quel appareil.',
      chainP:'Sans réponse dans le délai habituel, voici vos prochaines étapes :',
      noChain:'Vos options dépendent de votre province et du sujet. Un avocat gratuit peut vous dire où vous en êtes.',
      instP:'Où va votre plainte, et qui contacter au besoin.', sentTo:'ENVOYÉE', form:'FORMULAIRE', phone:'TÉLÉPHONE',
      letterP:'La lettre envoyée avec votre plainte.', copyLetter:'Copier la lettre',
      lawP:'Aide juridique gratuite ou à faible coût :', lawGo:'Trouver un avocat',
      mpP:'Facultatif. Le bureau d’un député peut souvent parler directement à l’organisme. Trouvez le vôtre par code postal.', mpGo:'Trouver mon député',
      track:'Suivre ma plainte', another:'Nouvelle plainte', classic:'Vue classique', close:'Fermer'},
    es:{h:'Queja enviada', sub:'Tu queja va en camino. Aquí tienes todo lo que puedes hacer ahora.', quote:'Justicia que tarda no es justicia.',
      s1:'Enviada', s2:'Tus derechos', s2s:'Si no responden', s3:'Instituciones', s4:'Tu carta', s4s:'Ver, copiar', s5:'Abogado gratis', s5s:'Cerca de ti', s6:'Tu diputado', s6s:'Reenviársela',
      flag:'SIGUIENTE PASO', boost:'+{n} VÍAS EXTRA', bodies:'{n} instituciones', note:'Guarda tu número de referencia. Las instituciones deben responder a una queja formal.',
      ref:'REFERENCIA', copy:'Copiar', copied:'Copiado', keep:'Con este número puedes seguir tu queja desde cualquier dispositivo.',
      chainP:'Si no hay respuesta en el plazo habitual, estos son tus siguientes pasos:',
      noChain:'Tus opciones dependen de tu provincia y del tema. Un abogado gratuito puede decirte dónde estás.',
      instP:'Adónde va tu queja y a quién contactar si hace falta.', sentTo:'ENVIADA', form:'FORMULARIO', phone:'TELÉFONO',
      letterP:'La carta enviada con tu queja.', copyLetter:'Copiar carta',
      lawP:'Ayuda legal gratuita o de bajo costo:', lawGo:'Buscar abogado',
      mpP:'No es obligatorio. La oficina de un diputado a menudo habla directamente con la institución. Búscalo por código postal.', mpGo:'Buscar mi diputado',
      track:'Seguir mi queja', another:'Nueva queja', classic:'Vista clásica', close:'Cerrar'}
  };
  function lang(){ var l = 'en'; try{ l = localStorage.getItem('cc_lang') || document.documentElement.lang || 'en'; }catch(e){} return D[l] ? l : 'en'; }
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var isMail = function(e){ return /^[^\s@\/]+@[^\s@\/]+\.[a-z]{2,}$/i.test(e || ''); };
  var webUrl = function(u){ u = /^https?:\/\//i.test(u || '') ? u : (u ? 'https://' + u : ''); return /^https:\/\/[^\s"<>]+$/i.test(u) ? u : ''; };

  var CSS = '#rv2{position:fixed;inset:0;z-index:10000;overflow:auto;color:#fff;font-family:Inter,system-ui,sans-serif;background:linear-gradient(rgba(26,6,32,.8),rgba(14,3,18,.94)),#160a1c url(/assets/brand/flag-aubergine-wave.webp) center/cover no-repeat;-webkit-tap-highlight-color:transparent;text-align:left}'
  + '#rv2 *{box-sizing:border-box;margin:0;padding:0}#rv2 button{font:inherit;color:inherit;border:0;background:none}#rv2 [hidden]{display:none!important}'
  + '#rv2 .wrap{max-width:560px;margin:0 auto;padding:26px 16px calc(28px + env(safe-area-inset-bottom,0px))}'
  + '@property --a{syntax:"<angle>";inherits:false;initial-value:0deg}'
  + '@keyframes rv2spin{to{--a:360deg}}@keyframes rv2up{from{transform:translateY(14px);opacity:0}}@keyframes rv2gild{50%{background-position:100% 0}}@keyframes rv2shine{40%,100%{transform:translateX(120%)}}@keyframes rv2pop{from{transform:scale(.4);opacity:0}}'
  + '@keyframes rv2glow{50%{box-shadow:0 0 18px rgba(255,77,121,.9)}}@keyframes rv2bglow{50%{box-shadow:0 0 18px rgba(250,204,21,.7);border-color:#fde047}}@keyframes rv2float{50%{transform:translateY(-2px)}}'
  + '#rv2 h1{text-align:center;font:700 24px/1.15 Cinzel,Georgia,serif;letter-spacing:.04em;font-variant:small-caps;background:linear-gradient(100deg,#fff 30%,#d5b9eb 50%,#fff 70%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:rv2gild 6s ease-in-out infinite}'
  + '#rv2 .sub{text-align:center;margin:6px auto 16px;max-width:380px;font:italic 400 17px/1.35 "EB Garamond",Georgia,serif;background:linear-gradient(180deg,#fff3c4 0%,#e6c35c 35%,#b8860b 60%,#f5d97a 85%,#a67c00 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}'
  + '#rv2 .quote{position:relative;padding:2px 0 2px 14px;margin:0 4px 16px;font:italic 400 17px/1.35 "EB Garamond",Georgia,serif;color:#eadcf3}'
  + '#rv2 .quote::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:1.5px;background:linear-gradient(180deg,transparent,#cfb0e8 20%,#cfb0e8 80%,transparent)}'
  + '#rv2 .quote cite{display:flex;align-items:center;gap:8px;margin-top:6px;font:700 11px/1 Cinzel,Georgia,serif;font-style:normal;letter-spacing:.24em;color:#cfb0e8}'
  + '#rv2 .quote cite::before{content:"";width:22px;height:1px;background:linear-gradient(90deg,transparent,#cfb0e8)}'
  + '#rv2 .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
  + '#rv2 .card{--a:0deg;position:relative;overflow:hidden;min-height:150px;padding:14px;border-radius:16px;border:1px solid rgba(244,214,255,.22);background:var(--g);box-shadow:inset 0 1px 0 rgba(255,230,250,.22),inset 0 -20px 40px -20px rgba(20,4,30,.6),0 14px 30px -18px rgba(190,24,93,.55);display:flex;flex-direction:column;justify-content:space-between;text-align:right;cursor:pointer;animation:rv2up .6s ease-out both;transition:transform .2s}'
  + '#rv2 .card:active{transform:scale(.97)}#rv2 .card::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 80% at 0% 0%,rgba(255,220,245,.22),transparent 55%)}#rv2 .card>*{position:relative}'
  + '#rv2 .card svg{width:30px;height:30px;stroke:#fff;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}'
  + '#rv2 .card .n{position:absolute;top:12px;right:14px;font:700 12px/1 Cinzel,Georgia,serif;font-style:normal;color:rgba(211,181,234,.75)}'
  + '#rv2 .card b{display:block;font:700 16px/1.2 Cinzel,Georgia,serif;font-variant:small-caps;letter-spacing:.02em}'
  + '#rv2 .card span{display:block;margin-top:4px;font:italic 400 15px/1.3 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '#rv2 .card .ok{position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;background:linear-gradient(180deg,#f3ecff,#cdb6f5);color:#2a0814;display:none;place-items:center;font:800 14px/1 Inter,sans-serif;font-style:normal}'
  + '#rv2 .card.done .ok{display:grid}#rv2 .card.done .n{display:none}'
  + '#rv2 .card:nth-child(1){--g:linear-gradient(155deg,rgba(138,92,246,.55),rgba(88,28,135,.38) 55%,rgba(46,16,80,.3))}'
  + '#rv2 .card:nth-child(2){--g:linear-gradient(155deg,rgba(190,24,93,.55),rgba(120,20,70,.38) 55%,rgba(60,10,40,.3));animation-delay:.06s}'
  + '#rv2 .card:nth-child(3){--g:linear-gradient(155deg,rgba(124,58,237,.55),rgba(109,40,140,.38) 55%,rgba(50,14,70,.3));animation-delay:.12s}'
  + '#rv2 .card:nth-child(4){--g:linear-gradient(155deg,rgba(225,29,72,.55),rgba(136,19,55,.38) 55%,rgba(70,10,35,.3));animation-delay:.18s}'
  + '#rv2 .card:nth-child(5){--g:linear-gradient(155deg,rgba(168,85,247,.55),rgba(126,34,206,.38) 55%,rgba(60,12,90,.3));animation-delay:.24s}'
  + '#rv2 .card:nth-child(6){--g:linear-gradient(155deg,rgba(159,18,57,.55),rgba(97,22,90,.38) 55%,rgba(45,10,55,.3));animation-delay:.30s}'
  + '#rv2 .card.main::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:2px;pointer-events:none;background:conic-gradient(from var(--a),transparent,#f9a8d4,#fff,#c4b5fd,transparent 40%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:rv2spin 3.5s linear infinite}'
  + '#rv2 .card.main{filter:brightness(1.25) saturate(1.15);min-height:200px;box-shadow:inset 0 1px 0 rgba(255,230,250,.35),0 0 26px -4px rgba(249,168,212,.65),0 14px 34px -14px rgba(190,24,93,.8)}'
  + '#rv2 .flag{position:absolute;top:10px;right:10px;z-index:3;padding:5px 8px;border-radius:999px;background:linear-gradient(90deg,#ff4d79,#b36bff);font:700 9px/1 Cinzel,serif;font-style:normal;letter-spacing:.12em;color:#fff;box-shadow:0 2px 10px rgba(255,77,121,.5);animation:rv2glow 1.8s ease-in-out infinite}'
  + '#rv2 .card .flag~.n{display:none}'
  + '#rv2 .boost{position:relative;overflow:hidden;display:inline-flex;margin-top:8px;padding:7px 14px;border-radius:999px;background:linear-gradient(135deg,rgba(250,204,21,.22),rgba(245,158,11,.14));border:1px solid rgba(253,224,71,.7);color:#fde68a;font:800 13px/1 Inter,system-ui,sans-serif;font-style:normal;letter-spacing:.06em;text-shadow:0 0 8px rgba(250,204,21,.45);animation:rv2bglow 1.8s ease-in-out infinite,rv2float 3s ease-in-out infinite}'
  + '#rv2 .boost::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);transform:translateX(-120%);animation:rv2shine 2.8s ease-in-out infinite;pointer-events:none}'
  + '#rv2 .orn{display:flex;align-items:center;justify-content:center;gap:10px;margin:18px 0 4px;color:#cfb0e8}'
  + '#rv2 .orn i{display:block;width:56px;height:1px;background:linear-gradient(90deg,transparent,#cfb0e8)}#rv2 .orn i:last-child{transform:scaleX(-1)}'
  + '#rv2 .note{margin-top:10px;text-align:center;font:italic 400 16px/1.35 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.85)}'
  + '#rv2 .dim{position:fixed;inset:0;z-index:2;background:rgba(10,2,14,.6);opacity:0;pointer-events:none;transition:opacity .2s}#rv2 .dim.on{opacity:1;pointer-events:auto}'
  + '#rv2 .sheet{position:fixed;left:50%;bottom:0;z-index:3;width:min(560px,100%);max-height:86dvh;overflow:auto;transform:translate(-50%,105%);transition:transform .3s cubic-bezier(.2,.8,.2,1);background:#14040f radial-gradient(ellipse 95% 60% at 50% 0%,#4a0b2e,#24091c 55%,#14040f);border:1px solid rgba(196,160,255,.5);border-bottom:0;border-radius:24px 24px 0 0;padding:10px 18px calc(22px + env(safe-area-inset-bottom,0px))}'
  + '#rv2 .sheet.on{transform:translate(-50%,0)}#rv2 .grab{width:42px;height:4px;margin:0 auto 12px;border-radius:4px;background:rgba(207,176,232,.4)}'
  + '#rv2 .sh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}#rv2 .sh h2{font:700 19px/1.2 Cinzel,Georgia,serif;font-variant:small-caps;letter-spacing:.03em;color:#fff}'
  + '#rv2 .x{width:36px;height:36px;flex:none;border-radius:50%;border:1px solid rgba(196,160,255,.45);background:rgba(24,4,16,.5);font-size:18px;cursor:pointer}'
  + '#rv2 .p{font:400 17px/1.45 "EB Garamond",Georgia,serif;color:#eadcf3}'
  + '#rv2 .sum{display:grid;gap:8px;margin:12px 0 4px}#rv2 .sum div{padding:10px 12px;border-radius:12px;background:rgba(24,4,16,.5);border:1px solid rgba(196,160,255,.25);font:400 16px/1.3 "EB Garamond",Georgia,serif;color:#eadcf3}'
  + '#rv2 .inst{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;margin-bottom:8px;border-radius:14px;border:1px solid rgba(196,160,255,.35);background:rgba(24,4,16,.45);text-align:left;color:#f7eef1;text-decoration:none}'
  + '#rv2 .inst div{flex:1;min-width:0}#rv2 .inst b{display:block;font:500 17px/1.2 "EB Garamond",Georgia,serif}'
  + '#rv2 .inst small{display:block;margin-top:2px;font:italic 400 14px/1.25 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.75);overflow-wrap:anywhere}'
  + '#rv2 .inst em{flex:none;font:700 9.5px/1 Cinzel,serif;font-style:normal;letter-spacing:.1em;padding:5px 7px;border-radius:6px;background:#2e0f52;border:1px solid rgba(196,160,255,.5)}'
  + '#rv2 .av{width:44px;height:44px;flex:none;border-radius:12px;display:grid;place-items:center;background:rgba(110,45,180,.5);font-size:20px}'
  + '#rv2 .chain{margin-top:10px;padding:12px 14px;border-radius:14px;background:rgba(24,4,16,.45);border:1px solid rgba(196,160,255,.3)}'
  + '#rv2 .chain div{color:#eadcf3!important}#rv2 .chain a{color:#fde68a!important}'
  + '#rv2 .letter{padding:16px;border-radius:12px;background:#f6ecd9;color:#2a0814;font:400 16px/1.45 "EB Garamond",Georgia,serif;white-space:pre-wrap;box-shadow:inset 0 0 30px rgba(120,80,40,.15)}'
  + '#rv2 .refbox{text-align:center;padding:16px;border-radius:16px;background:linear-gradient(155deg,rgba(138,92,246,.5),rgba(190,24,93,.35));border:1px solid rgba(244,214,255,.28)}'
  + '#rv2 .refbox small{font:700 11px/1 Cinzel,serif;letter-spacing:.2em;color:#cfb0e8}#rv2 .refbox strong{display:block;margin:8px 0 10px;font:700 22px/1 Cinzel,serif;letter-spacing:.1em}'
  + '#rv2 .mini{display:inline-block;padding:7px 14px;border-radius:999px;border:1px solid rgba(196,160,255,.5);color:#eadcf3;font:700 11px/1 Cinzel,serif;letter-spacing:.08em;cursor:pointer}'
  + '#rv2 .seal{width:76px;height:76px;margin:6px auto 12px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#8b3fd1,#3a0f68 70%);box-shadow:0 0 0 6px rgba(139,63,209,.15),0 14px 40px -10px rgba(190,24,93,.6);font-size:34px;animation:rv2pop .6s cubic-bezier(.2,.9,.3,1.3) both}'
  + '#rv2 .go{--a:0deg;position:relative;overflow:hidden;display:flex;width:100%;align-items:center;justify-content:center;gap:12px;margin-top:14px;padding:16px 20px;border:1.5px solid transparent;border-radius:18px;font:700 16px/1 Cinzel,Georgia,serif;font-variant:small-caps;letter-spacing:.08em;color:#fff;cursor:pointer;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%) padding-box,linear-gradient(180deg,#2b0d1f,#1a0714 60%,#12040e) padding-box,conic-gradient(from var(--a),#ff4d79,#f6c8a8,#e9e6f2,#b36bff,#ff4d79) border-box;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 12px 30px -12px rgba(255,77,121,.6),0 0 24px -6px rgba(179,107,255,.45);animation:rv2spin 6s linear infinite}'
  + '#rv2 .go::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(234,220,245,.4) 50%,transparent 70%);transform:translateX(-120%);animation:rv2shine 4.5s 1.2s ease-in-out infinite;pointer-events:none}'
  + '#rv2 .ghost{display:block;width:100%;margin-top:10px;padding:12px;border-radius:999px;border:1px solid rgba(207,176,232,.45);color:#d5b9eb;font:700 11px/1 Cinzel,serif;letter-spacing:.14em;cursor:pointer;text-transform:uppercase}'
  + '#rv2 .link{display:block;margin:14px auto 0;color:rgba(213,185,235,.7);font:italic 400 15px/1 "EB Garamond",Georgia,serif;text-decoration:underline;cursor:pointer}'
  + '#rv2 .hint{margin-top:8px;text-align:center;font:italic 400 15px/1.3 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.75)}'
  + '@media (max-width:360px){#rv2 .card b{font-size:14px}#rv2 .card span{font-size:14px}}'
  + '@media (prefers-reduced-motion:reduce){#rv2 *,#rv2 *::before,#rv2 *::after{animation:none!important;transition:none!important}}';

  var IC = {
    send:'<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    rights:'<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0zM8 21h8"/>',
    inst:'<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z"/>',
    letter:'<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    lawyer:'<circle cx="12" cy="7" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/><path d="M12 15l-1.5 3L12 21l1.5-3z"/>',
    mp:'<path d="M3 21h18M5 21V11M19 21V11M9 21v-6h6v6M3 11l9-7 9 7"/>'
  };

  // d = {c, ref, auths, draft, chain, prov, area} — all produced by doSubmit().
  function show(d){
    if (!on() || !d || !d.ref) return;
    var R = D[lang()], ov = document.getElementById('rv2');
    if (ov) ov.remove();
    if (!document.getElementById('rv2-css')){ var st = document.createElement('style'); st.id = 'rv2-css'; st.textContent = CSS; document.head.appendChild(st); }
    var auths = (d.auths || []).filter(function(a){ return a && a.name; });
    var lawyers = ((window.LAWYERS || {})[d.prov] || {})[d.area] || [];
    var nBackup = (String(d.chain || '').match(/<a /g) || []).length;
    var card = function(k, n, b, s, extra){
      return '<button type="button" class="card' + (extra || '') + '" data-s="' + k + '">' + (k === 'rights' && nBackup ? '<i class="flag">' + esc(R.flag) + '</i>' : '')
        + '<svg viewBox="0 0 24 24">' + IC[k] + '</svg><i class="n">' + n + '</i><i class="ok">✓</i><div><b>' + esc(b) + '</b><span>' + esc(s) + '</span>'
        + (k === 'rights' && nBackup ? '<i class="boost">' + esc(R.boost.replace('{n}', nBackup)) + '</i>' : '') + '</div></button>';
    };
    ov = document.createElement('div');
    ov.id = 'rv2'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', R.h);
    ov.innerHTML = '<main class="wrap"><h1>' + esc(R.h) + '</h1><p class="sub">' + esc(R.sub) + '</p>'
      + '<blockquote class="quote">' + esc(R.quote) + '<cite>W·E·GLADSTONE</cite></blockquote><div class="grid">'
      + card('send', 'I', R.s1, d.ref, ' done')
      + card('rights', 'II', R.s2, R.s2s, nBackup ? ' main' : '')
      + card('inst', 'III', R.s3, auths.length > 1 ? R.bodies.replace('{n}', auths.length) : (auths[0] ? auths[0].name : '—'))
      + card('letter', 'IV', R.s4, R.s4s)
      + card('lawyer', 'V', R.s5, R.s5s)
      + card('mp', 'VI', R.s6, R.s6s)
      + '</div><div class="orn"><i></i>✦<i></i></div><p class="note">' + esc(R.note) + '</p>'
      + '<button type="button" class="go" data-a="track">' + esc(R.track) + '</button>'
      + '<button type="button" class="ghost" data-a="another">' + esc(R.another) + '</button>'
      + '<button type="button" class="link" data-a="classic">' + esc(R.classic) + '</button></main>'
      + '<div class="dim"></div><section class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sh"><h2></h2><button type="button" class="x" aria-label="' + esc(R.close) + '">×</button></div><div class="sb"></div></section>';
    document.body.appendChild(ov);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var q = function(s){ return ov.querySelector(s); };

    function liveText(id){ var e = document.getElementById(id); return e && e.style.display !== 'none' ? e.textContent.trim() : ''; }
    var VIEWS = {
      send: function(){
        var rows = [liveText('email-status'), liveText('sync-note')].filter(Boolean);
        return [R.s1, '<div class="seal">✓</div><div class="refbox"><small>' + esc(R.ref) + '</small><strong>' + esc(d.ref) + '</strong><button type="button" class="mini" data-a="copyref">' + esc(R.copy) + '</button></div>'
          + (rows.length ? '<div class="sum">' + rows.map(function(r){ return '<div>' + esc(r) + '</div>'; }).join('') + '</div>' : '')
          + '<p class="hint">' + esc(R.keep) + '</p>'];
      },
      rights: function(){
        return [R.s2, d.chain ? '<p class="p">' + esc(R.chainP) + '</p><div class="chain">' + d.chain + '</div>'
          : '<p class="p">' + esc(R.noChain) + '</p><button type="button" class="go" data-a="lawyer">' + esc(R.lawGo) + '</button>'];
      },
      inst: function(){
        var h = '<p class="p" style="margin-bottom:12px">' + esc(R.instP) + '</p>';
        auths.forEach(function(a, i){
          var mail = isMail(a.email), url = !mail && a.email ? webUrl(a.email) : '';
          var href = mail ? 'mailto:' + a.email : url || (a.phone ? 'tel:' + String(a.phone).replace(/[^\d+]/g, '') : '');
          var tag = mail ? (i === 0 ? R.sentTo : '') : url ? R.form : a.phone ? R.phone : '';
          h += (href ? '<a class="inst" href="' + esc(href) + '"' + (url ? ' target="_blank" rel="noopener"' : '') + '>' : '<div class="inst">')
            + '<span class="av">🏛</span><div><b>' + esc(a.name) + '</b><small>' + esc(mail ? a.email : (a.phone || a.note || '')) + '</small></div>'
            + (tag ? '<em>' + esc(tag) + '</em>' : '') + (href ? '</a>' : '</div>');
        });
        return [R.s3, h];
      },
      letter: function(){
        return [R.s4, '<p class="p" style="margin-bottom:10px">' + esc(R.letterP) + '</p><div class="letter">' + esc(d.draft || '') + '</div>'
          + '<button type="button" class="go" data-a="copyletter">' + esc(R.copyLetter) + '</button>'];
      },
      lawyer: function(){
        var h = lawyers.length ? '<p class="p" style="margin-bottom:12px">' + esc(R.lawP) + '</p>' : '';
        lawyers.slice(0, 4).forEach(function(l){
          var u = webUrl(l.url);
          h += (u ? '<a class="inst" href="' + esc(u) + '" target="_blank" rel="noopener">' : '<div class="inst">') + '<span class="av">⚖</span><div><b>' + esc(l.name) + '</b><small>' + esc(l.note || l.phone || '') + '</small></div>'
            + (l.badge ? '<em>' + esc(l.badge) + '</em>' : '') + (u ? '</a>' : '</div>');
        });
        return [R.s5, h + '<button type="button" class="go" data-a="lawyer">' + esc(R.lawGo) + '</button>'];
      },
      mp: function(){
        return [R.s6, '<p class="p">' + esc(R.mpP) + '</p><button type="button" class="go" data-a="mp">' + esc(R.mpGo) + '</button>'];
      }
    };

    function open(k){
      var v = VIEWS[k](); q('.sh h2').textContent = v[0]; q('.sb').innerHTML = v[1];
      q('.dim').classList.add('on'); q('.sheet').classList.add('on'); q('.sheet').scrollTop = 0;
    }
    function closeSheet(){ q('.dim').classList.remove('on'); q('.sheet').classList.remove('on'); }
    function closeAll(){ ov.remove(); document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); }
    function onKey(e){ if (e.key === 'Escape') q('.sheet.on') ? closeSheet() : closeAll(); }
    function copy(text, btn){
      var done = function(){ if (btn){ btn.textContent = R.copied; } };
      try{ navigator.clipboard.writeText(text).then(done, done); }catch(e){ done(); }
    }
    document.addEventListener('keydown', onKey);
    q('.dim').onclick = closeSheet; q('.x').onclick = closeSheet;
    ov.addEventListener('click', function(e){
      var t = e.target.closest('[data-s],[data-a]'); if (!t) return;
      if (t.dataset.s){ open(t.dataset.s); return; }
      var a = t.dataset.a;
      if (a === 'copyref') copy(d.ref, t);
      else if (a === 'copyletter') copy(d.draft || '', t);
      else if (a === 'classic') closeAll();
      else if (a === 'mp'){ closeSheet(); if (typeof window.mvOpen === 'function') window.mvOpen(d.ref); }
      else if (a === 'lawyer'){
        closeAll();
        if (d.area && typeof window.goToLawyer === 'function') window.goToLawyer(d.prov, d.area);
        else if (typeof window.goApp === 'function') window.goApp('lawyer');
      }
      else if (a === 'track'){
        closeAll();
        if (typeof window.goApp === 'function') window.goApp('track');
        var inp = document.getElementById('trk-inp'); if (inp) inp.value = d.ref;
      }
      else if (a === 'another'){ closeAll(); if (typeof window.resetForm === 'function') window.resetForm(); }
    });
  }

  window.ccResultV2 = { show:show, on:on };
})();
