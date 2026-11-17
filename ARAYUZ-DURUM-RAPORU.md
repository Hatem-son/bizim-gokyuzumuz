# Bizim Gökyüzümüz — Arayüz Durum ve Koruma Raporu (`ARAYUZ-DURUM-RAPORU.md`)

> **Amaç:** Bu belge, uygulamanın arayüzünü baştan tasarlayacak olan tasarımcıya (Claude) mevcut mimariyi, tüm ekranları, tasarım değişkenlerini, animasyonları, şifreleme/güvenlik sınırlarını ve **özellikle kullanıcının doğrudan talep ettiği / elle korunan düzeltmeleri** eksiksiz aktarmak için hazırlanmıştır. Uygulama kaynak kodunda bu rapor hazırlanırken hiçbir değişiklik yapılmamıştır.

---

## A. Özet

| Alan | Değer |
| :--- | :--- |
| **Uygulama Adı** | Bizim Gökyüzümüz (`Gökyüzümüz`) |
| **Güncel Sürüm** | `v1.2.8` (`package.json:4`, `index.html:280`, `index.html:351`) |
| **Son Koruma Commit'i (HEAD)** | `6c973a6` (`6c973a6fe502ed0e4bfec7657e175f08ef50b94a`) — `"Kullanıcı düzeltmeleri (elle)"` (`2026-11-17 15:37:40 +0300`) |
| **Son Uygulama Sürüm Commit'i** | `d626f8e` (`d626f8ecd710e6ecbaea31b0cc0b1a5a64952153`) — `"chore(release): v1.2.8 — Asama 2 PWA cilasi..."` (`2026-11-17 14:21:26 +0300`) |
| **Canlı Adres (Production)** | https://bizim-gokyuzumuz.vercel.app |
| **Hedef Tarih (Geri Sayım)** | `9 Ocak 2027 00:00:00` (`src/ui/countdown.ts:5`), başlangıç referansı `16 Kasım 2026 00:00:00` (`src/ui/countdown.ts:6`) |
| **İki Kullanıcı Kimliği** | `hamham` (**Ham ham**, Yengeç `♋︎`, mavi `#a8d4ff`) ve `beto` (**Beto**, Oğlak `♑︎`, pembe `#ffb3da`) |

