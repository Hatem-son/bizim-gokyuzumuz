// Denizdeki Şişemiz — Sade, şiirsel ve iki kişiye özel tema (Ham ham: ay mavisi/fildişi, Beto: pembe/ahududu).
// Açıklama kalabalığı veya sayaç çubukları YOK: yalnızca dalgalarda süzülen şişe, saf vintage mektup kağıdı ve tek seferlik izin isteği.
import { h, $, $$, pushPage, popPage, openSheet, segment, confirmSheet, toast, reduced } from './ui';
import { I } from './icons';
import { raspberry } from './art';
import { lilyBloom } from './lily';
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
  type DiaryStickerId,
  type DiaryPeekReq,
} from '../lib/diary';

const PEEK_PRESETS = [
  'Aşkım merak ettim, mektubuna bakabilir miyim? 🥺🤍',
  'Kalbim seni özledi, bir göz atsam olur mu? 💌✨',
  'Lütfeeen bu mektubunu benimle paylaşır mısın? 🥰🫶',
];

const PEEK_EMOJIS = ['🥺', '🤍', '💌', '🥰', '🫶', '✨', '🌸', '🥹'];

const STICKERS: { id: DiaryStickerId; label: string; render: () => string }[] = [
  {
    id: 'plead',
    label: 'Lütfeeen',
    render: () => `<div class="stk stk-plead">
      <svg viewBox="0 0 64 64" width="46" height="46"><path d="M32 54S10 40 10 23a12 12 0 0 1 22-6.5A12 12 0 0 1 54 23c0 17-22 31-22 31Z" fill="#ff8db5" stroke="#fff6" stroke-width="1.5"/>
      <circle cx="24" cy="26" r="3.4" fill="#2b1924"/><circle cx="40" cy="26" r="3.4" fill="#2b1924"/>
      <circle cx="25.2" cy="24.8" r="1.2" fill="#fff"/><circle cx="41.2" cy="24.8" r="1.2" fill="#fff"/>
      <path d="M29 33q3 2.5 6 0" fill="none" stroke="#2b1924" stroke-width="1.8" stroke-linecap="round"/></svg>
      <span class="stk-float">🥺</span></div>`,
  },
  {
    id: 'kiss',
    label: 'Öpücük',
    render: () => `<div class="stk stk-kiss">
      <svg viewBox="0 0 64 64" width="46" height="46"><path d="M32 54S10 40 10 23a12 12 0 0 1 22-6.5A12 12 0 0 1 54 23c0 17-22 31-22 31Z" fill="#ff73a3" stroke="#fff6" stroke-width="1.5"/>
      <path d="M21 25q3-3 6 0M37 25q3-3 6 0" fill="none" stroke="#2b1924" stroke-width="2" stroke-linecap="round"/>
      <path d="M30 33q4 2 0 4" fill="none" stroke="#2b1924" stroke-width="2" stroke-linecap="round"/></svg>
      <span class="stk-float">💋</span></div>`,
  },
  {
    id: 'shy',
    label: 'Utandım',
    render: () => `<div class="stk stk-shy">
      <svg viewBox="0 0 64 64" width="46" height="46"><rect x="10" y="18" width="44" height="30" rx="6" fill="#f7ebd4" stroke="#c8a878" stroke-width="1.6"/>
      <path d="M11 20l21 15 21-15" fill="none" stroke="#c8a878" stroke-width="1.5"/>
      <circle cx="32" cy="34" r="6" fill="#e76f96"/></svg>
      <span class="stk-float">🙈</span></div>`,
  },
  {
    id: 'hug',
    label: 'Sarılalım',
    render: () => `<div class="stk stk-hug">
      <svg viewBox="0 0 64 64" width="46" height="46"><path d="M24 50S8 38 8 25a9 9 0 0 1 16-5.5A9 9 0 0 1 40 25c0 13-16 25-16 25Z" fill="#82aaff" opacity=".92"/>
      <path d="M40 52S24 40 24 27a9 9 0 0 1 16-5.5A9 9 0 0 1 56 27c0 13-16 25-16 25Z" fill="#ff8db5" opacity=".92"/></svg>
      <span class="stk-float">🫶</span></div>`,
  },
];

const STICKER_MAP = Object.fromEntries(STICKERS.map((s) => [s.id, s])) as Record<DiaryStickerId, (typeof STICKERS)[number]>;

