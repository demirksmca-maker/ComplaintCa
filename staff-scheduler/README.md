# Personel Vardiya Planlayıcı

ComplaintCA sitesinden bağımsız, AI destekli otomatik vardiya optimizasyonu
yapan bir **masaüstü** uygulaması (Electron). Windows, macOS ve Linux'ta
çalışır, verileri tamamen yerel olarak (bilgisayarınızda) saklar; internet
bağlantısı veya API anahtarı gerektirmez.

## Özellikler

- **Personel yönetimi**: ad, rol, min/maks haftalık çalışma saati, vardiyalar
  arası minimum dinlenme süresi, maksimum ardışık çalışma günü, sabit izin
  günleri ve ek uygunsuzluk aralıkları (randevu, izin vb.).
- **Vardiya şablonları**: haftanın her günü için farklı vardiyalar (ör. Sabah
  / Akşam / Gece), her vardiya için gereken kişi sayısı ve isteğe bağlı rol
  şartı.
- **Otomatik optimizasyon**: tek tuşla haftalık programı otomatik oluşturur;
  aşağıdaki kısıtları gözetir:
  - Personelin izinli/uygunsuz olduğu saatlere asla atama yapmaz.
  - Aynı personeli aynı anda çakışan iki vardiyaya atamaz.
  - Haftalık maksimum saatleri ve vardiyalar arası dinlenme süresini önceliklendirir
    (yeterli personel yoksa esnetir ve bunu **uyarı** olarak gösterir).
  - Saatleri personel arasında adil dağıtmaya çalışır (en az çalışan önce
    atanır) ve yerel arama ile ek iyileştirme yapar.
- **Uyarılar**: doldurulamayan vardiyalar, aşırı/az çalıştırılan personel
  program ekranında listelenir.
- **Raporlar**: personel başına planlanan toplam saat ve durum özeti.
- **CSV dışa aktarma**: oluşturulan programı Excel'de açılabilir CSV olarak
  kaydeder.

### "AI destekli" ne anlama geliyor?

Uygulama bir dil modeline (ChatGPT/Claude vb.) ağ üzerinden istek atmaz;
`src/optimizer.js` içinde çalışan, kısıt tabanlı bir sezgisel/yerel-arama
optimizasyon algoritması kullanır. Bu sayede uygulama tamamen çevrimdışı,
hızlı ve ücretsiz çalışır. İstenirse ileride bir LLM entegrasyonu
(ör. serbest metinle "bu hafta Ahmet'i az çalıştır" gibi notları
yorumlatmak) ayrı bir modül olarak eklenebilir.

## Kurulum ve Çalıştırma

```bash
cd staff-scheduler
npm install
npm start
```

## Testler

Optimizasyon algoritmasının birim testleri (Node'un yerleşik test
çalıştırıcısı ile, ek bağımlılık gerekmez):

```bash
npm test
```

## Paketleme (dağıtılabilir uygulama oluşturma)

```bash
npm run dist
```

`electron-builder`, işletim sisteminize uygun bir kurulum dosyası
(`dist/` klasörü altında) üretir.

## Veri Depolama

Tüm personel, vardiya ve program verileri, işletim sisteminin kullanıcı veri
klasöründe (`app.getPath('userData')`) `staff-scheduler-data.json` dosyasında
saklanır. Uygulamayı silmek verilerinizi de siler; yedeklemek isterseniz bu
dosyayı kopyalayabilirsiniz.

## Bilinen Sınırlamalar

- Dinlenme süresi ve ardışık gün hesapları hafta içi gün sıralamasına göre
  yapılır; bir haftanın Pazar'ından sonraki haftanın Pazartesi'sine geçen
  dinlenme süresi ayrıca kontrol edilmez (haftalık planlama döngüsü).
- Optimizasyon algoritması sezgiseldir; çok büyük ölçekli (yüzlerce personel/
  vardiya) senaryolarda en iyi çözümü garanti etmez, ancak pratik ölçeklerde
  (bir mağaza/restoran/klinik ekibi) iyi sonuçlar verir.
