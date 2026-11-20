// Denizdeki Şişemiz & Vintage Günlük Mektupları:
// İki kişi de gününü vintage kağıda yazıp rulo yapar, şişenin içine koyup denize bırakır.
// Her şişenin kapasitesi kişi başı 10 (10 benim + 10 Beto'nun = toplam 20 mektup).
// Birbirinizin mektuplarını göremezsiniz; her mektup için YALNIZCA 1 KEZ izin isteği gönderilebilir
// ve karşı tarafa "Hayır" / "Tamam, hadi" seçenekleriyle ulaşır.
import { h, $, $$, pushPage, popPage, openSheet, confirmSheet, toast, reduced } from './ui';
import { I } from './icons';
import { state, PEOPLE, toDbWho } from './state';
import { core } from './core';
import { hash } from '../gokyuzu/util';
import {
  fetchDiaryJar,
  openMyDiaryEntry,
  saveDiaryEntry,
  deleteMyDiaryEntry,
  pendingPeekRequests,
  grantedPeekEntries,
  getPeekStatus,
  canSendPeekRequest,
  markPeekRequestSent,
  respondToPeekRequest,
  BOTTLE_PER_PERSON,
  BOTTLE_TOTAL,
  type DiaryEntryMeta,
  type DiaryMood,
  type DiaryStickerId,
  type DiaryPeekReq,
} from '../lib/diary';

const MOODS: { id: DiaryMood; label: string; icon: string }[] = [
  { id: 'heart', label: 'Huzurlu', icon: I.heart(14) },
  { id: 'sun', label: 'Güneşli', icon: I.sun(14) },
  { id: 'coffee', label: 'Sakin', icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 4c0 1.2.8 1.8.8 2.8M12 4c0 1.2.8 1.8.8 2.8"/></svg>` },
  { id: 'moon', label: 'Gece', icon: I.moon(14) },
  { id: 'rain', label: 'Yağmurlu', icon: I.rain(14) },
  { id: 'spark', label: 'Özel', icon: I.spark(14) },
];

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m])) as Record<DiaryMood, (typeof MOODS)[number]>;

const PEEK_PRESETS = [
  'Aşkım çok merak ettim, bugününü okuyabilir miyim? 🥺🤍',
  'Kalbim seni çok özledi, sadece bir göz atsam olur mu? 💌✨',
  'Lütfeeen bu mektubunu benimle paylaşır mısın sevgilim? 🥰🫶',
  'Bugün neler yaptığını senin kaleminden okumak istiyorum 🌸🥹',
];

const PEEK_EMOJIS = ['🥺', '🤍', '💌', '🥰', '🫶', '✨', '🌸', '🥹', '💖', '🌊'];

const STICKERS: { id: DiaryStickerId; label: string; render: () => string }[] = [
  {
    id: 'plead',
    label: 'Lütfeeen',
    render: () => `<div class="stk stk-plead">
      <svg viewBox="0 0 64 64" width="48" height="48"><path d="M32 54S10 40 10 23a12 12 0 0 1 22-6.5A12 12 0 0 1 54 23c0 17-22 31-22 31Z" fill="#ff8db5" stroke="#fff6" stroke-width="1.5"/>
      <circle cx="24" cy="26" r="3.4" fill="#2b1924"/><circle cx="40" cy="26" r="3.4" fill="#2b1924"/>
      <circle cx="25.2" cy="24.8" r="1.2" fill="#fff"/><circle cx="41.2" cy="24.8" r="1.2" fill="#fff"/>
      <ellipse cx="20" cy="31" rx="3" ry="1.6" fill="#ff5b8d" opacity=".6"/><ellipse cx="44" cy="31" rx="3" ry="1.6" fill="#ff5b8d" opacity=".6"/>
      <path d="M29 33q3 2.5 6 0" fill="none" stroke="#2b1924" stroke-width="1.8" stroke-linecap="round"/></svg>
      <span class="stk-float">🥺</span></div>`,
  },
  {
    id: 'kiss',
    label: 'Öpücük',
    render: () => `<div class="stk stk-kiss">
      <svg viewBox="0 0 64 64" width="48" height="48"><path d="M32 54S10 40 10 23a12 12 0 0 1 22-6.5A12 12 0 0 1 54 23c0 17-22 31-22 31Z" fill="#ff73a3" stroke="#fff6" stroke-width="1.5"/>
      <path d="M21 25q3-3 6 0M37 25q3-3 6 0" fill="none" stroke="#2b1924" stroke-width="2" stroke-linecap="round"/>
      <path d="M30 33q4 2 0 4" fill="none" stroke="#2b1924" stroke-width="2" stroke-linecap="round"/></svg>
      <span class="stk-float">💋</span></div>`,
  },
  {
    id: 'shy',
    label: 'Utandım',
    render: () => `<div class="stk stk-shy">
      <svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="18" width="44" height="30" rx="6" fill="#f7ebd4" stroke="#c8a878" stroke-width="1.6"/>
      <path d="M11 20l21 15 21-15" fill="none" stroke="#c8a878" stroke-width="1.5"/>
      <circle cx="32" cy="34" r="6" fill="#e76f96"/></svg>
      <span class="stk-float">🙈</span></div>`,
  },
  {
    id: 'sparkle',
    label: 'Meraklı',
    render: () => `<div class="stk stk-sparkle">
      <svg viewBox="0 0 64 64" width="48" height="48"><path d="M32 8l5 16 16 5-16 5-5 16-5-16-16-5 16-5Z" fill="#ffd984" stroke="#fff8" stroke-width="1.4"/></svg>
      <span class="stk-float">✨</span></div>`,
  },
  {
    id: 'hug',
    label: 'Sarılalım',
    render: () => `<div class="stk stk-hug">
      <svg viewBox="0 0 64 64" width="48" height="48"><path d="M24 50S8 38 8 25a9 9 0 0 1 16-5.5A9 9 0 0 1 40 25c0 13-16 25-16 25Z" fill="#82aaff" opacity=".92"/>
      <path d="M40 52S24 40 24 27a9 9 0 0 1 16-5.5A9 9 0 0 1 56 27c0 13-16 25-16 25Z" fill="#ff8db5" opacity=".92"/></svg>
      <span class="stk-float">🫶</span></div>`,
  },
];