type BottleBucket = {
  index: number;
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
    out.push({ index: i, entries: list, mineCount, partnerCount: list.length - mineCount });
  }
  return out;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtVintageDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function rolledScrollSVG(who: 'hamham' | 'beto'): string {
  const ribbon = who === 'beto' ? '#f0749e' : '#739dff';
  const seal = who === 'beto' ? '#c84b76' : '#436cd4';
  const paper = who === 'beto' ? '#f8ebe9' : '#f4e6ca';
  return `<svg viewBox="0 0 18 40" width="16" height="36" aria-hidden="true">
    <rect x="2.5" y="2" width="13" height="36" rx="4.5" fill="${paper}" stroke="#ba9c70" stroke-width="0.85"/>
    <ellipse cx="9" cy="4.2" rx="5.2" ry="1.8" fill="#dfc9a0"/>
    <path d="M2.5 18.5 H15.5" stroke="${ribbon}" stroke-width="2.5"/>
    <circle cx="9" cy="18.5" r="3.1" fill="${seal}" stroke="#fff5" stroke-width="0.6"/>
  </svg>`;
}

function seaBottleSVG(isBeto: boolean): string {
  const gA = isBeto ? 'rgba(255,205,225,0.28)' : 'rgba(182,232,255,0.30)';
  const gB = isBeto ? 'rgba(255,235,244,0.09)' : 'rgba(235,248,255,0.09)';
  const stroke = isBeto ? 'rgba(255,222,236,0.52)' : 'rgba(220,244,255,0.52)';
  const cord = isBeto ? '#dfb0be' : '#c6d4f2';
  return `<svg class="btl-svg" viewBox="0 0 180 265" width="168" height="248" aria-hidden="true">
    <defs>
      <linearGradient id="gkSeaGlass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${gA}"/>
        <stop offset="22%" stop-color="${gB}"/>
        <stop offset="78%" stop-color="rgba(255,255,255,0.04)"/>
        <stop offset="100%" stop-color="${gA}"/>
      </linearGradient>
      <linearGradient id="gkSeaCork" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#986c43"/>
        <stop offset="42%" stop-color="#cfa376"/>
        <stop offset="100%" stop-color="#7f5632"/>
      </linearGradient>
    </defs>

    <g class="btl-cork">
      <path d="M74 14 C74 10 78 7 83 7 H97 C102 7 106 10 106 14 L103 42 H77 Z"
            fill="url(#gkSeaCork)" stroke="#694525" stroke-width="1.1"/>
      <ellipse cx="90" cy="12" rx="12" ry="2.2" fill="rgba(255,244,225,0.22)"/>
    </g>

    <path d="M73 36 H107 V66 C107 84 142 96 144 126 V224 C144 242 130 252 112 252 H68 C50 252 36 242 36 224 V126 C38 96 73 84 73 66 Z"
          fill="url(#gkSeaGlass)" stroke="${stroke}" stroke-width="1.5"/>
    <rect x="69" y="33" width="42" height="8" rx="4" fill="rgba(255,255,255,0.18)" stroke="${stroke}" stroke-width="1.2"/>
    <path d="M72 50 Q90 55 108 50" fill="none" stroke="${cord}" stroke-width="2" stroke-linecap="round"/>
    <path d="M42 232 C42 243 55 247 70 247 H110 C125 247 138 243 138 232"
          fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  </svg>
  ${isBeto ? `<div class="btl-charm">${raspberry(12)}</div>` : ''}`;
}

function seaBottleSheenSVG(): string {
  return `<svg class="btl-sheen" viewBox="0 0 180 265" width="168" height="248" aria-hidden="true">
    <path d="M48 128 V220 C48 230 53 236 60 239" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M79 44 V66 C79 80 56 96 54 118" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2" stroke-linecap="round"/>
    <path d="M132 128 V216" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function vintageCornerSVG(cls: string): string {
  return `<svg class="v-corner ${cls}" width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <path d="M2 22 V6 C2 3.8 3.8 2 6 2 H22" stroke="currentColor" stroke-width="1.15" opacity=".5"/>
    <circle cx="5.5" cy="5.5" r="1.3" fill="currentColor" opacity=".45"/>
  </svg>`;
}

function waxSealIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.5l2.2 1.6 2.7-.3 1.1 2.5 2.5 1.1-.3 2.7 1.6 2.2-1.6 2.2.3 2.7-2.5 1.1-1.1 2.5-2.7-.3-2.2 1.6-2.2-1.6-2.7.3-1.1-2.5-2.5-1.1.3-2.7L2.5 12l1.6-2.2-.3-2.7 2.5-1.1 1.1-2.5 2.7.3Z" fill="currentColor" opacity=".94"/>
    <path d="M12 15.2s-3-1.8-3-4a1.7 1.7 0 0 1 3-1.1 1.7 1.7 0 0 1 3 1.1c0 2.2-3 4-3 4Z" fill="#fbf3e6"/>
  </svg>`;
}

