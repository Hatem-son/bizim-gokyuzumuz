# Bizim Gökyüzümüz — Yapılacaklar ve Kurulum Rehberi

Bu dosya şu an canlıya çıkmak için **sadece senin ekranlardan yapman gereken kalan adımları** en sade sırayla içerir.

---

## Şu An Hazır Olanlar
- [x] Sabit e-posta + şifre girişi ([`src/config.ts`](src/config.ts)) ve kalıcı telefon oturumu
- [x] Güvenlik başlıkları ve sayfa yönlendirmeleri ([`vercel.json`](vercel.json))
- [x] Yerel fontlar, çevrimdışı önbellek ve Face ID doğrulaması
- [x] Yeni VAPID bildirim anahtarları ve [`.env.local`](.env.local) güncellemesi
- [x] GitHub gizli deposu (`bizim-gokyuzumuz`) ve Vercel ilk yayını (`https://bizim-gokyuzumuz.vercel.app`)
- [x] Supabase veritabanı ve `profiles` kurulumu

---

## Senin Yapacağın Kalan Adımlar

### 1. Vercel'e 3 Anahtarı Ekle ve Yeniden Yayınla (2 dk)
> Canlı site şu an veritabanına bağlanamıyor çünkü Vercel tarafında bu 3 ayar eksik.

1. Vercel panelinde **`bizim-gokyuzumuz`** projesini aç.
2. Üst menüden **Settings** → soldan **Environment Variables** bölümüne gir.
3. Aşağıdaki 3 satırı tek tek ekle (**Name** ve **Value** kutularına yazıp **Save**'e bas):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://nmlofyathjeoqlhyqiaq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Bilgisayarındaki `.env.local` dosyasının 2. satırındaki `eyJ...` metni *(veya Supabase → **Project Settings → API → `anon public`**)* |
| `VITE_VAPID_PUBLIC_KEY` | `BNmPPBuZ_D9GiL-6KHOugzIFlwRUb7CVzPgluZvyeYUsAqzlyXM-kxmKosuXZ5jjsijStI_PRaSBESGRsw7vL7s` |

4. Üst menüden **Deployments** sekmesine git → en üstteki yayının sağındaki **`...` (üç nokta)** butonuna tıkla → **Redeploy**'a bas ve ~1 dakika bekle.

---

### 2. Supabase'e Bildirim Fonksiyonunu (`send-push`) Yükle (2 dk)
1. Supabase panelinde sol menüden **Edge Functions**'a tıkla.
2. **Deploy a new function → Via Editor** seçeneğine bas.
3. İsim kutusuna tam olarak **`send-push`** yaz.
4. Ekrandaki örnek kodun tamamını sil; bilgisayarındaki [`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts) dosyasının içindekilerin tamamını kopyalayıp oraya yapıştır.
5. Sağ alttan **Deploy function** butonuna bas.

---

### 3. Supabase Bildirim Gizli Anahtarlarını (`Secrets`) Ekle (2 dk)
1. Supabase panelinde sol menüden **Edge Functions → Secrets** sayfasına gir.
2. Aşağıdaki 4 çifti tek tek ekleyip **Save**'e bas:

| Key | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | `BNmPPBuZ_D9GiL-6KHOugzIFlwRUb7CVzPgluZvyeYUsAqzlyXM-kxmKosuXZ5jjsijStI_PRaSBESGRsw7vL7s` |
| `VAPID_PRIVATE_KEY` | Bir önceki mesajda verdiğim `EMA2r2...` ile başlayan **Private Key** |
| `VAPID_SUBJECT` | `mailto:gokyuzu@gokyuzu.app` |
| `APP_ORIGIN` | `https://bizim-gokyuzumuz.vercel.app` |

---

### 4. Zamanlı Yıldız Kontrolünü Aç (`pg_cron` ve `pg_net`) (2 dk)
*(Bunu zaten yaptıysan ve `SERVICE_ROLE_BURAYA` yerine kendi anahtarını yazdıysan bu adımı atlayabilirsin.)*

1. Supabase → **Database → Extensions** sayfasına gir, arama kutusundan **`pg_cron`** ve **`pg_net`** uzantılarını aç (**Enable**).
2. Supabase → **Project Settings → API** altından **`service_role`** anahtarını kopyala *(bunu sadece burada kullanacağız, Vercel'e kesinlikle koyma)*.
3. **SQL Editor → `+ New query`** aç, aşağıdaki komutta `SERVICE_ROLE_BURAYA` yerine kopyaladığın anahtarı yapıştırıp **Run**'a bas:

```sql
select cron.unschedule('unlock-stars-push')
where exists (select 1 from cron.job where jobname = 'unlock-stars-push');

select cron.schedule(
  'unlock-stars-push',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://nmlofyathjeoqlhyqiaq.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_BURAYA'
    ),
    body := '{"mode":"check_unlocks"}'::jsonb
  );
  $job$
);
```

---

### 5. Kullanıcı E-postalarını Kontrol Et (1 dk)
- Supabase → **Authentication → Users** ekranında açtığın 2 kullanıcının e-postaları `humam@gokyuzu.app` ve `beto@gokyuzu.app` ise her şey tamamdır.
- Farklı uydurma e-postalar yazdıysan o iki e-postayı bana söyle; [`src/config.ts`](src/config.ts) içini güncelleyip GitHub'a göndereyim (Vercel otomatik günceller).

---

### 6. İki iPhone'a Uygulamayı Kur (3 dk)
1. İki telefonda da **mutlaka Safari** ile `https://bizim-gokyuzumuz.vercel.app` adresini aç *(Chrome kullanma)*.
2. Alt ortadaki **Paylaş** butonuna bas → **Ana Ekrana Ekle** → **Ekle**.
3. Bundan sonra hep **ana ekrandaki simgeden** aç.
4. **"Ham ham"** veya **"Beto"** kartını seç → Supabase'de belirlediğin şifreyi gir *(bir kere girmen yeter, telefonda kalıcıdır)*.
5. İkinizin belirlediği **ortak gizli kelimeyi** ikiniz de aynı şekilde yaz ve **"Gökyüzüne gir"**'e bas *(baş/son boşluklar ve büyük/küçük harf fark etmez ama aradaki boşluklar aynı olmalı)*.
6. Çıkan bildirim sorusuna **İzin Ver**'e dokun (çıkmazsa ayarlardan **"Bildirimleri aç"**'a bas).

---

### 7. Son Canlı Kontrol
Yukarıdaki **1, 2, 3 ve 4. adımları** bitirince bana **"yaptım"** yaz; canlı site üzerinden girişi, bildirim servisini ve tüm güvenlik testlerini tekrar kontrol edip onaylayayım.
