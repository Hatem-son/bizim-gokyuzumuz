# Bizim Gökyüzümüz

Ham ham ve Beto için hazırlanmış, uçtan uca şifreli özel gökyüzü PWA uygulaması.  
Bu rehber, **kod bilmeyen birinin bile** sıfırdan kurup iPhone'da kullanabilmesi için adım adım yazılmıştır.

---

## İçindekiler
1. [Gereken Hesaplar](#1-gereken-hesaplar)
2. [Supabase Projesi Oluşturma](#2-supabase-projesi-oluşturma)
3. [Yeni Üye Kaydını Kapatma ve İki Kullanıcıyı Ekleme](#3-yeni-üye-kaydını-kapatma-ve-iki-kullanıcıyı-ekleme)
4. [Veritabanı ve Zamanlı Yıldız SQL'ini Çalıştırma](#4-veritabanı-ve-zamanlı-yıldız-sqlini-çalıştırma)
5. [Bildirim (VAPID) Anahtarlarını Üretme](#5-bildirim-vapid-anahtarlarını-üretme)
6. [Ortam Değişkenleri (Hangisi Nereye?)](#6-ortam-değişkenleri-hangisi-nereye)
7. [Edge Function (`send-push`) ve `pg_cron` Kurulumu](#7-edge-function-send-push-ve-pg_cron-kurulumu)
8. [GitHub'a Gizli (Private) Depo Olarak Yükleme](#8-githuba-gizli-private-depo-olarak-yükleme)
9. [Vercel'e Yükleme ve Alan Adı Bağlama](#9-vercele-yükleme-ve-alan-adı-bağlama)
10. [iPhone'da Ana Ekrana Ekleme, Bildirim ve Kilit](#10-iphonedа-ana-ekrana-ekleme-bildirim-ve-kilit)
11. [Güvenlik Tasarımı Notu](#11-güvenlik-tasarımı-notu)
12. [Gerçek iPhone'da Performans Ölçümü](#12-gerçek-iphonedа-performans-ölçümü-safari-web-inspector)
13. [Sorun Giderme](#13-sorun-giderme)

---

## 1. Gereken Hesaplar

Hepsinin ücretsiz katmanı yeterlidir:
- **GitHub** (kodu gizli/private olarak saklamak için)
- **Supabase** (veritabanı, dosya depolama, canlı eşzamanlama ve push sunucusu için)
- **Vercel** (uygulamayı HTTPS adresinde yayınlamak için)
- Bilgisayarda **Node.js 20+** ve **Git** kurulu olmalı.

---

## 2. Supabase Projesi Oluşturma

1. [supabase.com](https://supabase.com) hesabına gir → **New project** tıkla.
2. Proje adına örneğin `bizim-gokyuzumuz` yaz, güçlü bir veritabanı şifresi seç, bölge olarak yakın bir bölge (örn. `Frankfurt`) seçip **Create new project** de.
3. Proje açılınca sol alttan **Project Settings (dişli ikon) → API** sayfasına gir ve şu 3 bilgiyi bir kenara kopyala:
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **`anon` / `public` key** *(istemciye konur)*
   - **`service_role` key** *(SADECE sunucu tarafı `pg_cron` içindir — asla `.env.local`, Vercel veya koda yazılmaz!)*

---

## 3. Yeni Üye Kaydını Kapatma ve İki Kullanıcıyı Ekleme

Dışarıdan hiç kimse hesap açamasın diye kaydı kapatıp yalnızca ikinizin hesabını elle oluşturmalısın:

1. Supabase sol menüden **Authentication → Sign In / Providers** (veya **Configuration → Auth Settings**) sayfasına gir.
2. **Allow new users to sign up** seçeneğini **KAPALI (OFF)** konumuna getir ve **Save**'e bas.
3. Sol menüden **Authentication → Users** sayfasına geç.
4. Sağ üstten **Add user → Create new user** tıkla:
   - **1. kullanıcı (Ham ham):** e-posta ve güçlü şifre yaz → *Auto Confirm User* işaretli olsun → **Create user**. Oluşan satırdaki `User UID`'yi kopyala.
   - **2. kullanıcı (Beto):** e-posta ve güçlü şifre yaz → *Auto Confirm User* işaretli olsun → **Create user**. Oluşan satırdaki `User UID`'yi kopyala.

*(4. adımda SQL çalıştırdıktan sonra bu iki UID'yi `profiles` tablosuna bağlayacağız.)*

---

## 4. Veritabanı ve Zamanlı Yıldız SQL'ini Çalıştırma

1. Supabase sol menüden **SQL Editor → New query** aç.
2. Bu projedeki [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamını kopyalayıp editöre yapıştır ve **Run** butonuna bas.
   - Bu işlem `profiles`, `stars`, `star_secrets` (zamanlı kilit tablosu), `settings`, `server_now()`, tüm **RLS kurallarını**, `media` özel Storage bucket'ını ve Realtime yayınını kurar.
3. Şimdi iki kullanıcıyı `profiles` tablosuna ekle (kendi kopyaladığın UID'lerle değiştirip SQL Editor'de çalıştır):
   ```sql
   insert into public.profiles (id, who) values
     ('HAM_HAM_USER_UID_BURAYA', 'hamham'),
     ('BETO_USER_UID_BURAYA', 'beto')
   on conflict (id) do update set who = excluded.who;
   ```

---

## 5. Bildirim (VAPID) Anahtarlarını Üretme

Bilgisayarında proje klasöründe terminali aç ve şu komutu çalıştır:

```powershell
npx web-push generate-vapid-keys
```

Komut sana **iki** anahtar üretecektir:
- `Public Key` → hem bilgisayar/Vercel tarafına hem Supabase'e gider.
- `Private Key` → **çok gizlidir**, yalnızca Supabase Edge Function Secrets kısmına konur.

---

## 6. Ortam Değişkenleri (Hangisi Nereye?)

| Değişken Adı | Nereye Konur? | Açıklama |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` ve **Vercel** | Supabase **Project URL** |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` ve **Vercel** | Supabase **`anon` / `public`** anahtarı |
| `VITE_VAPID_PUBLIC_KEY` | `.env.local` ve **Vercel** | Ürettiğin VAPID **Public Key** |
| `VAPID_PUBLIC_KEY` | **Supabase Edge Secrets** | Ürettiğin VAPID **Public Key** |
| `VAPID_PRIVATE_KEY` | **Supabase Edge Secrets** | Ürettiğin VAPID **Private Key** |
| `VAPID_SUBJECT` | **Supabase Edge Secrets** | `mailto:senin@mailin.com` |
| `APP_ORIGIN` | **Supabase Edge Secrets** | Canlı Vercel adresin (`https://....vercel.app`) |

Bilgisayarında test etmek için proje klasöründe **`.env.local`** dosyası oluştur (örnek için [`.env.example`](.env.example)'a bak):
```env
VITE_SUPABASE_URL=https://PROJE-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_VAPID_PUBLIC_KEY=B...
```

> **Dikkat:** `service_role` anahtarını ve `VAPID_PRIVATE_KEY`'i **asla** `.env.local`, `.env.example`, GitHub veya Vercel istemci ayarlarına yazma.

---

## 7. Edge Function (`send-push`) ve `pg_cron` Kurulumu

### A. `send-push` Fonksiyonunu Yükleme
Terminali proje klasöründe açıp Supabase CLI ile giriş yap ve fonksiyonu yükle:

```powershell
npx supabase login
npx supabase link --project-ref <PROJE_ID>
npx supabase functions deploy send-push --no-verify-jwt
```
*(Not: `send-push` içinde JWT veya `service_role` doğrulaması kod içinde bizzat yapılır; preflight CORS isteklerinin sorunsuz geçmesi için `--no-verify-jwt` önerilir.)*

Ardından **Supabase Dashboard → Edge Functions → Secrets** sayfasına girip şu 4 sırrı ekle:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (`mailto:...`)
- `APP_ORIGIN` *(Vercel siten açıldıktan sonra tam `https://...` adresini buraya yaz; yoksa tarayıcıdan gönderilen push istekleri CORS tarafından reddedilir)*

### B. Zamanlı Yıldız Otomatik Bildirimleri (`pg_cron`)
1. **Supabase Dashboard → Database → Extensions** menüsünden **`pg_cron`** ve **`pg_net`** uzantılarını aç.
2. **SQL Editor → New query** içinde aşağıdaki komutu kendi `<PROJE_REF>` ve `<SUPABASE_SERVICE_ROLE_KEY>` değerlerinle çalıştır:
   ```sql
   select cron.schedule(
     'unlock-stars-push',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://<PROJE_REF>.supabase.co/functions/v1/send-push',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
       ),
       body := '{"mode":"check_unlocks"}'::jsonb
     );
     $$
   );
   ```
Bu iş her dakika çalışıp açılma zamanı gelmiş (`unlock_at <= now()`) ve henüz bildirimi gitmemiş yıldızlar için her iki tarafa da push gönderir.

---

## 8. GitHub'a Gizli (Private) Depo Olarak Yükleme

1. [github.com/new](https://github.com/new) üzerinden yeni bir depo aç ve **Private** seç (README/.gitignore ekleme).
2. Proje klasöründe:
   ```powershell
   git add .
   git status   # Listede .env veya .env.local OLMADIĞINDAN emin ol!
   git commit -m "Bizim Gokyuzumuz ilk surum"
   git remote add origin https://github.com/<KULLANICI_ADIN>/<DEPO_ADIN>.git
   git push -u origin main
   ```

---

## 9. Vercel'e Yükleme ve Alan Adı Bağlama

1. [vercel.com](https://vercel.com) hesabına GitHub ile giriş yap → **Add New → Project** → gizli GitHub deponu seç → **Import**.
2. **Framework Preset** otomatik `Vite` görünür.
3. **Environment Variables** bölümünü aç ve yalnızca şu 3 değişkeni ekle:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
4. **Deploy** butonuna bas. Yayın açılınca sana verilen `https://....vercel.app` adresini kopyala.
5. **Özel Alan Adı (İsteğe bağlı):** Vercel Proje → **Settings → Domains** kısmından kendi alan adını bağlayıp DNS kayıtlarını yönlendirebilirsin.
6. **Önemli Son Adım:** Aldığın canlı site adresini (örn. `https://bizim-gokyuzumuz.vercel.app`) **Supabase Dashboard → Edge Functions → Secrets → `APP_ORIGIN`** değerine yaz. (Hem özel alan adın hem `.vercel.app` adresi kullanılacaksa ikisini virgülle ayırarak yazabilirsin.)

---

## 10. iPhone'da Ana Ekrana Ekleme, Bildirim ve Kilit

> iPhone'da Web Push bildirimleri ve tam ekran modunun çalışması için uygulama **mutlaka Safari üzerinden Ana Ekrana eklenmelidir** (iOS 16.4+).

1. iPhone'da **Safari**'yi açıp Vercel adresine gir.
2. Alt ortadaki **Paylaş** (kare + yukarı ok) simgesine dokun → **Ana Ekrana Ekle**'yi seç → **Ekle**.
3. Tarayıcı sekmesini kapatıp **Ana Ekrandaki iki yıldızlı simgeden** uygulamayı aç.
4. **"Ben kimim?"** seçimini yap, e-posta + şifrenle giriş yap ve ikinizin belirlediği **ortak gizli kelimeyi** yaz.
5. Gökyüzü açıldıktan ~12 saniye sonra çıkan kartta **"Evet, haber ver"** diyerek (veya sağ üst `...` → **Ayarlar → Bildirimleri aç** üzerinden) iOS bildirim iznini onayla.
6. İstersen Ayarlar'dan 4 haneli **Uygulama kilidi** ve **Face ID** açabilirsin.

---

## 11. Güvenlik Tasarımı Notu

- **Kendi yıldızını açamama kuralı:** Kendi yıldızını açamama kuralı arayüz ve `UPDATE` politikasıyla uygulanır, içerik gizliliği ortak gizli kelimeye dayanır.
- **Şifreleme anahtarı:** Ortak gizli kelimeden `PBKDF2` (`310.000` tur, `SHA-256`) ile türetilen `AES-GCM 256` anahtarı `extractable: false` bir `CryptoKey` olarak cihazın **IndexedDB** deposunda saklanır; ham baytları `localStorage` veya sayfadaki betikler tarafından okunamaz.
- **Zamanlı yıldız kilidi:** Kilitli yıldızların şifreli içeriği `star_secrets` tablosunda, medyası `media` bucket'ında tutulur; sunucu saati `unlock_at <= now()` olmadan alıcıya API veya Realtime üzerinden hiçbir şifreli veri/medya iletilmez.
- **Otomatik güvenlik testi:** `.env.local` doluyken terminalde `npm run security-check` çalıştırarak anonim okuma engeli, kapalı kayıt ve imzalı URL süre dolumunu otomatik test edebilirsin.

---

## 12. Gerçek iPhone'da Performans Ölçümü (Safari Web Inspector)

1. iPhone'da **Ayarlar → Safari → İleri Düzey → Web Denetçisi (Web Inspector)** anahtarını aç.
2. iPhone'u USB ile Mac'e bağla ve "Bu Bilgisayara Güven" de.
3. iPhone'da Ana Ekrandan **Bizim Gökyüzümüz** PWA'sını aç.
4. Mac Safari'de üst menüden **Geliştir (Develop) → [iPhone adın] → Bizim Gökyüzümüz** sekmesini seç.
5. **Zaman Çizelgeleri (Timelines)** sekmesinde kırmızı kayıt düğmesine bas; bu sırada iPhone'da gökyüzünü hızla sağa sola kaydır, uçak geçişi ve yıldız gönderimi yap.
6. **Frames** satırında kare süresinin **16,6 ms altında (60 fps)** kaldığını, boşta beklerken ~25 fps'e ve yazı penceresinde ~10 fps'e indiğini, kilit/arka planda çizimin tamamen durduğunu doğrula.
7. **Gizli kutu (kablosuz hızlı kontrol):** Uygulamada **Ayarlar** menüsünün en altındaki `Bizim Gökyüzümüz · v1.0.0` yazısına **5 kez dokunarak** son 120 karenin ortalama/en kötü çizim süresini gösteren kutuyu açıp kapatabilirsin (varsayılan kapalıdır).

---

## 13. Sorun Giderme

- **"Bu kelime eşleşmiyor" hatası:** İki telefonda yazılan gizli kelime birebir aynı olmalıdır (büyük/küçük harf fark etmez ama boşluk/ek karakter olmamalıdır). Eğer ilk kurulumda yanlışlıkla farklı bir kelimeyle kilidi kurduysan Supabase **Table Editor → `settings`** tablosundaki `id=1` satırını silip iki cihazdan tekrar aynı kelimeyle giriş yap.
- **iPhone'da "Bildirimleri aç" çalışmıyor:** Uygulama Safari sekmesinden değil, mutlaka **Ana Ekrana Ekle** yapılmış simgeden açılmalıdır (ve iOS 16.4+ olmalıdır). Ayrıca Vercel ve Supabase Secrets içinde VAPID anahtarlarının aynı çift olduğundan ve `APP_ORIGIN`'in Vercel adresinle birebir eşleştiğinden emin ol.
- **Zamanlı yıldızın açılma bildirimi gelmedi:** Supabase Dashboard → **Database → Extensions** altında `pg_cron` ve `pg_net`'in açık olduğunu, `cron.schedule` komutundaki `PROJE_REF` ve `SERVICE_ROLE_KEY`'in doğru girildiğini ve `send-push` fonksiyonunun `--no-verify-jwt` ile deploy edildiğini kontrol et.
- **Bilgisayarda `npm run dev` açınca Supabase bağlanmıyor:** Anahtarları `.env.example`'a değil **`.env.local`** dosyasına yazdığından emin ol ve dev sunucusunu yeniden başlat.
