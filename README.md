# Spor Rutini — takip uygulaması

Telefonda ve bilgisayarda çalışan, internet olmadan da açılan bir web uygulaması (PWA). Antrenmanları set set kaydeder, kilo/bel/uyku/protein takibi yapar, kural tabanlı uyarılar ve öneriler verir. **Veriler cihazda saklanır**; isteğe bağlı olarak Supabase ile cihazlar arasında eşitlenir. Yapay zekâ asistanı isteğe bağlıdır ve kopyala-yapıştır ile çalışır (veri otomatik gönderilmez).

Plan ve gereksinimler: [spor-rutini-plani.md](spor-rutini-plani.md) · [uygulama-gereksinimleri.md](uygulama-gereksinimleri.md)

## Neler var

| Ekran | İçerik |
|---|---|
| **Bugün** | Gün akışı: sabah tartı + uyku → öğle öğünü → akşam yürüyüşü → antrenman (tam / kısa 20 dk / bugün olmadı) ya da padel → akşam yemeği, ara öğün, plan dışı yiyecek → gün sonu (adım + not, isteğe bağlı 🤖 gün sonu kontrolü). Pazar günleri 🗓️ haftalık kontrol satırı. Tartıdan sonra **trend kilo** (7 günlük ortalama), programın ilk 14 günü **başlangıç değerlendirmesi** kartı, ilgili satırlarda 📌 eğer–o zaman planın. Altında en önemli 2 uyarı, haftalık özet ve 🔥 seri · 🌱 alışkanlık (aktif gün / 66) satırı |
| **Haftalık kontrol** (`#/haftalik`) | ~3 dk: haftanın özeti, bel ölçümü (bel/boy oranı), tek dokunuşla kalori ayarı, bakım dönemi, gelecek hafta ("yoğun hafta" → 2 kuvvet), eğer–o zaman planları (en fazla 3), alışveriş listesi, 🤖 haftalık değerlendirme |
| **Antrenman** | Dönem (ekipmansız → dambıl; bant isteğe bağlı — dambıl programı yalnızca dambıl seti + kapı barfiks barı + mat ister), A–B günleri, hareketlerin nasıl yapıldığı, kurallar; aktif antrenmanda set set kayıt, RIR, dinlenme sayacı, plank için kronometre, geçen seferin değerleri; bitirirken "Nasıldı?" (kolay/iyi/çok zor) ve ağrı bölgesi. **0.8.0:** süperset çiftleri (1a/1b) — sayaç eşe kısa geçiş (20 sn) ve tur sonu dinlenmesini (ayar − 30 sn, en az 45) kendisi ayarlar, ekran sıradaki harekete kayar; seans 30–40 dk (kısa ~20 dk) ve süre tahmini; her günde itiş + çekiş (ekipmansız dönemde Y-T / masa altı row); "↔ Değiştir" ile o günlük alternatif (ağrı / eksik ekipman, dönemde yapılabilenler); hareket başına YouTube video araması; antrenman boyunca ekran açık (Wake Lock); bitirirken "geçen sefere göre ilerleme" (🏆 kilo, seviye, en iyi set) — Bugün, Geçmiş, haftalık kontrol, blok değerlendirmesi ve yapay zekâ mesajında |
| **Yemek** | 2 öğün + ara öğün düzenine göre protein öncelikli haftalık plan; **Bugün** (Yedim ✓ → yaklaşık protein günlük kayda eklenir), **Plan** (gün gün düzenleme, protein/kalori özeti), **Alışveriş** (plandan otomatik, raf ömrü notlu, paylaşılabilir liste), **Rehber** (5 dk ev öğünleri, dışarıda/paket seçimleri, ara öğünler) |
| **İlerleme** | Kilo (günlük tartı + 7 günlük trend çizgisi), bel çevresi (bel/boy 0,5 çizgisi), güç testleri, haftalık kuvvet/padel sayısı, hareket bazında ilerleme, haftalık tablo, 4 haftalık blok değerlendirmesi; **Geçmiş kayıtlar** (düzenle/sil) buradan açılır |
| **Ayarlar** | Profil ve kalori/protein hedefleri, program başlangıcı, dönem, haftalık takvim, dinlenme süresi, yedek al / geri yükle, tüm verileri sil |