const STICKER_MAP = Object.fromEntries(STICKERS.map((s) => [s.id, s])) as Record<DiaryStickerId, (typeof STICKERS)[number]>;

type BottleBucket = {
  index: number; // 1-based
  entries: DiaryEntryMeta[];
  mineCount: number;
  partnerCount: number;
};

function partitionIntoBottles(allDesc: DiaryEntryMeta[]): BottleBucket[] {
  const asc = [...allDesc].reverse();
  const counts: Record<'hamham' | 'beto', number> = { hamham: 0, beto: 0 };
  const buckets = new Map<number, DiaryEntryMeta[]>();

  for (const e of asc) {
    const idx = Math.floor(counts[e.from] / BOTTLE_PER_PERSON) + 1;
    counts[e.from]++;
    const arr = buckets.get(idx) ?? [];
    arr.push(e);
    buckets.set(idx, arr);
  }

  const maxIdx = Math.max(1, ...buckets.keys());
  const out: BottleBucket[] = [];
  for (let i = 1; i <= maxIdx; i++) {
    const list = (buckets.get(i) ?? []).slice().reverse();
    const mineCount = list.filter((x) => x.mine).length;
    const partnerCount = list.length - mineCount;
    out.push({ index: i, entries: list, mineCount, partnerCount });
  }
  return out;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtVintageDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function rolledScrollSVG(who: 'hamham' | 'beto'): string {
  const ribbon = who === 'beto' ? '#f278a1' : '#6c99ff';
  const seal = who === 'beto' ? '#c84b76' : '#436cd4';
  return `<svg viewBox="0 0 18 40" width="16" height="36" aria-hidden="true">
    <rect x="2.5" y="2" width="13" height="36" rx="4.5" fill="#f3e5c8" stroke="#ba9c70" stroke-width="0.9"/>
    <ellipse cx="9" cy="4.2" rx="5.2" ry="1.8" fill="#dfc9a0"/>
    <path d="M2.5 18.5 H15.5" stroke="${ribbon}" stroke-width="2.6"/>
    <circle cx="9" cy="18.5" r="3.2" fill="${seal}" stroke="#fff5" stroke-width="0.6"/>
  </svg>`;
}

function seaBottleSVG(): string {
  return `<svg class="btl-svg" viewBox="0 0 180 265" width="164" height="242" aria-hidden="true">
    <defs>
      <linearGradient id="gkSeaGlass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(182,232,255,0.30)"/>
        <stop offset="22%" stop-color="rgba(235,248,255,0.09)"/>
        <stop offset="76%" stop-color="rgba(165,220,248,0.06)"/>
        <stop offset="100%" stop-color="rgba(195,238,255,0.28)"/>
      </linearGradient>
      <linearGradient id="gkSeaCork" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#986c43"/>
        <stop offset="42%" stop-color="#cfa376"/>
        <stop offset="100%" stop-color="#7f5632"/>
      </linearGradient>
    </defs>

    <!-- Mantar tıpa (mektup girerken açılır) -->
    <g class="btl-cork">
      <path d="M74 14 C74 10 78 7 83 7 H97 C102 7 106 10 106 14 L103 42 H77 Z"
            fill="url(#gkSeaCork)" stroke="#694525" stroke-width="1.1"/>
      <circle cx="85" cy="18" r="1.1" fill="#654122" opacity=".45"/>
      <circle cx="96" cy="25" r="1.2" fill="#654122" opacity=".4"/>
    </g>

    <!-- Şişe dar boyun ve gövde -->
    <path d="M73 36 H107 V66 C107 84 142 96 144 126 V224 C144 242 130 252 112 252 H68 C50 252 36 242 36 224 V126 C38 96 73 84 73 66 Z"
          fill="url(#gkSeaGlass)" stroke="rgba(220,244,255,0.52)" stroke-width="1.6"/>
    <!-- Ağız halkası + jüt ip -->
    <rect x="69" y="33" width="42" height="8" rx="4" fill="rgba(225,244,255,0.22)" stroke="rgba(235,248,255,0.56)" stroke-width="1.3"/>
    <path d="M72 49 Q90 54 108 49" fill="none" stroke="#d8be96" stroke-width="2" stroke-linecap="round"/>
    <path d="M72 53 Q90 58 108 53" fill="none" stroke="#c3a478" stroke-width="1.4" stroke-linecap="round"/>
    <!-- Kalın cam taban -->
    <path d="M42 232 C42 243 55 247 70 247 H110 C125 247 138 243 138 232"
          fill="rgba(210,240,255,0.16)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
  </svg>`;
}

function seaBottleSheenSVG(): string {
  return `<svg class="btl-sheen" viewBox="0 0 180 265" width="164" height="242" aria-hidden="true">
    <path d="M48 128 V220 C48 230 53 236 60 239" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M79 44 V66 C79 80 56 96 54 118" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M132 128 V216" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
}

function vintageCornerSVG(cls: string): string {
  return `<svg class="v-corner ${cls}" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <path d="M2 22 V6 C2 3.8 3.8 2 6 2 H22" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
    <path d="M6 16 V8 C6 6.8 6.8 6 8 6 H16" stroke="currentColor" stroke-width="0.9" opacity=".38"/>
    <circle cx="5.5" cy="5.5" r="1.4" fill="currentColor" opacity=".48"/>
  </svg>`;
}

function botanicalWatermarkSVG(): string {
  return `<svg class="v-botanical" width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <path d="M16 58 Q30 40 52 16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M26 46 Q18 36 22 26 Q32 32 26 46Z" fill="currentColor" opacity=".35"/>
    <path d="M36 36 Q48 38 52 28 Q42 26 36 36Z" fill="currentColor" opacity=".3"/>
    <path d="M44 26 Q38 14 48 12 Q52 20 44 26Z" fill="currentColor" opacity=".28"/>
  </svg>`;
}

function waxSealIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.5l2.2 1.6 2.7-.3 1.1 2.5 2.5 1.1-.3 2.7 1.6 2.2-1.6 2.2.3 2.7-2.5 1.1-1.1 2.5-2.7-.3-2.2 1.6-2.2-1.6-2.7.3-1.1-2.5-2.5-1.1.3-2.7L2.5 12l1.6-2.2-.3-2.7 2.5-1.1 1.1-2.5 2.7.3Z" fill="currentColor" opacity=".92"/>
    <circle cx="12" cy="12" r="5.6" stroke="#f7ebd4" stroke-width="1" opacity=".55"/>
    <path d="M12 15.2s-3-1.8-3-4a1.7 1.7 0 0 1 3-1.1 1.7 1.7 0 0 1 3 1.1c0 2.2-3 4-3 4Z" fill="#f7ebd4"/>
  </svg>`;
}

export function openDiaryJar(): void {
  const pa = PEOPLE[state.partner];
  let tab: 'mine' | 'partner' = 'mine';
  let activeBottleIdx = 1;
  let castingAnim = false;

  const el = h(`<div class="screen page jar-page">
    <div class="page-head">
      <button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button>
      <div class="title" style="font-size:31px;display:flex;align-items:center;gap:8px">Denizdeki Şişemiz</div>
      <span class="grow"></span>
      <span class="pill glass small" data-total-pill>0 / ${BOTTLE_TOTAL}</span>
    </div>
    <p class="small jar-sub">Yazdığın her gün rulo yapılıp şişeye konur ve denize bırakılır. Her şişe <b>10 senin + 10 ${pa.of}</b> olmak üzere toplam <b>20 mektup</b> alır.</p>
    <div class="jar-req-banner hide" data-req-banner></div>
    <div class="jar-sql-note hide" data-sql>Şişe şu an bu cihazda saklanıyor. İki telefon arasında senkron için Supabase SQL Editör'de <code>09-diary-jar.sql</code> dosyasını çalıştır.</div>

    <div class="bottle-switcher hide" data-switcher></div>

    <!-- Canlı Dalgalı Deniz & Yüzen Şişe Sahnesi -->
    <div class="bottle-ocean" data-ocean>
      <div class="ocean-moon-glow"></div>
      <div class="jar-motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <canvas class="ocean-cv back" data-cv-back></canvas>
      <div class="bottle-actor" data-actor>
        <div class="bottle-ripple" data-ripple></div>
        <div class="bottle-body" data-bottle>
          ${seaBottleSVG()}
          <div class="btl-scrolls" data-notes></div>
          ${seaBottleSheenSVG()}
        </div>
      </div>
      <canvas class="ocean-cv front" data-cv-front></canvas>
      <div class="sea-splash-layer" data-sparks></div>
    </div>

    <!-- Kişi Başı 10 + 10 = 20 Kapasite Çubuğu -->
    <div class="cap-card glass">
      <div class="cap-row">
        <span><i class="dot ${toDbWho(state.me)}"></i>Sen: <b data-cap-me>0/${BOTTLE_PER_PERSON}</b></span>
        <span class="cap-mid" data-cap-title>Şişe #1</span>
        <span><i class="dot ${toDbWho(state.partner)}"></i>${pa.name}: <b data-cap-pa>0/${BOTTLE_PER_PERSON}</b></span>
      </div>
      <div class="cap-bar">
        <i class="cap-fill me ${toDbWho(state.me)}" data-bar-me style="width:0%"></i>
        <i class="cap-fill pa ${toDbWho(state.partner)}" data-bar-pa style="width:0%"></i>
      </div>
    </div>

    <div class="jar-cta-row">
      <button type="button" class="btn btn-primary btn-block jar-write-btn" data-write>
        ${I.pen(17)}<span data-write-lbl>Mektup yaz &amp; denize bırak</span>
      </button>
    </div>

    <div class="jar-tabs" data-tabs>
      <button type="button" class="jar-tab on" data-tab="mine">Benim Mektuplarım</button>
      <button type="button" class="jar-tab" data-tab="partner">${pa.of} Mektupları</button>
    </div>
    <div class="jar-entries" data-entries></div>
  </div>`);

  pushPage(el, core.homeEl);
  const oceanEl = $('[data-ocean]', el);
  const cvBack = $<HTMLCanvasElement>('[data-cv-back]', el);
  const cvFront = $<HTMLCanvasElement>('[data-cv-front]', el);
  const actorEl = $('[data-actor]', el);
  const bottleEl = $('[data-bottle]', el);
  const rippleEl = $('[data-ripple]', el);
  const notesEl = $('[data-notes]', el);
  const sparksEl = $('[data-sparks]', el);
  const totalPill = $('[data-total-pill]', el);
  const capMeEl = $('[data-cap-me]', el);
  const capPaEl = $('[data-cap-pa]', el);
  const capTitleEl = $('[data-cap-title]', el);
  const barMeEl = $('[data-bar-me]', el);
  const barPaEl = $('[data-bar-pa]', el);
  const writeBtn = $<HTMLButtonElement>('[data-write]', el);
  const writeLbl = $('[data-write-lbl]', el);
  const switcherEl = $('[data-switcher]', el);
  const entriesEl = $('[data-entries]', el);
  const sqlEl = $('[data-sql]', el);
  const reqBanner = $('[data-req-banner]', el);

  let entries: DiaryEntryMeta[] = [];
  let bottles: BottleBucket[] = [{ index: 1, entries: [], mineCount: 0, partnerCount: 0 }];
  let manualExtraBottle = false;

  // ---------- Canlı Dalga Çizimi & Şişe Salınım Fiziği ----------
  let waveRaf = 0;
  let wW = 340;
  let wH = 290;
  const syncCanvasSize = () => {
    const rect = oceanEl.getBoundingClientRect();
    if (rect.width < 20) return;
    wW = Math.round(rect.width);
    wH = Math.round(rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const cv of [cvBack, cvFront]) {
      cv.width = Math.round(wW * dpr);
      cv.height = Math.round(wH * dpr);
      const ctx = cv.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };
  requestAnimationFrame(syncCanvasSize);

  const waveHeightAt = (x: number, tSec: number, layer: number): number => {
    const base = wH * (layer === 0 ? 0.56 : layer === 1 ? 0.62 : 0.66);
    const a1 = layer === 0 ? 5.5 : layer === 1 ? 7.5 : 8.5;
    const a2 = layer === 0 ? 3.0 : 4.2;
    const k1 = 0.019;
    const k2 = 0.033;
    const sp1 = layer === 0 ? 1.15 : layer === 1 ? 1.55 : 1.95;
    const sp2 = layer === 0 ? -0.8 : -1.25;
    return base + Math.sin(x * k1 + tSec * sp1 + layer) * a1 + Math.cos(x * k2 + tSec * sp2) * a2;
  };

  const drawWavePoly = (
    ctx: CanvasRenderingContext2D,
    tSec: number,
    layer: number,
    fillTop: string,
    fillBot: string,
    crestStroke: string,
  ) => {
    const g = ctx.createLinearGradient(0, wH * 0.48, 0, wH);
    g.addColorStop(0, fillTop);
    g.addColorStop(1, fillBot);
    ctx.fillStyle = g;
    ctx.beginPath();
    const step = 10;
    for (let x = 0; x <= wW + step; x += step) {
      const y = waveHeightAt(x, tSec, layer);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(wW, wH);
    ctx.lineTo(0, wH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = crestStroke;
    ctx.lineWidth = layer === 2 ? 1.6 : 1.1;
    ctx.beginPath();
    for (let x = 0; x <= wW + step; x += step) {
      const y = waveHeightAt(x, tSec, layer);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  const stepWaves = (nowMs: number) => {
    if (!el.isConnected) return;
    if (!document.hidden) {
      const t = nowMs * 0.001;
      const bCtx = cvBack.getContext('2d');
      const fCtx = cvFront.getContext('2d');
      if (bCtx && fCtx) {
        bCtx.clearRect(0, 0, wW, wH);
        fCtx.clearRect(0, 0, wW, wH);
        drawWavePoly(bCtx, t, 0, 'rgba(13, 30, 68, 0.88)', 'rgba(6, 14, 34, 0.98)', 'rgba(150, 205, 255, 0.18)');
        drawWavePoly(bCtx, t, 1, 'rgba(18, 46, 94, 0.82)', 'rgba(8, 18, 42, 0.96)', 'rgba(175, 228, 255, 0.28)');
        drawWavePoly(fCtx, t, 2, 'rgba(26, 68, 126, 0.46)', 'rgba(7, 16, 38, 0.82)', 'rgba(210, 244, 255, 0.42)');
      }
      if (!castingAnim) {
        const driftX = Math.sin(t * 0.65) * 14;
        const cx = wW * 0.5 + driftX;
        const wy = waveHeightAt(cx, t, 1);
        const wyNext = waveHeightAt(cx + 8, t, 1);
        const slopeDeg = (Math.atan2(wyNext - wy, 8) * 180) / Math.PI;
        const tilt = 14 + slopeDeg * 0.85 + Math.sin(t * 1.3) * 3.2;
        const bobY = wy - wH * 0.62;
        actorEl.style.transform = `translate3d(${driftX.toFixed(1)}px, ${bobY.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
        const rScale = 0.92 + 0.14 * Math.sin(t * 2.1);
        rippleEl.style.transform = `translate(-50%, -50%) scale(${rScale.toFixed(2)})`;
      }
    }
    if (!reduced()) {
      waveRaf = requestAnimationFrame(stepWaves);
    }
  };
  waveRaf = requestAnimationFrame(stepWaves);

  const currentBucket = (): BottleBucket =>
    bottles.find((b) => b.index === activeBottleIdx) ?? bottles[bottles.length - 1];

  const renderReqBanner = () => {
    if (!pendingPeekRequests.length) {
      reqBanner.classList.add('hide');
      reqBanner.innerHTML = '';
      return;
    }
    const req = pendingPeekRequests[0];
    reqBanner.classList.remove('hide');
    reqBanner.innerHTML = `<div class="jar-req-card glass">
      <div class="jar-req-top">
        <span class="jar-req-dot"></span>
        <span class="jar-req-txt"><b>${pa.name}</b> ${fmtVintageDate(req.entryDate)} mektubuna bakmak istiyor: <i>“${escapeHtml(req.message)}”</i> ${req.emojis.join('')}</span>
      </div>
      <div class="jar-req-btns">
        <button type="button" class="btn-choice no" data-q-no>Hayır</button>
        <button type="button" class="btn-choice yes" data-q-yes>Tamam, hadi</button>
        <button type="button" class="btn-choice detail" data-q-open aria-label="Detayı aç">${I.eye(15)}</button>
      </div>
    </div>`;
    $('[data-q-no]', reqBanner).addEventListener('click', async () => {
      await respondToPeekRequest(req, false, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      toast('Mektubun sır olarak kaldı 🤫');
    });
    $('[data-q-yes]', reqBanner).addEventListener('click', async () => {
      const ok = await respondToPeekRequest(req, true, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      if (ok) toast(`${pa.name} için mektup açıldı 🤍`, I.heart(14));
    });
    $('[data-q-open]', reqBanner).addEventListener('click', () => openIncomingReqSheet(req));
  };

  const renderSwitcherAndCapacity = () => {
    const b = currentBucket();
    const total = b.mineCount + b.partnerCount;
    totalPill.textContent = `${total} / ${BOTTLE_TOTAL}`;
    capTitleEl.textContent = `Şişe #${b.index} · ${total}/${BOTTLE_TOTAL}`;
    capMeEl.textContent = `${b.mineCount}/${BOTTLE_PER_PERSON}`;
    capPaEl.textContent = `${b.partnerCount}/${BOTTLE_PER_PERSON}`;
    barMeEl.style.width = `${(b.mineCount / BOTTLE_TOTAL) * 100}%`;
    barPaEl.style.width = `${(b.partnerCount / BOTTLE_TOTAL) * 100}%`;

    if (bottles.length > 1) {
      switcherEl.classList.remove('hide');
      switcherEl.innerHTML = bottles
        .map(
          (bt) =>
            `<button type="button" class="btl-chip ${bt.index === b.index ? 'on' : ''}" data-bidx="${bt.index}">Şişe #${bt.index} · ${bt.mineCount + bt.partnerCount}/${BOTTLE_TOTAL}</button>`,
        )
        .join('');
      $$('[data-bidx]', switcherEl).forEach((btn) =>
        btn.addEventListener('click', () => {
          activeBottleIdx = Number((btn as HTMLElement).dataset.bidx) || 1;
          renderSwitcherAndCapacity();
          renderBottleScrolls();
          renderList();
        }),
      );
    } else {
      switcherEl.classList.add('hide');
    }

    if (b.mineCount >= BOTTLE_PER_PERSON) {
      const nextBottleExists = bottles.some((x) => x.index === b.index + 1);
      writeLbl.textContent = nextBottleExists
        ? `Şişe #${b.index + 1}'e geç ve yaz`
        : `Bu şişede 10/10 doldurdun · Yeni şişe aç`;
    } else {
      writeLbl.textContent = 'Mektup yaz & denize bırak';
    }
    writeBtn.disabled = false;
  };

  const renderBottleScrolls = () => {
    notesEl.innerHTML = '';
    const b = currentBucket();
    const visible = b.entries.slice(0, BOTTLE_TOTAL).reverse();
    visible.forEach((entry, idx) => {
      const hVal = hash(entry.id);
      const col = idx % 5;
      const row = Math.floor(idx / 5);
      const jitterX = (hVal % 11) - 5;
      const jitterY = ((hVal >>> 4) % 7) - 3;
      const rot = ((hVal >>> 8) % 34) - 17;
      const leftPct = 10 + col * 18.5 + jitterX * 0.5;
      const bottomPx = 8 + row * 24 + jitterY * 0.6;
      const granted = !entry.mine && grantedPeekEntries.has(entry.id);
      const btn = h(`<button type="button" class="btl-scroll ${entry.from} ${entry.mine ? 'mine' : granted ? 'granted' : 'sealed'}"
        style="left:${leftPct.toFixed(1)}%;bottom:${bottomPx.toFixed(1)}px;--r:${rot}deg"
        aria-label="${entry.mine ? `${fmtVintageDate(entry.entryDate)} mektubun` : `${pa.of} mühürlü mektubu`}">
        ${rolledScrollSVG(entry.from)}
      </button>`);
      btn.addEventListener('click', () => {
        if (entry.mine || granted) {
          void openVintageReader(entry);
        } else {
          btn.animate(
            [
              { transform: `rotate(${rot}deg) translateX(0)` },
              { transform: `rotate(${rot - 8}deg) translateX(-2px)` },
              { transform: `rotate(${rot + 8}deg) translateX(2px)` },
              { transform: `rotate(${rot}deg) translateX(0)` },
            ],
            { duration: 340, easing: 'ease-out' },
          );
          openSealedPartnerSheet(entry);
        }
      });
      notesEl.appendChild(btn);
    });
  };

  const renderList = () => {
    const b = currentBucket();
    const mine = b.entries.filter((e) => e.mine);
    const theirs = b.entries.filter((e) => !e.mine);
    $$('[data-tab]', el).forEach((btn) => btn.classList.toggle('on', (btn as HTMLElement).dataset.tab === tab));
    entriesEl.innerHTML = '';

    const list = tab === 'mine' ? mine : theirs;
    if (!list.length) {
      entriesEl.innerHTML =
        tab === 'mine'
          ? `<div class="jar-empty">Bu şişede henüz senin mektubun yok (0/${BOTTLE_PER_PERSON}).<br><span class="small">Yazdığın her mektup rulo yapılıp şişeye konur; ${pa.name} iznin olmadan açamaz.</span></div>`
          : `<div class="jar-empty">${pa.name} bu şişeye henüz mektup bırakmadı (0/${BOTTLE_PER_PERSON}).</div>`;
      return;
    }

    for (const entry of list) {
      const m = MOOD_MAP[entry.mood] ?? MOOD_MAP.heart;
      const pStatus = getPeekStatus(entry.id);
      const granted = !entry.mine && pStatus === 'approved' && grantedPeekEntries.has(entry.id);

      if (entry.mine || granted) {
        const card = h(`<button type="button" class="v-mini press">
          <span class="v-mini-seal ${entry.from}">${m.icon}</span>
          <span class="v-mini-body">
            <b>${fmtVintageDate(entry.entryDate)}</b>
            <i>${m.label} · ${granted ? 'İzinle açıldı 🤍' : 'Mühürlü mektubun'}</i>
          </span>
          <span class="v-mini-chev">${I.chevron(16)}</span>
        </button>`);
        card.addEventListener('click', () => void openVintageReader(entry));
        entriesEl.appendChild(card);
      } else {
        const statusBtn =
          pStatus === 'sent'
            ? `<span class="v-ask-pill sent">İstek gönderildi 💌</span>`
            : pStatus === 'denied'
              ? `<span class="v-ask-pill denied">Sır kaldı 🤫</span>`
              : `<button type="button" class="v-ask-pill press" data-ask>Bakabilir miyim? 🥺</button>`;
        const card = h(`<div class="v-mini sealed-row">
          <span class="v-mini-seal ${entry.from}">${I.lock(14)}</span>
          <span class="v-mini-body">
            <b>${fmtVintageDate(entry.entryDate)}</b>
            <i>${pa.of} mühürlü mektubu · ${m.label}</i>
          </span>
          ${statusBtn}
        </div>`);
        card.querySelector('[data-ask]')?.addEventListener('click', () => openPeekRequestSheet(entry));
        entriesEl.appendChild(card);
      }
    }
  };

  const reload = async (jumpToLatestBottle = false) => {
    try {
      const res = await fetchDiaryJar();
      entries = res.entries;
      bottles = partitionIntoBottles(entries);
      if (manualExtraBottle) {
        const last = bottles[bottles.length - 1];
        if (last.mineCount >= BOTTLE_PER_PERSON) {
          bottles.push({ index: last.index + 1, entries: [], mineCount: 0, partnerCount: 0 });
        } else {
          manualExtraBottle = false;
        }
      }
      if (jumpToLatestBottle) {
        activeBottleIdx = bottles[bottles.length - 1].index;
      } else if (!bottles.some((b) => b.index === activeBottleIdx)) {
        activeBottleIdx = bottles[bottles.length - 1].index;
      }
      sqlEl.classList.toggle('hide', !res.needsSql);
      renderReqBanner();
      renderSwitcherAndCapacity();
      renderBottleScrolls();
      renderList();
    } catch {
      toast('Şişe yüklenemedi', I.info(14));
    }
  };

  const unsubDiary = core.onDiaryPacket(() => {
    if (!el.isConnected) {
      unsubDiary();
      return;
    }
    renderReqBanner();
    renderBottleScrolls();
    renderList();
  });

  // ---------- Mektubu Rulo Yap -> Şişeye Koy -> Denize Fırlat & Su Sıçrat Animasyonu ----------
  const playCastIntoSea = async (who: 'hamham' | 'beto') => {
    if (reduced()) return;
    castingAnim = true;
    try {
      const cork = $('.btl-cork', bottleEl) as HTMLElement | null;
      // 1) Şişeyi hafifçe yukarı kaldır & dikleştir
      await actorEl.animate(
        [
          { transform: actorEl.style.transform || 'none' },
          { transform: 'translate3d(0, -34px, 0) rotate(0deg)' },
        ],
        { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      ).finished;

      // 2) Mantar tıpa açılır
      cork?.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)' },
          { transform: 'translate(-18px, -26px) rotate(-28deg)', offset: 0.28 },
          { transform: 'translate(-18px, -26px) rotate(-28deg)', offset: 0.76 },
          { transform: 'translate(0, 0) rotate(0deg)' },
        ],
        { duration: 860, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );

      // 3) Rulo mektup dar şişe boynundan içeri süzülür
      const scrollDrop = h(`<div class="btl-drop-scroll">${rolledScrollSVG(who)}</div>`);
      bottleEl.appendChild(scrollDrop);
      await scrollDrop.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -56px) scale(1.15) rotate(-8deg)' },
          { opacity: 1, transform: 'translate(-50%, -14px) scale(1) rotate(0deg)', offset: 0.34 },
          { opacity: 1, transform: 'translate(-50%, 118px) scale(0.95) rotate(4deg)', offset: 0.84 },
          { opacity: 0, transform: 'translate(-50%, 138px) scale(0.9) rotate(-3deg)' },
        ],
        { duration: 680, delay: 110, easing: 'cubic-bezier(.22,.82,.28,1)', fill: 'forwards' },
      ).finished;
      scrollDrop.remove();

      // 4) Şişe yay çizerek denize atılır & suya çarpar!
      const castAnim = actorEl.animate(
        [
          { transform: 'translate3d(0, -34px, 0) rotate(0deg)' },
          { transform: 'translate3d(0, -58px, 0) rotate(-14deg)', offset: 0.32 },
          { transform: 'translate3d(0, 22px, 0) rotate(22deg)', offset: 0.72 },
          { transform: 'translate3d(0, 0px, 0) rotate(14deg)' },
        ],
        { duration: 680, easing: 'cubic-bezier(.22,.8,.26,1)', fill: 'forwards' },
      );

      // Suya çarpma anında su damlaları + köpük halkası
      window.setTimeout(() => {
        for (let i = 0; i < 10; i++) {
          const drop = h(`<i class="sea-drop"></i>`);
          const spread = (i - 4.5) * 12;
          const lift = -26 - Math.random() * 28;
          sparksEl.appendChild(drop);
          drop.animate(
            [
              { opacity: 0.95, transform: 'translate(0, 0) scale(0.7)' },
              { opacity: 0.9, transform: `translate(${spread * 0.6}px, ${lift}px) scale(1.1)`, offset: 0.45 },
              { opacity: 0, transform: `translate(${spread}px, 14px) scale(0.4)` },
            ],
            { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
          ).finished.then(() => drop.remove());
        }
      }, 440);

      await castAnim.finished;
      actorEl.getAnimations().forEach((a) => a.cancel());
    } finally {
      castingAnim = false;
    }
  };

  function openSealedPartnerSheet(entry: DiaryEntryMeta) {
    const m = MOOD_MAP[entry.mood] ?? MOOD_MAP.heart;
    const pStatus = getPeekStatus(entry.id);
    const canAsk = canSendPeekRequest(entry.id);
    const body = h(`<div class="gk-peek-modal">
      <div class="gk-pm-icon ${entry.from}">${I.lock(22)}</div>
      <div class="gk-pm-badge">${fmtVintageDate(entry.entryDate)} · ${m.label}</div>
      <h3 class="gk-pm-title">${pa.of} mühürlü mektubu</h3>
      <p class="gk-pm-sub">${
        pStatus === 'sent'
          ? 'Bu mektup için izin isteğini zaten gönderdin. Karşı taraf onaylarsa açılacak 💌'
          : pStatus === 'denied'
            ? `${pa.name} bu mektubun şimdilik sır kalmasını istedi 🤫🤍`
            : 'Şişedeki mektuplar gizlidir. Merak ettiysen yalnızca 1 kez tatlı bir izin isteği gönderebilirsin.'
      }</p>
      <div class="gk-pm-actions">
        <button type="button" class="btn-choice no" data-close>Kapat</button>
        ${
          canAsk
            ? `<button type="button" class="btn-choice yes" data-ask>Bakabilir miyim? 🥺</button>`
            : `<button type="button" class="btn-choice no" disabled>${pStatus === 'sent' ? 'İstek gönderildi' : 'Sır kaldı'}</button>`
        }
      </div>
    </div>`);
    const sh = openSheet(body, { cls: 'gk-glass-sheet' });
    $('[data-close]', body).addEventListener('click', () => void sh.close());
    body.querySelector('[data-ask]')?.addEventListener('click', async () => {
      await sh.close();
      openPeekRequestSheet(entry);
    });
  }

  function openPeekRequestSheet(entry: DiaryEntryMeta) {
    if (!canSendPeekRequest(entry.id)) {
      toast('Bu mektup için yalnızca 1 kez istek gönderilebilir', I.info(14));
      return;
    }
    let sticker: DiaryStickerId = 'plead';
    const pickedEmojis = new Set<string>(['🥺', '🤍']);
    const body = h(`<div class="gk-peek-modal gk-peek-compose">
      <div class="gk-pm-head">
        <div>
          <div class="eyebrow">${fmtVintageDate(entry.entryDate)}</div>
          <div class="gk-pm-title" style="margin-top:2px">Bakabilir miyim?</div>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Kapat">${I.close(18)}</button>
      </div>

      <div class="gk-pm-lbl">Hareketli çıkartma</div>
      <div class="v-stickers" data-stickers>
        ${STICKERS.map((s) => `<button type="button" class="v-stk-btn ${s.id === sticker ? 'on' : ''}" data-stk="${s.id}">${s.render()}<span>${s.label}</span></button>`).join('')}
      </div>

      <div class="gk-pm-lbl">Hazır sevgi cümleleri</div>
      <div class="v-presets" data-presets>
        ${PEEK_PRESETS.map((p) => `<button type="button" class="v-preset">${p}</button>`).join('')}
      </div>

      <textarea class="gk-pm-inp" maxlength="220" placeholder="Kendi tatlı mesajını yaz…" data-nodrag>${PEEK_PRESETS[0]}</textarea>

      <div class="v-emojis" data-emojis>
        ${PEEK_EMOJIS.map((em) => `<button type="button" class="v-em ${pickedEmojis.has(em) ? 'on' : ''}" data-em="${em}">${em}</button>`).join('')}
      </div>

      <div class="gk-pm-foot">
        <span class="small">Her mektup için 1 istek hakkın var</span>
        <button type="button" class="btn-choice yes" data-send>İstek Gönder 💌</button>
      </div>
    </div>`);

    const sh = openSheet(body, { cls: 'gk-glass-sheet' });
    const msgEl = $<HTMLTextAreaElement>('.gk-pm-inp', body);

    $('[data-close]', body).addEventListener('click', () => void sh.close());
    $$('[data-stk]', body).forEach((b) =>
      b.addEventListener('click', () => {
        sticker = (b as HTMLElement).dataset.stk as DiaryStickerId;
        $$('[data-stk]', body).forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    $$('.v-preset', body).forEach((b) =>
      b.addEventListener('click', () => {
        msgEl.value = b.textContent || '';
      }),
    );
    $$('[data-em]', body).forEach((b) =>
      b.addEventListener('click', () => {
        const em = (b as HTMLElement).dataset.em || '';
        if (pickedEmojis.has(em)) pickedEmojis.delete(em);
        else if (pickedEmojis.size < 5) pickedEmojis.add(em);
        b.classList.toggle('on', pickedEmojis.has(em));
      }),
    );

    $('[data-send]', body).addEventListener('click', async () => {
      if (!canSendPeekRequest(entry.id)) return;
      const msg = msgEl.value.trim() || PEEK_PRESETS[0];
      const req: DiaryPeekReq = {
        t: 'dpeek_req',
        reqId: crypto.randomUUID(),
        diaryId: entry.id,
        entryDate: entry.entryDate,
        message: msg,
        emojis: Array.from(pickedEmojis),
        sticker,
        at: Date.now(),
      };
      markPeekRequestSent(req);
      core.sendDiaryPacket(req);
      await sh.close();
      renderList();
      toast(`${pa.to} isteğin gönderildi 💌`, I.heart(14));
    });
  }

  function openIncomingReqSheet(req: DiaryPeekReq) {
    const stk = STICKER_MAP[req.sticker] ?? STICKERS[0];
    const body = h(`<div class="gk-peek-modal">
      <div class="v-req-sticker">${stk.render()}</div>
      <div class="gk-pm-badge">${pa.name} · ${fmtVintageDate(req.entryDate)}</div>
      <h3 class="gk-pm-title">Mektubuna bakmak istiyor</h3>
      <p class="gk-pm-quote">“${escapeHtml(req.message)}” ${req.emojis.join(' ')}</p>
      <div class="gk-pm-actions">
        <button type="button" class="btn-choice no" data-deny>Hayır</button>
        <button type="button" class="btn-choice yes" data-allow>Tamam, hadi</button>
      </div>
    </div>`);
    const sh = openSheet(body, { cls: 'gk-glass-sheet' });

    $('[data-deny]', body).addEventListener('click', async () => {
      await respondToPeekRequest(req, false, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      await sh.close();
      toast('Mektubun sır olarak kaldı 🤫');
    });

    $('[data-allow]', body).addEventListener('click', async () => {
      const ok = await respondToPeekRequest(req, true, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      await sh.close();
      if (ok) toast(`${pa.name} için mektup açıldı 🤍`, I.heart(14));
      else toast('Mektup bulunamadı', I.info(14));
    });
  }

  async function openVintageReader(entry: DiaryEntryMeta) {
    try {
      const granted = !entry.mine ? grantedPeekEntries.get(entry.id) : null;
      const content = granted ?? (entry.mine ? await openMyDiaryEntry(entry.id) : null);
      if (!content) {
        toast('Bu mektup kilitli', I.lock(14));
        return;
      }
      const m = MOOD_MAP[content.mood] ?? MOOD_MAP.heart;
      const body = h(`<div class="v-sheet-wrap">
        <div class="v-paper v-reader">
          ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
          ${botanicalWatermarkSVG()}
          <div class="v-paper-head">
            <span class="v-stamp">${fmtVintageDate(content.entryDate)}</span>
            <span class="v-mood-tag">${m.icon}<span>${m.label}</span></span>
          </div>
          ${content.title ? `<h3 class="v-title">${escapeHtml(content.title)}</h3>` : ''}
          <div class="v-ruled-text">${escapeHtml(content.text).replace(/\n/g, '<br>')}</div>
          <div class="v-paper-foot">
            <span class="v-sign">— ${granted ? `${pa.name} (izinle açıldı 🤍)` : PEOPLE[state.me].name}</span>
            ${entry.mine ? `<button type="button" class="v-del-btn" data-del aria-label="Mektubu sil">${I.trash(16)}<span>Sil</span></button>` : ''}
          </div>
        </div>
      </div>`);
      const sh = openSheet(body, { cls: 'v-sheet' });
      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Mektup silinsin mi?', 'Şişedeki bu mektubun kalıcı olarak silinir.', 'Sil', true)) {
          await deleteMyDiaryEntry(entry.id);
          await sh.close();
          toast('Mektup şişeden çıkarıldı');
          void reload();
        }
      });
    } catch {
      toast('Şifre çözülemedi', I.info(14));
    }
  }

  function openVintageWriter() {
    const b = currentBucket();
    if (b.mineCount >= BOTTLE_PER_PERSON) {
      const nextIdx = b.index + 1;
      if (!bottles.some((x) => x.index === nextIdx)) {
        manualExtraBottle = true;
        bottles.push({ index: nextIdx, entries: [], mineCount: 0, partnerCount: 0 });
      }
      activeBottleIdx = nextIdx;
      renderSwitcherAndCapacity();
      renderBottleScrolls();
      renderList();
      toast(`Yeni şişe (#${nextIdx}) denize indirildi 🌊`);
    }

    let mood: DiaryMood = 'heart';
    const dateIso = todayIso();
    const body = h(`<div class="v-sheet-wrap">
      <div class="v-paper v-writer">
        ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
        ${botanicalWatermarkSVG()}
        <div class="v-paper-head">
          <span class="v-stamp">${fmtVintageDate(dateIso)}</span>
          <button type="button" class="v-close-btn" data-close aria-label="Kapat">${I.close(18)}</button>
        </div>
        <div class="v-moods" data-moods>
          ${MOODS.map((m) => `<button type="button" class="v-mood ${m.id === mood ? 'on' : ''}" data-m="${m.id}">${m.icon}<span>${m.label}</span></button>`).join('')}
        </div>
        <input class="v-title-inp" type="text" maxlength="70" placeholder="Bugüne kısa bir başlık…" data-nodrag>
        <div class="v-lines-wrap" data-nodrag>
          <textarea class="v-textarea" maxlength="2000" placeholder="Bugün neler yaptın, aklından neler geçti… (Mektubun şişede saklanır, iznin olmadan açılamaz)"></textarea>
        </div>
        <div class="v-writer-foot">
          <span class="v-cnt" data-cnt>0 / 2000</span>
          <button type="button" class="v-seal-btn" data-seal disabled>
            ${waxSealIcon()}<span>Sar &amp; Denize Bırak</span>
          </button>
        </div>
      </div>
    </div>`);

    const sh = openSheet(body, { cls: 'v-sheet' });
    const ta = $<HTMLTextAreaElement>('.v-textarea', body);
    const titleInp = $<HTMLInputElement>('.v-title-inp', body);
    const cntEl = $('[data-cnt]', body);
    const sealBtn = $<HTMLButtonElement>('[data-seal]', body);

    $('[data-close]', body).addEventListener('click', () => void sh.close());
    $$('[data-m]', body).forEach((btn) =>
      btn.addEventListener('click', () => {
        mood = (btn as HTMLElement).dataset.m as DiaryMood;
        $$('[data-m]', body).forEach((x) => x.classList.toggle('on', x === btn));
      }),
    );

    const sync = () => {
      cntEl.textContent = `${ta.value.length} / 2000`;
      sealBtn.disabled = !ta.value.trim();
    };
    ta.addEventListener('input', sync);

    sealBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) return;
      sealBtn.disabled = true;
      try {
        const res = await saveDiaryEntry({
          title: titleInp.value.trim(),
          text,
          mood,
          entryDate: dateIso,
        });
        await sh.close();
        await playCastIntoSea(toDbWho(state.me));
        await reload(true);
        toast(res.needsSql ? 'Şişeye konup denize bırakıldı (yerel)' : 'Mektubun şişeyle denize bırakıldı 🌊', I.heart(14));
      } catch {
        sealBtn.disabled = false;
        toast('Kaydedilemedi, tekrar dene', I.info(14));
      }
    });
  }

  $$('[data-tab]', el).forEach((btn) =>
    btn.addEventListener('click', () => {
      tab = (btn as HTMLElement).dataset.tab === 'partner' ? 'partner' : 'mine';
      renderList();
    }),
  );
  $('[data-back]', el).addEventListener('click', () => {
    cancelAnimationFrame(waveRaf);
    unsubDiary();
    void popPage(core.homeEl);
  });
  writeBtn.addEventListener('click', () => openVintageWriter());
  window.addEventListener('resize', syncCanvasSize, { passive: true });
  void reload(true);
}
