// Anı Şişemiz — Mum / Gece Ateş Böceği Atmosferi, Şişe & Kağıt Atölyesi, Çoklu Ruh Hali,
// Bantlı Vintage Fotoğraf + Ses Kaydı, Pembe Saten Kurdele ve Akıntıyla Süzülen Şişe.
import { h, $, $$, pushPage, popPage, openSheet, segment, confirmSheet, toast, reduced } from './ui';
import { I } from './icons';
import { raspberry } from './art';
import { lilyBloom } from './lily';
import { state, PEOPLE, toDbWho } from './state';
import { core } from './core';
import { hash } from '../gokyuzu/util';
import { toBase64, fromBase64 } from '../lib/crypto';
import { VoiceRecorder, detectAudioMime, type RecordedVoice } from '../lib/media';
import {
  fetchDiaryJar,
  openMyDiaryEntry,
  saveDiaryEntry,
  deleteMyDiaryEntry,
  getSavedAtelierStyle,
  saveAtelierStyle,
  BOTTLE_PER_PERSON,
  BOTTLE_TOTAL,
  type DiaryEntryMeta,
  type DiaryMood,
  type BottleStyle,
  type PaperStyle,
  type MemoryMoodId,
} from '../lib/diary';

const MEMORY_MOODS: { id: MemoryMoodId; label: string; dbMood: DiaryMood }[] = [
  { id: 'peace', label: 'Huzurlu', dbMood: 'heart' },
  { id: 'love', label: 'Aşık', dbMood: 'heart' },
  { id: 'miss', label: 'Özlem dolu', dbMood: 'moon' },
  { id: 'happy', label: 'Mutlu', dbMood: 'sun' },
  { id: 'night', label: 'Gece düşüncesi', dbMood: 'moon' },
  { id: 'calm', label: 'Sakin', dbMood: 'coffee' },
  { id: 'emotional', label: 'Duygusal', dbMood: 'rain' },
  { id: 'hopeful', label: 'Umutlu', dbMood: 'spark' },
];

const MOOD_LABELS = Object.fromEntries(MEMORY_MOODS.map((m) => [m.id, m.label])) as Record<MemoryMoodId, string>;

const BOTTLE_STYLES: { id: BottleStyle; name: string; sub: string }[] = [
  { id: 'emerald', name: 'Eski Yeşil Cam', sub: 'Antika deniz şişesi' },
  { id: 'crystal', name: 'Şeffaf Kristal', sub: 'Ay ışığı yansımalı' },
  { id: 'shell', name: 'Deniz Kabuklu', sub: 'İnci & kabuk süslü' },
];

const PAPER_STYLES: { id: PaperStyle; name: string; sub: string }[] = [
  { id: 'straw', name: 'Saman Kağıdı', sub: 'Daktilo dokusu' },
  { id: 'sea', name: 'Islak Kenarlı Mektup', sub: 'Zarif el yazısı' },
  { id: 'night', name: 'Gece Mavisi Kart', sub: 'Altın gece mürekkebi' },
];

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