**Kural tabanlı uyarılar** (`app/js/rules.js`): haftalık kuvvet seansı eksikliği, uzun ara, protein 3 gün düşük, uyku ortalaması < 7 sa, kilo çok hızlı (> %1/hafta) veya 3 hafta yavaş (< 0,3 kg/hafta), padelde tekrarlayan ağrı, 2 seans üst üste üst sınır → zorlaştırma, ekipmansız dönemde 3 hafta düzenli gidince "ev seti zamanı" (dambıl + barfiks barı), bant → dambıl zamanı, tartı/ölçüm/fotoğraf/yedek hatırlatmaları, blok sonu değerlendirmesi, alışveriş günü hatırlatması. **0.6.0:** kilo hızı uyarısında tek dokunuşla ±150 kcal (sonra 14 gün susar), padel + antrenmanda tekrarlayan ağrı, iki antrenman üst üste "çok zor", 4 haftada bir güç testi (şınav, plank, 1 dk squat), Pazar/Pazartesi haftalık kontrol, 13. haftada (sonra her 12 haftada) 2 haftalık bakım kalorisi önerisi (bakımda kilo uyarıları susar).

**Yemek mantığı** (`app/js/foods.js`, `app/js/mealplan.js`): besin değerleri yaklaşıktır (USDA FoodData Central, TürKomp, market etiketleri) ve aralık olarak gösterilir. Kalori sayılmaz; plan protein hedefini tutturmaya göre kurulur (gerekirse ikinci ara öğün eklenir), kalori hedefinin çok altında kalırsa uyarı ve kolay eklemeler önerilir.

## Bilgisayarda çalıştırma

