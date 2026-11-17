# Canlı Kontrol Raporu — "Bizim Gökyüzümüz"

- **Kontrol Edilen Adres:** `https://bizim-gokyuzumuz.vercel.app`
- **Tarih:** 16 Kasım 2026

## Özet
- **✅ Tamam / Geçti:** 11
- **⚠️ Kısmen / Dikkat:** 2
- **❌ Hata / Acil Aksiyon Gerekli:** 3
- **🔍 Elle Kontrol Gerekli:** 8
- **Toplam:** 24 madde

> **Bu denetimde benim düzelttiğim 2 sorun:**
> 1. `send-push/index.ts` içindeki `buildCorsHeaders()` fonksiyonu tek `APP_ORIGIN` varken yabancı origin'lerden gelen `OPTIONS` isteklerine yanlışlıkla `200` dönüyordu → sıkı origin kontrolü eklenip düzeltildi ve GitHub'a (`49b95d8`) gönderildi *(Supabase Web Editöründen yeniden deploy etmen gerekir)*.
> 2. `README.md` içindeki eski tek dosya SQL / manuel UID / e-posta giriş anlatımları → yeni `01-schema.sql`, `02-profiles.sql` ve `src/config.ts` düzenine göre güncellenip GitHub'a (`49b95d8`) gönderildi.

---

## A. DEPLOY

1. **Canlı site açılışı ve güncel build (`bizim-gokyuzumuz.vercel.app`):** ✅ Canlı adres `HTTP 200` ile açılıyor ve son `src/config.ts` + şifreli giriş yapısı yayında.
2. **İstemci ortam değişkenleri (`VITE_*`) canlı build'e girmiş mi?** ❌ Konsolda `undefined` hatası yok, `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` **var**; ancak **`VITE_VAPID_PUBLIC_KEY` içine yanlışlıkla Supabase `sb_publishable_...` anahtarı girilmiş**, buraya VAPID Public Key yazılıp Vercel'den **Redeploy** yapılmalı.
3. **Vercel'de sunucu gizli anahtarları (`service_role`, VAPID Private) yok mu?** ✅ Canlı sitedeki tüm JS dosyaları tarandı; `service_role` **yok**, VAPID Private Key **yok**.
4. **Güvenlik başlıkları yanıtla geliyor mu?** ✅ Canlı yanıtta `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` ve `Permissions-Policy` mevcut.
5. **Manifest, Service Worker, ikonlar ve PWA kurulabilirliği:** ✅ `/manifest.webmanifest` (`200`), 4 manifest ikonu + `favicon-64.png` + `icon-180.png` (`200 image/png`) ve `/sw.js` (`200`, `no-cache`, tarayıcıda `activated`) aktif; yerel Lighthouse CLI kurulu olmadığı için tam Lighthouse raporu yerine tarayıcı PWA ölçütleri doğrulandı.

---

## B. SUPABASE