function isLateNightHour(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

function fmtVintageDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function compressMemoryPhoto(file: File): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 960 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
    cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('Canvas hazırlanamadı');
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', 0.78));
    if (!blob) throw new Error('Fotoğraf sıkıştırılamadı');
    const ab = await blob.arrayBuffer();
    const preview = URL.createObjectURL(blob);
    return { bytes: new Uint8Array(ab), mime: 'image/jpeg', preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Zarif İpek Pembe Kurdele Fiyongu (şişe boynu, polaroid ve vintage mektup süsü) */
let bowUid = 0;
function pinkRibbonSVG(size = 36, cls = ''): string {
  const id = `pkb${++bowUid}`;
  return `<svg class="pink-bow ${cls}" width="${size}" height="${Math.round(size * 0.88)}" viewBox="0 0 64 56" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffd1e2"/>
        <stop offset="52%" stop-color="#ff8fb6"/>
        <stop offset="100%" stop-color="#d84f80"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f779a6"/>
        <stop offset="100%" stop-color="#b93867"/>
      </linearGradient>
    </defs>
    <!-- Akan kurdele uçları -->
    <path d="M29 24 C24 35 18 44 13 52 L21 49 L25 54 C28 44 30 34 31 25 Z" fill="url(#${id}b)"/>
    <path d="M35 24 C40 35 46 44 51 52 L43 49 L39 54 C36 44 34 34 33 25 Z" fill="url(#${id}b)"/>
    <!-- Sol ve sağ saten fiyonk kanatları -->
    <path d="M31 22 C22 8 6 9 6 21 C6 32 21 33 31 24 Z" fill="url(#${id}a)" stroke="#b93867" stroke-width="0.8" stroke-opacity=".35"/>
    <path d="M33 22 C42 8 58 9 58 21 C58 32 43 33 33 24 Z" fill="url(#${id}a)" stroke="#b93867" stroke-width="0.8" stroke-opacity=".35"/>
    <!-- İpek kıvrım gölgeleri -->
    <path d="M15 20 Q23 22 29 23" stroke="#b93867" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>
    <path d="M49 20 Q41 22 35 23" stroke="#b93867" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>
    <!-- Orta düğüm -->
    <rect x="27.5" y="17.5" width="9" height="10" rx="4" fill="url(#${id}a)" stroke="#b93867" stroke-width="0.9" stroke-opacity=".4"/>
    <ellipse cx="30.5" cy="20" rx="2" ry="1.1" fill="#fff" opacity=".6"/>
  </svg>`;
}

function rolledScrollSVG(who: 'hamham' | 'beto'): string {
  const ribbon = who === 'beto' ? '#ff84b0' : '#739dff';
  const seal = who === 'beto' ? '#c84b76' : '#436cd4';
  const paper = who === 'beto' ? '#f9ecee' : '#f4e6ca';
  return `<svg viewBox="0 0 18 40" width="16" height="36" aria-hidden="true">
    <rect x="2.5" y="2" width="13" height="36" rx="4.5" fill="${paper}" stroke="#ba9c70" stroke-width="0.85"/>
    <ellipse cx="9" cy="4.2" rx="5.2" ry="1.8" fill="#dfc9a0"/>
    <path d="M2.5 18.5 H15.5" stroke="${ribbon}" stroke-width="2.6"/>
    <circle cx="9" cy="18.5" r="3.1" fill="${seal}" stroke="#fff5" stroke-width="0.6"/>
  </svg>`;
}

let btlUid = 0;
function seaBottleSVG(style: BottleStyle, isBeto: boolean, w = 156, hgt = 230): string {
  const uid = `btl${++btlUid}`;
  const palette =
    style === 'emerald'
      ? {
          gA: 'rgba(84, 188, 152, 0.36)',
          gB: 'rgba(150, 230, 198, 0.12)',
          gMid: 'rgba(34, 108, 84, 0.16)',
          stroke: 'rgba(154, 232, 202, 0.56)',
          base: 'rgba(66, 158, 126, 0.24)',
        }
      : style === 'shell'
        ? {
            gA: 'rgba(168, 224, 242, 0.32)',
            gB: 'rgba(255, 226, 238, 0.13)',
            gMid: 'rgba(120, 188, 214, 0.08)',
            stroke: 'rgba(220, 244, 255, 0.58)',
            base: 'rgba(195, 235, 248, 0.22)',
          }
        : {
            gA: isBeto ? 'rgba(255, 214, 232, 0.30)' : 'rgba(205, 236, 255, 0.32)',
            gB: 'rgba(255, 255, 255, 0.14)',
            gMid: 'rgba(255, 255, 255, 0.04)',
            stroke: 'rgba(240, 248, 255, 0.64)',
            base: 'rgba(235, 246, 255, 0.22)',
          };

  const crystalFacets =
    style === 'crystal'
      ? `<path d="M62 106 L58 232 M90 96 V240 M118 106 L122 232" stroke="rgba(255,255,255,0.16)" stroke-width="1" stroke-dasharray="2 3"/>`
      : '';

  const shellDecor =
    style === 'shell'
      ? `<g transform="translate(56, 78)">
          <circle cx="14" cy="4" r="2.2" fill="#fff7ee" opacity=".9"/>
          <circle cx="54" cy="4" r="2.2" fill="#fff7ee" opacity=".9"/>
          <path d="M34 0 C26 0 22 7 25 13 L34 15 L43 13 C46 7 42 0 34 0 Z" fill="#ffd9c8" stroke="#d99b84" stroke-width="0.9"/>
          <path d="M34 15 V3 M34 15 L28 4 M34 15 L40 4" stroke="#d99b84" stroke-width="0.7" opacity=".7"/>
        </g>`
      : '';

  return `<svg class="btl-svg" viewBox="0 0 180 265" width="${w}" height="${hgt}" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${palette.gA}"/>
        <stop offset="22%" stop-color="${palette.gB}"/>
        <stop offset="55%" stop-color="${palette.gMid}"/>
        <stop offset="100%" stop-color="${palette.gA}"/>
      </linearGradient>
      <linearGradient id="${uid}c" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#986c43"/>
        <stop offset="42%" stop-color="#cfa376"/>
        <stop offset="100%" stop-color="#7f5632"/>
      </linearGradient>
    </defs>

    <g class="btl-cork">
      <path d="M74 14 C74 10 78 7 83 7 H97 C102 7 106 10 106 14 L103 42 H77 Z"
            fill="url(#${uid}c)" stroke="#694525" stroke-width="1.1"/>
      <ellipse cx="90" cy="12" rx="12" ry="2.2" fill="rgba(255,244,225,0.22)"/>
    </g>

    <path d="M73 36 H107 V66 C107 84 142 96 144 126 V224 C144 242 130 252 112 252 H68 C50 252 36 242 36 224 V126 C38 96 73 84 73 66 Z"
          fill="url(#${uid}g)" stroke="${palette.stroke}" stroke-width="1.55"/>
    ${crystalFacets}
    <rect x="69" y="33" width="42" height="8" rx="4" fill="rgba(255,255,255,0.18)" stroke="${palette.stroke}" stroke-width="1.2"/>
    <path d="M72 52 Q90 57 108 52" fill="none" stroke="#ff9ec0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M42 232 C42 243 55 247 70 247 H110 C125 247 138 243 138 232"
          fill="${palette.base}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
    ${shellDecor}
  </svg>
  <div class="btl-bow">${pinkRibbonSVG(34)}</div>
  ${isBeto ? `<div class="btl-charm">${raspberry(11)}</div>` : ''}`;
}

function seaBottleSheenSVG(w = 156, hgt = 230): string {
  return `<svg class="btl-sheen" viewBox="0 0 180 265" width="${w}" height="${hgt}" aria-hidden="true">
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

function candleIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3c1.8 2.2 2.6 3.8 2.6 5.2a2.6 2.6 0 1 1-5.2 0C9.4 6.8 10.2 5.2 12 3Z"/>
    <rect x="8" y="11" width="8" height="10" rx="2"/>
  </svg>`;
}

function firefliesHTML(count = 9): string {
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    const left = 8 + ((i * 37) % 84);
    const top = 6 + ((i * 29) % 82);
    const delay = -((i * 1.3) % 6).toFixed(1);
    const dur = (4.2 + (i % 4) * 0.9).toFixed(1);
    items.push(`<i style="left:${left}%;top:${top}%;animation-delay:${delay}s;animation-duration:${dur}s"></i>`);
  }
  return `<div class="candle-fireflies" aria-hidden="true">${items.join('')}</div>`;
}

export function openDiaryJar(): void {
  const isBeto = state.me === 'beto';
  const pa = PEOPLE[state.partner];
  let tab: 'mine' | 'partner' = 'mine';
  let activeBottleIdx = 1;
  let castingAnim = false;
  let liveDriftX = 0;
  let pref = getSavedAtelierStyle();

  const el = h(`<div class="screen page jar-page">
    <div class="page-head">
      <button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button>
      <div class="title" style="font-size:34px;display:flex;align-items:center;gap:8px">Anı Şişemiz ${lilyBloom(26, 12)}</div>
      <span class="grow"></span>
      <div class="bottle-dots hide" data-switcher></div>
    </div>

    <div class="bottle-ocean" data-ocean>
      <div class="ocean-moon-glow"></div>
      <div class="jar-motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <canvas class="ocean-cv back" data-cv-back></canvas>
      <div class="bottle-actor" data-actor>
        <div class="bottle-ripple" data-ripple></div>
        <div class="bottle-body" data-bottle-model>
          ${seaBottleSVG(pref.bottle, isBeto)}
          <div class="btl-scrolls" data-notes></div>
          ${seaBottleSheenSVG()}
        </div>
      </div>
      <canvas class="ocean-cv front" data-cv-front></canvas>
      <div class="sea-splash-layer" data-sparks></div>
    </div>

    <div class="jar-cta-row">
      <button type="button" class="btn btn-primary btn-block jar-write-btn" data-write>
        ${isBeto ? `<span class="rb">${raspberry(13)}</span>` : I.pen(17)}<span>Anı bırak</span>
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
  const bottleModelEl = $('[data-bottle-model]', el);
  const rippleEl = $('[data-ripple]', el);
  let notesEl = $('[data-notes]', el);
  const sparksEl = $('[data-sparks]', el);
  const writeBtn = $<HTMLButtonElement>('[data-write]', el);
  const switcherEl = $('[data-switcher]', el);
  const entriesEl = $('[data-entries]', el);

  const refreshBottleModel = (style: BottleStyle) => {
    bottleModelEl.innerHTML = `
      ${seaBottleSVG(style, isBeto)}
      <div class="btl-scrolls" data-notes></div>
      ${seaBottleSheenSVG()}
    `;
    notesEl = $('[data-notes]', bottleModelEl);
    renderBottleScrolls();
  };

  $('[data-seg-wrap]', el).appendChild(
    segment(['Benim Anılarım', pa.name], 0, (i) => {
      tab = i === 1 ? 'partner' : 'mine';
      renderList();
    }),
  );

  let entries: DiaryEntryMeta[] = [];
  let bottles: BottleBucket[] = [{ index: 1, entries: [], mineCount: 0, partnerCount: 0 }];
  let manualExtraBottle = false;

  // ---------- Canlı Dalga Çizimi & Akıntıyla Sağa-Sola Süzülme ----------
  let waveRaf = 0;
  let wW = 340;
  let wH = 294;
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
    const base = wH * (layer === 0 ? 0.56 : layer === 1 ? 0.62 : 0.67);
    const a1 = layer === 0 ? 5.5 : layer === 1 ? 7.8 : 9.0;
    const a2 = layer === 0 ? 3.2 : 4.5;
    return (
      base +
      Math.sin(x * 0.02 + tSec * (1.15 + layer * 0.42) + layer) * a1 +
      Math.cos(x * 0.034 - tSec * (0.85 + layer * 0.22)) * a2
    );
  };

  const drawWavePoly = (
    ctx: CanvasRenderingContext2D,
    tSec: number,
    layer: number,
    topC: string,
    botC: string,
    crestC: string,
  ) => {
    const g = ctx.createLinearGradient(0, wH * 0.46, 0, wH);
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
        const maxDrift = Math.max(46, (wW - 144) * 0.46);
        const ph1 = t * 0.44;
        const ph2 = t * 0.21 + 1.3;
        const driftX = Math.sin(ph1) * (maxDrift * 0.72) + Math.sin(ph2) * (maxDrift * 0.28);
        const driftVx =
          Math.cos(ph1) * 0.44 * (maxDrift * 0.72) + Math.cos(ph2) * 0.21 * (maxDrift * 0.28);
        liveDriftX = driftX;

        const cx = wW * 0.5 + driftX;
        const wy = waveHeightAt(cx, t, 1);
        const wyNext = waveHeightAt(cx + 8, t, 1);
        const slopeDeg = (Math.atan2(wyNext - wy, 8) * 180) / Math.PI;
        const tilt = 10 + slopeDeg * 0.92 + driftVx * 0.14 + Math.sin(t * 1.35) * 3.4;
        const bobY = wy - wH * 0.62;

        actorEl.style.transform = `translate3d(${driftX.toFixed(1)}px, ${bobY.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
        const rScale = 0.9 + 0.16 * Math.sin(t * 2.2);
        rippleEl.style.transform = `translate(-50%, -50%) scale(${rScale.toFixed(2)})`;
      }
    }
    if (!reduced()) waveRaf = requestAnimationFrame(stepWaves);
  };
  waveRaf = requestAnimationFrame(stepWaves);

  const currentBucket = (): BottleBucket =>
    bottles.find((b) => b.index === activeBottleIdx) ?? bottles[bottles.length - 1];

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
      const leftPct = 9 + col * 18.5 + jitterX * 0.5;
      const bottomPx = 6 + row * 22 + jitterY * 0.6;
      const btn = h(`<button type="button" class="btl-scroll ${entry.from} ${entry.mine ? 'mine' : 'sealed'}"
        style="left:${leftPct.toFixed(1)}%;bottom:${bottomPx.toFixed(1)}px;--r:${rot}deg"
        aria-label="${entry.mine ? fmtVintageDate(entry.entryDate) : pa.name}">
        ${rolledScrollSVG(entry.from)}
      </button>`);
      btn.addEventListener('click', () => {
        if (entry.mine) {
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
          toast(`${pa.of} anısı · İleride birlikte açmak için şişede birikiyor`, I.lock(14), 2600);
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
      entriesEl.innerHTML = `<div class="jar-empty">${
        tab === 'mine' ? 'Şişede henüz bir anın yok.' : `${pa.name} henüz bir anı bırakmadı.`
      }</div>`;
      return;
    }

    for (const entry of list) {
      if (entry.mine) {
        const card = h(`<button type="button" class="v-mini press">
          <span class="v-mini-seal ${entry.from}">${I.text(15)}</span>
          <span class="v-mini-body"><b>${fmtVintageDate(entry.entryDate)}</b></span>
          <span class="v-mini-chev">${I.chevron(16)}</span>
        </button>`);
        card.addEventListener('click', () => void openVintageReader(entry));
        entriesEl.appendChild(card);
      } else {
        const card = h(`<div class="v-mini sealed-row">
          <span class="v-mini-seal ${entry.from}">${I.lock(14)}</span>
          <span class="v-mini-body"><b>${fmtVintageDate(entry.entryDate)}</b></span>
          <span class="v-ask-pill sent">Şişede saklı</span>
        </div>`);
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
      renderBottleSwitcher();
      renderBottleScrolls();
      renderList();
    } catch {
      toast('Şişe yüklenemedi', I.info(14));
    }
  };

  // ---------- Anıyı Sarma -> Seçilen Şişeye Koyma -> Bir Anda Denize Fırlatma ----------
  const playCastIntoSea = async (
    who: 'hamham' | 'beto',
    bStyle: BottleStyle,
    pStyle: PaperStyle,
    fromRect: DOMRect,
    snippetText: string,
  ) => {
    if (reduced()) return;
    castingAnim = true;
    const root = document.getElementById('app') || document.body;
    const ribbonCol = '#ff84b0';
    const sealCol = who === 'beto' ? '#c84b76' : '#436cd4';
    const stage = h(`<div class="cast-cinema" aria-hidden="true"></div>`);
    root.appendChild(stage);

    try {
      const rootRect = root.getBoundingClientRect();
      const cx = rootRect.width * 0.5;
      const cy = rootRect.height * 0.46;

      const startW = Math.min(320, Math.max(240, fromRect.width));
      const startH = Math.min(340, Math.max(220, fromRect.height));
      const pLeft = fromRect.left - rootRect.left + (fromRect.width - startW) * 0.5;
      const pTop = fromRect.top - rootRect.top + (fromRect.height - startH) * 0.5;

      const paperClone = h(`<div class="cinema-paper paper-${pStyle}"
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
          { transform: 'translate3d(0,0,0) scale(1, 1)', clipPath: 'inset(0% 0% 0% 0% round 16px)' },
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

      const rollFill = pStyle === 'night' ? '#1c2b56' : pStyle === 'straw' ? '#e7d2a8' : '#f7eee0';
      const bigScroll = h(`<div class="cinema-scroll" style="left:${cx}px;top:${cy - 86}px">
        <svg viewBox="0 0 36 86" width="34" height="80">
          <rect x="4" y="3" width="28" height="80" rx="9" fill="${rollFill}" stroke="#ba9c70" stroke-width="1.4"/>
          <ellipse cx="18" cy="7.5" rx="11" ry="3.6" fill="#dec89f"/>
          <path d="M4 42 H32" stroke="${ribbonCol}" stroke-width="5"/>
          <circle cx="18" cy="42" r="6.5" fill="${sealCol}" stroke="#fff7" stroke-width="1"/>
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

      actorEl.style.opacity = '0';
      const flyBottle = h(`<div class="cinema-bottle" style="left:${cx}px;top:${cy + 36}px">
        ${seaBottleSVG(bStyle, who === 'beto')}
        <div class="cinema-inner-scroll hide">${rolledScrollSVG(who)}</div>
        ${seaBottleSheenSVG()}
      </div>`);
      stage.appendChild(flyBottle);
      const flyCork = $('.btl-cork', flyBottle) as HTMLElement | null;
      const innerScroll = $('.cinema-inner-scroll', flyBottle);

      if (flyCork) flyCork.style.transform = 'translate(-24px, -28px) rotate(-32deg)';
      await flyBottle.animate(
        [
          { transform: 'translate(-50%, 30px) scale(0.84)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1 },
        ],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      ).finished;

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

      const oceanRect = oceanEl.getBoundingClientRect();
      const targetX = oceanRect.left - rootRect.left + oceanRect.width * 0.5 + liveDriftX;
      const targetY = oceanRect.top - rootRect.top + oceanRect.height * 0.56;
      const dx = targetX - cx;
      const dy = targetY - (cy + 36);
      sparksEl.style.transform = `translateX(${liveDriftX.toFixed(1)}px)`;

      const hurlAnim = flyBottle.animate(
        [
          { transform: 'translate(-50%, -50%) translate3d(0, 0, 0) scale(1.08) rotate(0deg)', opacity: 1 },
          { transform: 'translate(-50%, -50%) translate3d(-24px, 34px, 0) scale(1.22) rotate(-30deg)', opacity: 1, offset: 0.24 },
          { transform: `translate(-50%, -50%) translate3d(${dx * 0.48}px, ${dy - 148}px, 0) scale(0.86) rotate(185deg)`, opacity: 1, offset: 0.64 },
          { transform: `translate(-50%, -50%) translate3d(${dx}px, ${dy + 18}px, 0) scale(0.96) rotate(373deg)`, opacity: 0.96, offset: 0.94 },
          { transform: `translate(-50%, -50%) translate3d(${dx}px, ${dy + 26}px, 0) scale(0.92) rotate(378deg)`, opacity: 0 },
        ],
        { duration: 680, easing: 'cubic-bezier(.26,.08,.22,1)', fill: 'forwards' },
      );

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

      actorEl.style.opacity = '1';
      await actorEl.animate(
        [
          { transform: `translate3d(${liveDriftX.toFixed(1)}px, 26px, 0) rotate(24deg)` },
          { transform: `translate3d(${liveDriftX.toFixed(1)}px, -9px, 0) rotate(8deg)`, offset: 0.55 },
          { transform: `translate3d(${liveDriftX.toFixed(1)}px, 0px, 0) rotate(10deg)` },
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

  // ---------- Vintage Anı Okuyucu (Fotoğraf, Ses Plağı, Çoklu Ruh Hali & Kağıt Dokusu) ----------
  async function openVintageReader(entry: DiaryEntryMeta) {
    let audioUrl: string | null = null;
    let photoUrl: string | null = null;
    let audioEl: HTMLAudioElement | null = null;
    let waveTimer = 0;

    try {
      const content = await openMyDiaryEntry(entry.id);
      if (!content) {
        toast('Bu anı kilitli', I.lock(14));
        return;
      }
      const pStyle: PaperStyle = content.paperStyle ?? (entry.from === 'beto' ? 'sea' : 'straw');
      const moods = content.moods?.length ? content.moods : [];

      if (content.photoB64) {
        const bytes = fromBase64(content.photoB64);
        photoUrl = URL.createObjectURL(new Blob([bytes], { type: content.photoMime || 'image/jpeg' }));
      }
      if (content.voiceB64) {
        const bytes = fromBase64(content.voiceB64);
        const mime = detectAudioMime(bytes, content.voiceMime || 'audio/mp4');
        audioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      }

      const peaks = content.voicePeaks?.length
        ? content.voicePeaks
        : Array.from({ length: 24 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.7)));

      const body = h(`<div class="v-sheet-wrap candle-on">
        ${firefliesHTML(7)}
        <div class="v-paper v-reader paper-${pStyle}">
          ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
          <div class="v-top-bow">${pinkRibbonSVG(40)}</div>
          <div class="v-lily-mark">${lilyBloom(34, -12)}</div>
          <div class="v-paper-head">
            <span class="v-date-txt">${fmtVintageDate(content.entryDate)}</span>
            <button type="button" class="v-del-btn" data-del aria-label="Sil">${I.trash(16)}</button>
          </div>

          ${
            moods.length
              ? `<div class="v-mood-badges">${moods
                  .map((m) => `<span class="v-mbadge">${MOOD_LABELS[m] ?? m}</span>`)
                  .join('')}</div>`
              : ''
          }

          ${
            photoUrl
              ? `<figure class="v-polaroid">
                  <span class="v-tape left"></span><span class="v-tape right"></span>
                  <img src="${photoUrl}" alt="">
                  <span class="v-pol-bow">${pinkRibbonSVG(26)}</span>
                </figure>`
              : ''
          }

          ${content.text ? `<div class="v-ruled-text">${escapeHtml(content.text).replace(/\n/g, '<br>')}</div>` : ''}

          ${
            audioUrl
              ? `<div class="v-tape-player" data-player>
                  <button type="button" class="v-play-btn" data-play aria-label="Dinle">${I.play(16)}</button>
                  <div class="v-tape-bars" data-bars>
                    ${peaks.map((p) => `<i style="height:${Math.round(8 + p * 20)}px"></i>`).join('')}
                  </div>
                  <span class="v-tape-dur" data-dur>${fmtSec(content.voiceDur ?? 0)}</span>
                </div>`
              : ''
          }

          <div class="v-paper-foot">
            <span class="v-sign">— ${PEOPLE[state.me].name}</span>
          </div>
        </div>
      </div>`);

      const cleanupMedia = () => {
        clearInterval(waveTimer);
        if (audioEl) {
          audioEl.pause();
          audioEl.src = '';
          audioEl = null;
        }
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
      };

      const sh = openSheet(body, { cls: 'v-sheet candle-sheet', onClose: cleanupMedia });

      if (audioUrl) {
        const playBtn = $('[data-play]', body);
        const durEl = $('[data-dur]', body);
        const barEls = $$('[data-bars] i', body);
        audioEl = new Audio(audioUrl);
        audioEl.preload = 'metadata';

        playBtn.addEventListener('click', () => {
          if (!audioEl) return;
          if (audioEl.paused) {
            void audioEl.play();
            playBtn.innerHTML = I.pause(16);
            clearInterval(waveTimer);
            waveTimer = window.setInterval(() => {
              if (!audioEl) return;
              const tot = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : content.voiceDur || 1;
              const ratio = Math.min(1, audioEl.currentTime / tot);
              const activeN = Math.round(ratio * barEls.length);
              barEls.forEach((b, idx) => b.classList.toggle('on', idx < activeN));
              durEl.textContent = fmtSec(audioEl.currentTime);
            }, 90);
          } else {
            audioEl.pause();
            playBtn.innerHTML = I.play(16);
            clearInterval(waveTimer);
          }
        });
        audioEl.addEventListener('ended', () => {
          clearInterval(waveTimer);
          playBtn.innerHTML = I.play(16);
          barEls.forEach((b) => b.classList.remove('on'));
          durEl.textContent = fmtSec(content.voiceDur ?? 0);
        });
      }

      body.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Anı silinsin mi?', 'Şişedeki bu anı kalıcı olarak silinir.', 'Sil', true)) {
          await deleteMyDiaryEntry(entry.id);
          await sh.close();
          void reload();
        }
      });
    } catch {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      toast('Açılamadı', I.info(14));
    }
  }

  // ---------- ADIM 1: Yazmaya Başlamadan Önce Şişe & Kağıt Dokusu Atölyesi ----------
  function openAtelierPicker() {
    let chosenBottle: BottleStyle = pref.bottle;
    let chosenPaper: PaperStyle = pref.paper;

    const body = h(`<div class="atelier-sheet">
      ${firefliesHTML(8)}
      <div class="atelier-head">
        <div class="atelier-bow">${pinkRibbonSVG(34)}</div>
        <div class="atelier-title">Anı Atölyesi</div>
        <button type="button" class="icon-btn" data-close aria-label="Kapat">${I.close(18)}</button>
      </div>

      <div class="atelier-lbl">Şişeni seç</div>
      <div class="atelier-bottles" data-bottles>
        ${BOTTLE_STYLES.map(
          (b) => `<button type="button" class="at-btl-card ${b.id === chosenBottle ? 'on' : ''}" data-btl="${b.id}">
            <div class="at-btl-prev">${seaBottleSVG(b.id, isBeto, 68, 100)}</div>
            <b>${b.name}</b>
            <i>${b.sub}</i>
          </button>`,
        ).join('')}
      </div>

      <div class="atelier-lbl">Kağıt dokusu ve yazı hissi</div>
      <div class="atelier-papers" data-papers>
        ${PAPER_STYLES.map(
          (p) => `<button type="button" class="at-pap-card paper-${p.id} ${p.id === chosenPaper ? 'on' : ''}" data-pap="${p.id}">
            <span class="at-pap-sample">Aa</span>
            <span class="at-pap-tx"><b>${p.name}</b><i>${p.sub}</i></span>
          </button>`,
        ).join('')}
      </div>

      <button type="button" class="btn btn-primary btn-block atelier-go" data-go>
        ${I.pen(17)}<span>Anıyı yazmaya başla</span>
      </button>
    </div>`);

    const sh = openSheet(body, { cls: 'gk-glass-sheet candle-sheet' });
    $('[data-close]', body).addEventListener('click', () => void sh.close());

    $$('[data-btl]', body).forEach((btn) =>
      btn.addEventListener('click', () => {
        chosenBottle = (btn as HTMLElement).dataset.btl as BottleStyle;
        $$('[data-btl]', body).forEach((x) => x.classList.toggle('on', x === btn));
      }),
    );

    $$('[data-pap]', body).forEach((btn) =>
      btn.addEventListener('click', () => {
        chosenPaper = (btn as HTMLElement).dataset.pap as PaperStyle;
        $$('[data-pap]', body).forEach((x) => x.classList.toggle('on', x === btn));
      }),
    );

    $('[data-go]', body).addEventListener('click', async () => {
      pref = { bottle: chosenBottle, paper: chosenPaper };
      saveAtelierStyle(chosenBottle, chosenPaper);
      refreshBottleModel(chosenBottle);
      await sh.close();
      openVintageWriter(chosenBottle, chosenPaper);
    });
  }

  // ---------- ADIM 2: Mum / Ateş Böceği Atmosferli Vintage Anı Yazma Alanı ----------
  function openVintageWriter(bStyle: BottleStyle, initialPaper: PaperStyle) {
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

    const pStyle: PaperStyle = initialPaper;
    const selectedMoods = new Set<MemoryMoodId>(['peace']);
    let candleMode: boolean = isLateNightHour() || pStyle === 'night' || Boolean(1);
    let attachedPhoto: { bytes: Uint8Array<ArrayBuffer>; mime: string; preview: string } | null = null;
    let attachedVoice: RecordedVoice | null = null;
    let recorder: VoiceRecorder | null = null;
    let recTimer = 0;
    let previewAudio: HTMLAudioElement | null = null;

    const dateIso = todayIso();
    const body = h(`<div class="v-sheet-wrap ${candleMode ? 'candle-on' : ''}" data-wrap>
      <div class="candle-aura" aria-hidden="true"></div>
      ${firefliesHTML(10)}
      <div class="v-paper v-writer paper-${pStyle}">
        ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
        <div class="v-top-bow">${pinkRibbonSVG(40)}</div>
        <div class="v-lily-mark">${lilyBloom(34, -12)}</div>

        <div class="v-paper-head">
          <span class="v-date-txt">${fmtVintageDate(dateIso)}</span>
          <div class="v-head-r">
            <button type="button" class="v-candle-btn ${candleMode ? 'on' : ''}" data-candle aria-label="Mum ışığı modu" title="Mum atmosferi">
              ${candleIcon()}<span>Mum</span>
            </button>
            <button type="button" class="v-close-btn" data-close aria-label="Kapat">${I.close(18)}</button>
          </div>
        </div>

        <div class="v-mood-sec" data-nodrag>
          <div class="v-sec-lbl">Ruh halin nasıl? <i>(birden fazla seçebilirsin)</i></div>
          <div class="v-moods" data-moods>
            ${MEMORY_MOODS.map(
              (m) =>
                `<button type="button" class="v-mood ${selectedMoods.has(m.id) ? 'on' : ''}" data-m="${m.id}">${m.label}</button>`,
            ).join('')}
          </div>
        </div>

        <div class="v-lines-wrap" data-nodrag>
          <div data-photo-slot></div>
          <textarea class="v-textarea" maxlength="2000" placeholder="Bugünden bir anı bırak…"></textarea>
          <div data-voice-slot></div>
        </div>

        <div class="v-media-bar" data-nodrag>
          <label class="v-attach-btn press">
            ${I.camera(16)}<span>Fotoğraf yapıştır</span>
            <input type="file" accept="image/*" hidden data-photo-inp>
          </label>
          <button type="button" class="v-attach-btn press" data-voice-btn>
            ${I.mic(16)}<span data-voice-lbl>Ses kaydı ekle</span>
          </button>
        </div>

        <div class="v-writer-foot">
          <button type="button" class="v-seal-btn" data-seal disabled>
            ${waxSealIcon()}<span>Denize bırak</span>
          </button>
        </div>
      </div>
    </div>`);

    const cleanupWriter = () => {
      clearInterval(recTimer);
      recorder?.cleanup();
      recorder = null;
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.src = '';
        previewAudio = null;
      }
      if (attachedPhoto) {
        URL.revokeObjectURL(attachedPhoto.preview);
      }
    };

    const sh = openSheet(body, { cls: 'v-sheet candle-sheet', onClose: cleanupWriter });
    const wrapEl = $('[data-wrap]', body);
    const ta = $<HTMLTextAreaElement>('.v-textarea', body);
    const sealBtn = $<HTMLButtonElement>('[data-seal]', body);
    const candleBtn = $('[data-candle]', body);
    const photoSlot = $('[data-photo-slot]', body);
    const voiceSlot = $('[data-voice-slot]', body);
    const photoInp = $<HTMLInputElement>('[data-photo-inp]', body);
    const voiceBtn = $<HTMLButtonElement>('[data-voice-btn]', body);
    const voiceLbl = $('[data-voice-lbl]', body);

    const checkValid = () => {
      const ok = Boolean(ta.value.trim()) || Boolean(attachedPhoto) || Boolean(attachedVoice);
      sealBtn.disabled = !ok || Boolean(recorder);
    };

    candleBtn.addEventListener('click', () => {
      candleMode = !candleMode;
      candleBtn.classList.toggle('on', candleMode);
      wrapEl.classList.toggle('candle-on', candleMode);
    });

    $$('[data-m]', body).forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.m as MemoryMoodId;
        if (selectedMoods.has(id)) {
          if (selectedMoods.size > 1) selectedMoods.delete(id);
        } else {
          selectedMoods.add(id);
        }
        btn.classList.toggle('on', selectedMoods.has(id));
      }),
    );

    const renderPhotoPreview = () => {
      photoSlot.innerHTML = '';
      if (!attachedPhoto) return;
      const fig = h(`<figure class="v-polaroid">
        <span class="v-tape left"></span><span class="v-tape right"></span>
        <img src="${attachedPhoto.preview}" alt="">
        <span class="v-pol-bow">${pinkRibbonSVG(26)}</span>
        <button type="button" class="v-pol-rm" aria-label="Fotoğrafı kaldır">${I.close(14)}</button>
      </figure>`);
      $('.v-pol-rm', fig).addEventListener('click', () => {
        if (attachedPhoto) URL.revokeObjectURL(attachedPhoto.preview);
        attachedPhoto = null;
        photoInp.value = '';
        renderPhotoPreview();
        checkValid();
      });
      photoSlot.appendChild(fig);
    };

    photoInp.addEventListener('change', async () => {
      const f = photoInp.files?.[0];
      if (!f) return;
      try {
        if (attachedPhoto) URL.revokeObjectURL(attachedPhoto.preview);
        attachedPhoto = await compressMemoryPhoto(f);
        renderPhotoPreview();
        checkValid();
      } catch {
        toast('Fotoğraf okunamadı', I.info(14));
      }
    });

    const renderVoicePreview = () => {
      voiceSlot.innerHTML = '';
      if (recorder) {
        const strip = h(`<div class="v-tape-player recording">
          <span class="v-rec-dot"></span>
          <span class="v-rec-txt">Kaydediliyor… <b data-rt>0:00</b></span>
          <button type="button" class="v-stop-btn" data-stop>Bitir</button>
        </div>`);
        $('[data-stop]', strip).addEventListener('click', () => void finishRecording());
        voiceSlot.appendChild(strip);
        return;
      }
      if (!attachedVoice) return;
      const v = attachedVoice;
      const peaks = v.peaks?.length ? v.peaks.slice(0, 22) : Array.from({ length: 22 }, () => 0.45);
      const strip = h(`<div class="v-tape-player">
        <button type="button" class="v-play-btn" data-vplay aria-label="Dinle">${I.play(15)}</button>
        <div class="v-tape-bars">${peaks.map((p) => `<i style="height:${Math.round(8 + p * 18)}px"></i>`).join('')}</div>
        <span class="v-tape-dur">${fmtSec(v.dur)}</span>
        <button type="button" class="v-pol-rm inline" data-vrm aria-label="Sesi kaldır">${I.close(14)}</button>
      </div>`);
      const playB = $('[data-vplay]', strip);
      playB.addEventListener('click', () => {
        if (!previewAudio) {
          previewAudio = new Audio(v.previewUrl);
          previewAudio.addEventListener('ended', () => {
            playB.innerHTML = I.play(15);
          });
        }
        if (previewAudio.paused) {
          void previewAudio.play();
          playB.innerHTML = I.pause(15);
        } else {
          previewAudio.pause();
          playB.innerHTML = I.play(15);
        }
      });
      $('[data-vrm]', strip).addEventListener('click', () => {
        if (previewAudio) {
          previewAudio.pause();
          previewAudio.src = '';
          previewAudio = null;
        }
        URL.revokeObjectURL(v.previewUrl);
        attachedVoice = null;
        voiceLbl.textContent = 'Ses kaydı ekle';
        renderVoicePreview();
        checkValid();
      });
      voiceSlot.appendChild(strip);
    };

    const finishRecording = async () => {
      if (!recorder) return;
      clearInterval(recTimer);
      const r = recorder;
      recorder = null;
      voiceBtn.classList.remove('on');
      try {
        if (attachedVoice) URL.revokeObjectURL(attachedVoice.previewUrl);
        attachedVoice = await r.stop();
        voiceLbl.textContent = 'Sesi yenile';
      } catch (err) {
        toast((err as Error)?.message || 'Ses kaydedilemedi', I.info(14));
      }
      renderVoicePreview();
      checkValid();
    };

    voiceBtn.addEventListener('click', async () => {
      if (recorder) {
        await finishRecording();
        return;
      }
      try {
        const r = new VoiceRecorder();
        await r.start();
        recorder = r;
        voiceBtn.classList.add('on');
        voiceLbl.textContent = 'Kaydı bitir';
        renderVoicePreview();
        checkValid();
        clearInterval(recTimer);
        recTimer = window.setInterval(() => {
          if (!recorder) return;
          const elSec = recorder.elapsedSec();
          const rt = voiceSlot.querySelector('[data-rt]');
          if (rt) rt.textContent = fmtSec(elSec);
          if (elSec >= 90) void finishRecording();
        }, 250);
      } catch (err) {
        toast((err as Error)?.message || 'Mikrofon açılamadı', I.info(14));
      }
    });

    $('[data-close]', body).addEventListener('click', () => void sh.close());
    ta.addEventListener('input', checkValid);

    sealBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text && !attachedPhoto && !attachedVoice) return;
      sealBtn.disabled = true;
      const paperEl = $('.v-paper', body);
      const fromRect = paperEl.getBoundingClientRect();
      ta.blur();

      const moodArr = Array.from(selectedMoods);
      const primaryDbMood = MEMORY_MOODS.find((m) => m.id === moodArr[0])?.dbMood ?? 'heart';

      try {
        const saveP = saveDiaryEntry({
          title: '',
          text,
          mood: primaryDbMood,
          moods: moodArr,
          bottleStyle: bStyle,
          paperStyle: pStyle,
          photoB64: attachedPhoto ? toBase64(attachedPhoto.bytes) : undefined,
          photoMime: attachedPhoto?.mime,
          voiceB64: attachedVoice ? toBase64(attachedVoice.bytes) : undefined,
          voiceMime: attachedVoice?.mime,
          voiceDur: attachedVoice?.dur,
          voicePeaks: attachedVoice?.peaks?.slice(0, 24),
          entryDate: dateIso,
        });
        void sh.close();
        await Promise.all([
          playCastIntoSea(toDbWho(state.me), bStyle, pStyle, fromRect, text || 'Bir anı…'),
          saveP,
        ]);
        await reload(true);
      } catch {
        sealBtn.disabled = false;
        toast('Kaydedilemedi, tekrar dene', I.info(14));
      }
    });
  }

  $('[data-back]', el).addEventListener('click', () => {
    cancelAnimationFrame(waveRaf);
    void popPage(core.homeEl);
  });
  writeBtn.addEventListener('click', () => openAtelierPicker());
  window.addEventListener('resize', syncCanvasSize, { passive: true });
  void reload(true);
}