Gerekli: [Node.js](https://nodejs.org) 22+. Ek paket kurulmaz.

```bash
npm start
```

Sonra tarayıcıda `http://localhost:5173` adresini aç. Testler:

```bash
npm test
```

Not: Yerel adreste service worker (çevrimdışı önbellek) kapalıdır ki her değişiklik hemen görünsün. Denemek için adrese `?sw=1` ekle.

## Yayın

Adres: **https://yekmonoone.github.io/spor-rutini/** — `main` dalına her gönderimde GitHub Actions testleri çalıştırır ve `app/` klasörünü yayınlar (`.github/workflows/pages.yml`). Kişisel bilgiler içeren `spor-rutini-plani.md` depoya eklenmez (`.gitignore`).

## Telefona kurma (iPhone)

iPhone'un uygulamayı ana ekrana ekleyebilmesi için `app/` klasörünün bir **HTTPS** adresinde yayınlanması gerekir (ör. GitHub Pages veya Cloudflare Pages — ikisi de ücretsiz). Yalnızca `app/` klasörü yayınlanır; plan dosyaları ve kişisel bilgiler yayınlanmaz.

Yayınlandıktan sonra:
1. iPhone'da adresi **Safari** ile aç.
2. Paylaş düğmesi → **Ana Ekrana Ekle** → Ekle.
3. Uygulamayı bundan sonra ana ekrandaki simgeden aç. (Safari sekmesinde girilen veriler ana ekran uygulamasına taşınmaz.)
4. Haftada bir **Ayarlar → Yedeği dışa aktar → Dosyalar'a Kaydet (iCloud Drive)**.

## Güncelleme yaparken

- `app/` içine dosya eklersen/çıkarırsan `app/sw.js` içindeki `ASSETS` listesini güncelle.
- Her yayında `app/js/version.js` (`APP_VERSION`) ve `app/sw.js` (`VERSION`) aynı yeni sürüme çıkarılmalı; telefonda "Yeni sürüm hazır → Yenile" çıkar.
- `npm test` bu iki kuralı da kontrol eder.
- Simgeleri yeniden üretmek: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1`

## Klasör yapısı

```
app/                  Yayınlanan uygulama (yalnızca bu klasör)
  index.html, manifest.webmanifest, sw.js, icons/, css/app.css
  js/
    main.js           Açılış, yönlendirme, service worker
    store.js, db.js   Durum ve IndexedDB (yumuşak silme — 2. aşama eşitleme için)
    program.js, exercises.js   Dönemler, A/B günleri, hareket kütüphanesi
    foods.js, mealplan.js      Besin/öğün kütüphanesi, haftalık plan, alışveriş listesi
    ai.js, extract-json.js     Yapay zekâ mesajları ve cevaplarını okuma
    sync.js, sync-core.js      Supabase eşitlemesi
    targets.js        Kalori/protein hedefleri (Mifflin-St Jeor)
    stats.js, rules.js         Hesaplamalar ve kural tabanlı uyarılar
    charts.js, ui.js, timer.js, forms.js, backup.js
    views/            Ekranlar
tests/                Node testleri (node --test)
tools/                Yerel sunucu ve simge üretici
```

## Eşitleme (2. aşama)

Telefon ve bilgisayar arasında Supabase üzerinden eşitleme: kurulum adımları [supabase/KURULUM.md](supabase/KURULUM.md), veritabanı ve RLS kuralları [supabase/schema.sql](supabase/schema.sql). Kütüphane kullanılmaz; `app/js/sync.js` Supabase'in REST uçlarına doğrudan bağlanır, karar mantığı `app/js/sync-core.js` içinde (son yazan kazanır, silmeler de eşitlenir). Bağlantı/oturum bilgisi yalnızca cihazda tutulur ve yedek dosyasına girmez.

## Bildirimler (0.7.0)

Ana ekran uygulamasında ve eşitleme bağlıyken Web Push hatırlatmaları: sabah tartı, antrenman, gün sonu, Pazar haftalık kontrol — yalnızca gerekiyorsa (ör. kilo girildiyse sabah bildirimi gelmez). Sunucu tarafı `supabase/functions/send-reminders` (bağımlılıksız Web Push: RFC 8291/8292, WebCrypto), zamanlayıcı `pg_cron`. Kurulum: [supabase/BILDIRIM-KURULUM.md](supabase/BILDIRIM-KURULUM.md).

## Yapay zekâ

- **3. aşama (kopyala-yapıştır modu, sürüm 0.3.0):** Ayarlar → Yapay zekâ asistanı. Uygulama verilerden hazır bir mesaj üretir (değerlendirme, program, yemek planı, soru), panoya kopyalar ve Claude/ChatGPT/Gemini'yi açar; ağ isteği yapmaz (`app/js/ai.js`). Yapay zekânın verdiği ```json cevabı geri yapıştırılınca türü (A/B programı, 7 günlük yemek planı ya da gün sonu değişiklikleri) tanınır, doğrulanır ve onayla uygulanır (`settings.customProgram`, `mealplan`).
- **Gün sonu kontrolü (0.5.0):** plandan sapılan günlerde bugün ne olduğu, plan dışı yenenler ve gün notu Claude'a gider; Claude haftanın kalanı için **en fazla 3 küçük değişiklik** önerir. Uygulama sınırları denetler: yeni malzeme gerektiren öğün yok (yalnızca bu haftanın alışveriş listesiyle yapılabilenler ya da dışarıda), yeni ekipman/program yok (yalnızca gün türü değişir), yalnızca haftanın kalan günleri. Değişiklikler güne özeldir (`settings.scheduleOverrides`, `mealplan.overrides`), haftalık şablonu bozmaz.
- **0.9.0 — koç hafızası ve yeni yardımlar:**
  - **Haftayı değerlendir** artık sonunda JSON verir: en fazla 3 ölçülebilir **haftalık odak** (Bugün, haftalık kontrol ve asistanda görünür), kalori değişikliği (yalnızca −150 / 0 / +150, taban ve bakım dönemi denetlenir) ve isteğe bağlı eğer–o zaman planları (`parseWeeklyReview`). Onayla uygulanır.
  - **Dışarıda ne yesem?** (`eatout`): mekân/menü + bugün yenenler + kalan protein ile 2 seçenek; seçilen tek dokunuşla "Yedim" olarak öğüne kaydedilir (`parseEatOut`). Bugün ekranında dışarıda planlanan öğünde "🤖 Ne yesem?".
  - **Koç notları** (`meta.coachNotes`, en fazla 8) ve haftalık odak (`meta.weeklyFocus`) sonraki mesajlara "Önceki öneriler" olarak kısaca eklenir — yapay zekâ önceki önerisini takip eder.
  - **Veri azaltma:** her tür yalnızca gereken bölümleri gönderir (ör. "Dışarıda ne yesem?" yalnızca profil + bugün); ekranda hangi verilerin ve kaç karakter gittiği yazar.
  - Asistan ekranı: açıklamalı tür kartları, "📋 Panodan yapıştır", uygulanacak öneri yoksa hata yerine "not olarak kaydet". Antrenman sekmesinde "🤖 Yeni program" ve "Varsayılan programa dön", İlerleme'de blok değerlendirmesi kısayolu.
- **Sonra (isteğe bağlı):** API ile uygulama içi otomatik mod (anahtar Supabase Edge Function'da).

> Bu uygulama genel bilgi verir, tıbbi tavsiye değildir.