6. **`profiles` tablosu (2 satır) ve e-postalar:** 🔍 Anonim API ile tablo okuma RLS tarafından engellendiği için satırları dışarıdan göremedim; Supabase **SQL Editor**'de `select p.who, u.email from public.profiles p join auth.users u on u.id = p.id order by p.who;` çalıştırıp `hamham` ve `beto` çıktısını kontrol et.
7. **Herkese açık kayıt (`signup`) kapalı mı?** ✅ Canlı `/auth/v1/signup` isteği `HTTP 422 (signup_disabled)` ile reddedildi.
8. **Tüm tablolarda RLS açık mı (anonim okuma/yazma yok)?** ✅ Gerçek anonim `GET` istekleri `stars`, `star_secrets`, `profiles`, `settings` ve `media` Storage'da `[]` döndü; anonim `POST` yazma istekleri `HTTP 401 / 403 AccessDenied` (`42501 RLS`) ile reddedildi.
9. **`star_secrets` zamanlı kilit koruması (`unlock_at > now()`):** 🔍 Şema RLS politikası ([`supabase/01-schema.sql`](supabase/01-schema.sql)) mevcut; ancak iki hesabın şifreleri bende olmadığı için canlı test satırıyla doğrulama yapılamadı — iki telefondan 2 dk kilitli yıldız gönderip açılmadığını gör.
10. **Gönderen kendi yıldızını açamıyor mu (sunucu tarafı)?** 🔍 Sunucu RLS politikası (`from_user <> auth.uid()`) tanımlı; ancak kullanıcı oturum şifresi olmadan canlı `UPDATE` reddi çalıştırılamadı — kendi gönderdiğin kilitli/açık yıldızın açılmadığını uygulamadan teyit et.
11. **Storage bucket private mi ve kilitli medyaya erişim engelli mi?** 🔍 `media` bucket anonim listeleme ve yüklemeye (`403 AccessDenied`) tamamen kapalı; ancak kilitli medya dosyasının alıcı oturumunda reddi gerçek hesap girişi gerektirdiğinden zamanlı fotoğraf yıldızıyla test et.
12. **Realtime yalnızca `stars` tablosunda mı?** 🔍 `01-schema.sql` yalnızca `public.stars` tablosunu ekler; Supabase **SQL Editor**'de `select tablename from pg_publication_tables where pubname = 'supabase_realtime';` çalıştırıp sadece `stars` döndüğünü kontrol et.

---

## C. BİLDİRİM

13. **`send-push` Active mi ve 4 secret tanımlı mı?** ⚠️ `send-push` canlıda **Active** (404 değil, cevap veriyor); gizli değerler dışarıdan okunamadığından ve Vercel'de yanlış VAPID anahtarı girildiğinden **Edge Functions → Secrets** altındaki `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` ve `APP_ORIGIN` değerlerini doğru çiftle kontrol et.
14. **Geçersiz token (`401`) ve yabancı origin `OPTIONS` (`403`) kontrolü:** ❌ Geçersiz token ile `HTTP 401` döndü; ancak **canlıda başka origin'den `OPTIONS` isteği `HTTP 200` döndü** — hatayı [`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts) içinde düzelttim ve GitHub'a attım, güncellenmiş kodu Supabase editöründen yeniden **Deploy** etmen gerek.
15. **`mode=check_unlocks` `service_role` dışındaki token ile `403` dönüyor mu?** ✅ `anon` anahtarıyla gönderilen `{"mode":"check_unlocks"}` isteği **`HTTP 403 {"error":"Forbidden"}`** ile reddedildi.
16. **`cron.job` ve `cron.job_run_details` durumu:** 🔍 Veritabanı `cron` şemasına dışarıdan erişim yok; Supabase **SQL Editor**'de `select jobname, active from cron.job; select status, start_time from cron.job_run_details order by start_time desc limit 5;` çalıştırıp işin (`unlock-stars-push`) `active = true` ve `succeeded` olduğunu kontrol et *(projedeki iş adı `unlock-stars-push` olarak kuruludur)*.
17. **1–2 dk sonrası test yıldızı ile `unlock_push_sent` cron testi:** 🔍 Hesap/yönetici erişimi olmadan canlı cron testi çalıştırılamadı; Vercel VAPID düzeltmesi sonrası 2 dk'lık yıldız gönderip bildirimin zamanında düştüğünü gör.

---

## D. UYGULAMA

