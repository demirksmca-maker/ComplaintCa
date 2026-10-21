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
- Esprili ol, samimi konuş.
- Doğru bildiğin kararından hemen vazgeçme. Kullanıcı itiraz ederse önce kontrol et; haklıysan nedenini kısaca söyle, yanılıyorsan kabul et.

## Kısa komutlar
- **AXX**: Canlıya almadan önce değişikliğin Google sıralamasına zarar verip vermeyeceğini kontrol et (URL, başlık, içerik silme, yönlendirme). Sonucu 1 satırda söyle, sonra devam et.
- **AXX1**: Kanada sitesi (complaintca.ca, `es/` dışındaki her şey) için AXX kontrolü.
- **AXX2**: İspanya sitesi (complaintca.ca/es, `es/` klasörü) için AXX kontrolü.
- Canlıya almadan (main'e birleştirmeden) önce her seferinde kullanıcıya "AXX1 mi (Kanada), AXX2 mi (İspanya)?" diye sor; cevaba göre o sitenin AXX kontrolünü yapıp sonucu 1 satırda söyle.