### Kullanılan Teknolojiler ve Mimari
- **Derleyici ve Dil:** `Vite ^6.4.6` + saf `TypeScript ^5.7.3` (React/Vue yok; doğrudan hafif DOM denetleyicileri + tek tam ekran HTML5 2D Canvas).
- **Arka Uç ve Gerçek Zamanlı Senkronizasyon:** `@supabase/supabase-js ^2.49.1` (Auth `signInWithPassword`, Postgres RLS korumalı `profiles` / `settings` / `stars` / `star_secrets`, özel `media` Storage bucket'ı, `stars` tablosu üzerinde Realtime `postgres_changes`, `send-push` Deno Edge Function).
- **Uçtan Uca Şifreleme (E2EE):** Web Crypto API — ortak gizli kelimeden `PBKDF2-SHA256` (`310.000` iterasyon, salt: `'bizim-gokyuzumuz/hamham+beto/v1'`) ile türetilen `extractable: false` `AES-GCM-256` `CryptoKey` (`IndexedDB` `bizim-gokyuzumuz-keystore` içinde saklanır; `localStorage`'da ham anahtar tutulmaz). Tüm metinler, ses dalga tepeleri (`peaks`), fotoğraflar ve ses kayıtları istemcide şifrelenir.
- **Cihaz Kilidi:** `PBKDF2-SHA256` (`150.000` iterasyon) 4 haneli PIN + WebAuthn platform doğrulayıcısı (`Face ID / Touch ID`, `ES256` DER→P1363 ve `RS256` kriptografik imza doğrulaması, `2 dakika` arka plan kilidi).
- **PWA, Çevrimdışı Kuyruk ve Bildirim:** `public/manifest.webmanifest` (`display: standalone`, `orientation: portrait`), 10 adet iOS `apple-touch-startup-image` açılış görseli, `public/sw.js` kabuk önbelleği + Web Push (`VAPID`), `IndexedDB` şifreli çevrimdışı yıldız kuyruğu (`gokyuzu-outbox-v1`) ve `navigator.setAppBadge`.
- **Render Mimarisi:** Gökyüzü, Samanyolu (`repeat-x` sarımlı doku), Güneş, Ay, yön yıldızı, kayan yıldızlar, uçak, yelkenli tekne, altın `"Aynı An"` bağları ve yıldızlar tek `<canvas id="sky-canvas">` üzerinde çizilir (`DPR <= 1.5`, maks. `2.5M` piksel). Alt gece çayırı, zambaklar, mum kavanozu ve sayaç çelengi ilk yüklemede SVG'den `@2x/@3x` `WebP` (destek yoksa `PNG`) olarak `OffscreenCanvas`/canvas üzerinden rasterize edilir (`src/lib/rasterize.ts`).

---

## B. BENİM ELLE YAPTIĞIM DÜZELTMELER (En Önemli Bölüm — Yeni Tasarımda Mutlaka Korunmalı)

### B.0 Git Geçmişi ve Yazarlık Adli Notu (Tam Şeffaflık)
`git log` incelendiğinde depodaki 37 commit'in tamamı aynı yerel Git yapılandırmasıyla (`Hatem-son <humamjalaljalal@gmail.com>`) atılmıştır. Tasarım devrinde hiçbir bilginin kaybolmaması için değişiklikler iki katmanda ayrıştırılmıştır:

1. **Çalışma dizininde commit edilmeden bekleyen ve Adım 1'de `"Kullanıcı düzeltmeleri (elle)"` (`6c973a6`) ile korunan dosyalar** + erken dönem senkronizasyon commit'i (`d5a9908` — *belirsiz*).
2. **Harici şartname belgelerinde YER ALMAYAN, kullanıcının doğrudan kendi deneyimiyle görüp bizzat istediği 16 kritik arayüz/davranış düzeltmesi** (`v1.0.3`, `v1.0.4–v1.0.7`, `v1.0.9–v1.1.9`, `v1.2.4`). Yeni arayüzü tasarlayacak kişi yalnızca önceki tasarım belgelerine bakarsa bu düzeltmeleri bilmeyeceği için **aşağıdaki maddelerin her biri yeni tasarımda birebir korunmak zorundadır.**

---

### B.1 Doğrudan Dosya / Ortam Düzeltmeleri ve Kökeni Belirsiz Kayıtlar

#### 1) Commit `6c973a6` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-17 15:37:40 +0300`
- **Mesaj:** `Kullanıcı düzeltmeleri (elle)`
- **Durum Notu:** **Kısmen belirsiz** (`.gitignore` içindeki `.vercel` ve `.env*` satırları yerel ortamda ya kullanıcı tarafından elle ya da Vercel bağlantısı sırasında eklendi; `CANLI-KONTROL-RAPORU.md` ve `KURULUM-REHBERI.md` çalışma dizininde takip edilmeyen yerel belgelerdi ve kaybolmaması için korundu).
- **Dosya:Satır:** `.gitignore:7-10`, `CANLI-KONTROL-RAPORU.md:1-77`, `KURULUM-REHBERI.md:1-104`
- **Önce → Sonra (`.gitignore`):**
  ```gitignore
  # ÖNCE:
  dist
  .DS_Store

  # SONRA:
  dist
  .DS_Store

  .vercel
  .env*
  ```
- **Neyi düzeltiyor:** `.env`, `.env.local`, `.env.production` ve `.vercel` proje kimlik dosyalarının yanlışlıkla Git'e veya paketlere girmesini engelliyor.
- **KORUNMASI GEREKEN DAVRANIŞ:** `.env*` ve `.vercel` her zaman `.gitignore` içinde kalmalı; hiçbir ortam anahtarı istemci koduna sabitlenmemeli (`import.meta.env.VITE_*` kullanılmalı).

#### 2) Commit `d5a9908` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-16 18:59:36 +0300`
- **Mesaj:** `Sync files before push`
- **Durum Notu:** **Belirsiz** (İlk kurulum aşamasında çalışma klasörü senkronizasyonu; `README.md`, `index.html`, `src/config.ts`, `src/lib/push.ts`, `src/lib/stars.ts`, `src/lib/supabase.ts`, `src/ui/onboard.ts` dosyalarını ilk uzak depo push'u öncesi eşitledi).
- **KORUNMASI GEREKEN DAVRANIŞ:** Yalnızca iki sabit profil (`hamham@gokyuzu.app`, `beto@gokyuzu.app`) üzerinden şifreyle giriş (`src/config.ts:3-6`); dışarıdan kayıt (`signUp`) tamamen kapalıdır.

---

### B.2 Kullanıcının Bizzat İstediği ve Yeni Tasarımda ASLA Bozulmaması Gereken Düzeltmeler

#### 3) Commit `5e22d62` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-17 04:15:38 +0300`
- **Mesaj:** `fix(v1.2.4): always fly airplane and sail boat forward left-to-right nose-first`
- **Kullanıcı Talebi:** *"bazen ucak ters gelebiliyor onu kesinlikle duzeltmeni istiyorum ters gelmesin ucak , ilk once yazi sonra ucak geri geri geliyor en cok dikkat etmen gereken konu bu"*
- **Güncel Dosya:Satır:** `src/sky/plane.ts:259-261`, `src/sky/plane.ts:286-308`, `src/sky/boat.ts:273-275`, `src/sky/boat.ts:328-334`
- **Önce → Sonra:**
  ```ts
  // ÖNCE (src/sky/plane.ts & src/sky/boat.ts):
  this.rev = Math.random() < 0.5;
  ...
  const p = elapsed / this.dur;

  // SONRA (src/sky/plane.ts:260,286 & src/sky/boat.ts:274,328):
  // Uçak/tekne her zaman soldan sağa doğru burnu önde gider; ters/geri gelişe izin verilmez
  this.rev = false;
  ...
  const p = Math.max(0, Math.min(1, elapsed / this.dur));
  ```
- **Neyi düzeltiyor:** `rev = true` seçildiğinde pankartın önden girip uçağın/teknenin kuyruğu önde geri geri uçuyormuş gibi görünmesi hatasını tamamen ortadan kaldırdı.
- **KORUNMASI GEREKEN DAVRANIŞ (EN KRİTİK KURAL):** Gökyüzündeki **uçak da yelkenli tekne de ASLA ters yönde veya geri geri gelmemeli!** Her zaman ekranın solundan burnu/pruvası önde girip sağa doğru ilerlemeli (`planeX > flagX`, `boatX > flagX`); yazı pankartı her zaman aracın **arkasından** çekilmelidir.

#### 4) Commit `12bf798` + `7a59789` + `f860bf6` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-17 02:45:31` / `02:54:23` / `03:09:27 +0300`
- **Mesajlar:**
  - `12bf798`: `feat(v1.1.7): polish zambaks, candle jar, countdown & time-of-day splash`
  - `7a59789`: `feat(v1.1.8): tapered shooting stars, centered countdown & rim-hugging zambak garland`
  - `f860bf6`: `style(v1.1.9): refine countdown vertical & optical centering in top bar`
- **Kullanıcı Talepleri:**
  - *"sa dk sn detayini kaldirmani istiyorum sayactan ve biraz daha susle zambaklar ile , altaki zambak cicieklerininde goruntulerini fln gelistir mumum kabinida ayni sekilde guzel ve ozenli dursun hersey animasyonda guzel olsun , zamana gore degissin goruntu acilis ekranindaki"*
  - *"kayan yildizlar eklemeni istiyoeum ve sayaci ortala ve sayactaki susleri guzel olsun boyle random cicekler yerlestirlmis gibi durmasin"*
  - *"sayaci biraz daha ortalamani istiyicem"*
- **Güncel Dosya:Satır:**
  - Sayaç ortalama ve `sa/dk/sn` etiketsiz görünüm: `src/styles/main.css:525-537`, `src/styles/main.css:731-867`, `src/ui/countdown.ts:166-205`
  - Sayaç etrafı simetrik 12 çiçekli çelenk + zambak köşe dalları: `src/ui/countdown.ts:32-43`, `src/ui/countdown.ts:108-155`
  - Kayan yıldızlar (4 renk tonu + ikiz/üçlü paralel kayma): `src/sky/skyRenderer.ts:2408-2534`
  - Saate göre değişen açılış ekranı (`night`, `dawn`, `day`, `dusk`): `src/main.ts:850-884`, `src/styles/main.css:257-423`
- **Önce → Sonra:**
  ```ts
  // ÖNCE (src/ui/countdown.ts — saat/dakika/saniye harf etiketliydi):
  '<span class="dgt"></span><span class="dgt"></span><small>sa</small> ... <small>dk</small> ... <small>sn</small>'

  // SONRA (src/ui/countdown.ts:183-189 — sa/dk/sn yazıları kaldırıldı, sade HH : MM : SS):
  '<span class="dgt" id="cd-h0"></span><span class="dgt" id="cd-h1"></span><i class="sep">:</i>' +
  '<span class="dgt" id="cd-m0"></span><span class="dgt" id="cd-m1"></span><i class="sep">:</i>' +
  '<span class="dgt" id="cd-s0"></span><span class="dgt" id="cd-s1"></span>'
  ```
  ```css
  /* ÖNCE (src/styles/main.css — sayaç sağdaki menü butonu yüzünden sola/sağa kayık duruyordu): */
  .top { justify-content: space-between; padding: calc(env(safe-area-inset-top) + 14px) 16px 0; }

  /* SONRA (src/styles/main.css:525-535 & 578-585 — menü fixed sağda, sayaç optik olarak tam ortada): */
  .top { justify-content: center; padding: calc(env(safe-area-inset-top) + 22px) 32px 0 16px; }
  .icon-btn { position: fixed; top: calc(env(safe-area-inset-top) + 34px); right: 16px; }
  ```
- **KORUNMASI GEREKEN DAVRANIŞLAR:**
  1. **Sayaçta `sa`, `dk`, `sn` metinleri OLMAYACAK**; yalnızca gün sayısının altında `GÜN` yazar, saat kısmı sade `00 : 00 : 00` döner rakamlarla gösterilir.
  2. **Sayaç üst barda optik olarak tam ortalanmış** durmalı; sağ üstteki üç nokta (`#menu`) butonu sayacı sola itmemelidir.
  3. **Sayaç süsleri rastgele serpiştirilmiş çiçekler gibi durmamalı:** kadran halkasını simetrik saran 12 çiçeklik (`pembe lilyum + beyaz zambak` dönüşümlü, yolculuk ilerledikçe açılan) düzenli çelenk ve sağ-üst / sol-alt simetrik zambak dalları korunmalıdır.
  4. **Kayan yıldızlar** gece ve alacakaranlıkta (`daylight < 0.75`) `3–6.8 sn` aralıklarla süzülen, incelen kuyruklu (`ice`, `white`, `gold`, `rose`) ve %38 olasılıkla ikiz paralel kayan yıldız olarak kalmalıdır (blur filtresi kullanmadan).
  5. **Açılış ekranı (`#launch-splash`) saate göre renk ve alt başlık değiştirmelidir:** Gece `GECE GÖKYÜZÜMÜZ`, Şafak `ŞAFAK GÖKYÜZÜ`, Gündüz `GÜNÜN GÖKYÜZÜ`, Gün batımı `GÜN BATIMI`.

#### 5) Commit `b03501e` + `8d5e12b` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-17 02:09:28` / `02:26:10 +0300`
- **Mesajlar:**
  - `8d5e12b`: `fix: sifir acilis secim ekrani flashi, parlak aydinlik Ay, cizgisiz alt cayir ve vektorel ucak pankarti (v1.1.5)`
  - `b03501e`: `feat: dive-in acilis animasyonu, pankartta Great Vibes TR font garanti + olculu ortalama ve klavye ustu kilitli kurulum (v1.1.6)`
- **Güncel Dosya:Satır:** `index.html:301`, `src/main.ts:1731-1763`, `src/styles/main.css:1339-1387`, `src/sky/plane.ts:99-110,243-250`
- **Önce → Sonra:**
  ```html
  <!-- ÖNCE (index.html — her açılışta giriş ekranı saliselik yanıp sönüyordu): -->
  <section id="onboard" aria-label="Giriş">

  <!-- SONRA (index.html:301 — varsayılan kapalı; sadece kurulum yoksa JS ile açılır): -->
  <section id="onboard" class="gone" aria-label="Giriş" aria-hidden="true" inert>
  ```
  ```css
  /* SONRA (src/styles/main.css:1339-1349 — iOS klavyesi açılınca şifre/gizli kelime kutusu klavye altında kalmaz): */
  body.kb-active #onboard:not(.gone) {
    height: calc(var(--app-h, 100vh) - var(--kb, 0px));
    padding: calc(env(safe-area-inset-top) + 10px) 20px 10px;
  }
  body.kb-active #onboard .ob-eyebrow,
  body.kb-active #onboard .ob-sub,
  body.kb-active #onboard .ob-ver,
  body.kb-active #onboard .ob-scene { display: none; }
  ```
- **KORUNMASI GEREKEN DAVRANIŞLAR:**
  1. Kurulu uygulamayı açarken **"Sen Kimsin?" ekranı bir salise bile yanıp sönmemeli** (`#onboard` HTML'de `.gone` başlamalı); kurulu kullanıcı doğrudan `#launch-splash` "içine dalış" (`scale 1.13 -> 1`) animasyonuyla gökyüzüne girmelidir.
  2. Kurulumda şifre veya gizli kelime yazarken iOS klavyesi açıldığında sayfa kaymamalı (`touchmove` kilitli) ve giriş alanı + buton her zaman klavyenin üstünde görünür kalmalıdır.
  3. Uçak ve tekne pankartlarındaki `Great Vibes` el yazısı çizilmeden önce `document.fonts.load(...)` ile Türkçe karakterler (`ŞĞÜÖÇİı`) yüklenmeli; `actualBoundingBoxAscent/Descent` ile optik ortalanarak harf kuyrukları asla kesilmemelidir.

#### 6) Commit `e4466d1` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-17 01:56:38 +0300`
- **Mesaj:** `fix: PWA eski surumde takilma sorunu — no-store index, SW guncellemesinde otomatik yenileme (v1.1.4)`
- **Güncel Dosya:Satır:** `vercel.json:19-30`, `src/lib/pwa.ts:18-45`, `public/sw.js:1-90`
- **Önce → Sonra:**
  ```ts
  // SONRA (src/lib/pwa.ts:21-37 — açık form yoksa yeni Service Worker devreye girince otomatik yeniler):
  const busyOverlay = document.querySelector('#compose.open, .modal.open, #onboard:not(.gone)');
  if (busyOverlay) { window.setTimeout(tryReloadForUpdate, 1500); return; }
  window.location.reload();
  ```
- **KORUNMASI GEREKEN DAVRANIŞ:** Ana ekrana eklenmiş iOS PWA eski önbellekte takılı kalmamalı; `/`, `/index.html` ve `/sw.js` `no-store` olmalı, ancak kullanıcı yazı yazarken (`#compose.open`) sayfa aniden yenilenip yazdığı metin silinmemelidir.

#### 7) Commit `4fd7ccd` + `bf49382` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-17 01:22:23` / `01:37:37 +0300`
- **Mesajlar:**
  - `4fd7ccd`: `feat: tum kalpler beyaz, net ve sade Ay, yuksek cozunurluklu ucak, sabit mum ve kilitsiz yazma kaydirmasi (v1.1.0)`
  - `bf49382`: `fix: secim ekrani tekrari, alt ince cizgi, sadece aydinlik Ay ve sonsuz Samanyolu sarimi (v1.1.2)`
- **Güncel Dosya:Satır:** `src/styles/main.css:957-963,1008-1012,1205-1218,3319-3359`, `src/sky/skyRenderer.ts:1607,1738-1760,2371-2390`
- **Önce → Sonra:**
  ```css
  /* ÖNCE: Kalpler pembe/tema rengiydi, mum tıklanabiliyordu */
  .act-ic svg { fill: var(--accent); }
  .l-heart path { fill: var(--paper-accent); }

  /* SONRA (src/styles/main.css:1009,1208,3320,3356 — TÜM kalpler saf beyaz #ffffff): */
  .jar-heart, .act-ic svg, .medal-heart, .cd-heart, .l-heart path, .longing svg.on { fill: #ffffff; }
  .candle-wrap { pointer-events: none; } /* Mum sabit, yalnızca ahududular tıklanabilir */
  ```
  ```ts
  // SONRA (src/sky/skyRenderer.ts:1751-1753 — Ay'ın karanlık yarısı %100 şeffaf, rota çizgisi yok):
  g.save();
  g.clip(litPath); // Yalnızca Güneş ışığı vuran hilal/yüzey çizilir, gölge disk çizilmez
  ```
- **KORUNMASI GEREKEN DAVRANIŞLAR:**
  1. **Uygulamadaki TÜM kalpler saf beyaz (`#ffffff`) olmalıdır** (mum etiketi kalbi, `DÜŞÜNDÜM` butonu kalbi, uçak/tekne pankart kalbi, mektup içi büyük kalp ve 5'li özlem ölçüsü kalpleri, yükselen kalpler, gökyüzüne dokununca çıkan kalpler).
  2. **Ay'ın arkasında kesikli yörünge/rota çizgisi OLMAYACAK** ve **Ay'ın karanlık/gölgeli yarısı çizilmeyecek** (yalnızca ışık alan parlak kısmı görünecek).
  3. **Samanyolu kuşağı** sağa-sola kaydırıldığında keskin bir kenarda bitmemeli (`createPattern(..., 'repeat-x')` ile dikişsiz sonsuz sarım).
  4. **Mum kavanozu sabit** durmalı (`pointer-events: none`); yalnızca dibindeki 4 ahududu (`.rasp`) dokunulabilir olmalıdır.

#### 8) Commit `be2fd52` — `Hatem-son <humamjalaljalal@gmail.com>` · `2026-11-16 22:13:55 +0300`
- **Mesaj:** `feat: mumdan yukselen ve ayni an beyaz kalp (v1.0.3)`
- **Güncel Dosya:Satır:** `src/ui/whiteHeart.ts:1-347`, `src/main.ts:1270-1305`
- **KORUNMASI GEREKEN DAVRANIŞLAR:**
  1. Kullanıcı `DÜŞÜNDÜM` veya `YAZ` ile yıldız bıraktığında mum fitilinden (`getWickScreenPos`) gökyüzüne doğru **saf beyaz bir kalp** süzülerek yükselir (`spawnCandleWhiteHeart`, `4.2 sn` WAAPI `transform/opacity`).
  2. İki kullanıcı **1 saat içinde (`LINK_MS = 3_600_000`)** yıldız bıraktığında (`"Aynı An"`), ekran ortasında büyük beyaz kalp belirmeli ve üstteki `AYNI AN` sayacına uçarak sayacı zıplatmalıdır (`playSyncWhiteHeartToCounter`).

#### 9) Commit `82e53d6` + `f69a8fe` + `2ce2454` + `3a11d2b` + `3a4ac83` + `a850245` + `b77b6b3` + `3070662` + `c97c870` (`v1.0.2 → v1.1.3`)
- **Odak:** iPhone tam ekran (`viewport-fit=cover`) alt kenar çizgisi, `--app-h` kök yükseklik kilidi, `visualViewport` ile klavye üstüne mıhlanan yazma kartı ve katmanlı botanik gece çayırı.
- **Güncel Dosya:Satır:** `src/main.ts:834-955`, `src/styles/main.css:161-218,480-488,944-955,1139-1154,2976-3043`, `src/sky/skyRenderer.ts:1639-1645`
- **Önce → Sonra:**
  ```ts
  // SONRA (src/main.ts:837-845 — iOS standalone'da ekranın en altına kadar tam boy, klavye açılınca --app-h küçülmez):
  const candidate = standalone
    ? Math.max(window.innerHeight, document.documentElement.clientHeight, window.screen.height)
    : window.innerHeight;
  if (inputFocused && lastAppH > 0 && candidate < lastAppH) return;
  document.documentElement.style.setProperty('--app-h', `${candidate}px`);
  ```
  ```css
  /* SONRA (src/styles/main.css:3013-3015 — Yazma kartı klavye açıldığında zıplamadan tam klavye üstüne oturur): */
  #compose.open .sheet-card {
    transform: translate3d(0, calc(-1 * var(--kb, 0px)), 0);
  }
  ```
- **KORUNMASI GEREKEN DAVRANIŞLAR:**
  1. **Alt kenarda asla 1 piksellik bile açık renk çizgi veya boşluk görünmemeli:** `#scene` ve `#sky-canvas` `calc(var(--app-h, 100vh) + 4px)` yüksekliğinde olmalı, canvas tabanı `#08171c` (`--ground-bottom`) rengine yumuşakça sönümlenmeli ve `.ground` `bottom: -6px` ile ekranın fiziksel en alt kenarını (`home indicator` arkası dahil) tamamen örtmelidir.
  2. **Yazma kartı (`#compose`) klavye açıldığında zıplamamalı, kaymamalı:** `#msg` (`textarea`) sabit `104px` yükseklikte kendi içinde `pan-y` kaymalı, dış kart ise `--kb` kadar yukarı kalkarak klavyenin tam üstüne kilitlenmelidir.

---

### B.3 Tüm Git Geçmişi Özeti (37 Commit — Kronolojik)

| Commit | Tarih (`+0300`) | Tür | Özet |
| :--- | :--- | :--- | :--- |
| `6c973a6` | `2026-11-17 15:37` | **Elle Koruma** | `Kullanıcı düzeltmeleri (elle)` — `.gitignore` (*belirsiz*), `CANLI-KONTROL-RAPORU.md`, `KURULUM-REHBERI.md` |
| `d626f8e` | `2026-11-17 14:21` | Şartname (Aşama 2) | `v1.2.8` — iPhone splash PNG'leri, swipe-to-dismiss, IndexedDB outbox, badge, A2HS |
| `0667f65` | `2026-11-17 13:48` | Şartname (Aşama 1.2) | `v1.2.7` — SVG→WebP rasterizasyon, DPR/FPS sınırı, `media.ts` dinamik split |
| `5e4cb6b` | `2026-11-17 04:40` | Şartname (Aşama 1.1) | `v1.2.6` — Tembel yüklenen gizli `Teşhis` (`#perf-hud`) paneli |
| `b66c18e` | `2026-11-17 04:31` | Şartname (Aşama 0) | `v1.2.5` — Türkçe ağ hataları, abonelik temizliği, `≥44px` dokunma hedefleri |
| `5e22d62` | `2026-11-17 04:15` | **Kullanıcı İsteği** | `v1.2.4` — Uçak ve teknenin asla ters/geri gelmemesi (`rev = false`) |
| `483a856` | `2026-11-17 04:01` | Şartname (Detay 4) | `v1.2.3` — Yön yıldızı + pusula, yelkenli tekne, okyanus karşılamaları |
| `89373b5` | `2026-11-17 03:43` | Şartname (Detay 3) | `v1.2.2` — Beto hesabında sıcak ela-krem Ay tonu ve statik hale |
| `419e779` | `2026-11-17 03:39` | Şartname (Detay 2) | `v1.2.1` — Deterministik ela yıldız (`FNV-1a % 12`), `0.6s` halka ve mektup alt satırı |
| `8d4ae81` | `2026-11-17 03:19` | Şartname (Detay 1) | `v1.2.0` — Yeniden kullanılabilir `<PinkBow />` (mum şeridi ve uçak pankartı) |
| `f860bf6` | `2026-11-17 03:09` | **Kullanıcı İsteği** | `v1.1.9` — Sayacın üst barda hassas optik ve dikey ortalanması |
| `7a59789` | `2026-11-17 02:54` | **Kullanıcı İsteği** | `v1.1.8` — İncelen kayan yıldızlar, ortalanmış sayaç ve simetrik zambak çelengi |
| `12bf798` | `2026-11-17 02:45` | **Kullanıcı İsteği** | `v1.1.7` — Sayaçtan `sa/dk/sn` kaldırılması, kristal mum kavanozu, saate göre splash |
| `b03501e` | `2026-11-17 02:26` | **Kullanıcı İsteği** | `v1.1.6` — Dive-in açılış, pankartta TR `Great Vibes` garantisi, klavye üstü kurulum |
| `8d5e12b` | `2026-11-17 02:09` | **Kullanıcı İsteği** | `v1.1.5` — Sıfır seçim ekranı flash'ı (`#onboard.gone`), parlak Ay, çizgisiz çayır |
| `e4466d1` | `2026-11-17 01:56` | **Kullanıcı İsteği** | `v1.1.4` — PWA eski sürümde takılma düzeltmesi (`no-store` + SW otomatik yenileme) |
| `c97c870` | `2026-11-17 01:49` | **Kullanıcı İsteği** | `v1.1.3` — GPU katmanlı çiçekler ve sıfır GC yıldız sprite batching |
| `bf49382` | `2026-11-17 01:37` | **Kullanıcı İsteği** | `v1.1.2` — Yalnızca aydınlık yüzeyi çizilen Ay, sonsuz Samanyolu sarımı, alt dikiş |
| `3070662` | `2026-11-17 01:27` | **Kullanıcı İsteği** | `v1.1.1` — Botanik katmanlı zambaklar ve gece esintisi salınımı |
| `4fd7ccd` | `2026-11-17 01:22` | **Kullanıcı İsteği** | `v1.1.0` — Tüm kalpler saf beyaz, sade Ay, `@4x` uçak, sabit mum |
| `b77b6b3` | `2026-11-17 01:05` | **Kullanıcı İsteği** | `v1.0.9` — `--app-h` kök yükseklik, ortalanmış sayaç, sabit yazma kartı |
| `90d8ad8`–`e10059a` | `2026-11-16 21:22–00:46` | Karma / Düzeltme | `v1.0.2–v1.0.8` — Gece çayırı, beyaz kalp (`v1.0.3`), `visualViewport` (`v1.0.5`), 20sn derin uyku (`v1.0.6`) |
| `49b95d8`–`318c6df` | `2026-11-16 18:34–20:32` | İlk Kurulum | Temel uygulama, şifreli yıldız mimarisi, RLS SQL kurulumu ve `send-push` CORS (`d5a9908` *belirsiz*) |

---

## C. Ekranlar (Bileşenler, Öğeler, Durumlar ve Türkçe Metinler)

Tüm ekranların `390×844` gündüz (`13:30`) ve gece (`23:30`) ekran görüntüleri `ekranlar/` klasöründe yer almaktadır.

### C.1 Kurulum / Giriş Ekranı (`#onboard`)
- **Dosyalar:** `index.html:301-353`, `src/ui/onboard.ts:1-263`, `src/styles/main.css:1319-1655`
- **Üst Öğeler:** Üst başlık `.ob-eyebrow` (`HAM HAM & BETO`), el yazısı `h1` (`Bizim Gökyüzümüz`), açıklama `.ob-sub` (`Birbirimizi her düşündüğümüzde gökyüzümüze bir yıldız bırakacağız.`), alt dekoratif bahçe SVG `.ob-scene`, sürüm `.ob-ver` (`v1.2.8`).
- **Adım 1 — Kimlik Seçimi (`#step-who`):**
  - Soru: `SEN KİMSİN?`
  - İki takımyıldız kartı (`.who-card`):
    - Sol (`data-who="hamham"`, `.blue`): Yengeç takımyıldızı çizimi + `Ham ham` + `♋︎ YENGEÇ`
    - Sağ (`data-who="beto"`, `.pink`): Oğlak takımyıldızı çizimi + `Beto` + `♑︎ OĞLAK`
- **Adım 2 — Hesap Şifresi (`#step-auth`, yalnızca Supabase aktif ve oturum yokken):**
  - Selamlama: `Hoş geldin Ham ham` / `Hoş geldin Beto`
  - Etiket: `HESAP ŞİFREN`, input `#auth-pass` (`placeholder="Şifren"`), alt bilgi: `Sadece ikinizin hesabı tanımlı. Yeni kayıt dışarıya kapalı.`
  - Butonlar: `Giriş yap` (yüklenirken `Giriş yapılıyor…`), `Geri dön`
  - Hata durumları (`#auth-err`): `Şifre hatalı, tekrar dene.`, `İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.`, `Bu hesap seçtiğin kişiye ait değil.`
- **Adım 3 — Ortak Gizli Kelime (`#step-key`):**
  - Etiket: `GİZLİ KELİMEMİZ`, input `#key` (`placeholder="İkimizin bildiği kelime"`)
  - Alt bilgi: `İkimiz de aynı kelimeyi yazıyoruz. Bütün yıldızlarımız bu kelimeyle cihazda şifreleniyor, sunucu göremez.`
  - Butonlar: `Gökyüzüne gir` (yüklenirken `Anahtar hazırlanıyor…`), `Geri dön`, yerel önizlemede hata olursa `Yerel doğrulamayı sıfırla ve yeniden kur` (`#ob-wipe`).
  - Hata durumu (`#ob-err`): `Bu kelime, bu gökyüzünün gizli kelimesiyle eşleşmiyor.` / `Anahtar doğrulanamadı.`
- **Görseller:** `01-giris-1-kimlik-secimi-{gunduz,gece}.png`, `02-giris-2-hesap-sifresi-{gunduz,gece}.png`, `02b-giris-2-hesap-sifresi-hata-{gunduz,gece}.png`, `03-giris-3-gizli-kelime-{gunduz,gece}.png`

### C.2 Kurulum Sonrası Açılış Sahne Kapısı (`#launch-splash`)
- **Dosyalar:** `index.html:286-298`, `src/main.ts:850-884,1731-1763`, `src/styles/main.css:256-428`
- **Öğeler:** Nefes alan yıldız+beyaz kalp küresi (`.ls-orb`), `HAM HAM & BETO`, `Bizim Gökyüzümüz`, saate göre dinamik alt satır `#ls-sub` (`GECE GÖKYÜZÜMÜZ` / `ŞAFAK GÖKYÜZÜ` / `GÜNÜN GÖKYÜZÜ` / `GÜN BATIMI`).
- **Davranış:** Kurulumu tamamlanmış ve PIN kilidi olmayan açılışlarda görünür, `520ms` sonra büyüyerek (`scale 1 -> 1.2`) solar ve arkadaki gökyüzü sahnesine dalış (`scale 1.13 -> 1`) yapar.
- **Görseller:** `04-acilis-dive-in-splash-{gunduz,gece}.png`

### C.3 Uygulama Kilidi Ekranı (`#lock` — PIN & Face ID)
- **Dosyalar:** `index.html:356-384`, `src/ui/lockScreen.ts:1-166`, `src/lib/lock.ts:1-369`, `src/styles/main.css:2186-2360`
- **Öğeler:** Burç madalyonu `#lk-medal`, başlık `#lk-title`, alt başlık `#lk-sub`, 4 nokta `#lk-dots`, `0–9` tuş takımı `#pad` (`Vazgeç` + silme ikonu), `#lk-faceid` (`Face ID ile aç`), `#lk-forgot` (`Şifremi unuttum · gizli kelimeyle yeniden gir`).
- **Durumlar ve Türkçe Metinler:**
  - `unlock` (Kilit açma): Başlık `Hoş geldin Ham ham` / `Hoş geldin Beto`, alt yazı `ŞİFRENİ GİR`, yanlış PIN'de sarsıntı + `TEKRAR DENE`, Face ID başarısızsa `FACE ID OLMADI · PIN GİR`.
  - `set1` (Yeni PIN belirleme): Başlık `Dört haneli şifre`, alt yazı `YENİ ŞİFRE SEÇ`, `Vazgeç` görünür.
  - `set2` (PIN doğrulama): Başlık `Bir kez daha`, alt yazı `ŞİFREYİ DOĞRULA`, uyuşmazsa `UYUŞMADI, YENİDEN SEÇ`.
- **Görseller:** `05-uygulama-kilidi-pin-faceid-{gunduz,gece}.png`

### C.4 Ana Gökyüzü Sahnesi (`#scene`, `.top`, `#sky`, `.ground`, `.center-row`)
- **Dosyalar:** `index.html:27-108`, `src/sky/skyRenderer.ts`, `src/ui/countdown.ts`, `src/ui/garden.ts`, `src/sky/greetings.ts`, `src/main.ts`
- **Katmanlar ve Öğeler:**
  1. **Üst Bar (`.top`):** Ortada geri sayım kapsülü `#countdown` (12 çiçekli çelenk `#cd-ring`, gün sayısı `#cd-days` + `GÜN`, başlık `9 Ocak'a` — hedef gelince `Kavuşma günü` / `Kavuşmamız` + beyaz kalp — döner saat `HH : MM : SS`, zambak dalları `#cd-sprig`, `#cd-sprig2`) ve sağ üstte sabit 3 nokta ayarlar butonu `#menu` (`aria-label="Ayarlar"`).
  2. **Gökyüzü Etkileşim Alanı (`#sky`):** `4x` genişlikte yatay kaydırılabilir panorama (`DOĞU — [iz] — BATI` pusula çubuğu `#compass`), boş gökyüzü ipucu `#empty-hint` (`Gökyüzümüz ilk yıldızı bekliyor`), karşılama/durum başlığı `#sky-cap` (`#sky-cap-t` + `#sky-cap-s`).
  3. **Gök Cisimleri:** Gündüz Güneş, gece ve alacakaranlıkta gerçek evreli Ay (Beto'da ela-krem tonlu + statik haleli; dokununca örn. `İlk Dördün · %56 aydınlık` / `Gündüz gökyüzümüz`), üst-orta sol bölgede 4 kollu **Yön Yıldızı** (`guideX=41.5, guideY=8.5`).
  4. **Alt Gece Çayırı ve Eylem Satırı (`.ground` + `.center-row`):** Sıcak zemin ışığı `.floor-light`, arka çayır `#garden-meadow`, sağlı sollu esintide sallanan zambak/lilyumlar (`#stem-l`, `#stem-r`, `#lily-l`, `#lily-r`), ön çimen `#grass-front-img`, sol eylem `#btn-miss` (`DÜŞÜNDÜM` — basılı tutunca dolan dairesel şarj halkası `.charge`), ortada kristal mum kavanozu (`B ♡ H` etiketi, sağ üstünde `-12°` eğik pembe fiyonk `#candle-bow`, canlı SVG alev `#candle-flame`, dibinde dokunulabilir 4 ahududu `.rasp`), sağ eylem `#btn-write` (`YAZ`).
- **Özel Sahne Durumları:**
  - **Boş durum:** `#empty-hint` görünür (`Gökyüzümüz ilk yıldızı bekliyor`).
  - **Dolu durum:** Ham ham yıldızları mavi (`#a8d4ff`), Beto yıldızları pembe (`#ffb3da`), 1 saat içinde karşılıklı bırakılanlar altın (`#ffdc93`) ve aralarında altın bağ çizgisi, deterministik `%12 === 0` yıldızlar sıcak ela (`hazel`), zaman kilitli yıldızlar kesikli altın çember + asma kilit ikonuyla yarı saydam görünür.
  - **"Sensiz gökyüzü" (Ay/Güneş'e `500ms` basılı tutma):** Tüm yıldızlar geçici solar, başlık `Sensiz gökyüzü` / `Bir tek yıldız bile yok` olur.
  - **Kalp Dizilimi (Ay/Güneş'e çift dokunma):** Tüm yıldızlar `7 saniye` boyunca kesikli altın kalp çerçevesi üzerinde kalp şekline dizilir (`Kalp oldular` / `N YILDIZ · TEK KALP`).
  - **Ahududu dokunuşu:** Ahududu zıplar (`.boing`) ve üstünde yüzen not çıkar (`Tatlı bir ahududu` / `Beto'nun en sevdiğinden`, `Bir tane daha` / `Mevsimi gelince beraber`, vb.).
  - **10 ve 30 yıldız eşiği:** Sol (`10`) ve sağ (`30`) büyük lilyumun ikinci goncası çiçek açar; `Bir lilyum daha açtı` / `10 yıldız oldu` bildirimi gelir.
- **Görseller:** `06-ana-gokyuzu-bos-hamham-{gunduz,gece}.png`, `07-ana-gokyuzu-bos-beto-ela-ay-{gunduz,gece}.png`, `08-ana-gokyuzu-dolu-yildizlar-{gunduz,gece}.png`, `09a-ana-gokyuzu-sensiz-mod-{gunduz,gece}.png`, `09b-ana-gokyuzu-kalp-dizilimi-{gunduz,gece}.png`

### C.5 Yön Yıldızı Pusula Kartı (`#compass-pop`)
- **Dosyalar:** `index.html:73-91`, `src/main.ts:440-522`, `src/styles/main.css:3562-3656`
- **Öğeler:** `K / D / G / B` yön kadranı SVG `.compass-svg`, yön yıldızının ekrandaki gerçek açısına (`Math.atan2`) `500ms`'de dönen ibre `#compass-needle`, altında italik söz `#compass-quote` (10 cümlelik havuz: `Pusulam sensin`, `Yönümü hep sana bulurum`, `9 Ocak'a kadar bu yıldız yolumu gösteriyor`, vb.). `3 saniye` sonra kendiliğinden kapanır.
- **Görseller:** `10-yon-yildizi-pusula-{gunduz,gece}.png`

### C.6 Gökyüzü Araçları: Uçak (`PlaneController`) ve Yelkenli Tekne (`BoatController`)
- **Dosyalar:** `src/sky/plane.ts:1-455`, `src/sky/boat.ts:1-473`, `src/main.ts:524-555`
- **Zamanlama ve Kural:** Girişten `6.5 sn` sonra ve ardından her `5 dakikada` %50 olasılıkla tetiklenir; aynı araç üst üste en fazla 2 kez çıkar (`gokyuzu.vehicle.v4`). İkisi aynı anda asla çıkmaz. **Her zaman soldan sağa ileri yönde giderler.**
- **Uçak:** Pembe kuyruklu krem gövdeli pervaneli uçak (`27–32 sn`), arkasında ipek pembe pankart, pankartın ipe bağlandığı sağ uçta küçük `<PinkBow />`, beyaz kalp ve kullanıcıya özel `Great Vibes` metin (`Seni seviyorum Betooo`, `Seni seviyorum Ham hammm`, vb.).
- **Yelkenli Tekne:** Hilal gövdeli, `#f4efe6` üçgen yelkenli, direk tepesinde küçük `<PinkBow />` bulunan tekne (`28–34 sn`), arkasında `8–10` noktalı yıldız tozu izi + pankart (`Rüzgar seni bana getirsin`, `Pusulam sensin Beto`, `Limanım sensin Ham ham`, vb.). Üzerine dokunulursa `420ms`'de yumuşakça solarak kaybolur.
- **Görseller:** `11-ucak-ve-pembe-fiyonk-pankart-{gunduz,gece}.png`, `12-yelkenli-tekne-ve-pankart-{gunduz,gece}.png`

### C.7 Yıldız Listesi / Aylık 3B Gökyüzü Arşivi (`#tlabel` + `travel.ts`)
- **Dosyalar:** `index.html:68-71`, `src/sky/travel.ts:1-215`, `src/sky/skyRenderer.ts:936-1079`, `src/styles/main.css:2407-2470`
- **Nasıl Açılır:** Boş gökyüzüne `500ms` basılı tutulduğunda gökyüzü `0.52x` ölçeğe uzaklaşıp yuvarlatılmış 3B kartlara dönüşür (`Kasım 2026` → `Ocak 2027`). Sağa sola sürüklenerek aylar arasında gezilir, parmak bırakıldığında seçilen ayın gökyüzünün içine dalınır.
- **Durumlar ve Türkçe Metinler:**
  - Açık aylar: Ay adı (`Kasım 2026`), altında `N YILDIZ` veya `HENÜZ YILDIZ YOK`.
  - Gelecek normal ay: Kilit ikonu + `HENÜZ GELMEDİ` (seçilirse `O ay henüz gelmedi` / `Zamanı gelince yıldızları açılacak` bildirimi).
  - Ocak 2027 hedef kartı: Altın çerçeveli özel kart + `9 OCAK'TA AÇILACAK` (seçilirse `Ocak gökyüzümüz` / `9 Ocak'ta birlikte açacağız`).
  - Alt ipucu `em`: `KAYDIR · BIRAKINCA İÇİNE DAL` (ilk kaydırmada solar).
- **Görseller:** `13-aylik-gokyuzu-arsivi-karusel-{gunduz,gece}.png`

### C.8 Yazma Kartı (`#compose`) — Not, Zamanlı Yıldız, Fotoğraf, Ses Kaydı
- **Dosyalar:** `index.html:146-206`, `src/ui/composeSheet.ts:1-685`, `src/styles/main.css:2513-3083`
- **Temel Öğeler:** Tutamaç `.handle` (aşağı sürükleyerek kapatma destekli), burç madalyonu `#c-medal`, başlık `#c-title` (`Beto'ya` / `Ham ham'a`), alt başlık `BİR YILDIZ BIRAK`, 5 hazır çip (`Seni özledim`, `Günaydın`, `İyi geceler`, `Aklımdasın`, `Seni seviyorum`), italik mektup alanı `#msg` (`placeholder="Aklından ne geçiyor?"`, `maxlength="600"`), sayaç `0 / 600`, gönder butonu `#send` (`Gökyüzüne bırak`), alt şifreleme bilgisi `#c-hint` (`Uçtan uca şifreli · Sadece ikimiz okuyabiliriz`).
- **Alt Mod 1 — Zamanlı / Kilitli Yıldız (`#att-time` → `#sched-box`):**
  - Üst başlık: `KİLİTLİ BIRAKILACAK`, sağda `Vazgeç`.
  - Türkçe tarih seçici `#sched-dt-label` + 3 hazır seçim: `Yarın sabah`, `Bir hafta sonra`, `9 Ocak, gece yarısı`.
  - Açıklama `#sched-note`: `Beto yıldızı görecek ama 9 Ocak 00:00'a kadar açamayacak. O an bildirim düşecek.` (Geçersiz tarihte hata: `Geçmiş bir tarih seçemezsin. En az 1 dakika sonrasını seç.`)
  - Gönder butonu metni `Zamana bırak` olur.
- **Alt Mod 2 — Fotoğraf Eki (`#att-photo` → `#att-card`):**
  - Seçilen fotoğraf istemcide maks. `1280px` `JPEG (0.82)` olarak sıkıştırılır (`src/lib/media.ts:7-39`).
  - Önizleme küçük resmi `#att-thumb`, başlık `Fotoğraf`, ikili segment `.seg`: `Kalıcı` (`Yıldız her açıldığında görünür`) / `Tek seferlik` (`Açılıp kapatılınca silinir`), kaldırma butonu `#att-x`.
- **Alt Mod 3 — Ses Kaydı (`#att-voice` → `#att-card`):**
  - **Canlı kayıt durumu (`.rec-ui`):** Yanıp sönen kırmızı nokta `.rec-dot`, süre `0:00 / 1:00` (maks. `60 sn`), canlı mikrofon genliğine göre yükselen 28 çubuk `#rec-bars`, kırmızı durdurma butonu `#rec-stop`.
  - **Kayıt önizleme durumu:** Oynat/durdur butonu `#att-play`, `Ses kaydı · 0:14`, 28 dalga çubuğu, silme butonu `#att-x`.
  - **Hata durumları (`#att-err`):** `Mikrofon izni verilmedi veya bu cihaz desteklemiyor.`, `Bu tarayıcıda ses kaydı desteklenmiyor.`, `Fotoğraf okunamadı, başka bir kare dener misin?`
- **Görseller:** `14-yazma-karti-varsayilan-{gunduz,gece}.png`, `15-yazma-karti-zamanli-kilit-{gunduz,gece}.png`, `16-yazma-karti-fotograf-ekli-{gunduz,gece}.png`, `17-yazma-karti-ses-kaydi-canli-{gunduz,gece}.png`, `17b-yazma-karti-ses-onizleme-{gunduz,gece}.png`

### C.9 Yıldız Açma / Zarf ve Mektup Ekranı (`#letter-modal`)
- **Dosyalar:** `index.html:209-239`, `src/ui/letterModal.ts:1-454`, `src/styles/main.css:3084-3560`
- **İlk Açılış Zarf Seremonisi (`#env`):** Yıldız ilk kez açılıyorsa (`!star.openedAt`), yıldızın gökyüzündeki konumundan merkeze uçan zarf (`700ms`) → ahududu mührünün patlayarak açılması (`440ms`) → zarf kapağının 3B `rotateX(-178deg)` ile açılması (`520ms`) → kağıdın zarftan sıyrılıp mektup kartına dönüşmesi (`540ms`). Daha önce açılmış yıldızlar doğrudan `480ms` kart animasyonuyla açılır.
- **Mektup Kartı (`#letter`) Öğeleri:** Üstte ahududu mührü `#seal`, sol üstte gönderenin burç madalyonu `#l-medal`, sağ üstte `YILDIZ NO. X` (eşleşmişse `YILDIZ NO. X · AYNI SAATTE`), el yazısı başlık `#l-from` (`Beto'dan` / `Ham ham'dan`), içerik bölgesi, tarih `#l-date` (`17 Kasım 2026 Salı · 00:15`), `Kapat` butonu `#l-close` ve sağ alt köşede lilyum çiçeği `#sprig`.
- **İçerik Türleri ve Durumlar:**
  1. **Yazılı Not (`note`) + Ela Yıldız Satırı (`#l-hazel`):** Çizgili mektup kağıdı üzerinde kelime kelime beliren (`Cormorant Garamond italic 23px`) metin; yıldız deterministik ela yıldızsa altında italik ela notu (`Gözlerin gibi parlayan bir yıldız daha`, `Bu yıldız senin gözlerinin renginde`, vb.).
  2. **`"Seni düşündüm"` (`miss`):** Büyük beyaz kalp çizim animasyonu (`#l-heart`) + `5` kalplik `ÖZLEM ÖLÇÜSÜ` (`basılı tutma süresine göre 1–5 dolu beyaz kalp`) + el yazısı `Seni düşündüm`.
  3. **Fotoğraf (`photo`):** Bantlı Polaroid çerçeve (`.polaroid`, `-2deg` eğik, altında gün/ay yazısı). Tek seferlikse altında yanıp sönen `TEK SEFERLİK · KAPATINCA KAYBOLACAK` rozeti; mektup kapatıldığı an fotoğraf Storage'dan ve yerel önbellekten kalıcı silinir. İkinci açılışta kesikli çerçeveli `.spent-card` görünür: `Bu an bir kez görüldü` / `Tek seferlik bir fotoğraftı, şimdi sadece yıldızı kaldı`.
  4. **Sesli Yıldız (`voice`):** Yuvarlak oynatıcı `.player` (`#play`, 36 dalga çubuğu `#p-bars`, süre `#p-time`).
  5. **Kilitli Zamanlı Yıldız (`locked`):** Gökyüzünde dokunulduğunda yıldız hafifçe titrer (`shakeStar`), açılmaz; üstünde yüzen not çıkar: `Ham ham'ın yıldızı kilitli` / `9 Ocak 00:00'da açılacak · 53 gün kaldı` (kendi bıraktığın kilitli yıldızsa `Kilitli yıldızın` / `Beto 9 Ocak 00:00'da açabilecek`). Sunucu RLS de `star_secrets` erişimini kilit anına kadar engeller.
  6. **Ağ Hatası / Yeniden Deneme (`network`):** Mektup içinde `.spent-card`: `Bağlantı kurulamadı` / `İnternetini kontrol edip yıldızı yeniden açabilirsin` + `Tekrar dene` (`#l-retry`) butonu.
- **Görseller:** `18-yildiz-acma-zarf-ve-not-ela-{gunduz,gece}.png`, `19-yildiz-acma-seni-dusundum-{gunduz,gece}.png`, `20-yildiz-acma-polaroid-fotograf-{gunduz,gece}.png`, `20b-yildiz-acma-tek-seferlik-goruldu-{gunduz,gece}.png`, `21-yildiz-acma-sesli-not-{gunduz,gece}.png`, `22a-kilitli-zamanli-yildiz-uyarisi-{gunduz,gece}.png`, `22b-yildiz-acma-baglanti-hatasi-{gunduz,gece}.png`

### C.10 Ayarlar Paneli (`#settings`)
- **Dosyalar:** `index.html:242-282`, `src/main.ts:183-256,1361-1490`, `src/styles/main.css:1696-1869,2472-2512`
- **Öğeler:** Tutamaç `.handle` (aşağı sürükleyerek kapatma destekli), burç madalyonu `#s-medal`, başlık `Gökyüzümüz`, alt başlık `#s-who` (`HAM HAM · YENGEÇ` / `BETO · OĞLAK`), 3 istatistik kutusu (`YILDIZ`, altın renkli `AYNI AN`, `GÜN`), dağılım satırı `#st-who-split` (`Ham ham: X · Beto: Y`), uçtan uca şifreleme açıklaması, 4 ayar satırı ve en altta sürüm butonu `#s-ver` (`Bizim Gökyüzümüz · v1.2.8`).
- **Ayar Satırları ve Durum Metinleri:**
  1. `#s-push`: `Bildirimleri aç` / `Bildirimler açık ✓` / `Bildirim izni kapalı` / `Bildirimler (Ana Ekrana Ekle)`
  2. `#s-lock`: `Uygulama kilidi kur` (`Açılışta ve 2 dk arka planda kalınca 4 haneli şifre sorsun`) / kuruluysa `Uygulama kilidini kapat` (`Şu an açık · 4 haneli PIN (dokununca kaldırır)`)
  3. `#s-faceid` (yalnızca PIN kurulu ve cihaz destekliyorsa görünür): `Face ID ile açılışı aç` / açıkken `Face ID ile açılış açık ✓`
  4. `#s-out` (`.warn`): `Çıkış yap` (`Hesaptan ve gizli kelimeden çıkar, giriş ekranına döner`)
- **Görseller:** `23-ayarlar-paneli-{gunduz,gece}.png`

### C.11 Bildirim İzni Kartı (`#push-nudge`), Çevrimdışı Bant (`#net-banner`), Ana Ekrana Ekle (`#a2hs-tip`), Toast (`#toast`) ve Gizli `Teşhis` (`#perf-hud`)
- **Bildirim İzni Kartı (`#push-nudge`, `index.html:137-143`, `src/main.ts:1495-1537`):** Girişten `12 sn` sonra (izin `default` ise, en fazla 2 kez / 1 hafta arayla) çıkar: `Birbirinizi düşündüğünüzde haber vermemi ister misin?` — `Evet, haber ver` / `Şimdi değil`.
- **Çevrimdışı ve Kuyruk Bandı (`#net-banner`, `index.html:110-114`, `src/main.ts:258-297`):**
  - Çevrimdışı + kuyrukta yıldız var: `Bağlantı yok · N yıldız sırada, internet gelince bırakılacak`
  - Çevrimdışı (kuyruk boş): `Çevrimdışısın · Bıraktığın yıldızlar internet gelince gönderilecek`
  - Gönderiliyor: `Bekleyen N yıldız gökyüzüne bırakılıyor…`
  - Bağlantı geldi ama bekliyor: `N yıldız gönderilmeyi bekliyor` + `Tekrar dene` butonu.
- **Ana Ekrana Ekle İpucu (`#a2hs-tip`, `index.html:123-136`, `src/main.ts:1620-1634`):** Yalnızca tarayıcı sekmesinde (`!isStandalonePwa()`) bir kez gösterilir: `Ana ekrana ekle` / `Paylaş → Ana Ekrana Ekle'ye dokun`.
- **Üst Bildirim Hapı (`#toast`, `src/ui/toast.ts`) ve Yüzen Not (`.float-note`, `src/ui/floatNote.ts`):** `3.4 sn` (toast) ve `3.0 sn` (float-note) süreli geri bildirim kapsülleri.
- **Gizli `Teşhis` Paneli (`#perf-hud`, `src/ui/diagnostics.ts:1-214`):** Ayarlar altındaki `Bizim Gökyüzümüz · v1.2.8` yazısına `2.5 sn` içinde **5 kez** dokunulunca dinamik `import('./ui/diagnostics')` ile yüklenir; 5 saniyelik pencerede `FPS`, `avgMs`, `p95Ms`, `longTasks`, `domNodes`, `~layers`, `animations`, `canvasPx`, `dpr` değerlerini canlı gösterir (`fps < 48` ise `Düşük Güç Modu açık olabilir` uyarısı + `Kopyala` butonu).
- **Görseller:** `24-bildirim-izni-karti-{gunduz,gece}.png`, `25-cevrimdisi-bant-ve-ana-ekrana-ekle-{gunduz,gece}.png`, `26-teshis-paneli-{gunduz,gece}.png`


---

## D. Tasarım Değerleri (Renkler, CSS Değişkenleri, Tipografi, Yarıçaplar, Boşluklar, `z-index` ve Görünüm Alanı)

### D.1 CSS Özel Özellikleri (`:root` ve Kullanıcı Temaları — `src/styles/main.css:67-155`)

| Değişken | `:root` (Varsayılan / Beto bazlı) | `body[data-me="hamham"]` | `body[data-me="beto"]` | Açıklama |
| :--- | :--- | :--- | :--- | :--- |
| `--blue` / `--blue-glow` | `#a8d4ff` / `rgba(84,150,255,.7)` | Aynı | Aynı | Ham ham yıldız ve rozet rengi |
| `--pink` / `--pink-glow` | `#ffb3da` / `rgba(255,92,172,.7)` | Aynı | Aynı | Beto yıldız ve rozet rengi |
| `--gold` / `--gold-glow` | `#ffdc93` / `rgba(255,196,92,.75)` | Aynı | Aynı | `"Aynı An"` bağları, zamanlı kilit, Ocak 2027 kartı |
| `--sky-1` .. `--horizon` | `#03050e`, `#08122b`, `#17284d`, `#3e5480` | Saatle dinamik güncellenir | Saatle dinamik güncellenir | `@property <color>` gökyüzü geçişleri |
| `--ground-bottom` | `#08171c` | Aynı | Aynı | Gece çayırı ve ekran en alt dikişsiz zemin rengi |
| `--accent` / `--accent-strong` | `#ffc6e2` / `#ff8cc2` | `#c4e0ff` / `#5b9dff` | `#ffd3e8` / `#ff6fb0` | Birincil buton (`YAZ`, `Gökyüzüne bırak`), odak halkası |
| `--ink` | `#fff5fb` | `#eef5ff` | `#fff4fa` | Ana metin rengi |
| `--ink-soft` | `rgba(255,236,247,.74)` | `rgba(222,234,255,.76)` | `rgba(255,232,244,.78)` | İkincil metin / etiket rengi |
| `--ink-faint` | `rgba(255,236,247,.48)` | `rgba(222,234,255,.48)` | `rgba(255,232,244,.5)` | Üçüncül / ipucu metin rengi |
| `--line` / `--glass-hi` | `rgba(255,255,255,.14)` / `rgba(255,255,255,.22)` | Aynı | Aynı | İnce cam kenarlığı ve iç üst parlama (`solid-glass`) |
| `--sheet` | `rgba(28,12,42,.97)` | `rgba(10,18,48,.97)` (`#compose`: `#11183c`) | `rgba(46,14,44,.97)` (`#compose`: `#2d102c`) | Alt panel, toast ve yüzen not yüzeyi (opak, `backdrop-filter` YOK) |
| `--petal-base/mid/tip` | `#c2185b` / `#ff8ab8` / `#fff5f9` | `#3456b8` / `#a6c4ff` / `#f6f9ff` | Pembe (varsayılan) | Lilyum taç yaprakları ve mum mumu gradyanı |
| `--leaf-1` / `--leaf-2` | `#1b553a` / `#4f9a63` | Aynı | Aynı | Zambak/lilyum sap ve yaprak yeşili |
| `--paper` / `--paper-ink` / `--paper-accent` | `#fff6fa` / `#4f1a37` / `#d4457f` | `#f4f8ff` / `#1a2a58` / `#3b72d6` | Pembe (varsayılan) | Mektup kağıdı, mürekkep ve vurgu rengi |
| `--env-1` / `--env-2` / `--env-3` | `#f6d3e3` / `#e9b6cd` / `#fae3ee` | `#d7e4fb` / `#b9cdf2` / `#e7effd` | Pembe (varsayılan) | Zarf cebi, sırtı ve kapağı |

### D.2 Tuval (Canvas) ve Özel Öğe Renk Paletleri
- **Saate Göre Gökyüzü Paleti (`SKY_PALETTE`, `src/sky/solar.ts:32-37`):**
  - `night`: `['#03050e', '#08122b', '#17284d', '#3e5480']` (`daylight: 0`)
  - `dawn`: `['#0b1230', '#2c3a6c', '#9b7390', '#f0b48c']` (`daylight: 0.5`)
  - `day`: `['#1d4c94', '#3a78c4', '#7cb0e4', '#cde4f8']` (`daylight: 1.0`)
  - `dusk`: `['#080d26', '#262b5c', '#9a5670', '#ec9a6c']` (`daylight: 0.45`)
- **Kullanıcıya Göre Ay Işığı Paleti (`MOON_TINT`, `src/sky/skyRenderer.ts`):**
  - `hamham` (Gümüş-Krem): Yüzey `['#ffffff', '#fffdf2', '#f0ead8']`, krater `rgba(176,168,152,0.22)`
  - `beto` (Ela-Krem Ay Işığı): Yüzey `['#fffaf0', '#f5e8cc', '#e4cfa3']`, krater `rgba(154,132,96,0.20)`, dış statik ela halka `rgba(176,141,63,0.06)` (`r = ayÇapı * 1.8`)
- **Yıldız Renkleri (`COLOR_HEX` & Ela Yıldız, `src/sky/skyRenderer.ts:1448-1506`):**
  - `blue`: `#a8d4ff`, `pink`: `#ffb3da`, `gold`: `#ffdc93`
  - `hazel` (Ela yıldız): Çekirdek `#f1c97a` → orta `#b08d3f` → zeytin-ela `#7a8a3a` → dış halka `#5b3d1e`
- **Kayan Yıldız Tonları (`METEOR_PALETTES`):** `ice` (`184,226,255`), `gold` (`255,222,158`), `rose` (`255,198,228`), `white` (`242,248,255`)
- **Pembe Fiyonk (`PINK_BOW_COLORS`, `src/lib/illustrations.ts:197-203`):** Kanat `#f6b3c8`, gölge `#ec8fae`, düğüm `#e57a9d`, kuyruk `#ec8fae`, ince parlama `#ffd9e6` (`opacity: 0.7`)
- **Yön Yıldızı:** Çekirdek `#ffffff`, kollar `#dbe6ff`
- **Yelkenli Tekne:** Direk `#d4b499`, yelken `#f4efe6`, flama `#ec7a98`, gövde `#7c5368 → #996a80 → #684457`
- **Uçak & Tekne Pankartı:** İpek kağıt `#fae0eb → #f2c3d7 → #e6a5c2`, kenar şeridi `#cf7ba0`, yazı `#531b48`, kalp `#ffffff`
- **Tüm Kalpler:** Kesinlikle `#ffffff` (saf beyaz).

### D.3 Yazı Tipleri ve Boyut Ölçeği (`public/fonts/*.woff2`, `latin` + `latin-ext`)
1. **`--font-script` (`"Great Vibes"`):**
   - Kurulum ana başlığı `.ob h1`: `clamp(54px, 15vw, 70px)` (klavye açıkken `clamp(32px, 9vw, 40px)`), `line-height: 1.38`, kesilmeyi önleyen `.22em .28em .3em` iç boşluk.
   - Açılış splash `.ls-title`: `clamp(44px, 12vw, 56px)`
   - Kilit başlığı `.lk-title` & aylık arşiv `#tlabel b`: `44px`
   - Mektup gönderen `.from`: `42px` | `"Seni düşündüm"` `.ltext.miss`: `40px`
   - Gökyüzü karşılama `.sky-cap b`: `clamp(38px, 10vw, 48px)`
   - Ayarlar başlığı `.sheet-title`: `38px` (`#compose .sheet-title`: `28px`)
   - Kimlik kartı ismi `.who-card .nm` & `.hello`: `36px`
   - Boş gökyüzü ipucu `.empty-hint`: `27px` | Sayaç etiketi `.cd-label` & Polaroid alt yazı: `22px` | Uçak pankartı: `21px` | Tekne pankartı: `20px` | Mum kavanozu `B ♡ H`: `19px`
2. **`--font-letter` (`"Cormorant Garamond"` italic/serif):**
   - Açılan mektup metni `.ltext`: `23px / 34px` (`repeating-linear-gradient` satır çizgili)
   - Yazma kartı `#compose textarea`: `17px / 1.38` (genel `textarea`: `21px`)
   - Pusula sözü `.compass-quote`: `16.5px`
3. **`--font-ui` (`"Nunito"` 400–900):**
   - PIN rakamları `.pad button`: `28px` (`600`) | İstatistik sayıları `.stats b`: `24px` (`900`, `tabular-nums`)
   - Sayaç gün `.cd-days b`: `16px` (`900`) | Sayaç saat `.cd-time`: `13.5px` (`800`, `tabular-nums`)
   - Form girdileri `.field input`: `16px` (`700` — iOS otomatik yakınlaştırmayı önlemek için `≥16px` zorunlu!)
   - Birincil buton `.btn-primary` & ayar başlığı `.set-item span`: `15px` (`800–900`)
   - Büyük harf takip etiketleri (`.ob-eyebrow`, `.lk-sub`, `.sky-cap small`, `.act-lb`, `.cd-days small`): `7px–11px` (`800–900`, `letter-spacing: .12em–.32em`).

### D.4 Köşe Yarıçapları (`border-radius`) ve Boşluk / Dokunma Standartları
- **Tam Yuvarlak / Hap (`999px` / `50%`):** `#countdown`, `.btn-primary`, `.chip`, `.att-btn`, `.seg`, `.sched-preset`, `.toast`, `.net-banner`, `.player`, `.lclose`, `.lk-faceid`, `.icon-btn` (`44×44`), `.act-ic` (`58×58`), `.pad button` (`74×74`).
- **Kart Yarıçapları:** Alt paneller `.sheet-card`: `30px 30px 0 0` | Kimlik kartı `.who-card`: `26px` | Mektup `.letter`, `#push-nudge`, `#compass-pop`: `22px` | Girdi `.field input`, `.att-card`, `#a2hs-tip`: `20px` | Ayar satırı `.set-item`, `.stats div`, `.sched-box`: `18px` | `#perf-hud`, `.spent-card`: `16px` | `.float-note`, `.att-thumb`: `14px` | Zarf `.env-back`, `.sched-dt-wrap`: `12px` | Polaroid `.polaroid`: `3px`.
- **Dokunma Alanı Kuralı:** Tüm etkileşimli butonlar en az **`44×44 px`** (`min-height: 44px`, `.icon-btn`, `.att-x`, `.a2hs-close`, `.diag-x`, `.chip`, `.sched-preset`, `.link-btn`, `.set-ver`).

### D.5 Katman Sırası (`z-index` Yığını)

| `z-index` | Öğe / Seçici | Rolü |
| :--- | :--- | :--- |
| `0` | `#scene`, `#sky-canvas`, `#lilies` | Tam ekran gökyüzü tuvali ve arka çayır |
| `1` | `#ui` | Arayüz taşıyıcı katmanı (`pointer-events: none`, alt öğeler `auto`) |
| `2` | `#sky`, `.ground`, `.grass-front` | Gökyüzü dokunma alanı ve alt gece çayırı |
| `3` | `.candle-white-heart` | Mum fitilinden yükselen beyaz kalp |
| `4` | `#tlabel`, `.hazel-ring-fx` | Aylık 3B arşiv etiketi ve ela yıldız `0.6s` halkası |
| `5` | `.center-row` | Alt eylem satırı (`DÜŞÜNDÜM`, Mum, `YAZ`) |
| `6` | `.top` | Üst bar (`#countdown` ve `#menu`) |
| `8` | `#compass-pop` | Yön yıldızı pusula kartı |
| `21` | `.sync-white-heart` | `"Aynı An"` merkez beyaz kalp animasyonu |
| `22` | `.float-note`, `.ghost`, `.ghost-img` | Yüzen bilgi baloncuğu ve uçan mektup hayaleti |
| `23` | `#a2hs-tip` | Ana ekrana ekleme ipucu |
| `24` | `#push-nudge` | Bildirim izni isteme kartı |
| `25` | `.sheet` (`#compose`, `#settings`) | Alt çekmece paneller |
| `26` | `.modal` (`#letter-modal`) | Zarf ve mektup açma ekranı |
| `30` | `#onboard` | Kurulum / giriş ekranı |
| `35` | `#launch-splash` | Kurulum sonrası açılış sahne kapısı |
| `40` | `#lock` | PIN / Face ID kilit ekranı |
| `48` | `#net-banner` | Çevrimdışı / bekleyen yıldız durum bandı |
| `50` | `#toast` | Üst bildirim kapsülü |
| `60` | `#perf-hud` | Gizli `Teşhis` performans paneli |

### D.6 `safe-area`, `--app-h` ve `--kb` Kullanımı (`src/main.ts:832-955`)
- **`viewport-fit=cover`** (`index.html:5`) aktiftir; `:root` içinde `--sat`, `--sar`, `--sab`, `--sal` tanımlıdır.
- **`--app-h`:** `setAppHeight()` tarafından atanır. iOS standalone modda `Math.max(window.innerHeight, documentElement.clientHeight, window.screen.height)` alınarak alt çubuğun arkasındaki tam ekran boyu bulunur; bir `input`/`textarea` odaklıyken ekran boyu küçülürse `--app-h` **dondurulur** (arka plan sahnesi büzülmez).
- **`--kb` ve `body.kb-active`:** `window.visualViewport` üzerinden klavyenin `#ui` alt kenarını ne kadar örttüğü piksel cinsinden ölçülür (`rawVvKb > 60`). `#compose.open .sheet-card` `transform: translate3d(0, calc(-1 * var(--kb, 0px)), 0)` ile tam klavye üstüne oturur; `#onboard` ise `calc(var(--app-h) - var(--kb))` yüksekliğe geçip dekoratif öğeleri gizleyerek şifre kutusunu klavye üstünde tutar.

---

## E. Animasyonlar, Etkileşimler ve Performans Kuralları

### E.1 Değişmez Performans Kuralları
- **Sıfır Blur / Filtre:** Hiçbir yerde `backdrop-filter`, CSS `filter: blur()` / `drop-shadow()` veya SVG `<feGaussianBlur>` kullanılmaz (`.solid-glass` ve `.glass-pop` opak/yarı-saydam katmanlı dolgu kullanır).
- **Yalnızca GPU Özellikleri:** Sürekli animasyonlar yalnızca `transform` (`translate3d`, `scale3d`, `rotate3d`) ve `opacity` kullanır; `will-change` yalnızca aktif hareket sırasında (`.swiping`, `.dive-prep`, `.candle-bow.bounce`, `.hazel-ring-fx`) verilir.
- **Kare Hızı ve Uyku Politikası (`SkyEngine`):**
  - Etkileşim varken (`active` / `boostMotion`): `60 fps` `requestAnimationFrame`.
  - Boşta (`idle`): `30 fps`.
  - `20 saniye` dokunulmazsa (`body.deep-idle`): `0 fps` (tuval döngüsü, yıldız göz kırpması, kayan yıldızlar, zambak salınımı ve mum alevi durur; tek dokunuşta anında uyanır).
  - Alt panel/mektup/kilit açıkken (`body.quiet`): Arka plan CSS animasyonları `animation-play-state: paused` olur, tuval durur.
  - Sekme gizliyken (`document.hidden`): Tüm `rAF`, sayaç, araç zamanlayıcıları ve teşhis örnekleyicisi tamamen durur.
- **`prefers-reduced-motion: reduce`:** Tüm salınım/parlama animasyonları kapanır; tekne yatay kaymak yerine ekran ortasında `3.2 sn`'de yumuşakça belirip solar; ela yıldız halkası büyümek yerine opaklıkla solar.

### E.2 Öğe Bazlı Hareketler ve Süreler

| Öğe / Etkileşim | Süre & Eğri (`easing`) | Davranış Detayı |
| :--- | :--- | :--- |
| **Açılış Dive-in (`#launch-splash`)** | `720ms–1050ms` `cubic-bezier(.16,1,.3,1)` | Splash `scale(1 -> 1.2)` ile dağılırken `#scene` `scale(1.13 -> 1)` ve `.ground` `translateY(18px -> 0)` ile sahneye dalar. |
| **Zaman Hızlandırma (`startTimelapse`)** | `5.2s–9.0s` kosinüs eğrisi | Son ziyaretten `≥45 dk` geçmişse gökyüzü son görülen saatten şimdiki saate hızlandırılmış akar (`22:10 → 09:40`). |
| **Gökyüzü Yatay Kaydırma (`#sky`)** | Atalet sönümü `exp(-dt/340)` | `4x` dünya genişliğinde sürükleme, uçlarda `0.35` lastik direnci ve bırakınca yumuşak süzülme (`glide`). |
| **Aylık 3B Arşiv (`startTravel`)** | `720ms` `1 - (1-k)^3` | Boş gökyüzüne `500ms` basılı tutunca `0.52x` ölçeğe uzaklaşır; komşu aylar `±26°` perspektif eğimiyle dizilir. |
| **Ay / Güneş Etkileşimleri** | Tek tık `400ms` / Çift tık `7000ms` / Basılı tutma `500ms` | Tek dokunuş evre/saat başlığı gösterir; çift dokunuş yıldızları `7 sn` kalp şekline dizer; basılı tutma `"Sensiz gökyüzü"` moduna alır. |
| **Yön Yıldızı Pusulası** | Açılış `280–320ms`, ibre `500ms`, görünür kalma `3000ms` | İbre yön yıldızının gerçek ekran açısına döner, `3 sn` sonra kapanır. |
| **Uçak (`PlaneController`)** | `27–32 sn` (soldan sağa) | Yumuşak sinüs yüksekliği + `1.8 sn` periyotlu salınım + arkada teğet eğimli `18` dilimli dalgalanan ipek pankart. |
| **Yelkenli Tekne (`BoatController`)** | `28–34 sn` (soldan sağa), dokununca `420ms` solma | `4 sn` periyotta `±4px` dalga salınımı, `9` noktalı yıldız tozu izi, arkada dalgalanan pankart. |
| **`DÜŞÜNDÜM` (`#btn-miss`)** | Kısa dokunuş veya `0–3 sn` basılı tutma | Basılı tuttukça `.charge` halkası dolar, yıldız boyutu `7 -> 15.5` büyür (`1–5` özlem kalbi); bırakınca mumdan kuyruklu yıldız + beyaz kalp yükselir. |
| **Yeni Yıldız Doğuşu (`launchComet`)** | `1250ms` kübik Bezier (`rise`) / `950ms` (`streak`) | Gönderilen yıldız mum fitilinden hedef konuma uçar, varışta halka patlaması + mum alevi parlaması (`850ms`) + fiyonk zıplaması (`400ms`) tetikler. |
| **Ela Yıldız Halkası (`.hazel-ring-fx`)** | `600ms` `cubic-bezier(.22,.61,.36,1)` | İlk oluştuğunda bir kez `#f1c97a` ince halka `scale(0.55 -> 2.3)` ile yayılıp kaybolur. |
| **Alt Çekmeceler (`#compose`, `#settings`)** | Açılış/kapanış `280–380ms`, swipe eşiği `76px` veya hız `>0.55 px/ms` (`≥56px`) | Tutamaçtan veya kart en üstteyken aşağı çekilerek kapatılabilir (`src/ui/sheetSwipe.ts`). |
| **Zambak / Lilyum & Mum Alevi** | Zambak `6.8–7.6 sn`, Alev `1.9 sn` | Gece esintisinde `±2°` kök eksenli salınım; mum alevi hafif titreşim ve yıldız gönderiminde `flameFlare`. |
| **Sayaç Döner Rakamlar (`setRoll`)** | `550ms` `var(--ease)` | Yalnızca değişen basamak yukarı kayarak (`oOut` / `oIn`) güncellenir. |

---

## F. Özellik Listesi ve Kişisel Detaylar

### F.1 Kişiler ve Türkçe İsim Ekleri (`src/lib/people.ts:1-22`)
| Alan | `PEOPLE.hamham` | `PEOPLE.beto` | Kullanıldığı Yer |
| :--- | :--- | :--- | :--- |
| `.name` | `Ham ham` | `Beto` | Karşılama, bildirimler, tekne pankartı, istatistik |
| `.dat` *(Yönelme)* | `Ham ham'a` | `Beto'ya` | Yazma kartı başlığı (`#c-title`) |
| `.abl` *(Ayrılma)* | `Ham ham'dan` | `Beto'dan` | Açılan mektup başlığı (`#l-from`), fotoğraf `alt` metni |
| `.gen` *(İlgi/Tamlayan)* | `Ham ham'ın` | `Beto'nun` | Gönderim sonrası toast (`Artık Beto'nun gökyüzünde`), kilitli yıldız notu |
| `.constellation` / `.sign` | `YENGEÇ` / `♋︎` (`\u264B\uFE0E`) | `OĞLAK` / `♑︎` (`\u2651\uFE0E`) | Giriş kartları, ayarlar alt başlığı, tüm madalyonlar |

### F.2 Yıldız Türleri ve Seçenekleri (`src/types.ts`, `src/lib/stars.ts`)
1. **`note` (Yazılı yıldız):** `1–600` karakter şifreli mektup + isteğe bağlı hazır çipler + taslak kaydı (`gokyuzu.draft.v4.<who>`).
2. **`miss` (`"Seni düşündüm"` yıldızı):** Tek dokunuşla veya basılı tutarak (`held: 0..3 sn` → `1..5` özlem kalbi) anında gönderilen yıldız.
3. **`photo` (Fotoğraflı yıldız):** `Kalıcı` (`once: false`) veya `Tek seferlik` (`once: true` — alıcı açıp kapattığında hem Storage'dan hem yerel önbellekten silinir, `spent: true` olur).
4. **`voice` (Sesli yıldız):** Maks. `60 saniye` mikrofon kaydı + `36` çubuklu ses dalga tepesi (`peaks`) + mektup içi oynatıcı.
5. **Zaman Kilitli Yıldız (`unlockAt`):** Tüm yıldız türlerine eklenebilir (`Yarın sabah 09:00`, `Bir hafta sonra 09:00`, `9 Ocak 00:00` veya özel tarih). Sunucu saati (`syncServerClock`) baz alınır; kilit açılana dek `star_secrets` ve `media` Storage RLS tarafından kilitli tutulur. Kilit anı geldiğinde altın uyanış halkası (`markStarUnlockWake`) ve bildirim tetiklenir.
6. **`"Aynı An"` Altın Eşleşmesi (`src/lib/links.ts`):** İki farklı kullanıcının `1 saat` (`LINK_MS = 3_600_000`) içinde bıraktığı en yakın yıldız çiftleri birbirine bağlanır, ikisi de altına (`#ffdc93`) döner ve aralarında altın çizgi parlar.

### F.3 Dört Özel Kişisel Detay
1. **Pembe Fiyonk (`<PinkBow />`, `src/lib/illustrations.ts:189-249`):** Özgün, karaktersiz, simetrik 6 path'li fiyonk. Üç yerde bulunur: (a) Mumun `B ♡ H` etiket bandının sağ üst köşesinde `-12°` eğik (yıldız bırakılınca zıplar), (b) uçak pankartının ipe bağlandığı sağ uçta, (c) yelkenli teknenin direk tepesinde.
2. **Ela Yıldız (`src/lib/hazel.ts:1-62`):** Veritabanı şeması değiştirmeden `fnv1a32(star.id) % 12 === 0` olan yıldızlar (en eski ilk yıldız hariç, kilitliyse kilidi açıldıktan sonra) ela tonlarında çizilir; doğduğunda `600ms` ela halka yayar, mektubu açıldığında altında gönderene göre değişen italik ela cümlesi (`#l-hazel`) görünür.
3. **Ela Ay Işığı (`src/sky/skyRenderer.ts:1709-1760`):** Yalnızca `beto` hesabında Ay yüzeyi sıcak ela-krem tonlarında ve çevresinde çok hafif statik ela halesiyle çizilir (`hamham` hesabında klasik gümüş-krem).
4. **Okyanus & Yön Bulma (`src/sky/greetings.ts`, `src/sky/boat.ts`, `src/main.ts:440-522`):** Gece (`22:00–05:00`) ve sabah (`05:00–11:00`) karşılama havuzlarındaki okyanus/ufuk/rüzgar/yön cümleleri, gökyüzünde süzülen yelkenli tekne ve dokunulduğunda pusula kartı açan sabit **Yön Yıldızı**.

### F.4 Güvenlik, Bildirim ve Çevrimdışı Özellikler
- **Ayarlar Seçenekleri:** Web Push bildirim aboneliği (`#s-push`), 4 haneli PIN kurma/kaldırma (`#s-lock`, `2 dk` arka plan oto-kilit), WebAuthn `Face ID / Touch ID` (`#s-faceid`), güvenli çıkış (`#s-out`), 5 dokunuşla gizli `Teşhis` (`#s-ver`).
- **Çevrimdışı Şifreli Kuyruk (`src/lib/outbox.ts`):** İnternet yokken bırakılan yıldızlar şifrelenmiş halde `IndexedDB` (`gokyuzu-outbox-v1`) kuyruğuna yazılır; bağlantı geldiğinde veya uygulama uyandığında otomatik gönderilir.
- **Uygulama İkon Rozeti (`updateAppBadge`):** Karşı taraftan gelen, kilidi açılmış ve henüz okunmamış yıldız sayısını ana ekran ikonunda gösterir.

---

## G. Bilinen Sorunlar ve Yapılmamış İşler

### G.1 Açık / Bilinen Teknik ve UX Noktaları
1. **GitHub Deposu Görünürlüğü (Kullanıcı İşlemi Gerekli):** Uzak depo (`https://github.com/Hatem-son/bizim-gokyuzumuz`) şu an `Public` durumdadır (`HTTP 200`). İçinde gizli anahtar bulunmasa da uygulamanın yalnızca iki kişiye özel kalması için GitHub → *Settings → Change repository visibility → Make private* yapılmalıdır.
2. **Kurulum Şifre Adımında (`#step-auth`) Mobil Odak/Hata Sırası (`src/ui/onboard.ts:179,202`):** `#auth-pass` üzerinde `focus` olayı `#auth-err` hatasını temizlemeye (`clearErr(authErr)`) bağlıdır. Kullanıcı mobilde `Giriş yap` butonuna dokunduğunda input odağı düşer; şifre yanlışsa kod önce `authErr.hidden = false` yapıp hemen ardından `authPass.focus()` çağırdığı için `focus` dinleyicisi hata mesajını anında tekrar gizleyebilmektedir (klavyeden `Enter` ile gönderildiğinde input zaten odaklı olduğundan hata görünür kalır). Yeni tasarımda `clearErr` yalnızca `input` olayında çalışmalı, `focus` olayında hata silinmemelidir.
3. **Gerçek iPhone Cihaz Üzerinde `Teşhis` Ölçümü (Aşama 1.3):** Masaüstü ve 6× CPU kısıtlı mobil WebKit/Chromium ölçümleri tamamlanmıştır (`~18–20ms` kare süresi, `771` DOM düğümü); fiziksel iPhone ana ekran PWA kurulumunda 5 dokunuşla `Teşhis` çıktısının alınıp doğrulanması kullanıcı testi olarak açıktır.

### G.2 Önceki Yol Haritasından Henüz Yapılmamış Aşamalar (İleride İstenirse)
1. **Aşama 3 — Canlı Yıldız Göstergesi (`pair:live`) ve Yazma Kartından Gökyüzüne FLIP Uçuşu:**
   - Karşı taraf yazma kartını açtığında veya yazarken özel Supabase Realtime (`pair:live`, `private: true`) kanalı üzerinden sade bir canlı parıltı göstergesi.
   - Gönderilen yazılı kartın doğrudan kendi kutusundan küçülüp yıldız konumuna kesintisiz `1250ms` FLIP dönüşümü.
2. **Aşama 4 — `'draw'` Yıldız Türü (Çizim Tahtası ve Canlı Çizim Akışı) + Otomatik Test Paketi:**
   - Yazma kartında el çizimi / özgün damga tahtası (`kind: 'draw'`), uçtan uca `AES-GCM` şifreli vektör çizim kaydı ve karşı taraf o anda açıksa `pair:draw` kanalı üzerinden şifreli canlı çizim izleme.
   - `npm test` birim test paketi (`crypto`, `hazel`, `links`, `stars` zaman kilidi ve Türkçe ek testleri).

---

## H. Ekran Görüntüleri Dizini (`ekranlar/` — `390×844`, Gündüz & Gece)

Tüm görüntüler `390×844` iPhone boyutunda (`@2x` Retina), **Gündüz (`13:30`)** ve **Gece (`23:30`)** olmak üzere çiftli üretilmiştir:

| # | Gündüz Dosyası | Gece Dosyası | Ekran / Durum |
| :--- | :--- | :--- | :--- |
| 01 | `01-giris-1-kimlik-secimi-gunduz.png` | `01-giris-1-kimlik-secimi-gece.png` | Giriş Adım 1: Kimlik seçimi (`Ham ham` & `Beto`) |
| 02 | `02-giris-2-hesap-sifresi-gunduz.png` | `02-giris-2-hesap-sifresi-gece.png` | Giriş Adım 2: Hesap şifresi ekranı |
| 02b | `02b-giris-2-hesap-sifresi-hata-gunduz.png` | `02b-giris-2-hesap-sifresi-hata-gece.png` | Giriş Adım 2: Hatalı şifre durumu (`#auth-err`) |
| 03 | `03-giris-3-gizli-kelime-gunduz.png` | `03-giris-3-gizli-kelime-gece.png` | Giriş Adım 3: Ortak gizli kelime ekranı |
| 04 | `04-acilis-dive-in-splash-gunduz.png` | `04-acilis-dive-in-splash-gece.png` | Saate göre değişen açılış kapısı (`#launch-splash`) |
| 05 | `05-uygulama-kilidi-pin-faceid-gunduz.png` | `05-uygulama-kilidi-pin-faceid-gece.png` | 4 haneli PIN + `Face ID ile aç` kilit ekranı |
| 06 | `06-ana-gokyuzu-bos-hamham-gunduz.png` | `06-ana-gokyuzu-bos-hamham-gece.png` | Boş ana gökyüzü (`Ham ham` mavi tema) |
| 07 | `07-ana-gokyuzu-bos-beto-ela-ay-gunduz.png` | `07-ana-gokyuzu-bos-beto-ela-ay-gece.png` | Boş ana gökyüzü (`Beto` pembe tema + Ela Ay Işığı) |
| 08 | `08-ana-gokyuzu-dolu-yildizlar-gunduz.png` | `08-ana-gokyuzu-dolu-yildizlar-gece.png` | Yıldızlı gökyüzü (mavi, pembe, altın `"Aynı An"`, ela, kilitli) |
| 09a | `09a-ana-gokyuzu-sensiz-mod-gunduz.png` | `09a-ana-gokyuzu-sensiz-mod-gece.png` | Ay/Güneş'e basılı tutma: `"Sensiz gökyüzü"` modu |
| 09b | `09b-ana-gokyuzu-kalp-dizilimi-gunduz.png` | `09b-ana-gokyuzu-kalp-dizilimi-gece.png` | Ay/Güneş'e çift dokunma: `7 sn` Kalp Dizilimi |
| 10 | `10-yon-yildizi-pusula-gunduz.png` | `10-yon-yildizi-pusula-gece.png` | Yön yıldızı dokunuşu ve canlı pusula kartı (`#compass-pop`) |
| 11 | `11-ucak-ve-pembe-fiyonk-pankart-gunduz.png` | `11-ucak-ve-pembe-fiyonk-pankart-gece.png` | Soldan sağa uçan uçak + pembe fiyonklu pankart |
| 12 | `12-yelkenli-tekne-ve-pankart-gunduz.png` | `12-yelkenli-tekne-ve-pankart-gece.png` | Soldan sağa süzülen yelkenli tekne + pankart |
| 13 | `13-aylik-gokyuzu-arsivi-karusel-gunduz.png` | `13-aylik-gokyuzu-arsivi-karusel-gece.png` | Aylık 3B gökyüzü arşivi / yıldız listesi (`#tlabel`) |
| 14 | `14-yazma-karti-varsayilan-gunduz.png` | `14-yazma-karti-varsayilan-gece.png` | Yazma kartı (`#compose` — varsayılan görünüm ve çipler) |
| 15 | `15-yazma-karti-zamanli-kilit-gunduz.png` | `15-yazma-karti-zamanli-kilit-gece.png` | Yazma kartı — Zamanlı kilit (`9 Ocak, gece yarısı`) |
| 16 | `16-yazma-karti-fotograf-ekli-gunduz.png` | `16-yazma-karti-fotograf-ekli-gece.png` | Yazma kartı — Fotoğraf eki (`Kalıcı / Tek seferlik`) |
| 17 | `17-yazma-karti-ses-kaydi-canli-gunduz.png` | `17-yazma-karti-ses-kaydi-canli-gece.png` | Yazma kartı — Canlı ses kaydı dalga çubukları |
| 17b | `17b-yazma-karti-ses-onizleme-gunduz.png` | `17b-yazma-karti-ses-onizleme-gece.png` | Yazma kartı — Kaydedilmiş ses önizleme oynatıcısı |
| 18 | `18-yildiz-acma-zarf-ve-not-ela-gunduz.png` | `18-yildiz-acma-zarf-ve-not-ela-gece.png` | Yıldız açma — Mektup ve Ela Yıldız özel alt satırı |
| 19 | `19-yildiz-acma-seni-dusundum-gunduz.png` | `19-yildiz-acma-seni-dusundum-gece.png` | Yıldız açma — `"Seni düşündüm"` + 5'li Özlem Ölçüsü |
| 20 | `20-yildiz-acma-polaroid-fotograf-gunduz.png` | `20-yildiz-acma-polaroid-fotograf-gece.png` | Yıldız açma — Polaroid fotoğraf + `TEK SEFERLİK` rozeti |
| 20b | `20b-yildiz-acma-tek-seferlik-goruldu-gunduz.png` | `20b-yildiz-acma-tek-seferlik-goruldu-gece.png` | Yıldız açma — Açılıp silinmiş tek seferlik fotoğraf kartı |
| 21 | `21-yildiz-acma-sesli-not-gunduz.png` | `21-yildiz-acma-sesli-not-gece.png` | Yıldız açma — Sesli yıldız oynatıcısı |
| 22a | `22a-kilitli-zamanli-yildiz-uyarisi-gunduz.png` | `22a-kilitli-zamanli-yildiz-uyarisi-gece.png` | Kilitli zamanlı yıldıza dokunulduğunda çıkan kilit uyarısı |
| 22b | `22b-yildiz-acma-baglanti-hatasi-gunduz.png` | `22b-yildiz-acma-baglanti-hatasi-gece.png` | Yıldız açma — Ağ hatası ve `Tekrar dene` kartı |
| 23 | `23-ayarlar-paneli-gunduz.png` | `23-ayarlar-paneli-gece.png` | Ayarlar paneli (`#settings`) |
| 24 | `24-bildirim-izni-karti-gunduz.png` | `24-bildirim-izni-karti-gece.png` | Bildirim izni isteme kartı (`#push-nudge`) |
| 25 | `25-cevrimdisi-bant-ve-ana-ekrana-ekle-gunduz.png` | `25-cevrimdisi-bant-ve-ana-ekrana-ekle-gece.png` | Çevrimdışı kuyruk bandı (`#net-banner`) ve Ana Ekrana Ekle (`#a2hs-tip`) |
| 26 | `26-teshis-paneli-gunduz.png` | `26-teshis-paneli-gece.png` | Gizli `Teşhis` performans paneli (`#perf-hud`) |

---

## I. Paket Öncesi Gizli Bilgi Taraması (`secret|key|token|password`)

`arayuz-paketi.zip` oluşturulmadan önce pakete girecek tüm metin dosyaları (`ARAYUZ-DURUM-RAPORU.md`, `index.html`, `package.json`, `public/manifest.webmanifest` ve `src/` altındaki 38 kaynak dosyanın tamamı — toplam **42 metin dosyası** + `ekranlar/` PNG görselleri) büyük/küçük harf duyarsız `secret|key|token|password|service_role|vapid_private` düzenli ifadesiyle taranmıştır:

- **Pakete Dahil Edilmeyen Dizin ve Dosyalar:** `.env`, `.env.local`, `.env.production`, `.vercel/`, `node_modules/`, `.git/`, `dist/`, `supabase/` **KESİNLİKLE pakete alınmamıştır.**
- **Gerçek Gizli Anahtar / Jeton / Şifre Değeri (`realSecrets`):** **`0` (SIFIR)** — Hiçbir JWT (`eyJ...`), `service_role` anahtarı, `VAPID` özel anahtarı, Supabase proje URL'si/anon anahtar değeri veya kullanıcı şifresi bulunmamaktadır.
- **Kaynak Koddaki `secret|key|token|password` Kelime Eşleşmeleri (`366` satır / `22` kod dosyası — tamamı güvenli kod tanımlayıcısıdır):**
  - `index.html` (`5` eşleşme): `enterkeyhint="enter"`, `type="password"`, `autocomplete="current-password"`, `id="step-key"`.
  - `src/lib/crypto.ts` (`59` eşleşme): `CryptoKey`, `deriveAesKey`, `unlockWithSecret`, `STORAGE_KEYS`, `IDB_KEY_ID = 'active-aes-key'` (yalnızca Web Crypto API fonksiyon ve sabit adları).
  - `src/lib/stars.ts` (`40` eşleşme), `src/ui/onboard.ts` (`39` eşleşme), `src/lib/lock.ts` (`37` eşleşme), `src/sky/skyRenderer.ts` (`38` eşleşme), `src/main.ts` (`48` eşleşme), `src/styles/main.css` (`26` eşleşme — `@keyframes`), `src/ui/whiteHeart.ts` (`14` eşleşme — `Keyframe`), `src/lib/storage.ts` (`11` eşleşme — `STORAGE_KEYS`), `src/lib/supabase.ts` (`10` eşleşme — `import.meta.env.VITE_SUPABASE_ANON_KEY` ortam değişkeni okuma referansı ve `signInWithPassword` fonksiyon adı), `src/lib/outbox.ts` (`5` eşleşme — `keyPath`), `src/ui/lockScreen.ts` (`5` eşleşme — `handleKey`), `src/lib/push.ts` (`4` eşleşme — `import.meta.env.VITE_VAPID_PUBLIC_KEY` referansı), `src/lib/hazel.ts` (`4`), `src/sky/plane.ts` (`4`), `src/sky/boat.ts` (`4`), `src/sky/solar.ts` (`4`), `src/ui/composeSheet.ts` (`4`), `src/sky/greetings.ts` (`3`), `src/types.ts` (`1` — `publicKeySpki: string`), `src/ui/diagnostics.ts` (`1` — `KeyframeEffect`).
  - `package.json` (`0` eşleşme) ve `public/manifest.webmanifest` (`0` eşleşme).