18. **Giriş akışı ve gizli kelime ekranı:** ⚠️ Canlı sitede kart seçilince doğrudan şifre kutusu açılıyor ve yanlış şifrede `"Şifre doğru değil, tekrar dene"` çıkıyor; doğru şifre ve ortak gizli kelime ekranı şifre olmadığı için telefondan ilk girişle teyit edilmeli.
19. **Yıldız gönderme ve veritabanında E2E şifreleme:** 🔍 [`src/lib/stars.ts`](src/lib/stars.ts) ve [`src/lib/crypto.ts`](src/lib/crypto.ts) metin/fotoğraf/ses verilerini tarayıcıda AES-GCM ile şifreleyip gönderir; ilk yıldızı attıktan sonra Supabase **Table Editor → `star_secrets`** içinde `payload` sütununun okunamaz şifreli metin olduğunu kontrol et.
20. **Konsol hataları, 404 ve CSP ihlali:** ✅ Canlı açılışta tarayıcı konsolu tamamen temiz (`0` hata, `0` 404, `0` CSP ihlali).
21. **Performans (sekme gizliyken durma, `backdrop-filter`):** ✅ Canlı CSS'te `backdrop-filter` sayısı **`0`**; [`src/sky/skyRenderer.ts`](src/sky/skyRenderer.ts) `visibilitychange` ile sekme gizliyken çizim döngüsünü tamamen durduruyor.
22. **Yerel yazı tipleri:** ✅ 8 `.woff2` yazı tipi dosyasının tamamı `bizim-gokyuzumuz.vercel.app` üzerinden yükleniyor (harici font sunucusu isteği yok).
23. **GitHub repo gizliliği, `.env` ve Git geçmişi sızıntı kontrolü:** ❌ `.env*` dosyaları Git'te takip edilmiyor ve tüm Git commit geçmişinde sızmış gizli anahtar **yok**; **ancak GitHub deposu (`Hatem-son/bizim-gokyuzumuz`) şu anda `Public` (herkese açık, `HTTP 200`) görünüyor**, hemen **Private** yapılmalı.
24. **`README.md` güncelliği:** ✅ Eski SQL / giriş açıklamaları güncel `01-schema.sql`, `02-profiles.sql` ve `src/config.ts` yapısına göre güncellendi.

---

## Kullanıcının Yapması Gerekenler

### Acil Düzeltilecek 3 İşlem (Bunları yapmadan telefonda deneme)
- [ ] **1. GitHub deposunu gizle (1 dk):** GitHub'da `Hatem-son/bizim-gokyuzumuz` → **Settings → Danger Zone → Change repository visibility → Make private**.
- [ ] **2. Vercel'deki `VITE_VAPID_PUBLIC_KEY` değerini düzelt (2 dk):** Vercel → **Settings → Environment Variables** kısmında `VITE_VAPID_PUBLIC_KEY` değerini doğru VAPID Public Key yap *(şu an yanlışlıkla Supabase publishable key yazılmış)*, Supabase → **Edge Functions → Secrets**'ta da `VAPID_PUBLIC_KEY` (aynısı) ve `VAPID_PRIVATE_KEY` (sana verdiğim Private Key) olduğunu doğrula, ardından Vercel'de **Deployments → Redeploy** yap.
- [ ] **3. Düzeltilmiş `send-push` kodunu Supabase'e tekrar yükle (1 dk):** Bilgisayarındaki güncel [`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts) kodunun tamamını Supabase → **Edge Functions → `send-push` → Code** ekranına yapıştırıp **Deploy**'a bas.

### SQL & Canlı Cihaz Doğrulamaları (Yukarıdakilerden Sonra)
- [ ] **4. Supabase SQL doğrulaması (1 dk):** SQL Editor'de şu 3 sorguyu çalıştırıp `hamham + beto`, sadece `stars` ve `succeeded` çıktılarını gör:
  ```sql
  select p.who, u.email from public.profiles p join auth.users u on u.id = p.id order by p.who;
  select tablename from pg_publication_tables where pubname = 'supabase_realtime';
  select jobname, active from cron.job; select status, start_time from cron.job_run_details order by start_time desc limit 5;
  ```
- [ ] **5. İki iPhone'da kurulum ve test (4 dk):** İki telefonda da **Safari** ile `https://bizim-gokyuzumuz.vercel.app` aç → **Paylaş → Ana Ekrana Ekle** → ana ekrandaki simgeden giriş yap → bildirim iznine **İzin Ver** → Ayarlardan **Face ID** kilidini test et → not, fotoğraf, ses, tek seferlik ve **2 dk sonrası zamanlı yıldız** gönderip bildirimleri ve `star_secrets` içeriğinin şifreli olduğunu doğrula.
