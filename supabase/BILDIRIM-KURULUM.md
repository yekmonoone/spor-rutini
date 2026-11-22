# Bildirim kurulumu (0.7.0)

Hatırlatmaları telefona Supabase projen gönderir: 15 dakikada bir çalışan bir zamanlayıcı, zamanı gelen hatırlatmaya bakar ve **yalnızca gerekiyorsa** gönderir (ör. kilo girdiysen sabah bildirimi gelmez).

Gereken: eşitlemesi kurulu Supabase projesi ([KURULUM.md](KURULUM.md)), iPhone'da iOS 16.4+ ve uygulamanın **ana ekrana eklenmiş** olması.

## 0. Anahtarlar (bir kez — bilgisayarda)

```
node tools/push-setup.mjs https://PROJE.supabase.co
```

Üç dosya yazar:

| Dosya | Ne | Depoya girer mi |
|---|---|---|
| `supabase/.secrets.local` | VAPID gizli anahtarı + zamanlayıcı şifresi | **Hayır** (gitignore) |
| `supabase/push-setup.local.sql` | 1. adımda çalıştırılacak SQL (şifre içerir) | **Hayır** (gitignore) |
| `app/js/config.js` | Yalnızca açık anahtar | Evet (gizli değil) |

Anahtarlar bir kez üretilir; komut tekrar çalışırsa mevcutları korur. (Yeniden üretmek bütün telefonlarda bildirimi yeniden açmayı gerektirir: `--yeni`.)

## 1. Tablo ve zamanlayıcı (Supabase panelinde)

1. Supabase → projen → **SQL Editor** → **New query**.
2. `supabase/push-setup.local.sql` dosyasının **tamamını** yapıştır → **Run**. "Success" görmelisin.

Bu adım `push_subscriptions` tablosunu (herkes yalnızca kendi satırını görür), `pg_cron` + `pg_net` eklentilerini ve 15 dakikalık zamanlayıcıyı kurar. Zamanlayıcı şifresi Vault'ta saklanır.

## 2. Sunucu fonksiyonu (bilgisayarda)

Önce tarayıcıdan giriş (bir kez):

```
npx supabase login
```

Sonra dağıtım ve gizli değerler (`PROJE` = adresindeki `xxxx` kısmı):

```
npx supabase functions deploy send-reminders --project-ref PROJE --no-verify-jwt --use-api
npx supabase secrets set --project-ref PROJE --env-file supabase/.secrets.local
```

`--no-verify-jwt`: fonksiyonu zamanlayıcı kendi şifresiyle çağırır; fonksiyon şifreyi ya da (deneme bildirimi için) kullanıcı oturumunu kendisi doğrular.

## 3. iPhone

1. Uygulamayı **ana ekrandaki simgeden** aç (Safari'den değil).
2. Ayarlar → **🔔 Bildirimler** → saatleri seç → **Bildirimleri aç** → izin ver.
3. **Deneme bildirimi** → birkaç saniye içinde gelmeli.

## Hatırlatmalar

| Tür | Varsayılan | Ne zaman gelir |
|---|---|---|
| Sabah tartı | 08:30 | Bugün kilo girilmediyse |
| Antrenman | 19:45 | Bugün kuvvet günüyse (güne özel değişiklikler dahil), antrenman kaydı ya da "bugün olmadı" yoksa |
| Gün sonu | 22:30 | Adım girilmediyse |
| Haftalık kontrol | Pazar 20:00 | O haftanın kontrolü yapılmadıysa |

Her tür günde en fazla bir kez, seçilen saatten sonraki 90 dakika içinde gönderilir. Veriler eşitlemeden okunur: telefonda girdiğin kayıt eşitlendiyse bildirim gelmez.

## Sorun giderme

- **Deneme bildirimi gelmiyor:** Supabase → Edge Functions → send-reminders → **Logs**. "Sunucu ayarları eksik" → 2. adımdaki `secrets set` komutu. iPhone Ayarlar → Bildirimler → Spor Rutini açık mı?
- **Zamanlayıcı çalışıyor mu:** SQL Editor'da `select * from cron.job_run_details order by start_time desc limit 5;`
- **Kapatmak:** uygulamada Ayarlar → Bildirimleri kapat. Zamanlayıcıyı tamamen durdurmak için: `select cron.unschedule('spor-rutini-hatirlatma');`
