# Supabase kurulumu (bir kez, ~10 dakika)

Eşitleme için kendi ücretsiz Supabase projen gerekiyor. Verilerin bu projede durur; başka kimse göremez.

## 1. Hesap ve proje
1. https://supabase.com adresinde **Start your project** → GitHub ile giriş yap (ya da e-posta).
2. **New project**:
   - Name: `spor-rutini`
   - Database password: güçlü bir şifre üret ve bir yere kaydet (uygulamada kullanılmaz).
   - Region: **Central EU (Frankfurt)**
   - Plan: **Free**
3. Proje hazırlanınca (1–2 dk) devam et.
4. Hesap ayarlarında **iki adımlı doğrulamayı (MFA)** aç: sağ üst profil → Account preferences → Multi-factor authentication.

## 2. Tabloyu ve güvenlik kurallarını oluştur
1. Sol menü → **SQL Editor** → **New query**.
2. Bu klasördeki [schema.sql](schema.sql) dosyasının tamamını yapıştır → **Run**.
3. "Success" görmelisin. (Tekrar çalıştırmak zararsız.)

## 3. Giriş ayarları
1. Sol menü → **Authentication** → **URL Configuration** → **Site URL**: `https://yekmonoone.github.io/spor-rutini/` → Save.
   (E-posta onay bağlantısı tıklanınca buraya döner.)

## 4. Bağlantı bilgilerini al
Sol menü → **Project Settings** → **API Keys** (ya da **Data API**):
- **Project URL** (`https://xxxx.supabase.co`)
- **anon / publishable** anahtar (`eyJ...` ya da `sb_publishable_...`)

⚠️ **service_role / secret** anahtarını asla uygulamaya girme ya da kimseyle paylaşma. Uygulama bunu fark ederse reddeder.

## 5. Uygulamada bağlan
1. Telefonda uygulamayı aç → **Ayarlar → Eşitleme**.
2. Project URL ve anon anahtarını yapıştır, e-postanı ve yeni bir şifre (en az 8 karakter) gir → **Hesap oluştur**.
3. E-postana gelen onay bağlantısına tıkla → uygulamaya dön → **Giriş yap**. Telefondaki kayıtlar sunucuya gönderilir.
4. Bilgisayarda https://yekmonoone.github.io/spor-rutini/ aç → hoş geldin ekranında **"Eşitlemeyle giriş yap"** → aynı bilgilerle **Giriş yap**. Kayıtların gelir.

## 6. Yabancı hesap açılmasını kapat (önerilir)
Kendi hesabını oluşturduktan sonra: **Authentication → Sign In / Providers** → **Allow new users to sign up** → kapat → Save.
Böylece projende senden başka kimse hesap açamaz.

## Nasıl çalışır
- Her değişiklikten birkaç saniye sonra, uygulama açılınca ve internet gelince otomatik eşitlenir; Ayarlar'da **Şimdi eşitle** de var.
- İnternet yokken her şey cihazda çalışmaya devam eder; bağlantı gelince eşitlenir.
- Aynı kayıt iki cihazda değiştiyse **en son değiştirilen** kazanır.
- Yarım kalmış antrenman (taslak) cihaza özeldir, eşitlenmez.
- Ücretsiz planda proje 1 hafta hiç kullanılmazsa duraklatılır; veriler silinmez, Supabase panelinden **Restore** ile açılır. Ücretsiz planda otomatik yedek yok — uygulamadaki haftalık yedek dosyasını almaya devam et.
