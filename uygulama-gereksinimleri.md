# Spor Takip Uygulaması — Gereksinimler

> Durum: **1., 2. ve 3. aşama + yemek düzeni + gün akışı + haftalık kontrol ve ölçüm temeli + bildirimler geliştirildi** (sürüm 0.7.0, yayında: https://yekmonoone.github.io/spor-rutini/ — eşitleme için Supabase projesi kurulmalı: [supabase/KURULUM.md](supabase/KURULUM.md)) · Rutin için: [spor-rutini-plani.md](spor-rutini-plani.md) · Çalıştırma: [README.md](README.md)

## 1. Amaç
Verileri ve ilerlemeyi düzenli tutmak; isteğe bağlı AI ile konuşmak; uyarı ve öneri almak; önümüzdeki dönem için program oluşturmak.

## 2. Kararlaştırılanlar
- **Bağımsız uygulama** (claude.ai'ye bağlı değil).
- **Platform:** Windows PC + iOS telefon (ikisi de).
- **AI tamamen opsiyonel:** ayarlarda aç/kapa anahtarı; kapalıyken uygulama eksiksiz çalışır.
- **Çoklu AI sağlayıcı:** farklı AI servisleriyle kullanılabilmeli (ör. Claude, OpenAI, Gemini, OpenRouter, PC'de yerel model/Ollama). Kullanıcı kendi API anahtarını girer.
- **Antrenman kaydı set set:** hareket, set, tekrar, band/ağırlık, RIR, not.
- **Uyarılar uygulama içi** (push bildirim yok; hatırlatmalar gerekirse telefonun kendi hatırlatıcısıyla).
- **Arayüz dili:** Türkçe.

## 3. Veri modeli (taslak)
| Varlık | Alanlar |
|---|---|
| Profil | boy, doğum yılı, cinsiyet, aktivite düzeyi, hedefler, kalori/protein hedefleri |
| Program | gün şablonları (A/B), hareketler, hedef set/tekrar/RIR, dönem (band / dambıl) |
| Hareket kütüphanesi | ad, kas grubu, açıklama/teknik notları, kolay/zor varyasyonlar |
| Antrenman kaydı | tarih, gün tipi, her set için tekrar + direnç + RIR, süre, not |
| Padel kaydı | tarih, süre, tip (ders/maç), his (1–5), ağrı (dirsek/omuz/diz/bel) |
| Günlük kayıt | kilo, adım, uyku saati, yaklaşık protein, enerji/ruh hali (1–5) |
| Haftalık ölçüm | bel çevresi; aylık fotoğraf (opsiyonel, yalnızca cihazda) |

## 4. Temel özellikler (AI olmadan çalışır)
- **Bugünün antrenmanı:** plan önceden dolu, sadece sayıları gir; son seansın değerleri öneri olarak gelir.
- **Set arası dinlenme sayacı.**
- **İlerleme grafikleri:** haftalık ortalama kilo, bel çevresi, hareket bazında tekrar/direnç, haftalık seans sayısı.
- **Kural tabanlı uyarılar** (deterministik):
  - Bu hafta 2'den az kuvvet seansı.
  - Haftalık kilo kaybı vücut ağırlığının %1'inden fazla (çok hızlı) veya 3 hafta boyunca <0,3 kg (kalibrasyon önerisi).
  - Protein 3+ gün hedefin altında.
  - Uyku ortalaması 7 saatin altında.
  - Bir harekette 2 seans üst üste 3×15 → ilerleme önerisi.
  - Padel sonrası tekrarlayan dirsek/omuz ağrısı → dinlenme + uzmana danış uyarısı.
  - Bel ölçümü / fotoğraf zamanı.
- **Program dönemleri:** 4 haftalık bloklar, blok sonu değerlendirme, band → dambıl geçişi.
- **0.6.0 — düzenli takip için:**
  - Ölçüm temeli: trend kilo (7 günlük ortalama), bel/boy oranı (NICE NG246: < 0,5), 4 haftada bir güç testi (`measurements`, `kind: 'test'`), ilk 14 gün başlangıç değerlendirmesi.
  - Haftalık kontrol (`#/haftalik`, `meta.lastCheckin`) ve eğer–o zaman planları (`settings.ifThen`, en fazla 3; Singh 2024 alışkanlık medyanı ~59–66 gün, uygulama niyetleri d≈0,24–0,31).
  - Antrenman sonrası zorluk/ağrı (`workout.effort`, `workout.pain`), bakım dönemi (`settings.maintenanceFrom/Until`, kalori = tahmini harcama ±50).
  - Alışkanlık: aktif gün / 66 ve haftalık seri (≥2 kuvvet; bakım haftası zinciri kırmaz). Günlük seri/rozet yok.
- **0.7.0 — bildirimler:** Web Push (iOS 16.4+ ana ekran uygulaması, eşitleme gerekli). `push_subscriptions` tablosu (RLS), `pg_cron` 15 dk → Edge Function `send-reminders`; akıllı koşullar (tartı/antrenman/adım/haftalık kontrol yapıldıysa göndermez), günde bir kez, Europe/Istanbul. Kurulum: [supabase/BILDIRIM-KURULUM.md](supabase/BILDIRIM-KURULUM.md).

## 5. AI özellikleri (anahtar açıksa)
- **Sohbet:** profil + plan + son haftaların özeti bağlam olarak gönderilir.
- **Haftalık değerlendirme:** verilerden kısa yorum ve öneri.
- **Program oluşturma:** sonraki 4 haftalık blok önerisi; kullanıcı onaylamadan programa uygulanmaz.
- **Güvenlik kuralları (sistem talimatı):** teşhis koymaz; ağrı/sağlık belirtisinde uzmana yönlendirir; aşırı kalori açığı (<~1.700 kcal) veya aşırı hacim önermez.
- **Gizlilik:** AI'ya yalnızca özet veri gider (fotoğraf gitmez); ne gönderildiği kullanıcıya gösterilir.
- **Sağlayıcı katmanı:** tek ortak arayüz, sağlayıcıya göre adaptör; model seçimi ayarlardan.

## 6. Teknik kararlar
### Teknoloji
- **PWA (web uygulaması):** iPhone'da Safari → "Ana Ekrana Ekle" ile uygulama gibi çalışır, çevrimdışı da açılır; aynı kod PC'de de çalışır. App Store, Mac veya Apple geliştirici hesabı gerekmez.
- **Yayın:** iPhone'un erişebilmesi için HTTPS adresinde barındırılır (ör. GitHub Pages / Cloudflare Pages, ücretsiz).

### Aşamalar
| Aşama | Kapsam | Veri |
|---|---|---|
| 1 — Sadece telefon | Program + set set kayıt, ölçümler, grafikler, kural tabanlı uyarılar, dinlenme sayacı | Cihazda (hesapsız). **Yedek al / geri yükle** (tek dosya → iCloud Drive), haftalık yedek hatırlatması |
| 2 — PC + eşitleme | PC'den erişim, otomatik eşitleme, bulut yedek | **Supabase** (ücretsiz plan, Frankfurt/AB bölgesi), e-posta ile giriş |
| 3 — AI | Sohbet, haftalık değerlendirme, program önerisi; aç/kapa anahtarı, çoklu sağlayıcı | API anahtarları Supabase sunucu tarafında (Edge Function proxy); uygulama anahtarı görmez |

- 1. aşamanın veri katmanı, 2. aşamada Supabase'e geçişi kolaylaştıracak şekilde yazılır.
- Fotoğraflar her aşamada **yalnızca cihazda** kalır, buluta ve AI'ya gönderilmez.

### Supabase güvenlik kuralları (2. aşama)
- Her tabloda **RLS (Row Level Security) açık**; her kayıt kullanıcı kimliğine bağlı, yalnızca sahibi okur/yazar.
- **Service key asla istemci koduna konmaz**; yalnızca sunucu tarafında (Edge Function secret).
- Genel (anon/publishable) anahtarın istemcide olması normaldir; güvenlik RLS ile sağlanır.
- **Test:** ikinci bir deneme hesabıyla birinci hesabın verilerine erişilemediği doğrulanır.
- Supabase hesabında **iki adımlı doğrulama** açık.
- Ücretsiz plan sınırları (kurulumda resmi sayfadan doğrulanacak): otomatik yedek yok → uygulamanın kendi yedek özelliği korunur; ~1 hafta kullanılmayan proje duraklatılır (veri silinmez).

### AI anahtarı güvenliği (3. aşama)
- Varsayılan: anahtarlar sunucu tarafında (yukarıdaki proxy).
- Her AI sağlayıcısının panelinde **aylık harcama limiti** (ör. 5 $) konur.
- Alternatif (yalnızca 1. aşamada AI istenirse): anahtar sadece cihazda saklanır — tek kullanıcı için kabul edilebilir ama daha riskli.

### Alternatifler (gerekirse)
- Bulut istenmezse: sadece telefon + iCloud Drive yedek dosyası (PC erişimi yok).
- Supabase yerine Firebase (aynı mantık: güvenlik kuralları doğru yazılmalı).

## 7. Kaynaklar
- [Supabase Security](https://www.supabase.com/security) · [SOC 2](https://supabase.com/docs/guides/security/soc-2-compliance) · [ISO 27001](https://supabase.com/blog/supabase-is-now-iso-27001-certified)
- [Paylaşılan sorumluluk modeli](https://supabase.com/docs/guides/deployment/shared-responsibility-model) · [2025 güvenlik retrospektifi](https://supabase.com/blog/supabase-security-2025-retro)
- [Yanlış yapılandırılmış 16.000+ Supabase veritabanı (BleepingComputer)](https://bleepingcomputer.com/news/security/misconfigured-supabase-apps-expose-data-in-over-16-000-databases) · [UpGuard araştırması](https://www.upguard.com/blog/everything-everywhere-systemic-data-exposure-in-supabase-apps)
