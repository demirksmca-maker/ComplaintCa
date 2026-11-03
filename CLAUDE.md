# Claude çalışma kuralları

## İletişim
- Kullanıcıyla Türkçe konuş.
- Token harcama. Kısa, basit, günlük kelimeler kullan. Uzun cümle, uzun liste, uzun tablo yok.
- Basit soruya tek kelime/tek satır cevap ver ("Evet.", "Aşağı kaydır."). Açıklama gerekirse en fazla birkaç cümle.
- Yanıt en fazla 5-6 satır. Daha uzun gerekiyorsa sadece sonucu yaz, ayrıntıyı sorulursa ver.
- Kısa ve öz yaz. Gereksiz açıklama, özet, tekrar yok.
- Yapılan işi 1-3 satırda bildir: ne değişti, hangi dosya.
- Seçenekleri uzun uzun listeleme; tek bir öneri ver.
- Sorulmadıkça kodu satır satır açıklama.
- Sadece gerçekten karar gerekiyorsa soru sor.
- Dias Panel'den gelen talepleri sorgulamadan direkt uygula (kullanıcı orada görüp gönderiyor). Test/AXX/code-review yine çalışır, sonucu 1 satır yaz.
- Esprili ol, samimi konuş.
- Doğru bildiğin kararından hemen vazgeçme. Kullanıcı itiraz ederse önce kontrol et; haklıysan nedenini kısaca söyle, yanılıyorsan kabul et.

## Kısa komutlar
- **AXX**: Canlıya almadan önce değişikliğin Google sıralamasına zarar verip vermeyeceğini kontrol et (URL, başlık, içerik silme, yönlendirme). Sonucu 1 satırda söyle, sonra devam et.
- **AXX1**: Kanada sitesi (complaintca.ca, `es/` dışındaki her şey) için AXX kontrolü.
- **AXX2**: İspanya sitesi (complaintca.ca/es, `es/` klasörü) için AXX kontrolü.
- Canlıya almadan (main'e birleştirmeden) önce SORMA: değişen dosyalara bakıp mantıklı olanı kendin seç (`es/` altı = AXX2, diğerleri = AXX1, ikisi de varsa ikisini yap). AXX kontrolünü yapıp sonucu 1 satırda söyle.
- İstisna: Dias Panel > Test'ten gelen talepler (`demo/` gibi test sayfaları) için sorma; direkt AXX1 yap, sonucu 1 satırda söyle ve main'e birleştir.
- Test sayfası (`demo/`) Vercel'i beklemez: Dias Panel > Test onu doğrudan GitHub main'den yükler. Birleştirince iş biter; Vercel deploy'u bekleme, kontrol etme. Sadece `demo/` (ve `CLAUDE.md`) değişen commit'lerde Vercel deploy atlanır (`vercel.json` > `ignoreCommand`), günlük deploy sınırı boşa harcanmaz.
- İstisna: sadece Dias Panel (`shield.html`, `api/_shield-*`, `api/_stats.js`) değişiyorsa sorma; AXX1 + AXX2 ikisini de yap, sonucu 1 satırda söyle.
- Canlıya almadan önce testleri çalıştır (`node --test` ile tüm `*.test.mjs`). Kırmızı (kod kaynaklı) test varsa birleştirme, önce düzelt. Ortam eksikliğinden (kurulu olmayan paket vb.) düşen test bu kuralın dışında, durumu kısaca belirt.
- Canlıya almadan önce değişikliği `/code-review` ile incele (ücretli GitHub Action yok). Ciddi bulgu varsa birleştirme, önce düzelt; sonucu 1 satırda söyle.

## Temizlik yetkisi
- Claude'un tam yetkisi var: otomasyonları (`.github/workflows`, `scripts/`, `api/`) ve sitenin her köşesini tarayıp gereksiz/ölü kodu temizleyebilir.
- Sınırlar: Google'da indeksli URL'yi silme/taşıma yok (gerekirse 301 ver), `sitemap.xml`'deki sayfalara dokunurken AXX kontrolü şart.
- Silmeden önce kullanılmadığını doğrula (grep, referans, workflow). Testler yeşil kalmalı.

## Ax (yeni sohbette devam)
- Kullanıcı "Ax" derse: yeni sohbet açılmış demektir. Önceki işe buradan bağlan, baştan sorma.
- Konu: Search Console 0-tık sayfaları için SEO + yapay zeka (AI Mode) alıntı formatı. BİTTİ: aşama 1-4, 62 blog yazısının hepsinde 4+ SSS + FAQPage şeması (EN+ES), markalı yazılar, guides: Ontario, CRA, Banking, Alberta, Canada Post, Airline, Telecom, Insurance.
- Doğrulandı (3 Kas 2026): CRA Ombudsperson 1-866-586-3839; OEB/IPC/CPSO alan adları ve CPSO 1-800-268-7096 doğru. Açık iş yok.
- AI-arama işi (Kanada blog+guides, ES blog) bitti: net cevap kutusu, tarih, sitemap lastmod, llms.txt, iç linkler, Article görseli, Organization şeması. Tekrar uğraşma; sadece yeni sayfaya aynı formatı uygula. `es/index.html` artık indeksli ve test kilidi kaldırıldı (API/Firebase açık). Açık risk: ES yetkili kurum linkleri doğrulanmadı (kod yorumu), Firestore canlı Kanada projesiyle ortak.
- İsteğe bağlı sonraki: BC, Quebec, Saskatchewan, Healthcare, Police guides (ince). Önce Search Console'da 2-3 hafta sonra sonuçlara bak.
- Blog tasarımı (Kanada, `blog/`): ana sayfa teması `/assets/blog-theme.css`. Yazıda inline `<style>` yok. Yeni yazıda mevcut bir yazıyı kopyala: üst bar, kısa cevap (`.lede`), `nav.toc` içinde 6 kart (tek satır kısa etiket, 4 bölüm + FAQ + Sources), her H2 bir `section.sec`. `blog-theme.test.mjs` kontrol eder.
- AI format: (1) net soru başlığı, (2) en üstte tek cümlelik cevap, (3) numaralı kısa adımlar (kime, ne, ne kadar sürer; kurum adı tam), (4) 3-5 kısa SSS (rakam/süre ile) + FAQPage şeması, `dateModified` güncelle.
- Kural: bilgiyi resmi kaynaktan/aramayla doğrula; doğrulayamadığını yazma.
- Her canlıya almadan önce AXX1/AXX2'yi kendin seç (sorma); test + /code-review çalıştır.
