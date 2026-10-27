# Claude çalışma kuralları

## İletişim
- Kullanıcıyla Türkçe konuş.
- Token harcama. Kısa, basit, günlük kelimeler kullan. Uzun cümle, uzun liste, uzun tablo yok.
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
- Canlıya almadan (main'e birleştirmeden) önce her seferinde kullanıcıya "AXX1 mi (Kanada), AXX2 mi (İspanya)?" diye sor; cevaba göre o sitenin AXX kontrolünü yapıp sonucu 1 satırda söyle.
- İstisna: Dias Panel > Test'ten gelen talepler (`demo/` gibi test sayfaları) için sorma; direkt AXX1 yap, sonucu 1 satırda söyle ve main'e birleştir.
- Test sayfası (`demo/`) Vercel'i beklemez: Dias Panel > Test onu doğrudan GitHub main'den yükler. Birleştirince iş biter; Vercel deploy'u bekleme, kontrol etme. Sadece `demo/` (ve `CLAUDE.md`) değişen commit'lerde Vercel deploy atlanır (`vercel.json` > `ignoreCommand`), günlük deploy sınırı boşa harcanmaz.
- İstisna: sadece Dias Panel (`shield.html`, `api/_shield-*`, `api/_stats.js`) değişiyorsa sorma; AXX1 + AXX2 ikisini de yap, sonucu 1 satırda söyle.
- Canlıya almadan önce testleri çalıştır (`node --test` ile tüm `*.test.mjs`). Kırmızı (kod kaynaklı) test varsa birleştirme, önce düzelt. Ortam eksikliğinden (kurulu olmayan paket vb.) düşen test bu kuralın dışında, durumu kısaca belirt.
- Canlıya almadan önce değişikliği `/code-review` ile incele (ücretli GitHub Action yok). Ciddi bulgu varsa birleştirme, önce düzelt; sonucu 1 satırda söyle.

## Temizlik yetkisi
- Claude'un tam yetkisi var: otomasyonları (`.github/workflows`, `scripts/`, `api/`) ve sitenin her köşesini tarayıp gereksiz/ölü kodu temizleyebilir.
- Sınırlar: Google'da indeksli URL'yi silme/taşıma yok (gerekirse 301 ver), `sitemap.xml`'deki sayfalara dokunurken AXX kontrolü şart.
- Silmeden önce kullanılmadığını doğrula (grep, referans, workflow). Testler yeşil kalmalı.
