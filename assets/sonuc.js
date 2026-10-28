// SONUÇ: the one result screen of the complaint flow (the /demo/sonuc.html theme).
// The six-step screen hands its answers here (ccSonuc.open). ASYA reads them in the background
// (/api/classify, /api/route, /api/verdict) and six cards show the complaint:
// I send · II rights · III institutions · IV letter · V free lawyer · VI MP (help lines for a safety case).
// Card I checks the e-mail (6-digit code), Turnstile and the agreement, then files it with /api/complaint;
// the same screen then shows the sent state. Nothing is sent until the person taps Send.
(function(){
  if (window.ccSonuc) return;
  var SITEKEY = '0x4AAAAAAD0YTkgBQCsboEB8', COOLDOWN_MS = 5 * 60 * 1000, PASS_KEY = 'cc_mail_pass', SAVE_KEY = 'cc_sonuc', NAME_TOKEN = '[Your name]';

  // ── Text: English, plus the site's French, Spanish and Turkish ──
  var T = {
    en: {
      hLoad:'Preparing Your Complaint', subLoad:'ASYA is reading your answers. This takes a few seconds.',
      h:'Your Complaint Is Ready', sub:'A complaint based on the law gets an answer. Check it, then send.',
      hHelp:'Your Options Are Ready', subHelp:'You decide what happens. Your rights, options and support are here.',
      hSent:'Complaint Sent', subSent:'Your complaint is on its way. Here is everything you can do next.',
      quote:'Justice delayed is justice denied.', safe:'<b>You are not alone.</b> If you are in danger, call <a href="tel:911">911</a> now. Nothing here is sent until you approve it.',
      load:['Reading your answers…','Finding the right institution…','Checking the law for your province…','Writing your letter…'],
      wait:'ASYA is preparing…', note:'Institutions must answer a formal complaint. Nothing is sent until you approve.', noteHelp:'Nothing is sent to anyone until you approve. You can stop at any time.',
      noteSent:'Keep your reference number. Institutions must reply to a formal complaint.', edit:'✎ Edit my answers',
      cSend:'Send Complaint', cSendS:'Check and send', cSendSent:'Sent · {ref}', cRights:'Your Rights', cRightsS:'{n} rules on your side', cRightsNone:'What happens next', cRightsSent:'If there is no reply',
      cInst:'Institutions', cInstS:'{n} selected', cInstNone:'Next steps only', cInstSent:'{n} bodies', cLetter:'Your Letter', cLetterS:'Preview, edit', cLetterSent:'View, copy',
      cLawyer:'Free Lawyer', cLawyerS:'Near you', cMp:'Your MP', cMpS:'If you want', cMpSent:'Forward it', cHelp:'Get Help Now', cHelpS:'24/7 · free · confidential',
      start:'START HERE', ready:'READY', next:'NEXT STEP', boost:'+{n} BACKUP ROUTES', inLetter:'IN YOUR LETTER',
      sum:{ to:'TO', about:'ABOUT', topic:'TOPIC', where:'WHERE', mail:'EMAIL', also:'ALSO' }, toNone:'Saved, with next steps', alsoN:'Ready letter + link for {n} more',
      anon:'Don’t share my name with the institution', namePh:'Your full name', nameWhy:'Your name is required for an urgent complaint or the lawyer pool.',
      agree:'I authorize ComplaintCA to send this complaint to the institution on my behalf and to receive the replies. The information is accurate.', terms:'Statement and terms',
      send:'Send Complaint', sending:'Sending…', hint:'Your email is never shared with the institution.', sos:'If anyone is in danger, call 911.',
      codeMsg:'We sent a 6-digit code to {m}. Check your spam folder too, then enter it here:', codeOk:'Verify and Send', codeRe:'Send the code again',
      codeBad:'Wrong or expired code.', codeMany:'Too many codes. Please wait a few minutes.', codeFail:'Could not send the code. Please try again.',
      high:'This complaint is marked urgent, so a formal, strong notice goes to the institution. Is everything you wrote accurate?', highOk:'Yes, Send', highNo:'Cancel',
      eMail:'Your email address is not valid. Fix it in your answers.', eName:'Please enter your name.', eAgree:'Please confirm the statement above.', eFail:'Something went wrong. Please try again.',
      eCool:'Please wait a few minutes before sending another complaint.', eVerify:'Please complete the check above, then try again.', eSave:'We could not save your complaint. Please try again in a moment.', eUnver:'Please confirm your email again.',
      chkBlank:'The letter still has a blank to fill in.', chkTo:'The letter is not addressed to the institution it is sent to.', chkSame:'The institution receiving the letter is the one you complain about.', chkProv:'The law named is from another province.', chkAgain:'Fix it in Your Letter, or tap Send again to send it as it is.',
      rIntro:'The law is on your side. Everything marked “In your letter” is already in it.', rIntroSent:'If there is no reply in the usual time, these are your next steps, in order:',
      rLaw:'Legal basis', rSanc:'If they do not reply', rDead:'Reply deadlines', rDeadB:'Confirm receipt by {a}. Written reply by {b}.', rRemedy:'What you may recover', rClaim:'Deadline to claim: {d}',
      rLimit:'Time limit to complain', rChain:'Backup routes', rNoLaw:'ASYA could not confirm the exact law right now. A free lawyer (card V) can tell you where you stand.',
      disc:'General information, not legal advice.', seeLetter:'See My Letter',
      iIntro:'ASYA picked the institutions for your topic and place. Add or remove the extra ones.', iIntroSent:'Where your complaint went, and who else you can contact.',
      iPrimary:'ASYA SENDS', iExtra:'LETTER + LINK', iSent:'SENT', iForm:'FORM', iPhone:'PHONE', iPool:'Lawyer pool', iPoolS:'Your case opens to partner lawyers without your name; your name is required.',
      iNone:'No institution matches this place and topic automatically. Your complaint is saved and you get the next steps.', done:'Done', open:'Open', copyLetter:'Copy Letter',
      lIntro:'This is the letter the institution receives.', lIntroSent:'The letter sent with your complaint.', lEdit:'Edit', lDone:'Done', lOk:'Looks Good',
      wIntro:'Free and low-cost legal help where you live:', wAid:'Free legal help if your income qualifies', wFirst:'Send your complaint first. These options stay here after.', wGo:'Open Lawyer Finder',
      mText:'Not required. An MP office can often speak to an institution directly. Find yours by postal code.', mGo:'Find My MP',
      hText:'You decide what happens. These lines are free and confidential; you do not have to go to the police.', exit:'⎋ Quick exit',
      ref:'REFERENCE', copy:'Copy', copied:'Copied', keep:'Use this number to track your complaint from any device.',
      st:['ComplaintCA received it','Sent to the institution','Institution reviewing','Reply received'],
      dSent:'Delivered to {n}.', dForm:'{n} only accepts its official form. Please file there:', dFormGo:'Official Form', dFail:'Automatic sending failed. Please send it from your email app:', dFailGo:'Open My Email App',
      dTest:'TEST · no institution was emailed', dSaved:'Your complaint was saved. Your next steps are in card II.', dMail:'We emailed you the reference number.',
      track:'Track My Complaint', another:'New Complaint', close:'Close', aid:'Legal aid in your province'
    },
    tr: {
      hLoad:'Şikayetin Hazırlanıyor', subLoad:'ASYA cevaplarını okuyor. Birkaç saniye sürer.',
      h:'Şikayetin Hazır', sub:'Kanuna dayanan şikayet cevap alır. Kontrol et, sonra gönder.',
      hHelp:'Seçeneklerin Hazır', subHelp:'Ne olacağına sen karar verirsin. Hakların, seçeneklerin ve destek burada.',
      hSent:'Şikayetin Gönderildi', subSent:'Şikayetin yola çıktı. Bundan sonra yapabileceğin her şey burada.',
      quote:'Geciken adalet, adalet değildir.', safe:'<b>Yalnız değilsin.</b> Tehlikedeysen hemen <a href="tel:911">911</a>’i ara. Burada hiçbir şey sen onaylamadan gönderilmez.',
      load:['Cevapların okunuyor…','Doğru kurum bulunuyor…','Eyaletinin kanunlarına bakılıyor…','Mektubun yazılıyor…'],
      wait:'ASYA hazırlıyor…', note:'Kurumlar resmi bir şikayete cevap vermek zorundadır. Sen onaylamadan hiçbir şey gönderilmez.', noteHelp:'Sen onaylamadan kimseye hiçbir şey gönderilmez. İstediğin an durabilirsin.',
      noteSent:'Referans numaranı sakla. Kurumlar resmi bir şikayete cevap vermek zorundadır.', edit:'✎ Cevaplarımı düzenle',
      cSend:'Şikayet Gönder', cSendS:'Kontrol et, gönder', cSendSent:'Gönderildi · {ref}', cRights:'Yasal Hakların', cRightsS:'{n} kural senin yanında', cRightsNone:'Sonra ne olur', cRightsSent:'Cevap gelmezse',
      cInst:'Kurumlar', cInstS:'{n} seçildi', cInstNone:'Sadece sonraki adımlar', cInstSent:'{n} kurum', cLetter:'Mektubun', cLetterS:'Önizle, düzenle', cLetterSent:'Gör, kopyala',
      cLawyer:'Ücretsiz Avukat', cLawyerS:'Adresine yakın', cMp:'Milletvekilin', cMpS:'İstersen ekle', cMpSent:'Ona da ilet', cHelp:'Hemen Yardım Al', cHelpS:'7/24 · ücretsiz · gizli',
      start:'BURADAN BAŞLA', ready:'HAZIR', next:'SIRADAKİ ADIM', boost:'+{n} YEDEK YOL', inLetter:'MEKTUBUNDA',
      sum:{ to:'KİME', about:'KİMİN HAKKINDA', topic:'KONU', where:'NEREDE', mail:'E-POSTA', also:'AYRICA' }, toNone:'Kaydedilir, sonraki adımlarla', alsoN:'{n} kurum için hazır mektup + bağlantı',
      anon:'Adım kurumla paylaşılmasın', namePh:'Adın soyadın', nameWhy:'Acil şikayet ya da avukat havuzu için adın gerekli.',
      agree:'ComplaintCA’nın bu şikayeti benim adıma kuruma göndermesine ve cevapları almasına izin veriyorum. Bilgiler doğrudur.', terms:'Beyan ve şartlar',
      send:'Şikayeti Gönder', sending:'Gönderiliyor…', hint:'E-postan kurumla asla paylaşılmaz.', sos:'Biri tehlikedeyse 911’i ara.',
      codeMsg:'{m} adresine 6 haneli bir kod gönderdik. Spam klasörüne de bak, sonra kodu buraya yaz:', codeOk:'Doğrula ve Gönder', codeRe:'Kodu tekrar gönder',
      codeBad:'Kod yanlış ya da süresi dolmuş.', codeMany:'Çok fazla kod istendi. Birkaç dakika bekle.', codeFail:'Kod gönderilemedi. Tekrar dene.',
      high:'Bu şikayet acil olarak işaretli; kuruma resmi ve güçlü bir bildirim gider. Yazdıkların doğru mu?', highOk:'Evet, Gönder', highNo:'Vazgeç',
      eMail:'E-posta adresin geçerli değil. Cevaplarından düzelt.', eName:'Lütfen adını yaz.', eAgree:'Lütfen yukarıdaki beyanı onayla.', eFail:'Bir şeyler ters gitti. Tekrar dene.',
      eCool:'Yeni bir şikayet göndermeden önce birkaç dakika bekle.', eVerify:'Yukarıdaki kontrolü tamamla, sonra tekrar dene.', eSave:'Şikayetin kaydedilemedi. Biraz sonra tekrar dene.', eUnver:'Lütfen e-postanı tekrar doğrula.',
      chkBlank:'Mektupta hâlâ doldurulmamış bir boşluk var.', chkTo:'Mektup, gönderildiği kuruma hitap etmiyor.', chkSame:'Mektubu alan kurum, şikayet ettiğin kurumla aynı.', chkProv:'Yazılan kanun başka bir eyalete ait.', chkAgain:'Mektubun kartından düzelt ya da olduğu gibi göndermek için tekrar Gönder’e bas.',
      rIntro:'Kanun senin yanında. “Mektubunda” yazanlar mektuba zaten eklendi.', rIntroSent:'Normal sürede cevap gelmezse sıradaki adımların bunlar:',
      rLaw:'Yasal dayanak', rSanc:'Cevap vermezlerse', rDead:'Cevap süreleri', rDeadB:'{a} tarihine kadar alındı onayı. {b} tarihine kadar yazılı cevap.', rRemedy:'Neyi geri alabilirsin', rClaim:'Talep için son tarih: {d}',
      rLimit:'Şikayet için süre sınırı', rChain:'Yedek yollar', rNoLaw:'ASYA şu an tam kanunu doğrulayamadı. Ücretsiz bir avukat (V. kart) nerede durduğunu söyler.',
      disc:'Genel bilgidir, hukuki tavsiye değildir.', seeLetter:'Mektubumu Gör',
      iIntro:'ASYA konuna ve adresine göre kurumları seçti. Ek kurumları ekle ya da çıkar.', iIntroSent:'Şikayetinin gittiği yer ve ulaşabileceğin diğer kurumlar.',
      iPrimary:'ASYA GÖNDERİR', iExtra:'MEKTUP + BAĞLANTI', iSent:'GİTTİ', iForm:'FORM', iPhone:'TELEFON', iPool:'Avukat havuzu', iPoolS:'Dosyan adın olmadan ortak avukatlara açılır; adın gerekir.',
      iNone:'Bu yer ve konu için otomatik kurum yok. Şikayetin kaydedilir ve sonraki adımlar gösterilir.', done:'Tamam', open:'Aç', copyLetter:'Mektubu Kopyala',
      lIntro:'Kurumun alacağı mektup bu.', lIntroSent:'Şikayetinle birlikte giden mektup.', lEdit:'Düzenle', lDone:'Bitti', lOk:'Güzel Olmuş',
      wIntro:'Yaşadığın yerde ücretsiz ve ucuz hukuk yardımı:', wAid:'Gelirin uygunsa ücretsiz hukuk yardımı', wFirst:'Önce şikayetini gönder. Bu seçenekler sonra da burada.', wGo:'Avukat Bulucuyu Aç',
      mText:'Zorunlu değil. Milletvekili ofisleri kurumla çoğu zaman doğrudan konuşabilir. Posta kodunla bul.', mGo:'Milletvekilimi Bul',
      hText:'Ne olacağına sen karar verirsin. Bu hatlar ücretsiz ve gizli; polise gitmek zorunda değilsin.', exit:'⎋ Hızlı çıkış',
      ref:'REFERANS', copy:'Kopyala', copied:'Kopyalandı', keep:'Bu numarayla şikayetini her cihazdan takip edebilirsin.',
      st:['ComplaintCA teslim aldı','Kuruma gönderildi','Kurum inceliyor','Cevap geldi'],
      dSent:'{n} kurumuna ulaştı.', dForm:'{n} sadece kendi resmi formunu kabul ediyor. Lütfen oradan başvur:', dFormGo:'Resmi Form', dFail:'Otomatik gönderim olmadı. Lütfen kendi e-posta uygulamandan gönder:', dFailGo:'E-posta Uygulamamı Aç',
      dTest:'TEST · hiçbir kuruma e-posta gitmedi', dSaved:'Şikayetin kaydedildi. Sonraki adımların II. kartta.', dMail:'Referans numaranı e-postana gönderdik.',
      track:'Şikayetimi Takip Et', another:'Yeni Şikayet', close:'Kapat', aid:'Eyaletindeki adli yardım'
    },
    fr: {
      hLoad:'Préparation de votre plainte', subLoad:'ASYA lit vos réponses. Cela prend quelques secondes.',
      h:'Votre plainte est prête', sub:'Une plainte fondée sur la loi obtient une réponse. Vérifiez-la, puis envoyez.',
      hHelp:'Vos options sont prêtes', subHelp:'C’est vous qui décidez. Vos droits, vos options et du soutien sont ici.',
      hSent:'Plainte envoyée', subSent:'Votre plainte est en route. Voici tout ce que vous pouvez faire ensuite.',
      quote:'Justice différée est justice refusée.', safe:'<b>Vous n’êtes pas seul·e.</b> En danger, appelez le <a href="tel:911">911</a> maintenant. Rien n’est envoyé sans votre accord.',
      load:['Lecture de vos réponses…','Recherche du bon organisme…','Vérification de la loi de votre province…','Rédaction de votre lettre…'],
      wait:'ASYA prépare…', note:'Les organismes doivent répondre à une plainte officielle. Rien n’est envoyé sans votre accord.', noteHelp:'Rien n’est envoyé à personne sans votre accord. Vous pouvez arrêter à tout moment.',
      noteSent:'Gardez votre numéro de référence. Les organismes doivent répondre à une plainte officielle.', edit:'✎ Modifier mes réponses',
      cSend:'Envoyer la plainte', cSendS:'Vérifier et envoyer', cSendSent:'Envoyée · {ref}', cRights:'Vos droits', cRightsS:'{n} règles en votre faveur', cRightsNone:'La suite', cRightsSent:'Sans réponse',
      cInst:'Organismes', cInstS:'{n} choisi(s)', cInstNone:'Prochaines étapes', cInstSent:'{n} organismes', cLetter:'Votre lettre', cLetterS:'Voir, modifier', cLetterSent:'Voir, copier',
      cLawyer:'Avocat gratuit', cLawyerS:'Près de chez vous', cMp:'Votre député', cMpS:'Si vous voulez', cMpSent:'Lui transmettre', cHelp:'Aide immédiate', cHelpS:'24/7 · gratuit · confidentiel',
      start:'COMMENCEZ ICI', ready:'PRÊTE', next:'PROCHAINE ÉTAPE', boost:'+{n} RECOURS', inLetter:'DANS VOTRE LETTRE',
      sum:{ to:'À', about:'CONCERNE', topic:'SUJET', where:'LIEU', mail:'COURRIEL', also:'AUSSI' }, toNone:'Enregistrée, avec les prochaines étapes', alsoN:'Lettre + lien pour {n} de plus',
      anon:'Ne pas donner mon nom à l’organisme', namePh:'Votre nom complet', nameWhy:'Votre nom est requis pour une plainte urgente ou le bassin d’avocats.',
      agree:'J’autorise ComplaintCA à envoyer cette plainte à l’organisme en mon nom et à recevoir les réponses. Les informations sont exactes.', terms:'Déclaration et conditions',
      send:'Envoyer la plainte', sending:'Envoi…', hint:'Votre courriel n’est jamais transmis à l’organisme.', sos:'Si quelqu’un est en danger, appelez le 911.',
      codeMsg:'Nous avons envoyé un code à 6 chiffres à {m}. Vérifiez aussi vos indésirables, puis entrez-le ici :', codeOk:'Vérifier et envoyer', codeRe:'Renvoyer le code',
      codeBad:'Code erroné ou expiré.', codeMany:'Trop de codes. Attendez quelques minutes.', codeFail:'Le code n’a pas pu être envoyé. Réessayez.',
      high:'Cette plainte est marquée urgente : un avis officiel et ferme est envoyé à l’organisme. Tout ce que vous avez écrit est-il exact ?', highOk:'Oui, envoyer', highNo:'Annuler',
      eMail:'Votre adresse courriel n’est pas valide. Corrigez-la dans vos réponses.', eName:'Veuillez entrer votre nom.', eAgree:'Veuillez confirmer la déclaration ci-dessus.', eFail:'Une erreur est survenue. Réessayez.',
      eCool:'Attendez quelques minutes avant d’envoyer une autre plainte.', eVerify:'Terminez la vérification ci-dessus, puis réessayez.', eSave:'Votre plainte n’a pas pu être enregistrée. Réessayez dans un moment.', eUnver:'Veuillez confirmer votre courriel à nouveau.',
      chkBlank:'La lettre contient encore un champ à remplir.', chkTo:'La lettre n’est pas adressée à l’organisme qui la reçoit.', chkSame:'L’organisme qui reçoit la lettre est celui dont vous vous plaignez.', chkProv:'La loi citée est d’une autre province.', chkAgain:'Corrigez dans Votre lettre, ou touchez Envoyer de nouveau pour l’envoyer telle quelle.',
      rIntro:'La loi est de votre côté. Tout ce qui est marqué « Dans votre lettre » y figure déjà.', rIntroSent:'Sans réponse dans le délai habituel, voici vos prochaines étapes :',
      rLaw:'Fondement juridique', rSanc:'S’ils ne répondent pas', rDead:'Délais de réponse', rDeadB:'Accusé de réception au plus tard le {a}. Réponse écrite au plus tard le {b}.', rRemedy:'Ce que vous pourriez obtenir', rClaim:'Délai pour réclamer : {d}',
      rLimit:'Délai pour porter plainte', rChain:'Recours de rechange', rNoLaw:'ASYA n’a pas pu confirmer la loi exacte. Un avocat gratuit (carte V) peut vous dire où vous en êtes.',
      disc:'Information générale, pas un avis juridique.', seeLetter:'Voir ma lettre',
      iIntro:'ASYA a choisi les organismes selon votre sujet et votre lieu. Ajoutez ou retirez les autres.', iIntroSent:'Où votre plainte est allée, et qui d’autre contacter.',
      iPrimary:'ASYA ENVOIE', iExtra:'LETTRE + LIEN', iSent:'ENVOYÉE', iForm:'FORMULAIRE', iPhone:'TÉLÉPHONE', iPool:'Bassin d’avocats', iPoolS:'Votre dossier est ouvert aux avocats partenaires sans votre nom; votre nom est requis.',
      iNone:'Aucun organisme ne correspond automatiquement à ce lieu et ce sujet. Votre plainte est enregistrée et vous recevez les prochaines étapes.', done:'Terminé', open:'Ouvrir', copyLetter:'Copier la lettre',
      lIntro:'Voici la lettre que l’organisme reçoit.', lIntroSent:'La lettre envoyée avec votre plainte.', lEdit:'Modifier', lDone:'Terminé', lOk:'C’est bon',
      wIntro:'Aide juridique gratuite ou à faible coût près de chez vous :', wAid:'Aide juridique gratuite si votre revenu y donne droit', wFirst:'Envoyez d’abord votre plainte. Ces options restent ici ensuite.', wGo:'Trouver un avocat',
      mText:'Facultatif. Le bureau d’un député peut souvent parler directement à l’organisme. Trouvez le vôtre par code postal.', mGo:'Trouver mon député',
      hText:'C’est vous qui décidez. Ces lignes sont gratuites et confidentielles; vous n’êtes pas obligé·e d’aller à la police.', exit:'⎋ Sortie rapide',
      ref:'RÉFÉRENCE', copy:'Copier', copied:'Copié', keep:'Ce numéro permet de suivre votre plainte depuis n’importe quel appareil.',
      st:['ComplaintCA l’a reçue','Envoyée à l’organisme','En examen','Réponse reçue'],
      dSent:'Livrée à {n}.', dForm:'{n} accepte seulement son formulaire officiel. Veuillez déposer là :', dFormGo:'Formulaire officiel', dFail:'L’envoi automatique a échoué. Envoyez-la depuis votre application courriel :', dFailGo:'Ouvrir mon courriel',
      dTest:'TEST · aucun organisme n’a reçu de courriel', dSaved:'Votre plainte est enregistrée. Vos prochaines étapes sont dans la carte II.', dMail:'Nous vous avons envoyé le numéro de référence par courriel.',
      track:'Suivre ma plainte', another:'Nouvelle plainte', close:'Fermer', aid:'Aide juridique de votre province'
    },
    es: {
      hLoad:'Preparando tu queja', subLoad:'ASYA está leyendo tus respuestas. Tarda unos segundos.',
      h:'Tu queja está lista', sub:'Una queja basada en la ley recibe respuesta. Revísala y envíala.',
      hHelp:'Tus opciones están listas', subHelp:'Tú decides qué pasa. Tus derechos, opciones y apoyo están aquí.',
      hSent:'Queja enviada', subSent:'Tu queja va en camino. Aquí tienes todo lo que puedes hacer ahora.',
      quote:'Justicia que tarda no es justicia.', safe:'<b>No estás solo/a.</b> Si estás en peligro, llama al <a href="tel:911">911</a> ahora. Nada se envía sin tu aprobación.',
      load:['Leyendo tus respuestas…','Buscando la institución correcta…','Revisando la ley de tu provincia…','Escribiendo tu carta…'],
      wait:'ASYA está preparando…', note:'Las instituciones deben responder a una queja formal. Nada se envía sin tu aprobación.', noteHelp:'Nada se envía a nadie sin tu aprobación. Puedes parar cuando quieras.',
      noteSent:'Guarda tu número de referencia. Las instituciones deben responder a una queja formal.', edit:'✎ Editar mis respuestas',
      cSend:'Enviar queja', cSendS:'Revisar y enviar', cSendSent:'Enviada · {ref}', cRights:'Tus derechos', cRightsS:'{n} reglas a tu favor', cRightsNone:'Qué pasa después', cRightsSent:'Si no responden',
      cInst:'Instituciones', cInstS:'{n} elegidas', cInstNone:'Solo próximos pasos', cInstSent:'{n} instituciones', cLetter:'Tu carta', cLetterS:'Ver, editar', cLetterSent:'Ver, copiar',
      cLawyer:'Abogado gratis', cLawyerS:'Cerca de ti', cMp:'Tu diputado', cMpS:'Si quieres', cMpSent:'Reenviársela', cHelp:'Ayuda ahora', cHelpS:'24/7 · gratis · confidencial',
      start:'EMPIEZA AQUÍ', ready:'LISTA', next:'SIGUIENTE PASO', boost:'+{n} VÍAS EXTRA', inLetter:'EN TU CARTA',
      sum:{ to:'PARA', about:'SOBRE', topic:'TEMA', where:'LUGAR', mail:'CORREO', also:'TAMBIÉN' }, toNone:'Se guarda, con próximos pasos', alsoN:'Carta + enlace para {n} más',
      anon:'No compartir mi nombre con la institución', namePh:'Tu nombre completo', nameWhy:'Tu nombre es obligatorio para una queja urgente o la bolsa de abogados.',
      agree:'Autorizo a ComplaintCA a enviar esta queja a la institución en mi nombre y a recibir las respuestas. La información es correcta.', terms:'Declaración y condiciones',
      send:'Enviar queja', sending:'Enviando…', hint:'Tu correo nunca se comparte con la institución.', sos:'Si alguien está en peligro, llama al 911.',
      codeMsg:'Enviamos un código de 6 dígitos a {m}. Mira también el correo no deseado y escríbelo aquí:', codeOk:'Verificar y enviar', codeRe:'Enviar el código otra vez',
      codeBad:'Código incorrecto o caducado.', codeMany:'Demasiados códigos. Espera unos minutos.', codeFail:'No se pudo enviar el código. Inténtalo de nuevo.',
      high:'Esta queja está marcada como urgente: se envía un aviso formal y firme a la institución. ¿Todo lo que escribiste es correcto?', highOk:'Sí, enviar', highNo:'Cancelar',
      eMail:'Tu correo no es válido. Corrígelo en tus respuestas.', eName:'Escribe tu nombre.', eAgree:'Confirma la declaración de arriba.', eFail:'Algo salió mal. Inténtalo de nuevo.',
      eCool:'Espera unos minutos antes de enviar otra queja.', eVerify:'Completa la verificación de arriba y vuelve a intentarlo.', eSave:'No pudimos guardar tu queja. Inténtalo en un momento.', eUnver:'Confirma tu correo otra vez.',
      chkBlank:'La carta todavía tiene un espacio sin rellenar.', chkTo:'La carta no está dirigida a la institución que la recibe.', chkSame:'La institución que recibe la carta es la misma de la que te quejas.', chkProv:'La ley citada es de otra provincia.', chkAgain:'Corrígelo en Tu carta, o pulsa Enviar otra vez para enviarla así.',
      rIntro:'La ley está de tu lado. Lo marcado «En tu carta» ya está incluido.', rIntroSent:'Si no hay respuesta en el plazo habitual, estos son tus siguientes pasos:',
      rLaw:'Base legal', rSanc:'Si no responden', rDead:'Plazos de respuesta', rDeadB:'Acuse de recibo antes del {a}. Respuesta por escrito antes del {b}.', rRemedy:'Lo que podrías recuperar', rClaim:'Plazo para reclamar: {d}',
      rLimit:'Plazo para quejarte', rChain:'Vías extra', rNoLaw:'ASYA no pudo confirmar la ley exacta ahora. Un abogado gratuito (tarjeta V) puede decirte dónde estás.',
      disc:'Información general, no asesoría legal.', seeLetter:'Ver mi carta',
      iIntro:'ASYA eligió las instituciones según tu tema y lugar. Añade o quita las extra.', iIntroSent:'Adónde fue tu queja y a quién más puedes contactar.',
      iPrimary:'ASYA ENVÍA', iExtra:'CARTA + ENLACE', iSent:'ENVIADA', iForm:'FORMULARIO', iPhone:'TELÉFONO', iPool:'Bolsa de abogados', iPoolS:'Tu caso se abre a abogados asociados sin tu nombre; tu nombre es obligatorio.',
      iNone:'Ninguna institución coincide automáticamente con este lugar y tema. Tu queja se guarda y recibes los próximos pasos.', done:'Listo', open:'Abrir', copyLetter:'Copiar carta',
      lIntro:'Esta es la carta que recibe la institución.', lIntroSent:'La carta enviada con tu queja.', lEdit:'Editar', lDone:'Listo', lOk:'Está bien',
      wIntro:'Ayuda legal gratuita o de bajo costo donde vives:', wAid:'Ayuda legal gratuita si tus ingresos califican', wFirst:'Envía primero tu queja. Estas opciones siguen aquí después.', wGo:'Buscar abogado',
      mText:'No es obligatorio. La oficina de un diputado a menudo habla directamente con la institución. Búscalo por código postal.', mGo:'Buscar mi diputado',
      hText:'Tú decides qué pasa. Estas líneas son gratuitas y confidenciales; no tienes que ir a la policía.', exit:'⎋ Salida rápida',
      ref:'REFERENCIA', copy:'Copiar', copied:'Copiado', keep:'Con este número puedes seguir tu queja desde cualquier dispositivo.',
      st:['ComplaintCA la recibió','Enviada a la institución','En revisión','Respuesta recibida'],
      dSent:'Entregada a {n}.', dForm:'{n} solo acepta su formulario oficial. Preséntala allí:', dFormGo:'Formulario oficial', dFail:'El envío automático falló. Envíala desde tu aplicación de correo:', dFailGo:'Abrir mi correo',
      dTest:'PRUEBA · no se envió correo a ninguna institución', dSaved:'Tu queja se guardó. Tus siguientes pasos están en la tarjeta II.', dMail:'Te enviamos el número de referencia por correo.',
      track:'Seguir mi queja', another:'Nueva queja', close:'Cerrar', aid:'Asistencia legal de tu provincia'
    }
  };
  var AGREEMENT = ['By submitting, I confirm the information I provide is accurate and that I am not filing a false or malicious report.',
    'ComplaintCA is an intermediary platform, not a law firm. It provides tools and information — not legal advice or representation — and does not guarantee any outcome or resolution.',
    'I understand my complaint is processed, including by automated and AI systems, solely to handle this matter. My personal information is never shared with a lawyer or any third party unless I explicitly choose to be contacted, and I may request deletion of my data at any time.',
    'All legal and criminal responsibility arising from the content I submit is mine alone.'];
  function lang(){ var l = ''; try { l = document.documentElement.lang || localStorage.getItem('cc_lang') || ''; } catch (e) {} l = String(l).slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; }
  var L = T.en;
  var fmt = function(s, o){ return String(s).replace(/\{(\w+)\}/g, function(m, k){ return o[k] != null ? o[k] : m; }); };

  // ── Routing data (same rules as the ASYA form this screen replaced) ──
  // The six-step topic, when chosen, decides the category: the person picked it.
  var TOPIC_CAT = {
    consumer: { 'Billing error':'billing', 'Hidden fee':'billing', 'No refund':'billing', 'Contract / cancellation':'billing', _:'service' },
    tenancy: { _:'repairs' },
    employment: { 'Unfair dismissal':'wrongful', 'Harassment':'harassment', _:'wages' },
    humanrights: { 'Race':'race', 'Disability':'disability', 'Sex / gender':'gender', 'Religion':'religion', 'Age':'age', _:'disc' },
    cyber: { _:'privacy' },
    mp: { 'Immigration (IRCC)':'immigration', 'EI / benefits':'benefits', _:'service' }
  };
  var GROUP_T = { municipal:'municipality', business:'business', landlord:'landlord', employer:'business', rights:'government', government:'government', healthcare:'health', other:'other' };
  var SCHOOL_RE = /school|principal|teacher|student|classroom|school board|bully|college|académie|école|okul|öğretmen|müdür|öğrenci/i;
  var RIGHTS = ['race','gender','religion','disability','age','sexual','language','indigenous','disc'];
  var SERIOUS = ['wrongful','wages','harassment','disc'];
  var LW_AREA = { wrongful:'employment', wages:'employment', harassment:'humanrights', disc:'humanrights', race:'humanrights', gender:'humanrights', religion:'humanrights', disability:'humanrights', age:'humanrights', sexual:'humanrights', language:'humanrights', indigenous:'humanrights', property:'tenant', repairs:'tenant', immigration:'immigration', police:'criminal' };
  var LEGAL_AID = { ON:['Legal Aid Ontario','https://www.legalaid.on.ca/'], BC:['Legal Aid BC','https://legalaid.bc.ca/'], AB:['Legal Aid Alberta','https://www.legalaid.ab.ca/'],
    QC:['Commission des services juridiques','https://www.csj.qc.ca/'], MB:['Legal Aid Manitoba','https://www.legalaid.mb.ca/'], SK:['Legal Aid Saskatchewan','https://legalaid.sk.ca/'],
    NS:['Nova Scotia Legal Aid','https://www.nslegalaid.ca/'], NB:['Legal Aid New Brunswick','https://www.legalaid-aidejuridique-nb.ca/'] };
  var AID_ALL = 'https://www.justice.gc.ca/eng/fund-fina/gov-gouv/aid-aide.html';
  var PROV_ACT = { ON:/ontario|\bs\.o\.\s/i, BC:/british columbia|\brsbc\b|\bs\.b\.c\./i, AB:/alberta|\brsa\b/i, QC:/qu[eé]bec|\bcqlr\b/i, MB:/manitoba|c\.c\.s\.m/i, SK:/saskatchewan/i, NS:/nova scotia/i, NB:/new brunswick/i };
  var HELP = [['🚨','911','Emergency · if you are in danger now','tel:911'],['☎️','9-8-8 Suicide Crisis Helpline','24/7, call or text 988','tel:988'],
    ['🌸','Assaulted Women’s Helpline','24/7 · 1-866-863-0511 · 200+ languages','tel:18668630511'],['📞','Kids Help Phone','24/7 · 1-800-668-6868','tel:18006686868'],
    ['🪶','Hope for Wellness','24/7 · 1-855-242-3310','tel:18552423310'],['🤝','211','Community and social services · free, 24/7','tel:211']];
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function addBD(n){ var x = new Date(), k = 0; while (k < n) { x.setDate(x.getDate() + 1); var w = x.getDay(); if (w !== 0 && w !== 6) k++; } return x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear(); }
  function provOf(s){ s = String(s || '');
    var m = s.match(/\b(ON|BC|AB|QC|MB|SK|NS|NB|PE|NL|YT|NT|NU)\b/); if (m) return m[1];
    var low = s.toLowerCase(), P = [['ON',/ontario|toronto|ottawa|mississauga|hamilton|brampton/],['BC',/british columbia|vancouver|victoria|surrey|burnaby/],['AB',/alberta|calgary|edmonton/],
      ['QC',/qu[eé]bec|montr[eé]al/],['MB',/manitoba|winnipeg/],['SK',/saskatchewan|regina|saskatoon/],['NS',/nova scotia|halifax/],['NB',/new brunswick|moncton|fredericton/]];
    for (var i = 0; i < P.length; i++) if (P[i][1].test(low)) return P[i][0]; return ''; }
  function routeCat(cat, target, text){
    if (target === 'school' && RIGHTS.indexOf(cat) < 0) return 'education';
    if (cat === 'billing') {
      if (/\bbank|loan|mortgage|overdraft|interest rate|line of credit|banque|banka/i.test(text)) return 'billing';
      if (/phone|internet|cell|mobile plan|rogers|bell|telus|freedom|fido|koodo|cable|téléphone|telefon/i.test(text)) return 'telecom';
      if (/hydro|electric|power bill|gas bill|enbridge|energy|électricité|elektrik|doğalgaz/i.test(text)) return 'utility';
      return 'service';
    }
    return cat;
  }
  var clean = function(s){ return String(s || '').replace(/[#*_`]+|-{3,}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260); };
  var isMail = function(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''); };
  var webUrl = function(u){ u = /^https?:\/\//i.test(u || '') ? u : (u ? 'https://' + u : ''); return /^https:\/\/[^\s"<>]+$/i.test(u) ? u : ''; };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var post = function(url, body){ return fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) }); };
  var getJson = function(p, ms){ return Promise.race([p.then(function(r){ return r.ok ? r.json() : null; }), new Promise(function(ok){ setTimeout(ok, ms, null); })]).catch(function(){ return null; }); };

  var CSS = [
    '@property --sna{syntax:"<angle>";inherits:false;initial-value:0deg}',
    '@keyframes snSpin{to{--sna:360deg}}@keyframes snUp{from{transform:translateY(14px);opacity:0}}@keyframes snGild{50%{background-position:100% 0}}@keyframes snShine{40%,100%{transform:translateX(120%)}}',
    '@keyframes snPop{from{transform:scale(.4);opacity:0}}@keyframes snGlow{50%{box-shadow:0 0 18px rgba(255,77,121,.9)}}@keyframes snBglow{50%{box-shadow:0 0 18px rgba(250,204,21,.7);border-color:#fde047}}@keyframes snFloat{50%{transform:translateY(-2px)}}@keyframes snShim{to{background-position:-200% 0}}',
    '#sn{position:relative;display:none;margin-top:46px;min-height:max(620px,calc(100dvh - 85px));color:#fff;font-family:Inter,system-ui,sans-serif;text-align:left;background:linear-gradient(rgba(26,6,32,.8),rgba(14,3,18,.94)),#160a1c url(/assets/brand/flag-aubergine-wave.webp) center/cover no-repeat;-webkit-tap-highlight-color:transparent}',
    '#sn.on{display:block}body.cc-sonuc-on .amain{display:none!important}#sn *{box-sizing:border-box}#sn [hidden]{display:none!important}',
    '#sn button{font:inherit;color:inherit}#sn a{color:inherit}',
    '#sn .sn-wrap{max-width:560px;margin:0 auto;padding:22px max(16px,env(safe-area-inset-right,0px)) calc(28px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}',
    '#sn .sn-h{margin:0;text-align:center;font:700 24px/1.15 Cinzel,Georgia,serif;letter-spacing:.04em;font-variant:small-caps;background:linear-gradient(100deg,#fff 30%,#d5b9eb 50%,#fff 70%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:snGild 6s ease-in-out infinite}',
    '#sn .sn-sub{text-align:center;margin:6px auto 16px;max-width:380px;font:italic 400 17px/1.35 "EB Garamond",Georgia,serif;color:#d4af37;background:linear-gradient(180deg,#fff3c4 0%,#e6c35c 35%,#b8860b 60%,#f5d97a 85%,#a67c00 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    '#sn .sn-quote{position:relative;margin:0 4px 16px;padding:2px 0 2px 14px;font:italic 400 17px/1.35 "EB Garamond",Georgia,serif;color:#eadcf3}',
    '#sn .sn-quote::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:1.5px;background:linear-gradient(180deg,transparent,#cfb0e8 20%,#cfb0e8 80%,transparent)}',
    '#sn .sn-quote cite{display:flex;align-items:center;gap:8px;margin-top:6px;font:700 11px/1 Cinzel,Georgia,serif;font-style:normal;letter-spacing:.24em;color:#cfb0e8}#sn .sn-quote cite::before{content:"";width:22px;height:1px;background:linear-gradient(90deg,transparent,#cfb0e8)}',
    '#sn .sn-safe{margin-bottom:14px;padding:14px 16px;border-radius:16px;background:linear-gradient(155deg,rgba(124,58,237,.35),rgba(46,16,80,.5));border:1px solid rgba(196,160,255,.4);font:400 17px/1.4 "EB Garamond",Georgia,serif;color:#f3eaff}#sn .sn-safe a{color:#fff;font-weight:600}',
    '#sn .sn-status{min-height:22px;margin:-6px 0 12px;text-align:center;font:italic 400 16px/1.35 "EB Garamond",Georgia,serif;color:#e9d5ff}',
    '#sn .sn-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '#sn .sn-card{position:relative;overflow:hidden;min-height:150px;padding:14px;border-radius:16px;border:1px solid rgba(244,214,255,.22);background:var(--g);box-shadow:inset 0 1px 0 rgba(255,230,250,.22),inset 0 -20px 40px -20px rgba(20,4,30,.6),0 14px 30px -18px rgba(190,24,93,.55);display:flex;flex-direction:column;justify-content:space-between;text-align:right;cursor:pointer;animation:snUp .6s ease-out both;transition:transform .2s,filter .2s}',
    '#sn .sn-card:active{transform:scale(.97)}#sn .sn-card:focus-visible{outline:2px solid #fff;outline-offset:3px}',
    '#sn .sn-card::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 80% at 0% 0%,rgba(255,220,245,.22),transparent 55%)}#sn .sn-card>*{position:relative}',
    '#sn .sn-card svg{width:30px;height:30px;stroke:#fff;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}',
    '#sn .sn-n{position:absolute!important;top:12px;right:14px;font:700 12px/1 Cinzel,Georgia,serif;font-style:normal;color:rgba(211,181,234,.75)}',
    '#sn .sn-card b{display:block;font:700 16px/1.2 Cinzel,Georgia,serif;font-variant:small-caps;letter-spacing:.02em}',
    '#sn .sn-card span{display:block;margin-top:4px;font:italic 400 15px/1.3 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#sn .sn-ok{position:absolute!important;top:10px;right:10px;width:24px;height:24px;border-radius:50%;background:linear-gradient(180deg,#f3ecff,#cdb6f5);color:#2a0814;display:none;place-items:center;font:800 14px/1 Inter,sans-serif;font-style:normal}',
    '#sn .sn-card.done .sn-ok{display:grid}#sn .sn-card.done .sn-n,#sn .sn-flag~.sn-n{display:none}#sn .sn-card.done .sn-flag{display:none}',
    '#sn .sn-card:nth-child(1){--g:linear-gradient(155deg,rgba(138,92,246,.55),rgba(88,28,135,.38) 55%,rgba(46,16,80,.3))}',
    '#sn .sn-card:nth-child(2){--g:linear-gradient(155deg,rgba(190,24,93,.55),rgba(120,20,70,.38) 55%,rgba(60,10,40,.3));animation-delay:.06s}',
    '#sn .sn-card:nth-child(3){--g:linear-gradient(155deg,rgba(124,58,237,.55),rgba(109,40,140,.38) 55%,rgba(50,14,70,.3));animation-delay:.12s}',
    '#sn .sn-card:nth-child(4){--g:linear-gradient(155deg,rgba(225,29,72,.55),rgba(136,19,55,.38) 55%,rgba(70,10,35,.3));animation-delay:.18s}',
    '#sn .sn-card:nth-child(5){--g:linear-gradient(155deg,rgba(168,85,247,.55),rgba(126,34,206,.38) 55%,rgba(60,12,90,.3));animation-delay:.24s}',
    '#sn .sn-card:nth-child(6){--g:linear-gradient(155deg,rgba(159,18,57,.55),rgba(97,22,90,.38) 55%,rgba(45,10,55,.3));animation-delay:.30s}',
    '#sn .sn-card.main{filter:brightness(1.25) saturate(1.15);min-height:200px;box-shadow:inset 0 1px 0 rgba(255,230,250,.35),0 0 26px -4px rgba(249,168,212,.65),0 14px 34px -14px rgba(190,24,93,.8)}',
    '#sn .sn-card.main::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:2px;pointer-events:none;background:conic-gradient(from var(--sna),transparent,#f9a8d4,#fff,#c4b5fd,transparent 40%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:snSpin 3.5s linear infinite}',
    '#sn .sn-card.wait{cursor:progress;pointer-events:none}#sn .sn-card.wait span{color:transparent;border-radius:6px;background:linear-gradient(90deg,rgba(213,185,235,.12) 25%,rgba(213,185,235,.32) 50%,rgba(213,185,235,.12) 75%) 0 0/200% 100%;animation:snShim 1.4s linear infinite}',
    '#sn .sn-flag{position:absolute!important;top:10px;right:10px;z-index:3;padding:5px 8px;border-radius:999px;background:linear-gradient(90deg,#ff4d79,#b36bff);font:700 9px/1 Cinzel,serif;font-style:normal;letter-spacing:.12em;color:#fff;box-shadow:0 2px 10px rgba(255,77,121,.5);animation:snGlow 1.8s ease-in-out infinite}',
    '#sn .sn-boost{position:relative;overflow:hidden;display:inline-flex;margin-top:8px;padding:7px 12px;border-radius:999px;background:linear-gradient(135deg,rgba(250,204,21,.22),rgba(245,158,11,.14));border:1px solid rgba(253,224,71,.7);color:#fde68a;font:800 11px/1 Inter,system-ui,sans-serif;font-style:normal;letter-spacing:.06em;text-shadow:0 0 8px rgba(250,204,21,.45);animation:snBglow 1.8s ease-in-out infinite,snFloat 3s ease-in-out infinite}',
    '#sn .sn-boost::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);transform:translateX(-120%);animation:snShine 2.8s ease-in-out infinite;pointer-events:none}',
    '#sn .sn-orn{display:flex;align-items:center;justify-content:center;gap:10px;margin:18px 0 4px;color:#cfb0e8}#sn .sn-orn i{display:block;width:56px;height:1px;background:linear-gradient(90deg,transparent,#cfb0e8)}#sn .sn-orn i:last-child{transform:scaleX(-1)}',
    '#sn .sn-note{margin:10px 0 0;text-align:center;font:italic 400 16px/1.35 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.85)}',
    '#sn .sn-edit{display:block;margin:16px auto 0;padding:6px;background:none;border:0;color:rgba(213,185,235,.75);font:italic 400 15px/1 "EB Garamond",Georgia,serif;text-decoration:underline;cursor:pointer}',
    '#sn .sn-dim{position:fixed;inset:0;z-index:300;background:rgba(10,2,14,.6);opacity:0;pointer-events:none;transition:opacity .2s}#sn .sn-dim.on{opacity:1;pointer-events:auto}',
    '#sn .sn-sheet{position:fixed;left:50%;bottom:0;z-index:301;width:min(560px,100%);max-height:86dvh;overflow:auto;overscroll-behavior:contain;transform:translate(-50%,105%);visibility:hidden;transition:transform .3s cubic-bezier(.2,.8,.2,1),visibility 0s .3s;background:#14040f radial-gradient(ellipse 95% 60% at 50% 0%,#4a0b2e,#24091c 55%,#14040f);border:1px solid rgba(196,160,255,.5);border-bottom:0;border-radius:24px 24px 0 0;padding:10px 18px calc(22px + env(safe-area-inset-bottom,0px))}',
    '#sn .sn-sheet.on{transform:translate(-50%,0);visibility:visible;transition:transform .3s cubic-bezier(.2,.8,.2,1)}#sn .sn-grab{width:42px;height:4px;margin:0 auto 12px;border-radius:4px;background:rgba(207,176,232,.4)}',
    '#sn .sn-sh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}#sn .sn-sh h3{margin:0;font:700 19px/1.2 Cinzel,Georgia,serif;font-variant:small-caps;letter-spacing:.03em;color:#fff}',
    '#sn .sn-x{width:36px;height:36px;flex:none;border-radius:50%;border:1px solid rgba(196,160,255,.45);background:rgba(24,4,16,.5);font-size:18px;cursor:pointer}',
    '#sn .p{margin:0;font:400 17px/1.45 "EB Garamond",Georgia,serif;color:#eadcf3}#sn .p em{color:#d5b9eb}',
    '#sn .sum{display:grid;gap:8px;margin:4px 0}#sn .sum div{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:12px;background:rgba(24,4,16,.5);border:1px solid rgba(196,160,255,.25);font:400 16px/1.3 "EB Garamond",Georgia,serif}',
    '#sn .sum small{font:700 10.5px/1.6 Cinzel,Georgia,serif;letter-spacing:.14em;color:#cfb0e8;flex:none}#sn .sum span{text-align:right;overflow-wrap:anywhere}',
    '#sn .acc{border:1px solid rgba(196,160,255,.3);border-radius:14px;background:rgba(24,4,16,.45);margin-bottom:8px;overflow:hidden}',
    '#sn .acc summary{list-style:none;display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;font:600 16.5px/1.25 "EB Garamond",Georgia,serif}#sn .acc summary::-webkit-details-marker{display:none}',
    '#sn .acc summary::after{content:"+";margin-left:auto;font:400 20px/1 Inter;color:#cfb0e8;transition:transform .2s}#sn .acc[open] summary::after{transform:rotate(45deg)}',
    '#sn .acc summary i{display:grid;place-items:center;width:26px;height:26px;flex:none;border-radius:8px;background:rgba(110,45,180,.5);font:700 11px/1 Cinzel,serif;font-style:normal}',
    '#sn .acc .p{padding:0 14px 14px 50px;font-size:16px;overflow-wrap:anywhere}#sn .acc .p a{color:#fde68a}',
    '#sn .law{display:inline-block;margin-top:6px;padding:3px 8px;border-radius:6px;background:#2e0f52;border:1px solid rgba(196,160,255,.45);font:700 10px/1.4 Cinzel,serif;letter-spacing:.08em;color:#d5b9eb}',
    '#sn .cited{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 10px;border-radius:999px;background:rgba(134,239,172,.14);border:1px solid rgba(134,239,172,.5);color:#bbf7d0;font:700 10.5px/1 Cinzel,serif;letter-spacing:.08em;animation:snPop .4s both}',
    '#sn .prog{height:4px;border-radius:4px;background:rgba(207,176,232,.2);margin:10px 0 12px;overflow:hidden}#sn .prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#b36bff,#f9a8d4);transition:width .3s}',
    '#sn .inst{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;margin-bottom:8px;border-radius:14px;border:1px solid rgba(196,160,255,.35);background:rgba(24,4,16,.45);text-align:left;color:#f7eef1;text-decoration:none}',
    '#sn button.inst{cursor:pointer}#sn .inst>div{flex:1;min-width:0}#sn .inst b{display:block;font:500 17px/1.2 "EB Garamond",Georgia,serif}',
    '#sn .inst small{display:block;margin-top:2px;font:italic 400 14px/1.25 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.75);overflow-wrap:anywhere}',
    '#sn .inst em{flex:none;font:700 9.5px/1 Cinzel,serif;font-style:normal;letter-spacing:.1em;padding:5px 7px;border-radius:6px;background:#2e0f52;border:1px solid rgba(196,160,255,.5)}',
    '#sn .inst .bx{width:22px;height:22px;flex:none;border-radius:7px;border:1.5px solid rgba(207,176,232,.7);display:grid;place-items:center;font:800 13px/1 Inter;color:transparent}',
    '#sn .inst.on{background:linear-gradient(180deg,#f3ecff,#cdb6f5);border-color:#fff;color:#2a0814}#sn .inst.on small{color:#5a1d9a}#sn .inst.on .bx{background:#5a1d9a;border-color:#5a1d9a;color:#fff}#sn .inst.on em{background:#5a1d9a;color:#fff}',
    '#sn .inst.lock{cursor:default}#sn .av{width:44px;height:44px;flex:none;border-radius:12px;display:grid;place-items:center;background:rgba(110,45,180,.5);font-size:20px}',
    '#sn .acts{display:flex;gap:6px;flex:none}#sn .mini{display:inline-block;padding:7px 12px;border-radius:999px;border:1px solid rgba(196,160,255,.5);background:rgba(24,4,16,.4);color:#eadcf3;text-decoration:none;font:700 10.5px/1 Cinzel,serif;letter-spacing:.08em;cursor:pointer}',
    '#sn .letter{padding:16px;border-radius:12px;background:#f6ecd9;color:#2a0814;font:400 16px/1.45 "EB Garamond",Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:inset 0 0 30px rgba(120,80,40,.15)}',
    '#sn .letter .subj{display:block;margin-bottom:10px;font-weight:600}#sn .letter h4{margin:12px 0 2px;font:700 11px/1.4 Cinzel,serif;letter-spacing:.12em;color:#5a1d9a}',
    '#sn textarea.letter{display:block;width:100%;min-height:360px;border:0;outline:2px solid #b36bff;resize:vertical}',
    '#sn .tg{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-top:10px;border-radius:14px;background:rgba(24,4,16,.45);border:1px solid rgba(196,160,255,.3);cursor:pointer;width:100%;text-align:left}',
    '#sn .tg div{flex:1;font:400 16px/1.3 "EB Garamond",Georgia,serif}#sn .tg i{position:relative;width:44px;height:26px;flex:none;border-radius:99px;background:rgba(207,176,232,.25);transition:background .2s}',
    '#sn .tg i::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}#sn .tg.on i{background:#8b3fd1}#sn .tg.on i::after{transform:translateX(18px)}',
    '#sn .terms{margin-top:8px;font:400 14px/1.4 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.8)}#sn .terms summary{cursor:pointer;color:#d5b9eb}#sn .terms p{margin:6px 0 0}',
    '#sn .in{display:block;width:100%;margin-top:10px;padding:12px 14px;border-radius:12px;border:1px solid rgba(196,160,255,.45);background:rgba(24,4,16,.6);color:#f7eef1;font:400 17px/1.3 "EB Garamond",Georgia,serif;outline:none}#sn .in:focus{border-color:#d5b9eb}',
    '#sn .why{margin:10px 0 0;font:italic 400 15px/1.3 "EB Garamond",Georgia,serif;color:#fde68a}',
    '#sn .warn{margin-top:12px;padding:12px 14px;border-radius:14px;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.5);font:400 16px/1.35 "EB Garamond",Georgia,serif;color:#fed7aa}',
    '#sn .err{min-height:0;margin:10px 0 0;text-align:center;font:400 16px/1.35 "EB Garamond",Georgia,serif;color:#fecaca}#sn .err:empty{display:none}',
    '#sn .code{margin-top:12px;padding:14px;border-radius:14px;background:rgba(24,4,16,.55);border:1px solid rgba(253,224,71,.5)}#sn .code .in{text-align:center;letter-spacing:.4em;font:700 22px/1 Inter,sans-serif}',
    '#sn .ts{display:flex;justify-content:center;margin-top:10px}#sn .ts:empty{display:none}',
    '#sn .go{position:relative;overflow:hidden;display:flex;width:100%;align-items:center;justify-content:center;gap:12px;margin-top:14px;padding:16px 20px;border:1.5px solid transparent;border-radius:18px;font:700 16px/1 Cinzel,Georgia,serif;font-variant:small-caps;letter-spacing:.08em;color:#fff;cursor:pointer;text-decoration:none;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 42%) padding-box,linear-gradient(180deg,#2b0d1f,#1a0714 60%,#12040e) padding-box,conic-gradient(from var(--sna),#ff4d79,#f6c8a8,#e9e6f2,#b36bff,#ff4d79) border-box;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 12px 30px -12px rgba(255,77,121,.6),0 0 24px -6px rgba(179,107,255,.45);animation:snSpin 6s linear infinite}',
    '#sn .go::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(234,220,245,.4) 50%,transparent 70%);transform:translateX(-120%);animation:snShine 4.5s 1.2s ease-in-out infinite;pointer-events:none}',
    '#sn .go:disabled{cursor:default;color:rgba(220,197,238,.6);animation:none;box-shadow:none;background:linear-gradient(160deg,#3a1248,#24092f 55%,#2e0a24) padding-box,linear-gradient(100deg,rgba(207,176,232,.25),rgba(207,176,232,.6) 50%,rgba(207,176,232,.25)) border-box}#sn .go:disabled::after{display:none}',
    '#sn .ca{padding:4px 8px;border-radius:8px;background:linear-gradient(145deg,#4a1a5e,#2a0d3a);border:1px solid rgba(207,176,232,.55);color:#d5b9eb;font-size:11px;letter-spacing:.18em}',
    '#sn .ghost{display:block;width:100%;margin-top:10px;padding:12px;border-radius:999px;border:1px solid rgba(207,176,232,.45);background:transparent;color:#d5b9eb;font:700 11px/1 Cinzel,serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}',
    '#sn .two{display:flex;gap:10px}#sn .two>*{flex:1}',
    '#sn .hint{margin:8px 0 0;text-align:center;font:italic 400 15px/1.3 "EB Garamond",Georgia,serif;color:rgba(213,185,235,.75)}#sn .hint a{color:#fde68a}',
    '#sn .seal{width:76px;height:76px;margin:6px auto 12px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#8b3fd1,#3a0f68 70%);box-shadow:0 0 0 6px rgba(139,63,209,.15),0 14px 40px -10px rgba(190,24,93,.6);font-size:34px;animation:snPop .6s cubic-bezier(.2,.9,.3,1.3) both}',
    '#sn .refbox{text-align:center;padding:16px;border-radius:16px;background:linear-gradient(155deg,rgba(138,92,246,.5),rgba(190,24,93,.35));border:1px solid rgba(244,214,255,.28)}',
    '#sn .refbox small{font:700 11px/1 Cinzel,serif;letter-spacing:.2em;color:#cfb0e8}#sn .refbox strong{display:block;margin:8px 0 10px;font:700 22px/1 Cinzel,serif;letter-spacing:.1em}',
    '#sn .tag{display:inline-block;margin:10px auto 0;padding:5px 10px;border-radius:999px;background:rgba(250,204,21,.15);border:1px solid rgba(253,224,71,.6);color:#fde68a;font:700 10.5px/1 Cinzel,serif;letter-spacing:.1em}',
    '#sn .steps{display:grid;gap:10px;margin-top:14px}#sn .steps div{display:flex;gap:12px;align-items:center;font:400 16px/1.3 "EB Garamond",Georgia,serif;color:rgba(234,220,243,.6)}',
    '#sn .steps div::before{content:"";width:12px;height:12px;flex:none;border-radius:50%;border:1.5px solid rgba(207,176,232,.6)}#sn .steps div.on{color:#fff}#sn .steps div.on::before{background:#86efac;border-color:#86efac;box-shadow:0 0 10px #86efac}',
    '#sn .sn-toast{position:fixed;left:50%;bottom:24px;z-index:302;transform:translate(-50%,40px);opacity:0;transition:.3s;padding:12px 18px;border-radius:12px;background:linear-gradient(180deg,#f3ecff,#ddccfa);color:#2a0814;font:italic 400 16px/1.3 "EB Garamond",Georgia,serif;pointer-events:none;white-space:nowrap}#sn .sn-toast.on{transform:translate(-50%,0);opacity:1}',
    '@media (max-width:360px){#sn .sn-card b{font-size:14px}#sn .sn-card span{font-size:14px}}',
    '@media (prefers-reduced-motion:reduce){#sn *,#sn *::before,#sn *::after{animation:none!important;transition:none!important}}'
  ].join('\n');

  var IC = {
    send:'<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>', rights:'<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0zM8 21h8"/>',
    inst:'<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z"/>', letter:'<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    lawyer:'<circle cx="12" cy="7" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/><path d="M12 15l-1.5 3L12 21l1.5-3z"/>', mp:'<path d="M3 21h18M5 21V11M19 21V11M9 21v-6h6v6M3 11l9-7 9 7"/>',
    help:'<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/>'
  };
  var KEYS = ['send','rights','inst','letter','lawyer','mp'], NUM = ['I','II','III','IV','V','VI'];

  var root, q, D = null, phase = 'off', run = 0, A = null, R = null, Vd = null, res = null, cat = '', target = 'other', org = '', prio = 'medium', card6 = 'mp';
  var rows = [], pool = false, named = false, nameVal = '', agreed = false, seen = {}, read = {}, letterEdited = '', editing = false, cur = '';
  var tsToken = '', tsWidget = null, codeTok = '', codeFor = '', pendingCode = false, busy = false, highOk = false, overrideCheck = false, loadTimer = 0;
  // The answers (and a 6-digit code already e-mailed) survive a reload in this tab, e.g. when a phone drops the page while the person reads the code.
  function save(){ try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ t:Date.now(), d:D, tok:codeTok, to:codeFor })); } catch (e) {} }
  function unsave(){ try { sessionStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function saved(){ try { var o = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null'); return o && o.d && Date.now() - o.t < 6 * 3600 * 1000 ? o : null; } catch (e) { return null; } }

  function build(){
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('section'); root.id = 'sn'; root.setAttribute('aria-labelledby', 'sn-h');
    root.innerHTML = '<div class="sn-wrap"><h2 class="sn-h" id="sn-h"></h2><p class="sn-sub"></p><div class="sn-safe" hidden></div>' +
      '<blockquote class="sn-quote"><span></span><cite>W·E·GLADSTONE</cite></blockquote><p class="sn-status" aria-live="polite"></p><div class="sn-grid">' +
      KEYS.map(function(k, i){ return '<button type="button" class="sn-card" data-k="' + k + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + IC[k] + '</svg><i class="sn-n">' + NUM[i] + '</i><i class="sn-ok">✓</i><div><b></b><span></span><i class="sn-boost" hidden></i></div></button>'; }).join('') +
      '</div><div class="sn-orn" aria-hidden="true"><i></i>✦<i></i></div><p class="sn-note"></p><div class="sn-after"></div><button type="button" class="sn-edit"></button></div>' +
      '<div class="sn-dim"></div><section class="sn-sheet" role="dialog" aria-modal="true" aria-labelledby="sn-sh-t"><div class="sn-grab"></div><div class="sn-sh"><h3 id="sn-sh-t"></h3><button type="button" class="sn-x">×</button></div><div class="sn-body"></div><div class="sn-sendp"></div></section>' +
      '<div class="sn-toast" role="status"></div>';
    (document.getElementById('cc-sonuc-host') || document.body).appendChild(root);
    q = function(s){ return root.querySelector(s); };
    root.addEventListener('click', onClick);
    root.addEventListener('toggle', onToggle, true);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && cur) closeSheet(); });
  }
  function toast(m){ var t = q('.sn-toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(function(){ t.classList.remove('on'); }, 1800); }
  function copy(text, btn){ var ok = function(){ if (btn) btn.textContent = L.copied; toast(L.copied); };
    try { navigator.clipboard.writeText(text).then(ok, function(){ toast(text.slice(0, 40)); }); } catch (e) { toast(text.slice(0, 40)); } }

  // ── Analysis: ASYA reads the answers; whatever fails, the screen still opens with what it has ──
  function analyse(){
    var my = ++run, story = D.story;
    var fixed = D.cat && TOPIC_CAT[D.cat] ? (TOPIC_CAT[D.cat][D.sub] || TOPIC_CAT[D.cat]._) : '';
    var cls = getJson(post('/api/classify', { desc:story }), 12000);
    var go = function(c){
      A = c && c.isComplaint !== false ? c : (c && c.priority ? { priority:c.priority, institution:c.institution, city:c.city, address:c.address } : null);
      var base = fixed || (A && A.category) || 'other';
      target = SCHOOL_RE.test(story + ' ' + (D.who || '') + ' ' + ((A && A.institution) || '')) ? 'school'
        : D.cat ? ({ consumer:'business', tenancy:'landlord', employment:'business', humanrights:D.who ? 'business' : 'other', cyber:'other', mp:D.sub === 'City service' ? 'municipality' : 'government' })[D.cat]
        : (GROUP_T[A && A.group] || 'other');
      cat = routeCat(base, target, story);
      org = D.who || (A && A.institution) || '';
      var place = A ? [A.city, A.address].filter(Boolean).join(' ') : '';
      return Promise.all([
        getJson(post('/api/route', { category:cat, target:target, location:D.loc, targetAddress:(A && A.address) || '', targetName:org, place:place }), 12000),
        getJson(post('/api/verdict', { title:story.slice(0, 80), desc:story, category:cat, location:D.loc, targetName:org, ctype:'notice', anonymous:true, lang:document.documentElement.lang === 'fr' ? 'fr' : 'en' }), 25000)
      ]);
    };
    // A chosen topic already fixes the category: classify, route and verdict run side by side.
    var all = fixed ? Promise.all([cls, go(null)]).then(function(x){ var c = x[0]; A = c && c.isComplaint !== false ? c : (c && c.priority ? { priority:c.priority } : null); return x[1]; })
      : cls.then(go);
    all.then(function(x){
      if (my !== run) return;
      R = x[0]; Vd = x[1]; prio = (A && A.priority) || 'medium';
      card6 = (A && A.support) || cat === 'harassment' || cat === 'sexual' || (D.cat === 'humanrights' && prio === 'high') ? 'help' : 'mp';
      pool = false; makeRows(); buildLetter(); phase = 'ready'; draw();
    }).catch(function(){ if (my !== run) return; R = null; Vd = null; makeRows(); buildLetter(); phase = 'ready'; draw(); });
  }
  function makeRows(){
    rows = []; var seenN = {};
    var add = function(n, line, url, primary){ var k = String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!k || seenN[k]) return; seenN[k] = 1; rows.push({ n:n, line:line || '', url:url || '', primary:!!primary, on:true }); };
    ((R && R.authorities) || []).slice(0, 3).forEach(function(a, i){ add(a.name, [a.phone, a.email].filter(Boolean).join(' · ') || a.note, a.url, i === 0); });
    ((R && R.chain && R.chain.bodies) || []).slice(0, 2).forEach(function(b){ add(b.name, b.phone, b.url); });
  }
  var poolOffered = function(){ return prio === 'high' || SERIOUS.indexOf(cat) > -1 || !!(Vd && Vd.poolSuggest); };
  var needName = function(){ return prio === 'high' || pool; };
  var recipient = function(){ return rows[0] && rows[0].primary ? rows[0].n : ''; };
  // The topic the person picked wins over ASYA's guess ("Human Rights · Other" reads as "Human Rights").
  var label = function(){ var t = String(D.topic || '').split(' · '); return (t[1] && t[1] !== 'Other' ? t[1] : t[0]) || (A && A.label) || 'Complaint'; };

  // The letter the institution receives (ASYA's rewrite of the story when it has one).
  var secs = [];
  function buildLetter(){
    var high = prio === 'high', law = clean(Vd && Vd.law), sanc = clean(Vd && Vd.sanctions), to = recipient();
    var incident = ((Vd && Vd.complaint) || D.what || D.story).replace(/[#*_`]+/g, '').replace(/^\s*-{3,}\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
    if (D.notes && incident.indexOf(D.notes.slice(0, 40)) < 0) incident = (incident + '\n\n' + D.notes).slice(0, 2000);
    var asks = high ? ['Investigate this report immediately.', 'Tell me in writing what steps you will take, including interim measures to keep the person affected safe.', 'Meet or speak with me within 3 business days.']
      : ['Review this complaint.', 'Tell me in writing what you will do to resolve it.', 'Confirm who is handling my file.'];
    var legal = Vd && Vd.deadline && !/not applicable/i.test(Vd.deadline) ? clean(Vd.deadline) : '';
    var next = rows.filter(function(r){ return !r.primary && r.on; }).slice(0, 2).map(function(r){ return r.n; });
    var escl = next.length ? 'I will escalate this to ' + next.join(', then ') + '.' : (sanc || 'I will escalate this to the appropriate oversight body.');
    var reserve = '';
    if (Vd && Vd.poolSuggest && law) reserve = '\nI reserve my right to pursue this matter under the ' + law.replace(/\s*\(.*$/, '').replace(/[.;]+$/, '').replace(/^the\s+/i, '') + (Vd.claimDeadline ? ' within the legal time limit (' + Vd.claimDeadline.replace(/[.]+$/, '') + ')' : '') + '.';
    var other = org && org !== to;
    secs = [
      { h:'', b:'Dear Sir or Madam' + (to ? ' at ' + to : '') + ',' + (other ? '\n\nRe: Complaint against ' + org : '') + '\n\nI am writing to file a formal complaint' + (other ? ' about ' + org : '') + ' and to ask for your help in resolving it. The details are set out below.' },
      { h:'Incident', b:incident },
      { h:'What I ask', b:asks.map(function(x){ return '• ' + x; }).join('\n') }
    ];
    if (law) secs.push({ h:'Legal basis', b:law });
    secs.push({ h:'Reply deadlines', b:'Confirm receipt by ' + addBD(3) + '\nWritten reply by ' + addBD(10) + (legal ? '\n(' + legal + ')' : '') });
    secs.push({ h:'If there is no reply', b:escl + reserve });
    secs.push({ h:'', b:'Thank you for your attention to this matter. I can provide further details or documents on request.\n\nSincerely,\n' + NAME_TOKEN });
  }
  var letterPlain = function(){ return secs.map(function(s){ return (s.h ? s.h.toUpperCase() + '\n' : '') + s.b; }).join('\n\n'); };
  var letterText = function(){ return letterEdited || letterPlain(); };
  var subject = function(){ return 'Formal complaint: ' + label() + (org ? ' · ' + org : ''); };
  var signed = function(){ var nm = (needName() || named) && nameVal.trim() ? nameVal.trim() : 'Complainant'; return letterText().split(NAME_TOKEN).join(nm); };

  // ── Drawing ──
  function rightsList(){
    var L2 = [], law = clean(Vd && Vd.law), sanc = clean(Vd && Vd.sanctions);
    if (law) L2.push([L.rLaw, esc(law), true]);
    if (sanc) L2.push([L.rSanc, esc(sanc), true]);
    L2.push([L.rDead, esc(fmt(L.rDeadB, { a:addBD(3), b:addBD(10) })) + (Vd && Vd.deadline && !/not applicable/i.test(Vd.deadline) ? '<br>' + esc(clean(Vd.deadline)) : ''), true]);
    if (Vd && Vd.poolSuggest && (Vd.remedy || Vd.claimDeadline)) L2.push([L.rRemedy, esc(Vd.remedy || '—') + (Vd.claimDeadline ? '<br>' + esc(fmt(L.rClaim, { d:Vd.claimDeadline })) : ''), false]);
    if (D.limit) L2.push([L.rLimit, esc(D.limit), false]);
    var bodies = chainBodies();
    if (bodies.length) L2.push([L.rChain, bodies.map(function(b){ var u = webUrl(b.url); return (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(b.name) + '</a>' : esc(b.name)) + (b.phone ? ' · <a href="tel:' + esc(String(b.phone).replace(/[^\d+]/g, '')) + '">' + esc(b.phone) + '</a>' : ''); }).join('<br>'), true]);
    return L2;
  }
  function chainBodies(){ var c = (res && res.chain) || (R && R.chain); return (c && c.bodies) || []; }
  function setCard(k, title, sub, opt){
    var c = q('.sn-card[data-k="' + k + '"]'); opt = opt || {};
    if (k === 'mp') { c.dataset.k6 = card6; c.querySelector('svg').innerHTML = IC[card6]; }
    c.querySelector('b').textContent = title; c.querySelector('span').textContent = sub;
    c.classList.toggle('done', !!opt.done); c.classList.toggle('main', !!opt.main); c.classList.toggle('wait', phase === 'load');
    var f = c.querySelector('.sn-flag'); if (f) f.remove();
    if (opt.flag) { f = document.createElement('i'); f.className = 'sn-flag'; f.textContent = opt.flag; c.insertBefore(f, c.firstChild); }
    var b = c.querySelector('.sn-boost'); b.hidden = !opt.boost; b.textContent = opt.boost || '';
  }
  function draw(){
    if (!D) return;
    L = T[lang()];
    var help = card6 === 'help' && phase !== 'load', sent = phase === 'sent';
    q('.sn-h').textContent = phase === 'load' ? L.hLoad : sent ? L.hSent : help ? L.hHelp : L.h;
    q('.sn-sub').textContent = phase === 'load' ? L.subLoad : sent ? L.subSent : help ? L.subHelp : L.sub;
    q('.sn-safe').innerHTML = L.safe; q('.sn-safe').hidden = !help || sent; q('.sn-quote').hidden = help && !sent; q('.sn-quote span').textContent = L.quote;
    q('.sn-note').textContent = sent ? L.noteSent : help ? L.noteHelp : L.note;
    q('.sn-edit').textContent = L.edit; q('.sn-edit').hidden = sent;
    var st = q('.sn-status'); st.hidden = phase !== 'load'; clearInterval(loadTimer);
    if (phase === 'load') { var i = 0; st.textContent = L.load[0]; loadTimer = setInterval(function(){ i = Math.min(L.load.length - 1, i + 1); st.textContent = L.load[i]; }, 2600); }
    var nb = chainBodies().length, boost = nb ? fmt(L.boost, { n:nb }) : '';
    if (phase === 'load') {
      KEYS.forEach(function(k){ setCard(k, L[{ send:'cSend', rights:'cRights', inst:'cInst', letter:'cLetter', lawyer:'cLawyer', mp:'cMp' }[k]], L.wait); });
    } else if (!sent) {
      var nr = rightsList().filter(function(x){ return x[2]; }).length, non = rows.filter(function(r){ return r.on; }).length + (pool ? 1 : 0);
      var first = !seen.rights ? 'rights' : 'send';
      setCard('send', L.cSend, L.cSendS, { main:first === 'send', flag:first === 'send' ? L.ready : '' });
      setCard('rights', L.cRights, clean(Vd && Vd.law) ? fmt(L.cRightsS, { n:nr }) : L.cRightsNone, { done:!!seen.rights, main:first === 'rights', flag:first === 'rights' ? L.start : '', boost:boost });
      setCard('inst', L.cInst, rows.length ? fmt(L.cInstS, { n:non }) : L.cInstNone, { done:!!seen.inst });
      setCard('letter', L.cLetter, L.cLetterS, { done:!!seen.letter });
      setCard('lawyer', L.cLawyer, L.cLawyerS, { done:!!seen.lawyer });
      setCard('mp', card6 === 'help' ? L.cHelp : L.cMp, card6 === 'help' ? L.cHelpS : L.cMpS, { done:!!seen.mp });
    } else {
      var na = ((res && res.authorities) || []).length + nb;
      setCard('send', L.cSend, fmt(L.cSendSent, { ref:res.ref }), { done:true });
      setCard('rights', L.cRights, L.cRightsSent, { main:!!nb, flag:nb ? L.next : '', boost:boost });
      setCard('inst', L.cInst, na ? fmt(L.cInstSent, { n:na }) : L.cInstNone, {});
      setCard('letter', L.cLetter, L.cLetterSent, {});
      setCard('lawyer', L.cLawyer, L.cLawyerS, {});
      setCard('mp', card6 === 'help' ? L.cHelp : L.cMp, card6 === 'help' ? L.cHelpS : L.cMpSent, {});
    }
    q('.sn-after').innerHTML = sent ? '<button type="button" class="go" data-a="track">' + esc(L.track) + '</button><button type="button" class="ghost" data-a="another">' + esc(L.another) + '</button>' : '';
    if (cur) openSheet(cur, true);
  }

  // ── Sheets ──
  var VIEWS = {
    rights: function(){
      var list = rightsList(), sent = phase === 'sent';
      var h = '<p class="p">' + esc(sent ? L.rIntroSent : L.rIntro) + '</p><div class="prog"><i></i></div>';
      if (!clean(Vd && Vd.law) && !sent) h += '<div class="warn">' + esc(L.rNoLaw) + '</div><div style="height:10px"></div>';
      list.forEach(function(r, i){ h += '<details class="acc" data-i="' + i + '"' + (read[i] ? ' open' : '') + '><summary><i>' + (read[i] ? '✓' : i + 1) + '</i>' + esc(r[0]) + '</summary><div class="p">' + r[1] + (r[2] && !sent ? '<br><span class="cited">✓ ' + esc(L.inLetter) + '</span>' : '') + '</div></details>'; });
      return [L.cRights, h + '<p class="hint">' + esc(L.disc) + '</p>' + (sent ? '' : '<button type="button" class="go" data-go="letter">' + esc(L.seeLetter) + '</button>')];
    },
    inst: function(){
      var sent = phase === 'sent', h = '<p class="p" style="margin-bottom:12px">' + esc(sent ? L.iIntroSent : L.iIntro) + '</p>';
      if (sent) {
        var inst = res.institution || {}, auths = res.authorities || [];
        auths.forEach(function(a, i){
          var u = webUrl(a.url), tag = i === 0 && inst.status === 'sent' ? L.iSent : !u && a.phone ? L.iPhone : '';
          h += '<div class="inst"><span class="av">🏛</span><div><b>' + esc(a.name) + '</b><small>' + esc(a.email || a.phone || a.note || '') + '</small></div>' + (tag ? '<em>' + esc(tag) + '</em>' : '') + '<span class="acts">' +
            (u ? '<a class="mini" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(L.iForm) + '</a>' : '') + (i > 0 ? '<button type="button" class="mini" data-a="copyletter">' + esc(L.copyLetter) + '</button>' : '') + '</span></div>';
        });
        chainBodies().forEach(function(b){ var u = webUrl(b.url);
          h += '<div class="inst"><span class="av">⚖</span><div><b>' + esc(b.name) + '</b><small>' + esc(b.phone || '') + '</small></div><span class="acts">' + (u ? '<a class="mini" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(L.open) + '</a>' : '') + '<button type="button" class="mini" data-a="copyletter">' + esc(L.copyLetter) + '</button></span></div>'; });
        if (!auths.length && !chainBodies().length) h += '<p class="hint">' + esc(L.iNone) + '</p>';
        return [L.cInst, h];
      }
      if (!rows.length) h += '<div class="warn">' + esc(L.iNone) + '</div>';
      rows.forEach(function(r, i){ h += '<button type="button" class="inst' + (r.on ? ' on' : '') + (r.primary ? ' lock' : '') + '" data-row="' + i + '"><span class="bx">✓</span><div><b>' + esc(r.n) + '</b><small>' + esc(r.line) + '</small></div><em>' + esc(r.primary ? L.iPrimary : L.iExtra) + '</em></button>'; });
      if (poolOffered()) h += '<button type="button" class="inst' + (pool ? ' on' : '') + '" data-a="pool"><span class="bx">✓</span><div><b>' + esc(L.iPool) + '</b><small>' + esc(L.iPoolS) + '</small></div><em>⚖</em></button>';
      return [L.cInst, h + '<button type="button" class="go" data-go="send">' + esc(L.done) + '</button>'];
    },
    letter: function(){
      var sent = phase === 'sent', h = '<p class="p" style="margin-bottom:10px">' + esc(sent ? L.lIntroSent : L.lIntro) + '</p>';
      if (editing && !sent) return [L.cLetter, h + '<textarea class="letter" id="sn-led" maxlength="6000">' + esc(letterText()) + '</textarea><button type="button" class="go" data-a="ledit">' + esc(L.lDone) + '</button>'];
      var body = letterEdited ? '<div>' + esc(letterEdited) + '</div>' : secs.map(function(s){ return (s.h ? '<h4>' + esc(s.h) + '</h4>' : '') + '<div>' + esc(s.b) + '</div>'; }).join('');
      h += '<div class="letter"><span class="subj">' + esc(subject()) + '</span>' + body + '</div>';
      return [L.cLetter, h + (sent ? '<button type="button" class="go" data-a="copyletter">' + esc(L.copyLetter) + '</button>'
        : '<div class="two"><button type="button" class="ghost" data-a="ledit">' + esc(L.lEdit) + '</button></div><button type="button" class="go" data-go="send">' + esc(L.lOk) + '</button>')];
    },
    lawyer: function(){
      var pv = provOf(D.loc), aid = LEGAL_AID[pv] || [L.aid, AID_ALL], area = LW_AREA[cat] || '';
      var list = (window.LAWYERS && window.LAWYERS[pv.toLowerCase()] && window.LAWYERS[pv.toLowerCase()][area]) || [];
      var h = '<p class="p" style="margin-bottom:12px">' + esc(L.wIntro) + '</p><a class="inst" href="' + esc(aid[1]) + '" target="_blank" rel="noopener"><span class="av">⚖</span><div><b>' + esc(aid[0]) + '</b><small>' + esc(L.wAid) + '</small></div></a>';
      list.slice(0, 4).forEach(function(l){ var u = webUrl(l.url);
        h += (u ? '<a class="inst" href="' + esc(u) + '" target="_blank" rel="noopener">' : '<div class="inst">') + '<span class="av">⚖</span><div><b>' + esc(l.name) + '</b><small>' + esc(l.note || l.phone || '') + '</small></div>' + (l.badge ? '<em>' + esc(l.badge) + '</em>' : '') + (u ? '</a>' : '</div>'); });
      return [L.cLawyer, h + (phase === 'sent' ? '<button type="button" class="go" data-a="lawyer">' + esc(L.wGo) + '</button>' : '<p class="hint">' + esc(L.wFirst) + '</p>') + '<p class="hint">' + esc(L.disc) + '</p>'];
    },
    mp: function(){
      if (card6 === 'help') {
        var h = '<p class="p" style="margin-bottom:12px">' + esc(L.hText) + '</p>';
        HELP.forEach(function(x){ h += '<a class="inst" href="' + x[3] + '"><span class="av">' + x[0] + '</span><div><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></div></a>'; });
        return [L.cHelp, h + '<button type="button" class="ghost" data-a="exit">' + esc(L.exit) + '</button>'];
      }
      return [L.cMp, '<p class="p">' + esc(L.mText) + '</p><button type="button" class="go" data-a="mp">' + esc(L.mGo) + '</button>'];
    }
  };

  // Card I is one lasting block, so the Turnstile check inside it is never rebuilt while the person works.
  var SP = null;
  function sendPane(){
    var p = q('.sn-sendp');
    if (!SP) {
      p.innerHTML = '<div class="sp-sum sum"></div><div class="sp-name"></div><button type="button" class="tg" data-a="agree"><div></div><i></i></button>' +
        '<details class="terms"><summary></summary>' + AGREEMENT.map(function(t){ return '<p>' + esc(t) + '</p>'; }).join('') + '</details><div class="ts"></div>' +
        '<div class="warn sp-high" hidden><p class="p"></p><div class="two"><button type="button" class="ghost" data-a="highno"></button><button type="button" class="go" data-a="highok" style="margin-top:10px"></button></div></div>' +
        '<button type="button" class="go sp-btn" data-a="send"><span></span> <span class="ca">CA</span></button>' +
        '<div class="code" hidden><p class="p sp-cmsg"></p><input class="in sp-cin" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"><button type="button" class="go" data-a="code"></button><p class="err sp-cerr"></p><p class="hint"><a href="#" data-a="recode"></a></p></div>' +
        '<p class="err sp-err" role="status"></p><p class="hint sp-hint"></p><p class="hint sp-sos"></p><div class="sp-done"></div>';
      SP = { sum:p.querySelector('.sp-sum'), name:p.querySelector('.sp-name'), agree:p.querySelector('[data-a="agree"]'), terms:p.querySelector('.terms summary'), ts:p.querySelector('.ts'),
        high:p.querySelector('.sp-high'), btn:p.querySelector('.sp-btn'), code:p.querySelector('.code'), cmsg:p.querySelector('.sp-cmsg'), cin:p.querySelector('.sp-cin'), cerr:p.querySelector('.sp-cerr'),
        err:p.querySelector('.sp-err'), hint:p.querySelector('.sp-hint'), sos:p.querySelector('.sp-sos'), done:p.querySelector('.sp-done') };
      SP.cin.addEventListener('input', function(){ SP.cin.value = SP.cin.value.replace(/\D/g, '').slice(0, 6); });
    }
    if (pendingCode && codeFor === D.mail) { SP.code._on = true; SP.cmsg.textContent = fmt(L.codeMsg, { m:codeFor }); } pendingCode = false;
    var sent = phase === 'sent';
    [].forEach.call(p.children, function(ch){ ch.hidden = sent ? ch !== SP.done : ch === SP.done || (ch === SP.high && !SP.high._on) || (ch === SP.code && !SP.code._on); });
    if (sent) { SP.done.innerHTML = sentHtml(); return; }
    var others = rows.filter(function(r){ return !r.primary && r.on; }).length;
    var row = function(k, v){ return '<div><small>' + esc(L.sum[k]) + '</small><span>' + esc(v || '—') + '</span></div>'; };
    SP.sum.innerHTML = row('to', recipient() || L.toNone) + (org ? row('about', org) : '') + row('topic', label()) + row('where', D.loc) + row('mail', D.mail) + (others ? row('also', fmt(L.alsoN, { n:others })) : '');
    drawName();
    SP.agree.classList.toggle('on', agreed); SP.agree.querySelector('div').textContent = L.agree; SP.terms.textContent = L.terms;
    SP.high.querySelector('.p').textContent = L.high; SP.high.querySelector('[data-a="highno"]').textContent = L.highNo; SP.high.querySelector('[data-a="highok"]').textContent = L.highOk;
    SP.btn.firstChild.textContent = busy ? L.sending : L.send; SP.btn.disabled = busy;
    SP.code.querySelector('[data-a="code"]').textContent = L.codeOk; SP.code.querySelector('[data-a="recode"]').textContent = L.codeRe;
    SP.hint.textContent = L.hint; SP.sos.textContent = L.sos;
    loadTs();
  }
  function drawName(){
    var need = needName(), h = '';
    if (!need) h += '<button type="button" class="tg' + (!named ? ' on' : '') + '" data-a="anon"><div>' + esc(L.anon) + '</div><i></i></button>';
    if (need || named) h += (need ? '<p class="why">' + esc(L.nameWhy) + '</p>' : '') + '<input class="in sp-nm" type="text" maxlength="120" autocomplete="name" placeholder="' + esc(L.namePh) + '" value="' + esc(nameVal) + '">';
    SP.name.innerHTML = h;
    var n = SP.name.querySelector('.sp-nm'); if (n) n.addEventListener('input', function(){ nameVal = n.value; });
  }
  function loadTs(){
    if (tsWidget !== null) return; tsWidget = false;
    var render = function(){ try { tsWidget = window.turnstile.render(SP.ts, { sitekey:SITEKEY, theme:'dark', callback:function(t){ tsToken = t; }, 'error-callback':function(){ tsToken = ''; SP.ts.innerHTML = ''; }, 'expired-callback':function(){ tsToken = ''; } }); } catch (e) { tsWidget = null; } };
    if (window.turnstile) return render();
    var sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = render; sc.onerror = function(){ tsWidget = null; sc.remove(); }; document.head.appendChild(sc);
  }
  function sentHtml(){
    var inst = res.institution || {}, a0 = (res.authorities || [])[0] || {}, line = '', act = '';
    if (inst.status === 'sent') line = fmt(L.dSent, { n:inst.name || '' });
    else if (inst.status === 'form_only') { line = fmt(L.dForm, { n:inst.name || '' }); var u = webUrl(a0.url); if (u) act = '<a class="go" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(L.dFormGo) + '</a>'; }
    else if (inst.status === 'failed' && inst.fallback) { var f = inst.fallback; line = L.dFail; act = '<a class="go" href="mailto:' + esc(f.to) + '?subject=' + esc(encodeURIComponent(f.subject)) + '&amp;body=' + esc(encodeURIComponent(f.body)) + '">' + esc(L.dFailGo) + '</a>'; }
    else line = L.dSaved;
    var on = [true, inst.status === 'sent', false, false];
    return '<div class="seal">✓</div><div class="refbox"><small>' + esc(L.ref) + '</small><strong>' + esc(res.ref) + '</strong><button type="button" class="mini" data-a="copyref">' + esc(L.copy) + '</button></div>' +
      (res.test ? '<p style="text-align:center"><span class="tag">' + esc(L.dTest) + '</span></p>' : '') +
      '<p class="p" style="margin-top:12px;text-align:center">' + esc(line) + (res.confirmationSent ? ' ' + esc(L.dMail) : '') + '</p>' + act +
      '<div class="steps">' + L.st.map(function(s, i){ return '<div' + (on[i] ? ' class="on"' : '') + '>' + esc(s) + '</div>'; }).join('') + '</div>' +
      '<p class="hint">' + esc(L.keep) + '</p><button type="button" class="go" data-a="track">' + esc(L.track) + '</button>';
  }
  function openSheet(k, keep){
    if (phase === 'load') return;
    cur = k; if (!keep) { seen[k] = true; }
    var isSend = k === 'send';
    q('.sn-body').hidden = isSend; q('.sn-sendp').hidden = !isSend;
    if (isSend) { q('#sn-sh-t').textContent = phase === 'sent' ? L.hSent : L.cSend; sendPane(); }
    else { var v = VIEWS[k](); q('#sn-sh-t').textContent = v[0]; q('.sn-body').innerHTML = v[1]; if (k === 'rights') prog(); }
    q('.sn-x').setAttribute('aria-label', L.close);
    q('.sn-dim').classList.add('on'); q('.sn-sheet').classList.add('on'); if (!keep) q('.sn-sheet').scrollTop = 0;
    if (!keep) refreshCards();
  }
  function closeSheet(quiet){ var ta = q('#sn-led'); if (editing && ta) { letterEdited = ta.value.trim() === letterPlain().trim() ? '' : ta.value; editing = false; }
    q('.sn-dim').classList.remove('on'); q('.sn-sheet').classList.remove('on'); cur = ''; if (!quiet) refreshCards(); }
  function refreshCards(){ var c = cur; cur = ''; draw(); cur = c; }
  function prog(){ var n = rightsList().length, r = 0; for (var i = 0; i < n; i++) if (read[i]) r++; var p = q('.prog i'); if (p) p.style.width = (n ? r / n * 100 : 0) + '%'; }
  function onToggle(e){
    var d = e.target; if (!d.open || !d.classList || !d.classList.contains('acc')) return;
    read[d.dataset.i] = 1; d.querySelector('summary i').textContent = '✓'; prog();
  }

  // ── Clicks ──
  function onClick(e){
    var c = e.target.closest('.sn-card'); if (c && !c.classList.contains('wait')) { openSheet(c.dataset.k); return; }
    if (e.target.closest('.sn-dim,.sn-x')) { closeSheet(); return; }
    if (e.target.closest('.sn-edit')) { editAnswers(); return; }
    var t = e.target.closest('[data-go],[data-a],[data-row]'); if (!t) return;
    if (t.dataset.go) { openSheet(t.dataset.go); return; }
    if (t.dataset.row != null) { var r = rows[+t.dataset.row]; if (!r || r.primary) return; r.on = !r.on; t.classList.toggle('on', r.on); buildLetter(); return; }
    var a = t.dataset.a; if (t.tagName === 'A' && a) e.preventDefault();
    if (a === 'pool') { pool = !pool; t.classList.toggle('on', pool); return; }
    if (a === 'anon') { named = !named; drawName(); return; }
    if (a === 'agree') { agreed = !agreed; t.classList.toggle('on', agreed); return; }
    if (a === 'ledit') { if (editing) { var ta = q('#sn-led'); if (ta) letterEdited = ta.value.trim() === letterPlain().trim() ? '' : ta.value; } editing = !editing; overrideCheck = false; openSheet('letter', true); return; }
    if (a === 'copyletter') { copy(res ? (res.letter || signed()) : signed(), t); return; }
    if (a === 'copyref') { copy(res.ref, t); return; }
    if (a === 'send') { send(); return; }
    if (a === 'highok') { highOk = true; SP.high._on = false; SP.high.hidden = true; send(); return; }
    if (a === 'highno') { SP.high._on = false; SP.high.hidden = true; return; }
    if (a === 'code') { checkCode(); return; }
    if (a === 'recode') { sendCode(D.mail); return; }
    if (a === 'exit') { location.replace('https://www.google.com/search?q=weather'); return; }
    if (a === 'mp') { closeSheet(true); if (typeof window.mvOpen === 'function') window.mvOpen(res ? res.ref : ''); return; }
    if (a === 'lawyer') { var area = LW_AREA[cat], pv = provOf(D.loc).toLowerCase(); hide(); if (area && pv && typeof window.goToLawyer === 'function') window.goToLawyer(pv, area); else if (window.goApp) window.goApp('lawyer'); return; }
    if (a === 'track') { var ref = res.ref; hide(); if (window.goApp) window.goApp('track'); var inp = document.getElementById('trk-inp'); if (inp) { inp.value = ref; if (typeof window.doTrack === 'function') window.doTrack(); } return; }
    if (a === 'another') { newComplaint(); return; }
  }
  function editAnswers(){ run++; phase = 'off'; unsave(); hide(); if (window.ccStepsOpen) window.ccStepsOpen(); }
  function newComplaint(){ hide(); D = null; phase = 'off'; unsave(); if (window.ccStepsReset) window.ccStepsReset(); if (window.ccStepsOpen) window.ccStepsOpen(); }

  // ── E-mail check: the first Send e-mails a 6-digit code; the right code earns a 30-day pass kept on this device ──
  function passFor(m){ try { var o = JSON.parse(localStorage.getItem(PASS_KEY) || 'null'); return o && o.e === m.toLowerCase() && +String(o.p).split('.')[0] > Date.now() ? o.p : ''; } catch (e) { return ''; } }
  function sendCode(m){
    SP.cerr.textContent = '';
    return post('/api/email-code', { action:'send', email:m }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return [r, d]; }); }).catch(function(){ return [null, {}]; }).then(function(x){
      var r = x[0], d = x[1]; SP.code._on = true; SP.code.hidden = false;
      if (!r || !r.ok) { SP.cerr.textContent = d.error === 'cooldown' ? L.codeMany : L.codeFail; return false; }
      codeTok = d.token; codeFor = m; save(); SP.cmsg.textContent = fmt(L.codeMsg, { m:m }); SP.cin.value = ''; SP.cin.focus(); return true;
    });
  }
  function checkCode(){
    var m = D.mail, c = SP.cin.value.trim(); SP.cerr.textContent = '';
    if (m !== codeFor) { sendCode(m); return; }
    if (!/^\d{6}$/.test(c)) { SP.cerr.textContent = L.codeBad; return; }
    post('/api/email-code', { action:'check', email:m, code:c, token:codeTok }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return [r, d]; }); }).catch(function(){ return [null, {}]; }).then(function(x){
      var r = x[0], d = x[1];
      if (!r || !r.ok || !d.pass) { SP.cerr.textContent = d.error === 'cooldown' ? L.codeMany : L.codeBad; return; }
      try { localStorage.setItem(PASS_KEY, JSON.stringify({ e:m.toLowerCase(), p:d.pass })); } catch (e) {}
      SP.code._on = false; SP.code.hidden = true; send();
    });
  }
  // Same checks as before anything leaves: problems are listed once; a second tap sends anyway.
  function checkCase(letter){
    var out = [], low = function(s){ return String(s || '').toLowerCase().trim(); }, to = recipient(), pv = provOf(D.loc), law = clean(Vd && Vd.law);
    var greet = letter.split('\n').filter(function(l){ return /^\s*dear\b/i.test(l); })[0] || '';
    if (to && low(greet).indexOf(low(to)) < 0) out.push(L.chkTo);
    if (to && org && low(to) === low(org)) out.push(L.chkSame);
    if (/\[(your name|name|ref|date|deadline|address)\]/i.test(letter)) out.push(L.chkBlank);
    if (pv && law && Object.keys(PROV_ACT).some(function(k){ return k !== pv && PROV_ACT[k].test(law); })) out.push(L.chkProv);
    return out;
  }
  function send(){
    if (busy || phase !== 'ready') return;
    var err = function(m){ SP.err.textContent = m; };
    err('');
    var mail = D.mail;
    if (!isMail(mail)) { err(L.eMail); return; }
    if (needName() && !nameVal.trim()) { err(L.eName); var n = SP.name.querySelector('.sp-nm'); if (n) n.focus(); return; }
    if (!agreed) { err(L.eAgree); return; }
    var pass = passFor(mail);
    if (!pass) { if (SP.code._on && codeFor === mail) { SP.cin.focus(); return; } SP.btn.disabled = true; sendCode(mail).then(function(){ SP.btn.disabled = false; }); return; }
    var issues = checkCase(signed());
    if (issues.length && !overrideCheck) { overrideCheck = true; err('⚠ ' + issues.join(' ') + ' ' + L.chkAgain); return; }
    overrideCheck = false;
    var last = 0; try { last = parseInt(localStorage.getItem('vc_last_submit') || '0', 10); } catch (e) {}
    if (Date.now() - last < COOLDOWN_MS) { err(L.eCool); return; }
    if (prio === 'high' && !highOk) { SP.high._on = true; SP.high.hidden = false; SP.high.scrollIntoView({ block:'center', behavior:'smooth' }); return; }
    busy = true; SP.btn.disabled = true; SP.btn.firstChild.textContent = L.sending;
    var isNamed = needName() || named, letter = signed(), title = D.what.replace(/\s+/g, ' ').trim().slice(0, 80) || label();
    var test = !!(window._ccPanelTest || /[?&]test=1\b/.test(location.search));
    var body = { test:test, title:title, desc:D.story, target:target, targetName:org, targetAddress:'', location:D.loc, place:A ? [A.city, A.address].filter(Boolean).join(' ') : '', category:cat, priority:prio,
      ctype:pool ? 'legal' : 'notice', anonymous:!isNamed, name:isNamed ? nameVal.trim() : '', email:mail, photoCount:0, legalAccepted:true, consent:{ authorize:true, v:'2026-10' },
      turnstileToken:tsToken, mailPass:pass, lang:document.documentElement.lang || 'en', emailDraft:letter };
    var r0 = null;
    post('/api/complaint', body).then(function(r){ r0 = r; return r.json().catch(function(){ return {}; }); }).catch(function(){ return { error:'network' }; }).then(function(d){
      busy = false; SP.btn.disabled = false; SP.btn.firstChild.textContent = L.send; highOk = false;
      if (!r0 || !r0.ok) {
        if (window.turnstile && tsWidget) try { window.turnstile.reset(tsWidget); tsToken = ''; } catch (e) {}
        if (d.error === 'email_unverified') { try { localStorage.removeItem(PASS_KEY); } catch (e) {} codeTok = ''; }
        if (d.error === 'invalid' && (d.fields || []).indexOf('name') > -1) { prio = 'high'; drawName(); }
        err({ cooldown:L.eCool, verification:L.eVerify, save_failed:L.eSave, email_unverified:L.eUnver }[d.error] || L.eFail); return;
      }
      try { localStorage.setItem('vc_last_submit', String(Date.now())); } catch (e) {}
      var now = new Date().toISOString(), rec = { ref:d.ref, title:title, desc:D.story, category:d.category, target:target, targetName:org, priority:d.priority, location:D.loc, anonymous:!isNamed, ctype:body.ctype, isLegal:body.ctype === 'legal', photoCount:0, status:'received', date:now, timeline:[{ status:'received', date:now }], test:d.test };
      try { var list = JSON.parse(localStorage.getItem('vc_comp') || '[]'); list.unshift(rec); localStorage.setItem('vc_comp', JSON.stringify(list.slice(0, 50))); } catch (e) {}
      try { if (typeof _complaints !== 'undefined' && Array.isArray(_complaints)) _complaints.unshift(rec); } catch (e) {}
      res = d; res.letter = letter; phase = 'sent'; seen = {}; unsave();
      if (window.ccStepsReset) window.ccStepsReset();
      openSheet('send');
    });
  }

  // ── Showing and hiding: it takes the File tab like the six-step screen ──
  function show(){
    if (!root) build();
    if (window.ccStepsClose) window.ccStepsClose();
    if (window._ccGoFile) window._ccGoFile(); else if (window.goApp) window.goApp('new');
    document.body.classList.add('cc-sonuc-on'); root.classList.add('on'); window.scrollTo(0, 0);
  }
  function hide(){ if (!root) return; closeSheet(true); clearInterval(loadTimer); root.classList.remove('on'); document.body.classList.remove('cc-sonuc-on'); }

  window.ccSonuc = {
    // d = { mail, loc, who, cat, sub, topic, limit, what, notes, story } from the six-step screen.
    open: function(d, keep){
      D = d; codeTok = (keep && keep.tok) || ''; codeFor = (keep && keep.to) || ''; pendingCode = !!codeTok; A = R = Vd = res = null; cat = ''; org = d.who || ''; prio = 'medium'; card6 = 'mp'; rows = []; secs = [];
      pool = named = agreed = busy = highOk = overrideCheck = editing = false; nameVal = ''; letterEdited = ''; seen = {}; read = {}; cur = '';
      if (SP) { SP.code._on = SP.high._on = false; SP.err.textContent = ''; SP.cerr.textContent = ''; }
      if (window.turnstile && tsWidget) try { window.turnstile.reset(tsWidget); } catch (e) {} tsToken = '';
      phase = 'load'; save(); show(); draw(); analyse();
    },
    hide: hide,
    // The File tab comes back here while a filled complaint waits to be sent.
    resume: function(){
      if (D && (phase === 'load' || phase === 'ready')) { show(); draw(); return true; }
      var o = phase === 'sent' ? null : saved(); if (!o) return false;
      window.ccSonuc.open(o.d, o); return true;
    },
    waiting: function(){ return !!saved(); },
    relang: function(){ if (root && root.classList.contains('on')) draw(); }
  };
})();