export function openDiaryJar(): void {
  const isBeto = state.me === 'beto';
  const pa = PEOPLE[state.partner];
  let tab: 'mine' | 'partner' = 'mine';
  let activeBottleIdx = 1;
  let castingAnim = false;

  const el = h(`<div class="screen page jar-page">
    <div class="page-head">
      <button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button>
      <div class="title" style="font-size:34px;display:flex;align-items:center;gap:8px">Şişemiz ${lilyBloom(26, 12)}</div>
      <span class="grow"></span>
      <div class="bottle-dots hide" data-switcher></div>
    </div>

    <div class="jar-req-banner hide" data-req-banner></div>

    <div class="bottle-ocean" data-ocean>
      <div class="ocean-moon-glow"></div>
      <div class="jar-motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <canvas class="ocean-cv back" data-cv-back></canvas>
      <div class="bottle-actor" data-actor>
        <div class="bottle-ripple" data-ripple></div>
        <div class="bottle-body" data-bottle>
          ${seaBottleSVG(isBeto)}
          <div class="btl-scrolls" data-notes></div>
          ${seaBottleSheenSVG()}
        </div>
      </div>
      <canvas class="ocean-cv front" data-cv-front></canvas>
      <div class="sea-splash-layer" data-sparks></div>
    </div>

    <div class="jar-cta-row">
      <button type="button" class="btn btn-primary btn-block jar-write-btn" data-write>
        ${isBeto ? `<span class="rb">${raspberry(13)}</span>` : I.pen(17)}<span>Mektup bırak</span>
      </button>
    </div>

    <div data-seg-wrap style="margin-bottom:12px"></div>
    <div class="jar-entries" data-entries></div>
  </div>`);

  pushPage(el, core.homeEl);
  const oceanEl = $('[data-ocean]', el);
  const cvBack = $<HTMLCanvasElement>('[data-cv-back]', el);
  const cvFront = $<HTMLCanvasElement>('[data-cv-front]', el);
  const actorEl = $('[data-actor]', el);
  const rippleEl = $('[data-ripple]', el);
  const notesEl = $('[data-notes]', el);
  const sparksEl = $('[data-sparks]', el);
  const writeBtn = $<HTMLButtonElement>('[data-write]', el);
  const switcherEl = $('[data-switcher]', el);
  const entriesEl = $('[data-entries]', el);
  const reqBanner = $('[data-req-banner]', el);

  $('[data-seg-wrap]', el).appendChild(
    segment(['Benimkiler', pa.name], 0, (i) => {
      tab = i === 1 ? 'partner' : 'mine';
      renderList();
    }),
  );

  let entries: DiaryEntryMeta[] = [];
  let bottles: BottleBucket[] = [{ index: 1, entries: [], mineCount: 0, partnerCount: 0 }];
  let manualExtraBottle = false;

  // ---------- Canlı Dalga Çizimi & Şişe Salınımı (kişiye özel su tonu) ----------
  let waveRaf = 0;
  let wW = 340;
  let wH = 286;
  const syncCanvasSize = () => {
    const rect = oceanEl.getBoundingClientRect();
    if (rect.width < 20) return;
    wW = Math.round(rect.width);
    wH = Math.round(rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const cv of [cvBack, cvFront]) {
      cv.width = Math.round(wW * dpr);
      cv.height = Math.round(wH * dpr);
      cv.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };
  requestAnimationFrame(syncCanvasSize);

  const waveHeightAt = (x: number, tSec: number, layer: number): number => {
    const base = wH * (layer === 0 ? 0.57 : layer === 1 ? 0.63 : 0.67);
    const a1 = layer === 0 ? 5.2 : layer === 1 ? 7.2 : 8.2;
    const a2 = layer === 0 ? 2.8 : 4.0;
    return base + Math.sin(x * 0.019 + tSec * (1.1 + layer * 0.4) + layer) * a1 + Math.cos(x * 0.032 - tSec * (0.8 + layer * 0.2)) * a2;
  };

  const drawWavePoly = (ctx: CanvasRenderingContext2D, tSec: number, layer: number, topC: string, botC: string, crestC: string) => {
    const g = ctx.createLinearGradient(0, wH * 0.48, 0, wH);
    g.addColorStop(0, topC);
    g.addColorStop(1, botC);
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let x = 0; x <= wW + 10; x += 10) {
      const y = waveHeightAt(x, tSec, layer);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(wW, wH);
    ctx.lineTo(0, wH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = crestC;
    ctx.lineWidth = layer === 2 ? 1.5 : 1.05;
    ctx.beginPath();
    for (let x = 0; x <= wW + 10; x += 10) {
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
        if (isBeto) {
          drawWavePoly(bCtx, t, 0, 'rgba(34, 22, 58, 0.88)', 'rgba(14, 9, 28, 0.98)', 'rgba(255, 195, 222, 0.16)');
          drawWavePoly(bCtx, t, 1, 'rgba(46, 28, 76, 0.82)', 'rgba(18, 11, 34, 0.96)', 'rgba(255, 210, 230, 0.28)');
          drawWavePoly(fCtx, t, 2, 'rgba(72, 40, 104, 0.44)', 'rgba(15, 10, 30, 0.84)', 'rgba(255, 225, 238, 0.40)');
        } else {
          drawWavePoly(bCtx, t, 0, 'rgba(13, 30, 68, 0.88)', 'rgba(6, 14, 34, 0.98)', 'rgba(150, 205, 255, 0.18)');
          drawWavePoly(bCtx, t, 1, 'rgba(18, 46, 94, 0.82)', 'rgba(8, 18, 42, 0.96)', 'rgba(175, 228, 255, 0.28)');
          drawWavePoly(fCtx, t, 2, 'rgba(26, 68, 126, 0.46)', 'rgba(7, 16, 38, 0.82)', 'rgba(210, 244, 255, 0.42)');
        }
      }
      if (!castingAnim) {
        const driftX = Math.sin(t * 0.62) * 14;
        const cx = wW * 0.5 + driftX;
        const wy = waveHeightAt(cx, t, 1);
        const wyNext = waveHeightAt(cx + 8, t, 1);
        const slopeDeg = (Math.atan2(wyNext - wy, 8) * 180) / Math.PI;
        const tilt = 13 + slopeDeg * 0.85 + Math.sin(t * 1.25) * 3;
        const bobY = wy - wH * 0.63;
        actorEl.style.transform = `translate3d(${driftX.toFixed(1)}px, ${bobY.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
        const rScale = 0.92 + 0.14 * Math.sin(t * 2.1);
        rippleEl.style.transform = `translate(-50%, -50%) scale(${rScale.toFixed(2)})`;
      }
    }
    if (!reduced()) waveRaf = requestAnimationFrame(stepWaves);
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
        <span class="jar-req-txt"><b>${pa.name}</b> · <i>“${escapeHtml(req.message)}”</i> ${req.emojis.join('')}</span>
      </div>
      <div class="jar-req-btns">
        <button type="button" class="btn-choice no" data-q-no>Hayır</button>
        <button type="button" class="btn-choice yes" data-q-yes>Tamam, hadi</button>
        <button type="button" class="btn-choice detail" data-q-open aria-label="Gör">${I.eye(15)}</button>
      </div>
    </div>`;
    $('[data-q-no]', reqBanner).addEventListener('click', async () => {
      await respondToPeekRequest(req, false, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      toast('Mektubun sır kaldı 🤫');
    });
    $('[data-q-yes]', reqBanner).addEventListener('click', async () => {
      const ok = await respondToPeekRequest(req, true, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      if (ok) toast(`${pa.name} için açıldı 🤍`, I.heart(14));
    });
    $('[data-q-open]', reqBanner).addEventListener('click', () => openIncomingReqSheet(req));
  };

  const renderBottleSwitcher = () => {
    const b = currentBucket();
    if (bottles.length > 1) {
      switcherEl.classList.remove('hide');
      switcherEl.innerHTML = bottles
        .map((bt) => `<button type="button" class="btl-dot ${bt.index === b.index ? 'on' : ''}" data-bidx="${bt.index}">${bt.index}</button>`)
        .join('');
      $$('[data-bidx]', switcherEl).forEach((btn) =>
        btn.addEventListener('click', () => {
          activeBottleIdx = Number((btn as HTMLElement).dataset.bidx) || 1;
          renderBottleSwitcher();
          renderBottleScrolls();
          renderList();
        }),
      );
    } else {
      switcherEl.classList.add('hide');
    }
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
        aria-label="${entry.mine ? fmtVintageDate(entry.entryDate) : pa.name}">
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
          if (canSendPeekRequest(entry.id)) openPeekRequestSheet(entry);
          else openSealedPartnerSheet(entry);
        }
      });
      notesEl.appendChild(btn);
    });
  };

  const renderList = () => {
    const b = currentBucket();
    const list = tab === 'mine' ? b.entries.filter((e) => e.mine) : b.entries.filter((e) => !e.mine);
    entriesEl.innerHTML = '';

    if (!list.length) {
      entriesEl.innerHTML = `<div class="jar-empty">${tab === 'mine' ? 'Henüz bıraktığın bir mektup yok.' : `${pa.name} henüz mektup bırakmadı.`}</div>`;
      return;
    }

    for (const entry of list) {
      const pStatus = getPeekStatus(entry.id);
      const granted = !entry.mine && pStatus === 'approved' && grantedPeekEntries.has(entry.id);

      if (entry.mine || granted) {
        const card = h(`<button type="button" class="v-mini press">
          <span class="v-mini-seal ${entry.from}">${I.text(15)}</span>
          <span class="v-mini-body">
            <b>${fmtVintageDate(entry.entryDate)}</b>
            ${granted ? `<i>İzinle açıldı 🤍</i>` : ''}
          </span>
          <span class="v-mini-chev">${I.chevron(16)}</span>
        </button>`);
        card.addEventListener('click', () => void openVintageReader(entry));
        entriesEl.appendChild(card);
      } else {
        const statusBtn =
          pStatus === 'sent'
            ? `<span class="v-ask-pill sent">İstek gönderildi</span>`
            : pStatus === 'denied'
              ? `<span class="v-ask-pill denied">Sır kaldı</span>`
              : `<button type="button" class="v-ask-pill press" data-ask>Bakabilir miyim? 🥺</button>`;
        const card = h(`<div class="v-mini sealed-row">
          <span class="v-mini-seal ${entry.from}">${I.lock(14)}</span>
          <span class="v-mini-body"><b>${fmtVintageDate(entry.entryDate)}</b></span>
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
      if (jumpToLatestBottle || !bottles.some((b) => b.index === activeBottleIdx)) {
        activeBottleIdx = bottles[bottles.length - 1].index;
      }
      renderReqBanner();
      renderBottleSwitcher();
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

  const playCastIntoSea = async (
    who: 'hamham' | 'beto',
    fromRect: DOMRect,
    snippetText: string,
  ) => {
    if (reduced()) return;
    castingAnim = true;
    const root = document.getElementById('app') || document.body;
    const ribbonCol = who === 'beto' ? '#f0749e' : '#739dff';
    const sealCol = who === 'beto' ? '#c84b76' : '#436cd4';
    const stage = h(`<div class="cast-cinema" aria-hidden="true"></div>`);
    root.appendChild(stage);

    try {
      const rootRect = root.getBoundingClientRect();
      const cx = rootRect.width * 0.5;
      const cy = rootRect.height * 0.46;

      // ---------- AŞAMA 1: Vintage Mektubun Rulo Haline Sarılması ----------
      const startW = Math.min(320, Math.max(240, fromRect.width));
      const startH = Math.min(340, Math.max(220, fromRect.height));
      const pLeft = fromRect.left - rootRect.left + (fromRect.width - startW) * 0.5;
      const pTop = fromRect.top - rootRect.top + (fromRect.height - startH) * 0.5;

      const paperClone = h(`<div class="cinema-paper ${who === 'beto' ? 'persona-beto' : 'persona-ham'}"
        style="left:${pLeft}px;top:${pTop}px;width:${startW}px;height:${startH}px">
        <div class="cp-txt">${escapeHtml(snippetText.slice(0, 140))}</div>
        <div class="cp-roller"></div>
      </div>`);
      stage.appendChild(paperClone);

      const roller = $('.cp-roller', paperClone);
      roller.animate(
        [
          { top: '94%', opacity: 0.4, transform: 'scaleY(0.7)' },
          { top: '50%', opacity: 1, transform: 'scaleY(1.15)', offset: 0.5 },
          { top: '2%', opacity: 1, transform: 'scaleY(1.25)' },
        ],
        { duration: 540, easing: 'cubic-bezier(.32,.08,.24,1)', fill: 'forwards' },
      );

      await paperClone.animate(
        [
          {
            transform: 'translate3d(0,0,0) scale(1, 1)',
            clipPath: 'inset(0% 0% 0% 0% round 16px)',
          },
          {
            transform: `translate3d(${(cx - (pLeft + startW * 0.5)) * 0.6}px, ${(cy - 70 - (pTop + startH * 0.5)) * 0.6}px, 0) scale(0.62, 0.42)`,
            clipPath: 'inset(0% 14% 48% 14% round 18px)',
            offset: 0.68,
          },
          {
            transform: `translate3d(${cx - (pLeft + startW * 0.5)}px, ${cy - 86 - (pTop + startH * 0.5)}px, 0) scale(0.14, 0.24)`,
            clipPath: 'inset(0% 34% 72% 34% round 24px)',
            opacity: 0,
          },
        ],
        { duration: 560, easing: 'cubic-bezier(.3,.06,.2,1)', fill: 'forwards' },
      ).finished;
      paperClone.remove();

      // Sarılmış rulo + kurdele bağlanma pop'u
      const bigScroll = h(`<div class="cinema-scroll" style="left:${cx}px;top:${cy - 86}px">
        <svg viewBox="0 0 36 86" width="34" height="80">
          <rect x="4" y="3" width="28" height="80" rx="9" fill="${who === 'beto' ? '#faecee' : '#f5e7cb'}" stroke="#ba9c70" stroke-width="1.4"/>
          <ellipse cx="18" cy="7.5" rx="11" ry="3.6" fill="#dec89f"/>
          <path class="cs-rib" d="M4 42 H32" stroke="${ribbonCol}" stroke-width="5"/>
          <circle class="cs-seal" cx="18" cy="42" r="6.5" fill="${sealCol}" stroke="#fff7" stroke-width="1"/>
        </svg>
      </div>`);
      stage.appendChild(bigScroll);
      await bigScroll.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.65) rotate(-10deg)', opacity: 0.4 },
          { transform: 'translate(-50%, -50%) scale(1.14) rotate(4deg)', opacity: 1, offset: 0.65 },
          { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
        ],
        { duration: 240, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'forwards' },
      ).finished;

      // ---------- AŞAMA 2: Şişenin Açılması, Rulonun İçine Girmesi & Tıpanın Kapanması ----------
      actorEl.style.opacity = '0';
      const flyBottle = h(`<div class="cinema-bottle" style="left:${cx}px;top:${cy + 36}px">
        ${seaBottleSVG(who === 'beto')}
        <div class="cinema-inner-scroll hide">${rolledScrollSVG(who)}</div>
        ${seaBottleSheenSVG()}
      </div>`);
      stage.appendChild(flyBottle);
      const flyCork = $('.btl-cork', flyBottle) as HTMLElement | null;
      const innerScroll = $('.cinema-inner-scroll', flyBottle);

      if (flyCork) {
        flyCork.style.transform = 'translate(-24px, -28px) rotate(-32deg)';
      }
      await flyBottle.animate(
        [
          { transform: 'translate(-50%, 30px) scale(0.84)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1 },
        ],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      ).finished;

      // Rulo mektup şişenin ağzından içeri kayar
      await bigScroll.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
          { transform: 'translate(-50%, 18px) scale(0.66) rotate(2deg)', opacity: 1, offset: 0.55 },
          { transform: 'translate(-50%, 92px) scale(0.5) rotate(-4deg)', opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(.32,.04,.24,1)', fill: 'forwards' },
      ).finished;
      bigScroll.remove();
      innerScroll.classList.remove('hide');

      // Mantar tıpa hızla kapanır + şişe hafif esner
      if (flyCork) {
        await flyCork.animate(
          [
            { transform: 'translate(-24px, -28px) rotate(-32deg)' },
            { transform: 'translate(0, 2px) rotate(0deg)', offset: 0.72 },
            { transform: 'translate(0, 0) rotate(0deg)' },
          ],
          { duration: 220, easing: 'cubic-bezier(.2,1.35,.4,1)', fill: 'forwards' },
        ).finished;
      }

      // ---------- AŞAMA 3: Gerilip Bir Anda Denize Fırlatılma & Su Sıçraması ----------
      const oceanRect = oceanEl.getBoundingClientRect();
      const targetX = oceanRect.left - rootRect.left + oceanRect.width * 0.5;
      const targetY = oceanRect.top - rootRect.top + oceanRect.height * 0.56;
      const dx = targetX - cx;
      const dy = targetY - (cy + 36);

      const hurlAnim = flyBottle.animate(
        [
          // Mevcut konum
          { transform: 'translate(-50%, -50%) translate3d(0, 0, 0) scale(1.08) rotate(0deg)', opacity: 1 },
          // Geriye gerilme (fırlatma öncesi)
          { transform: 'translate(-50%, -50%) translate3d(-24px, 34px, 0) scale(1.22) rotate(-30deg)', opacity: 1, offset: 0.24 },
          // Yüksek yay çizerek havada dönerek fırlama!
          { transform: `translate(-50%, -50%) translate3d(${dx * 0.48}px, ${dy - 148}px, 0) scale(0.86) rotate(185deg)`, opacity: 1, offset: 0.64 },
          // Denize dalış!
          { transform: `translate(-50%, -50%) translate3d(${dx}px, ${dy + 18}px, 0) scale(0.96) rotate(373deg)`, opacity: 0.96, offset: 0.94 },
          { transform: `translate(-50%, -50%) translate3d(${dx}px, ${dy + 26}px, 0) scale(0.92) rotate(378deg)`, opacity: 0 },
        ],
        { duration: 680, easing: 'cubic-bezier(.26,.08,.22,1)', fill: 'forwards' },
      );

      // Tam suya çarpma anında büyük su tacı + damlalar + dalga halkaları
      window.setTimeout(() => {
        const crown = h(`<svg class="sea-crown" viewBox="0 0 120 54" width="116" height="52">
          <path d="M12 48 Q26 16 18 8 Q36 28 46 6 Q60 30 74 5 Q84 28 102 8 Q94 18 108 48 Z"
                fill="rgba(220,244,255,0.55)" stroke="rgba(255,255,255,0.8)" stroke-width="1.2"/>
        </svg>`);
        sparksEl.appendChild(crown);
        crown.animate(
          [
            { opacity: 0, transform: 'translate(-50%, 6px) scale(0.4, 0.2)' },
            { opacity: 1, transform: 'translate(-50%, -26px) scale(1.08, 1.15)', offset: 0.36 },
            { opacity: 0, transform: 'translate(-50%, -6px) scale(1.35, 0.15)' },
          ],
          { duration: 540, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'forwards' },
        ).finished.then(() => crown.remove());

        for (let r = 0; r < 2; r++) {
          const ring = h(`<span class="sea-ring"></span>`);
          sparksEl.appendChild(ring);
          ring.animate(
            [
              { opacity: 0.85, transform: 'translate(-50%, -50%) scale(0.35)' },
              { opacity: 0, transform: 'translate(-50%, -50%) scale(2.1)' },
            ],
            { duration: 760, delay: r * 130, easing: 'ease-out', fill: 'forwards' },
          ).finished.then(() => ring.remove());
        }

        for (let i = 0; i < 14; i++) {
          const drop = h(`<i class="sea-drop"></i>`);
          const spread = (i - 6.5) * 14 + (Math.random() - 0.5) * 8;
          const lift = -32 - Math.random() * 38;
          sparksEl.appendChild(drop);
          drop.animate(
            [
              { opacity: 1, transform: 'translate(0, 0) scale(0.8)' },
              { opacity: 0.92, transform: `translate(${spread * 0.58}px, ${lift}px) scale(1.18)`, offset: 0.44 },
              { opacity: 0, transform: `translate(${spread}px, 18px) scale(0.35)` },
            ],
            { duration: 660, easing: 'cubic-bezier(.2,.72,.28,1)', fill: 'forwards' },
          ).finished.then(() => drop.remove());
        }
      }, 610);

      await hurlAnim.finished;

      // Şişe suyun altından yüzeye çıkıp dalgalara oturur
      actorEl.style.opacity = '1';
      await actorEl.animate(
        [
          { transform: 'translate3d(0, 26px, 0) rotate(24deg)' },
          { transform: 'translate3d(0, -9px, 0) rotate(8deg)', offset: 0.55 },
          { transform: 'translate3d(0, 0px, 0) rotate(13deg)' },
        ],
        { duration: 520, easing: 'cubic-bezier(.22,.85,.3,1)', fill: 'forwards' },
      ).finished;
      actorEl.getAnimations().forEach((a) => a.cancel());
    } finally {
      actorEl.style.opacity = '1';
      stage.remove();
      castingAnim = false;
    }
  };

  function openSealedPartnerSheet(entry: DiaryEntryMeta) {
    const pStatus = getPeekStatus(entry.id);
    const body = h(`<div class="gk-peek-modal">
      <div class="gk-pm-icon ${entry.from}">${I.lock(20)}</div>
      <h3 class="gk-pm-title">${fmtVintageDate(entry.entryDate)}</h3>
      <p class="gk-pm-sub">${pStatus === 'sent' ? 'İsteğin gönderildi, yanıt bekleniyor 💌' : 'Bu mektup sır olarak kaldı 🤫'}</p>
      <div class="gk-pm-actions">
        <button type="button" class="btn-choice no" data-close>Kapat</button>
      </div>
    </div>`);
    const sh = openSheet(body, { cls: 'gk-glass-sheet' });
    $('[data-close]', body).addEventListener('click', () => void sh.close());
  }

  function openPeekRequestSheet(entry: DiaryEntryMeta) {
    if (!canSendPeekRequest(entry.id)) {
      openSealedPartnerSheet(entry);
      return;
    }
    let sticker: DiaryStickerId = 'plead';
    const pickedEmojis = new Set<string>(['🥺', '🤍']);
    const body = h(`<div class="gk-peek-modal gk-peek-compose">
      <div class="gk-pm-head">
        <div class="gk-pm-title">Bakabilir miyim?</div>
        <button type="button" class="icon-btn" data-close aria-label="Kapat">${I.close(18)}</button>
      </div>

      <div class="v-stickers" data-stickers>
        ${STICKERS.map((s) => `<button type="button" class="v-stk-btn ${s.id === sticker ? 'on' : ''}" data-stk="${s.id}">${s.render()}<span>${s.label}</span></button>`).join('')}
      </div>

      <div class="v-presets" data-presets>
        ${PEEK_PRESETS.map((p) => `<button type="button" class="v-preset">${p}</button>`).join('')}
      </div>

      <textarea class="gk-pm-inp" maxlength="220" placeholder="Mesajını yaz…" data-nodrag>${PEEK_PRESETS[0]}</textarea>

      <div class="v-emojis" data-emojis>
        ${PEEK_EMOJIS.map((em) => `<button type="button" class="v-em ${pickedEmojis.has(em) ? 'on' : ''}" data-em="${em}">${em}</button>`).join('')}
      </div>

      <div class="gk-pm-actions">
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
      toast('Mektubun sır kaldı 🤫');
    });

    $('[data-allow]', body).addEventListener('click', async () => {
      const ok = await respondToPeekRequest(req, true, (p) => core.sendDiaryPacket(p));
      renderReqBanner();
      await sh.close();
      if (ok) toast(`${pa.name} için açıldı 🤍`, I.heart(14));
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
      const authorBeto = entry.from === 'beto';
      const body = h(`<div class="v-sheet-wrap">
        <div class="v-paper v-reader ${authorBeto ? 'persona-beto' : 'persona-ham'}">
          ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
          <div class="v-lily-mark">${lilyBloom(36, -12)}</div>
          <div class="v-paper-head">
            <span class="v-date-txt">${fmtVintageDate(content.entryDate)}</span>
            ${entry.mine ? `<button type="button" class="v-del-btn" data-del aria-label="Sil">${I.trash(16)}</button>` : ''}
          </div>
          ${content.title ? `<h3 class="v-title">${escapeHtml(content.title)}</h3>` : ''}
          <div class="v-ruled-text">${escapeHtml(content.text).replace(/\n/g, '<br>')}</div>
          <div class="v-paper-foot">
            <span class="v-sign">— ${granted ? pa.name : PEOPLE[state.me].name}</span>
          </div>
        </div>
      </div>`);
      const sh = openSheet(body, { cls: 'v-sheet' });
      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Mektup silinsin mi?', 'Şişedeki bu mektup kalıcı olarak silinir.', 'Sil', true)) {
          await deleteMyDiaryEntry(entry.id);
          await sh.close();
          void reload();
        }
      });
    } catch {
      toast('Açılamadı', I.info(14));
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
      renderBottleSwitcher();
      renderBottleScrolls();
      renderList();
    }

    const dateIso = todayIso();
    const body = h(`<div class="v-sheet-wrap">
      <div class="v-paper v-writer ${isBeto ? 'persona-beto' : 'persona-ham'}">
        ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
        <div class="v-lily-mark">${lilyBloom(36, -12)}</div>
        <div class="v-paper-head">
          <span class="v-date-txt">${fmtVintageDate(dateIso)}</span>
          <button type="button" class="v-close-btn" data-close aria-label="Kapat">${I.close(18)}</button>
        </div>
        <div class="v-lines-wrap" data-nodrag>
          <textarea class="v-textarea" maxlength="2000" placeholder="Bugün neler oldu…"></textarea>
        </div>
        <div class="v-writer-foot">
          <button type="button" class="v-seal-btn" data-seal disabled>
            ${waxSealIcon()}<span>Denize bırak</span>
          </button>
        </div>
      </div>
    </div>`);

    const sh = openSheet(body, { cls: 'v-sheet' });
    const ta = $<HTMLTextAreaElement>('.v-textarea', body);
    const sealBtn = $<HTMLButtonElement>('[data-seal]', body);

    $('[data-close]', body).addEventListener('click', () => void sh.close());
    ta.addEventListener('input', () => {
      sealBtn.disabled = !ta.value.trim();
    });

    sealBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) return;
      sealBtn.disabled = true;
      const paperEl = $('.v-paper', body);
      const fromRect = paperEl.getBoundingClientRect();
      ta.blur();
      try {
        const saveP = saveDiaryEntry({
          title: '',
          text,
          mood: 'heart',
          entryDate: dateIso,
        });
        void sh.close();
        await Promise.all([playCastIntoSea(toDbWho(state.me), fromRect, text), saveP]);
        await reload(true);
      } catch {
        sealBtn.disabled = false;
        toast('Kaydedilemedi, tekrar dene', I.info(14));
      }
    });
  }

  $('[data-back]', el).addEventListener('click', () => {
    cancelAnimationFrame(waveRaf);
    unsubDiary();
    void popPage(core.homeEl);
  });
  writeBtn.addEventListener('click', () => openVintageWriter());
  window.addEventListener('resize', syncCanvasSize, { passive: true });
  void reload(true);
}
