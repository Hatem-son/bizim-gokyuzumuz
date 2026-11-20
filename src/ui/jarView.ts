// Anı Şişemiz — Gece Sessizliğinde Uçuşan Ateş Böcekleri, Şişe & Kağıt Atölyesi,
// Kesilmeyen 2 Satırlı Çoklu Ruh Hali, Bantlı Vintage Fotoğraf Karesi + Dönen Makaralı Kaset Ses Hatırası ve Pembe Kurdele.
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
  MOOD_CATEGORIES,
  MEMORY_MOODS,
  MOOD_BY_ID,
  type DiaryEntryMeta,
  type BottleStyle,
  type PaperStyle,
  type MoodTone,
  type MemoryMoodId,
  type MemoryMoodDef,
} from '../lib/diary';

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

const BOTTLE_SHORT_NAMES: Record<BottleStyle, string> = {
  emerald: 'Eski Yeşil Cam',
  crystal: 'Şeffaf Kristal',
  shell: 'Deniz Kabuklu',
};

type SeaBottle = {
  key: string;
  style: BottleStyle;
  subIndex: number;
  entries: DiaryEntryMeta[];
  mineCount: number;
  partnerCount: number;
};

const STYLE_ORDER: BottleStyle[] = ['emerald', 'crystal', 'shell'];

function partitionIntoSeaBottles(allDesc: DiaryEntryMeta[], emptyFallback: BottleStyle): SeaBottle[] {
  if (!allDesc.length) {
    return [{ key: `${emptyFallback}-1`, style: emptyFallback, subIndex: 1, entries: [], mineCount: 0, partnerCount: 0 }];
  }

  const asc = [...allDesc].reverse();
  const counts: Record<BottleStyle, Record<'hamham' | 'beto', number>> = {
    emerald: { hamham: 0, beto: 0 },
    crystal: { hamham: 0, beto: 0 },
    shell: { hamham: 0, beto: 0 },
  };
  const buckets = new Map<string, { style: BottleStyle; subIndex: number; list: DiaryEntryMeta[] }>();
  const firstSeenOrder: string[] = [];

  for (const e of asc) {
    const st: BottleStyle = STYLE_ORDER.includes(e.bottleStyle) ? e.bottleStyle : 'emerald';
    const subIdx = Math.floor(counts[st][e.from] / BOTTLE_PER_PERSON) + 1;
    counts[st][e.from]++;
    const key = `${st}-${subIdx}`;
    let b = buckets.get(key);
    if (!b) {
      b = { style: st, subIndex: subIdx, list: [] };
      buckets.set(key, b);
      firstSeenOrder.push(key);
    }
    b.list.push(e);
  }

  return firstSeenOrder.map((key) => {
    const b = buckets.get(key)!;
    const descList = b.list.slice().reverse();
    const mineCount = descList.filter((x) => x.mine).length;
    return {
      key,
      style: b.style,
      subIndex: b.subIndex,
      entries: descList,
      mineCount,
      partnerCount: descList.length - mineCount,
    };
  });
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

/** Zarif İpek Pembe Kurdele Fiyongu */
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
    <path d="M29 24 C24 35 18 44 13 52 L21 49 L25 54 C28 44 30 34 31 25 Z" fill="url(#${id}b)"/>
    <path d="M35 24 C40 35 46 44 51 52 L43 49 L39 54 C36 44 34 34 33 25 Z" fill="url(#${id}b)"/>
    <path d="M31 22 C22 8 6 9 6 21 C6 32 21 33 31 24 Z" fill="url(#${id}a)" stroke="#b93867" stroke-width="0.8" stroke-opacity=".35"/>
    <path d="M33 22 C42 8 58 9 58 21 C58 32 43 33 33 24 Z" fill="url(#${id}a)" stroke="#b93867" stroke-width="0.8" stroke-opacity=".35"/>
    <path d="M15 20 Q23 22 29 23" stroke="#b93867" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>
    <path d="M49 20 Q41 22 35 23" stroke="#b93867" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>
    <rect x="27.5" y="17.5" width="9" height="10" rx="4" fill="url(#${id}a)" stroke="#b93867" stroke-width="0.9" stroke-opacity=".4"/>
    <ellipse cx="30.5" cy="20" rx="2" ry="1.1" fill="#fff" opacity=".6"/>
  </svg>`;
}

function cassetteReelSVG(): string {
  return `<svg class="cas-reel" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" opacity=".65"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity=".8"/>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function scrollPalette(paperStyle: PaperStyle, who: 'hamham' | 'beto') {
  const ribbon = who === 'beto' ? '#ff84b0' : '#7ba6ff';
  const seal = who === 'beto' ? '#c84b76' : '#3e68d4';
  if (paperStyle === 'straw') {
    return {
      bodyA: '#f2d394',
      bodyB: '#d19e4c',
      rim: '#fbe9c2',
      stroke: '#875b21',
      ribbon,
      seal,
      sealRim: 'rgba(255,248,230,0.6)',
      stars: false,
    };
  }
  if (paperStyle === 'night') {
    return {
      bodyA: '#233b7d',
      bodyB: '#101d45',
      rim: '#3857a8',
      stroke: '#f2cc7e',
      ribbon,
      seal,
      sealRim: '#f6d58e',
      stars: true,
    };
  }
  return {
    bodyA: '#fffafb',
    bodyB: '#f1dae4',
    rim: '#ffffff',
    stroke: '#be899e',
    ribbon,
    seal,
    sealRim: 'rgba(255,255,255,0.68)',
    stars: false,
  };
}

let scrUid = 0;
function rolledScrollSVG(who: 'hamham' | 'beto', paperStyle: PaperStyle = 'sea', big = false): string {
  const id = `scr${++scrUid}`;
  const p = scrollPalette(paperStyle, who);
  if (big) {
    return `<svg viewBox="0 0 36 86" width="34" height="80" aria-hidden="true">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${p.bodyA}"/>
          <stop offset="100%" stop-color="${p.bodyB}"/>
        </linearGradient>
      </defs>
      <rect x="4" y="3" width="28" height="80" rx="9" fill="url(#${id})" stroke="${p.stroke}" stroke-width="1.45"/>
      <ellipse cx="18" cy="7.5" rx="11" ry="3.6" fill="${p.rim}" opacity=".92"/>
      ${
        p.stars
          ? `<circle cx="11" cy="24" r="1.2" fill="#ffe5a3" opacity=".9"/><circle cx="24" cy="63" r="1.3" fill="#ffe5a3" opacity=".85"/><circle cx="13" cy="68" r="0.9" fill="#ffe5a3" opacity=".7"/>`
          : `<path d="M9 23 H27 M9 62 H25" stroke="${p.stroke}" stroke-width="0.9" opacity=".28" stroke-linecap="round"/>`
      }
      <path d="M4 42 H32" stroke="${p.ribbon}" stroke-width="5"/>
      <circle cx="18" cy="42" r="6.5" fill="${p.seal}" stroke="${p.sealRim}" stroke-width="1.1"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 18 40" width="16" height="36" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.bodyA}"/>
        <stop offset="100%" stop-color="${p.bodyB}"/>
      </linearGradient>
    </defs>
    <rect x="2.3" y="2" width="13.4" height="36" rx="4.5" fill="url(#${id})" stroke="${p.stroke}" stroke-width="0.95"/>
    <ellipse cx="9" cy="4.2" rx="5.2" ry="1.8" fill="${p.rim}" opacity=".92"/>
    ${
      p.stars
        ? `<circle cx="6.2" cy="11.5" r="0.85" fill="#ffe5a3"/><circle cx="11.8" cy="29.5" r="0.9" fill="#ffe5a3"/>`
        : ''
    }
    <path d="M2.3 18.5 H15.7" stroke="${p.ribbon}" stroke-width="2.6"/>
    <circle cx="9" cy="18.5" r="3.1" fill="${p.seal}" stroke="${p.sealRim}" stroke-width="0.65"/>
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
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.5l2.2 1.6 2.7-.3 1.1 2.5 2.5 1.1-.3 2.7 1.6 2.2-1.6 2.2.3 2.7-2.5 1.1-1.1 2.5-2.7-.3-2.2 1.6-2.2-1.6-2.7.3-1.1-2.5-2.5-1.1.3-2.7L2.5 12l1.6-2.2-.3-2.7 2.5-1.1 1.1-2.5 2.7.3Z" fill="currentColor" opacity=".94"/>
    <path d="M12 15.2s-3-1.8-3-4a1.7 1.7 0 0 1 3-1.1 1.7 1.7 0 0 1 3 1.1c0 2.2-3 4-3 4Z" fill="#fbf3e6"/>
  </svg>`;
}

/** Gece Sessizliği: Ekran Boyunca Tatlı Eğrilerle Uçuşan Canlı Ateş Böcekleri */
function nightFirefliesHTML(count = 16): string {
  const flies: string[] = [];
  const paths = ['ff-path-a', 'ff-path-b', 'ff-path-c'];
  for (let i = 0; i < count; i++) {
    const left = 4 + ((i * 23) % 92);
    const top = 4 + ((i * 31) % 88);
    const sz = i % 3 === 0 ? 7 : i % 2 === 0 ? 5.5 : 4;
    const delay = -((i * 1.15) % 8).toFixed(2);
    const dur = (6.2 + (i % 5) * 1.3).toFixed(1);
    const pCls = paths[i % paths.length];
    const warmRose = i % 4 === 0;
    flies.push(
      `<span class="night-ff ${pCls} ${warmRose ? 'rose' : ''}" style="left:${left}%;top:${top}%;--sz:${sz}px;animation-delay:${delay}s;animation-duration:${dur}s"><i></i></span>`,
    );
  }
  return `<div class="night-fireflies" aria-hidden="true">${flies.join('')}</div>`;
}

export function openDiaryJar(): void {
  const isBeto = state.me === 'beto';
  const pa = PEOPLE[state.partner];
  let tab: 'mine' | 'partner' = 'mine';
  let selectedBottleKey: 'all' | string = 'all';
  let seaPageIdx = 0;
  let castingBottleKey: string | null = null;
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
      <div class="bottles-stage" data-bottles-stage></div>
      <canvas class="ocean-cv front" data-cv-front></canvas>
      <div class="sea-splash-layer" data-sparks></div>
    </div>

    <div class="jar-cta-row">
      <button type="button" class="btn btn-primary btn-block jar-write-btn" data-write>
        ${isBeto ? `<span class="rb">${raspberry(13)}</span>` : I.pen(17)}<span>Anı bırak</span>
      </button>
    </div>

    <div class="bottle-filter-row hide" data-btl-filter></div>
    <div data-seg-wrap style="margin-bottom:12px"></div>
    <div class="jar-entries" data-entries></div>
  </div>`);

  pushPage(el, core.homeEl);
  const oceanEl = $('[data-ocean]', el);
  const cvBack = $<HTMLCanvasElement>('[data-cv-back]', el);
  const cvFront = $<HTMLCanvasElement>('[data-cv-front]', el);
  const stageActorsEl = $('[data-bottles-stage]', el);
  const sparksEl = $('[data-sparks]', el);
  const writeBtn = $<HTMLButtonElement>('[data-write]', el);
  const switcherEl = $('[data-switcher]', el);
  const filterRowEl = $('[data-btl-filter]', el);
  const entriesEl = $('[data-entries]', el);

  type ActorNode = {
    key: string;
    actorEl: HTMLElement;
    rippleEl: HTMLElement;
    liveDriftX: number;
    liveBobY: number;
    liveScale: number;
  };
  let actorNodes: ActorNode[] = [];

  $('[data-seg-wrap]', el).appendChild(
    segment(['Benim Anılarım', pa.name], 0, (i) => {
      tab = i === 1 ? 'partner' : 'mine';
      renderList();
    }),
  );

  let entries: DiaryEntryMeta[] = [];
  let bottles: SeaBottle[] = partitionIntoSeaBottles([], pref.bottle);

  const MAX_PER_SEA_PAGE = 3;
  const visibleSeaBottles = (): SeaBottle[] => {
    const maxPage = Math.max(0, Math.ceil(bottles.length / MAX_PER_SEA_PAGE) - 1);
    if (seaPageIdx > maxPage) seaPageIdx = maxPage;
    return bottles.slice(seaPageIdx * MAX_PER_SEA_PAGE, (seaPageIdx + 1) * MAX_PER_SEA_PAGE);
  };

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

  const computeSlotPose = (slotIdx: number, slotCount: number, tSec: number, isFocused: boolean) => {
    let driftX = 0;
    let driftVx = 0;
    let scale = 0.98;
    if (slotCount <= 1) {
      const maxDrift = Math.max(42, (wW - 150) * 0.44);
      const ph1 = tSec * 0.44;
      const ph2 = tSec * 0.21 + 1.3;
      driftX = Math.sin(ph1) * (maxDrift * 0.72) + Math.sin(ph2) * (maxDrift * 0.28);
      driftVx = Math.cos(ph1) * 0.44 * (maxDrift * 0.72) + Math.cos(ph2) * 0.21 * (maxDrift * 0.28);
      scale = 0.98;
    } else if (slotCount === 2) {
      const lane = (slotIdx === 0 ? -1 : 1) * Math.min(92, wW * 0.23);
      const amp = Math.min(20, wW * 0.052);
      const spd = 0.46 + slotIdx * 0.07;
      const ph = tSec * spd + slotIdx * 2.35;
      driftX = lane + Math.sin(ph) * amp;
      driftVx = Math.cos(ph) * spd * amp;
      scale = isFocused ? 0.9 : 0.84;
    } else {
      const lane = (slotIdx - 1) * Math.min(108, wW * 0.305);
      const amp = Math.min(11, wW * 0.03);
      const spd = 0.45 + slotIdx * 0.06;
      const ph = tSec * spd + slotIdx * 2.1;
      driftX = lane + Math.sin(ph) * amp;
      driftVx = Math.cos(ph) * spd * amp;
      const baseScale = slotIdx === 1 ? 0.77 : 0.73;
      scale = isFocused ? baseScale + 0.07 : baseScale;
    }

    const cx = wW * 0.5 + driftX;
    const wy = waveHeightAt(cx, tSec, 1);
    const wyNext = waveHeightAt(cx + 8, tSec, 1);
    const slopeDeg = (Math.atan2(wyNext - wy, 8) * 180) / Math.PI;
    const baseLean = slotCount === 1 ? 9 : slotIdx % 2 === 0 ? 7 : -6;
    const tilt = baseLean + slopeDeg * 0.92 + driftVx * 0.14 + Math.sin(tSec * 1.35 + slotIdx * 1.7) * 3.2;
    const bobY = wy - wH * 0.62;
    return { driftX, bobY, tilt, scale };
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

      const n = actorNodes.length;
      for (let i = 0; i < n; i++) {
        const node = actorNodes[i];
        const isFocused = selectedBottleKey !== 'all' && selectedBottleKey === node.key;
        const pose = computeSlotPose(i, n, t, isFocused);
        node.liveDriftX = pose.driftX;
        node.liveBobY = pose.bobY;
        node.liveScale = pose.scale;
        if (castingBottleKey === node.key) continue;
        node.actorEl.style.transform = `translate3d(${pose.driftX.toFixed(1)}px, ${pose.bobY.toFixed(1)}px, 0) rotate(${pose.tilt.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
        const rScale = 0.88 + 0.16 * Math.sin(t * 2.2 + i * 1.5);
        node.rippleEl.style.transform = `translate(-50%, -50%) scale(${rScale.toFixed(2)})`;
      }
    }
    if (!reduced()) waveRaf = requestAnimationFrame(stepWaves);
  };
  waveRaf = requestAnimationFrame(stepWaves);

  const bottleLabel = (b: SeaBottle): string => {
    const sameStyleCount = bottles.filter((x) => x.style === b.style).length;
    return sameStyleCount > 1 ? `${BOTTLE_SHORT_NAMES[b.style]} #${b.subIndex}` : BOTTLE_SHORT_NAMES[b.style];
  };

  const renderBottleSwitcher = () => {
    const totalPages = Math.ceil(bottles.length / MAX_PER_SEA_PAGE);
    if (totalPages > 1) {
      switcherEl.classList.remove('hide');
      switcherEl.innerHTML = Array.from({ length: totalPages }, (_, idx) => {
        return `<button type="button" class="btl-dot ${idx === seaPageIdx ? 'on' : ''}" data-spg="${idx}">${idx + 1}</button>`;
      }).join('');
      $$('[data-spg]', switcherEl).forEach((btn) =>
        btn.addEventListener('click', () => {
          seaPageIdx = Number((btn as HTMLElement).dataset.spg) || 0;
          renderBottleSwitcher();
          renderSeaBottles();
        }),
      );
    } else {
      switcherEl.classList.add('hide');
    }

    if (bottles.length > 1) {
      filterRowEl.classList.remove('hide');
      filterRowEl.innerHTML =
        `<button type="button" class="btl-fchip ${selectedBottleKey === 'all' ? 'on' : ''}" data-bf="all">Tüm Şişeler</button>` +
        bottles
          .map(
            (b) =>
              `<button type="button" class="btl-fchip ${selectedBottleKey === b.key ? 'on' : ''}" data-bf="${b.key}">${bottleLabel(b)}</button>`,
          )
          .join('');
      $$('[data-bf]', filterRowEl).forEach((btn) =>
        btn.addEventListener('click', () => {
          const k = (btn as HTMLElement).dataset.bf || 'all';
          selectedBottleKey = k;
          if (k !== 'all') {
            const idx = bottles.findIndex((b) => b.key === k);
            if (idx >= 0) seaPageIdx = Math.floor(idx / MAX_PER_SEA_PAGE);
          }
          renderBottleSwitcher();
          renderSeaBottles();
          renderList();
        }),
      );
    } else {
      selectedBottleKey = 'all';
      filterRowEl.classList.add('hide');
    }
  };

  const renderSeaBottles = () => {
    stageActorsEl.innerHTML = '';
    actorNodes = [];
    const vis = visibleSeaBottles();
    const nowSec = performance.now() * 0.001;

    vis.forEach((btl, slotIdx) => {
      const isFocused = selectedBottleKey !== 'all' && selectedBottleKey === btl.key;
      const isDimmed = selectedBottleKey !== 'all' && selectedBottleKey !== btl.key;
      const nodeEl = h(`<div class="bottle-actor ${isFocused ? 'focused' : ''} ${isDimmed ? 'dimmed' : ''}" data-bkey="${btl.key}">
        <div class="bottle-ripple" data-ripple></div>
        <div class="bottle-body">
          ${seaBottleSVG(btl.style, isBeto)}
          <div class="btl-scrolls" data-notes></div>
          ${seaBottleSheenSVG()}
        </div>
      </div>`);

      const rippleEl = $('[data-ripple]', nodeEl);
      const notesEl = $('[data-notes]', nodeEl);

      const visibleEntries = btl.entries.slice(0, BOTTLE_TOTAL).reverse();
      visibleEntries.forEach((entry, idx) => {
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
          ${rolledScrollSVG(entry.from, entry.paperStyle)}
        </button>`);
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
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

      if (bottles.length > 1) {
        nodeEl.addEventListener('click', () => {
          selectedBottleKey = selectedBottleKey === btl.key ? 'all' : btl.key;
          renderBottleSwitcher();
          renderSeaBottles();
          renderList();
        });
      }

      const pose = computeSlotPose(slotIdx, vis.length, nowSec, isFocused);
      if (castingBottleKey === btl.key) {
        nodeEl.style.opacity = '0';
      }
      nodeEl.style.transform = `translate3d(${pose.driftX.toFixed(1)}px, ${pose.bobY.toFixed(1)}px, 0) rotate(${pose.tilt.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
      stageActorsEl.appendChild(nodeEl);
      actorNodes.push({
        key: btl.key,
        actorEl: nodeEl,
        rippleEl,
        liveDriftX: pose.driftX,
        liveBobY: pose.bobY,
        liveScale: pose.scale,
      });
    });
  };

  const renderList = () => {
    const sourceEntries =
      selectedBottleKey === 'all'
        ? entries
        : bottles.find((b) => b.key === selectedBottleKey)?.entries ?? [];
    const list = tab === 'mine' ? sourceEntries.filter((e) => e.mine) : sourceEntries.filter((e) => !e.mine);
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
          <span class="v-mini-seal ${entry.from} p-${entry.paperStyle}">${I.text(15)}</span>
          <span class="v-mini-body"><b>${fmtVintageDate(entry.entryDate)}</b><i>${BOTTLE_SHORT_NAMES[entry.bottleStyle]}</i></span>
          <span class="v-mini-chev">${I.chevron(16)}</span>
        </button>`);
        card.addEventListener('click', () => void openVintageReader(entry));
        entriesEl.appendChild(card);
      } else {
        const card = h(`<div class="v-mini sealed-row">
          <span class="v-mini-seal ${entry.from} p-${entry.paperStyle}">${I.lock(14)}</span>
          <span class="v-mini-body"><b>${fmtVintageDate(entry.entryDate)}</b><i>${BOTTLE_SHORT_NAMES[entry.bottleStyle]}</i></span>
          <span class="v-ask-pill sent">Şişede saklı</span>
        </div>`);
        entriesEl.appendChild(card);
      }
    }
  };

  const reload = async (focusKey?: string) => {
    try {
      const res = await fetchDiaryJar();
      entries = res.entries;
      bottles = partitionIntoSeaBottles(entries, pref.bottle);
      if (focusKey) {
        const idx = bottles.findIndex((b) => b.key === focusKey);
        if (idx >= 0) seaPageIdx = Math.floor(idx / MAX_PER_SEA_PAGE);
      }
      if (selectedBottleKey !== 'all' && !bottles.some((b) => b.key === selectedBottleKey)) {
        selectedBottleKey = 'all';
      }
      renderBottleSwitcher();
      renderSeaBottles();
      renderList();
    } catch {
      toast('Şişe yüklenemedi', I.info(14));
    }
  };

  const prepareTargetBottleForCast = (bStyle: BottleStyle): string => {
    if (!entries.length) {
      const k = `${bStyle}-1`;
      bottles = [{ key: k, style: bStyle, subIndex: 1, entries: [], mineCount: 0, partnerCount: 0 }];
      seaPageIdx = 0;
      renderBottleSwitcher();
      renderSeaBottles();
      return k;
    }
    const matching = bottles.filter((b) => b.style === bStyle);
    const last = matching[matching.length - 1];
    if (last && last.mineCount < BOTTLE_PER_PERSON) {
      const idx = bottles.findIndex((b) => b.key === last.key);
      if (idx >= 0) seaPageIdx = Math.floor(idx / MAX_PER_SEA_PAGE);
      renderBottleSwitcher();
      renderSeaBottles();
      return last.key;
    }
    const nextSub = last ? last.subIndex + 1 : 1;
    const newKey = `${bStyle}-${nextSub}`;
    bottles.push({ key: newKey, style: bStyle, subIndex: nextSub, entries: [], mineCount: 0, partnerCount: 0 });
    seaPageIdx = Math.floor((bottles.length - 1) / MAX_PER_SEA_PAGE);
    renderBottleSwitcher();
    renderSeaBottles();
    return newKey;
  };

  const playCastIntoSea = async (
    who: 'hamham' | 'beto',
    bStyle: BottleStyle,
    pStyle: PaperStyle,
    targetKey: string,
    fromRect: DOMRect,
    snippetText: string,
  ) => {
    if (reduced()) return;
    castingBottleKey = targetKey;
    const targetNode = actorNodes.find((n) => n.key === targetKey);
    if (targetNode) targetNode.actorEl.style.opacity = '0';

    const root = document.getElementById('app') || document.body;
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

      const bigScroll = h(`<div class="cinema-scroll" style="left:${cx}px;top:${cy - 86}px">
        ${rolledScrollSVG(who, pStyle, true)}
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

      const flyBottle = h(`<div class="cinema-bottle" style="left:${cx}px;top:${cy + 36}px">
        ${seaBottleSVG(bStyle, who === 'beto')}
        <div class="cinema-inner-scroll hide">${rolledScrollSVG(who, pStyle, false)}</div>
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

      const liveNode = actorNodes.find((n) => n.key === targetKey);
      const landDriftX = liveNode ? liveNode.liveDriftX : 0;
      const landScale = liveNode ? liveNode.liveScale : 0.9;
      const oceanRect = oceanEl.getBoundingClientRect();
      const targetX = oceanRect.left - rootRect.left + oceanRect.width * 0.5 + landDriftX;
      const targetY = oceanRect.top - rootRect.top + oceanRect.height * 0.56;
      const dx = targetX - cx;
      const dy = targetY - (cy + 36);
      sparksEl.style.transform = `translateX(${landDriftX.toFixed(1)}px)`;

      const hurlAnim = flyBottle.animate(
        [
          { transform: 'translate(-50%, -50%) translate3d(0, 0, 0) scale(1.08) rotate(0deg)', opacity: 1 },
          { transform: 'translate(-50%, -50%) translate3d(-24px, 34px, 0) scale(1.22) rotate(-30deg)', opacity: 1, offset: 0.24 },
          { transform: `translate(-50%, -50%) translate3d(${dx * 0.48}px, ${dy - 148}px, 0) scale(0.86) rotate(185deg)`, opacity: 1, offset: 0.64 },
          { transform: `translate(-50%, -50%) translate3d(${dx}px, ${dy + 18}px, 0) scale(${landScale.toFixed(2)}) rotate(373deg)`, opacity: 0.96, offset: 0.94 },
          { transform: `translate(-50%, -50%) translate3d(${dx}px, ${dy + 26}px, 0) scale(${(landScale * 0.96).toFixed(2)}) rotate(378deg)`, opacity: 0 },
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

      const endNode = actorNodes.find((n) => n.key === targetKey);
      if (endNode) {
        endNode.actorEl.style.opacity = '1';
        const dX = endNode.liveDriftX;
        const s = endNode.liveScale;
        await endNode.actorEl.animate(
          [
            { transform: `translate3d(${dX.toFixed(1)}px, 26px, 0) rotate(22deg) scale(${s.toFixed(3)})` },
            { transform: `translate3d(${dX.toFixed(1)}px, -9px, 0) rotate(6deg) scale(${s.toFixed(3)})`, offset: 0.55 },
            { transform: `translate3d(${dX.toFixed(1)}px, 0px, 0) rotate(8deg) scale(${s.toFixed(3)})` },
          ],
          { duration: 520, easing: 'cubic-bezier(.22,.85,.3,1)', fill: 'forwards' },
        ).finished;
        endNode.actorEl.getAnimations().forEach((a) => a.cancel());
      }
    } finally {
      actorNodes.forEach((n) => {
        n.actorEl.style.opacity = '1';
      });
      stage.remove();
      castingBottleKey = null;
    }
  };

  // ---------- Vintage Anı Okuyucu ----------
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
        : Array.from({ length: 20 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.7)));

      const body = h(`<div class="v-sheet-wrap">
        ${nightFirefliesHTML(14)}
        <div class="v-paper v-reader paper-${pStyle}">
          ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
          <div class="v-top-bow">${pinkRibbonSVG(40)}</div>
          <div class="v-lily-mark">${lilyBloom(32, -12)}</div>
          <div class="v-paper-head">
            <span class="v-date-txt">${fmtVintageDate(content.entryDate)}</span>
            <button type="button" class="v-del-btn" data-del aria-label="Sil">${I.trash(16)}</button>
          </div>

          ${
            moods.length
              ? `<div class="v-reader-moods">${moods
                  .map((m) => {
                    const def = MOOD_BY_ID.get(m);
                    if (!def) return `<span class="v-mbadge">${escapeHtml(String(m))}</span>`;
                    return `<div class="v-rmood-card tone-${def.cat}">
                      <span class="rm-ico">${def.icon}</span>
                      <span class="rm-txt"><b>${escapeHtml(def.label)}</b><i>${escapeHtml(def.desc)}</i></span>
                    </div>`;
                  })
                  .join('')}</div>`
              : ''
          }

          ${content.text ? `<div class="v-ruled-text">${escapeHtml(content.text).replace(/\n/g, '<br>')}</div>` : ''}

          ${
            photoUrl || audioUrl
              ? `<div class="v-scrap-tray reader-tray">
                  ${
                    photoUrl
                      ? `<figure class="v-photo-stamp reader-photo">
                          <span class="v-washi left"></span><span class="v-washi right"></span>
                          <div class="v-ps-frame"><img src="${photoUrl}" alt=""></div>
                          <figcaption class="v-ps-cap">${pinkRibbonSVG(22)}<span>hatıra karesi</span></figcaption>
                        </figure>`
                      : ''
                  }
                  ${
                    audioUrl
                      ? `<div class="v-cassette" data-cassette>
                          <div class="cas-top">
                            ${cassetteReelSVG()}
                            <span class="cas-lbl">SES HATIRASI</span>
                            ${cassetteReelSVG()}
                          </div>
                          <div class="cas-bot">
                            <button type="button" class="cas-play" data-play aria-label="Dinle">${I.play(14)}</button>
                            <div class="cas-bars" data-bars>
                              ${peaks.map((p) => `<i style="height:${Math.round(7 + p * 16)}px"></i>`).join('')}
                            </div>
                            <span class="cas-dur" data-dur>${fmtSec(content.voiceDur ?? 0)}</span>
                          </div>
                        </div>`
                      : ''
                  }
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

      const sh = openSheet(body, { cls: 'v-sheet firefly-sheet', onClose: cleanupMedia });

      if (audioUrl) {
        const casEl = $('[data-cassette]', body);
        const playBtn = $('[data-play]', body);
        const durEl = $('[data-dur]', body);
        const barEls = $$('[data-bars] i', body);
        audioEl = new Audio(audioUrl);
        audioEl.preload = 'metadata';

        playBtn.addEventListener('click', () => {
          if (!audioEl) return;
          if (audioEl.paused) {
            void audioEl.play();
            casEl.classList.add('spinning');
            playBtn.innerHTML = I.pause(14);
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
            casEl.classList.remove('spinning');
            playBtn.innerHTML = I.play(14);
            clearInterval(waveTimer);
          }
        });
        audioEl.addEventListener('ended', () => {
          clearInterval(waveTimer);
          casEl.classList.remove('spinning');
          playBtn.innerHTML = I.play(14);
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

  // ---------- ADIM 1: Şişe & Kağıt Seçimi Atölyesi ----------
  function openAtelierPicker() {
    let chosenBottle: BottleStyle = pref.bottle;
    let chosenPaper: PaperStyle = pref.paper;

    const body = h(`<div class="atelier-sheet">
      ${nightFirefliesHTML(12)}
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

    const sh = openSheet(body, { cls: 'gk-glass-sheet firefly-sheet' });
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
      if (!entries.length) {
        bottles = partitionIntoSeaBottles([], chosenBottle);
        renderSeaBottles();
      }
      await sh.close();
      openVintageWriter(chosenBottle, chosenPaper);
    });
  }

  // ---------- Detaylı Ruh Hali Seçim Ekranı (İçeriden Seçim · İyi, Kötü, Kırgın, Gergin, Gece…) ----------
  function openMoodPickerSheet(selectedMoods: Set<MemoryMoodId>, onChanged: () => void) {
    let activeCat: 'all' | MoodTone = 'all';
    let query = '';

    const modal = h(`<div class="mood-picker">
      <div class="mp-head">
        <div class="mp-head-tx">
          <div class="mp-title-row">${pinkRibbonSVG(28)}<h3 class="mp-title">Ruh Halini Seç</h3></div>
          <p class="mp-sub">İyi, kötü, kırgın ya da yorgun… içinden geçen her hissi birden fazla seçebilirsin.</p>
        </div>
        <button type="button" class="icon-btn mp-close" data-mp-close aria-label="Kapat">${I.close(18)}</button>
      </div>

      <div class="mp-search-wrap" data-nodrag>
        <span class="mp-s-ic">${I.search(15)}</span>
        <input type="text" class="mp-search" placeholder="His ara… (kırgın, kötü, yorgun, aşık, huzurlu)" maxlength="40" data-mp-q>
        <button type="button" class="mp-q-clr hide" data-mp-qclr aria-label="Temizle">${I.close(13)}</button>
      </div>

      <div class="mp-cats" data-mp-cats data-nodrag>
        ${MOOD_CATEGORIES.map(
          (c) =>
            `<button type="button" class="mp-cat ${c.id === activeCat ? 'on' : ''}" data-cat="${c.id}"><span>${c.icon}</span><b>${c.label}</b></button>`,
        ).join('')}
      </div>

      <div class="mp-list" data-mp-list data-scroll data-nodrag></div>

      <div class="mp-foot" data-nodrag>
        <div class="mp-picked-bar hide" data-mp-picked></div>
        <button type="button" class="btn btn-primary btn-block mp-done-btn" data-mp-done>Tamam</button>
      </div>
    </div>`);

    const sh = openSheet(modal, {
      cls: 'gk-glass-sheet mood-sheet',
      backCls: 'mood-back',
      onClose: () => onChanged(),
    });

    const listEl = $('[data-mp-list]', modal);
    const qInp = $<HTMLInputElement>('[data-mp-q]', modal);
    const qClr = $('[data-mp-qclr]', modal);
    const pickedEl = $('[data-mp-picked]', modal);
    const doneBtn = $<HTMLButtonElement>('[data-mp-done]', modal);

    const renderFooter = () => {
      const arr = Array.from(selectedMoods)
        .map((id) => MOOD_BY_ID.get(id))
        .filter((x): x is MemoryMoodDef => Boolean(x));

      if (!arr.length) {
        pickedEl.classList.add('hide');
        pickedEl.innerHTML = '';
        doneBtn.textContent = 'Seçmeden dön';
      } else {
        pickedEl.classList.remove('hide');
        pickedEl.innerHTML = `
          <div class="mp-picked-chips">
            ${arr
              .map(
                (m) =>
                  `<button type="button" class="mp-mini-chip tone-${m.cat}" data-rm-m="${m.id}"><span>${m.icon}</span><b>${escapeHtml(m.label)}</b><i>×</i></button>`,
              )
              .join('')}
          </div>
          <button type="button" class="mp-clr-all" data-clr-all>Temizle</button>
        `;
        $$('[data-rm-m]', pickedEl).forEach((b) =>
          b.addEventListener('click', () => {
            const id = (b as HTMLElement).dataset.rmM as MemoryMoodId;
            selectedMoods.delete(id);
            onChanged();
            renderListItems();
            renderFooter();
          }),
        );
        $('[data-clr-all]', pickedEl).addEventListener('click', () => {
          selectedMoods.clear();
          onChanged();
          renderListItems();
          renderFooter();
        });
        doneBtn.textContent = `Seçimi uygula (${arr.length} ruh hali)`;
      }
    };

    const cardHTML = (m: MemoryMoodDef): string => {
      const isOn = selectedMoods.has(m.id);
      return `<button type="button" class="mp-card tone-${m.cat} ${isOn ? 'on' : ''}" data-pick-m="${m.id}">
        <span class="mp-ico">${m.icon}</span>
        <span class="mp-tx">
          <b>${escapeHtml(m.label)}</b>
          <i>${escapeHtml(m.desc)}</i>
        </span>
        <span class="mp-chk">${isOn ? I.check(13) : ''}</span>
      </button>`;
    };

    const renderListItems = () => {
      const q = query.trim().toLocaleLowerCase('tr-TR');
      const filtered = MEMORY_MOODS.filter((m) => {
        if (activeCat !== 'all' && m.cat !== activeCat) return false;
        if (!q) return true;
        return (
          m.label.toLocaleLowerCase('tr-TR').includes(q) ||
          m.desc.toLocaleLowerCase('tr-TR').includes(q)
        );
      });

      if (!filtered.length) {
        listEl.innerHTML = `<div class="mp-empty">Aradığın ifadeye uygun bir ruh hali bulunamadı.</div>`;
        return;
      }

      if (activeCat === 'all' && !q) {
        const groups = MOOD_CATEGORIES.filter((c) => c.id !== 'all');
        listEl.innerHTML = groups
          .map((g) => {
            const items = filtered.filter((m) => m.cat === g.id);
            if (!items.length) return '';
            return `<div class="mp-group">
              <div class="mp-group-hd">${g.title}</div>
              <div class="mp-group-items">${items.map(cardHTML).join('')}</div>
            </div>`;
          })
          .join('');
      } else {
        listEl.innerHTML = `<div class="mp-group-items">${filtered.map(cardHTML).join('')}</div>`;
      }

      $$('[data-pick-m]', listEl).forEach((btn) =>
        btn.addEventListener('click', () => {
          const id = (btn as HTMLElement).dataset.pickM as MemoryMoodId;
          if (selectedMoods.has(id)) selectedMoods.delete(id);
          else selectedMoods.add(id);
          btn.classList.toggle('on', selectedMoods.has(id));
          const chk = $('.mp-chk', btn);
          chk.innerHTML = selectedMoods.has(id) ? I.check(13) : '';
          onChanged();
          renderFooter();
        }),
      );
    };

    $$('[data-cat]', modal).forEach((btn) =>
      btn.addEventListener('click', () => {
        activeCat = ((btn as HTMLElement).dataset.cat as 'all' | MoodTone) || 'all';
        $$('[data-cat]', modal).forEach((x) => x.classList.toggle('on', x === btn));
        listEl.scrollTop = 0;
        renderListItems();
      }),
    );

    qInp.addEventListener('input', () => {
      query = qInp.value;
      qClr.classList.toggle('hide', !query.length);
      listEl.scrollTop = 0;
      renderListItems();
    });

    qClr.addEventListener('click', () => {
      query = '';
      qInp.value = '';
      qClr.classList.add('hide');
      renderListItems();
    });

    $('[data-mp-close]', modal).addEventListener('click', () => void sh.close());
    doneBtn.addEventListener('click', () => void sh.close());

    renderListItems();
    renderFooter();
  }

  // ---------- ADIM 2: Gece Sessizliğinde Uçuşan Ateş Böcekli Vintage Anı Yazma Alanı ----------
  function openVintageWriter(bStyle: BottleStyle, pStyle: PaperStyle) {
    const selectedMoods = new Set<MemoryMoodId>();
    let attachedPhoto: { bytes: Uint8Array<ArrayBuffer>; mime: string; preview: string } | null = null;
    let attachedVoice: RecordedVoice | null = null;
    let recorder: VoiceRecorder | null = null;
    let recTimer = 0;
    let previewAudio: HTMLAudioElement | null = null;

    const dateIso = todayIso();
    const body = h(`<div class="v-sheet-wrap">
      ${nightFirefliesHTML(16)}
      <div class="v-paper v-writer paper-${pStyle}">
        ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
        <div class="v-top-bow">${pinkRibbonSVG(40)}</div>
        <div class="v-lily-mark">${lilyBloom(30, -12)}</div>

        <div class="v-paper-head">
          <span class="v-date-txt">${fmtVintageDate(dateIso)}</span>
          <button type="button" class="v-close-btn" data-close aria-label="Kapat">${I.close(18)}</button>
        </div>

        <div class="v-scroll-body" data-nodrag>
          <button type="button" class="v-mood-entry press" data-open-moods></button>

          <textarea class="v-textarea" maxlength="2000" placeholder="Bugünden bir anı bırak…"></textarea>

          <div class="v-scrap-tray hide" data-scrap></div>
        </div>

        <div class="v-writer-foot" data-nodrag>
          <label class="v-tool-pill press" aria-label="Fotoğraf yapıştır">
            ${I.camera(16)}<span>Fotoğraf</span>
            <input type="file" accept="image/*" hidden data-photo-inp>
          </label>
          <button type="button" class="v-tool-pill press" data-voice-btn>
            ${I.mic(16)}<span data-voice-lbl>Ses</span>
          </button>
          <span class="grow"></span>
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

    const sh = openSheet(body, { cls: 'v-sheet firefly-sheet', onClose: cleanupWriter });
    const ta = $<HTMLTextAreaElement>('.v-textarea', body);
    const moodEntryBtn = $<HTMLButtonElement>('[data-open-moods]', body);
    const sealBtn = $<HTMLButtonElement>('[data-seal]', body);
    const scrapTray = $('[data-scrap]', body);
    const photoInp = $<HTMLInputElement>('[data-photo-inp]', body);
    const voiceBtn = $<HTMLButtonElement>('[data-voice-btn]', body);
    const voiceLbl = $('[data-voice-lbl]', body);

    const renderMoodTrigger = () => {
      const chosen = Array.from(selectedMoods)
        .map((id) => MOOD_BY_ID.get(id))
        .filter((x): x is MemoryMoodDef => Boolean(x));

      if (!chosen.length) {
        moodEntryBtn.classList.remove('filled');
        moodEntryBtn.innerHTML = `
          <span class="vme-orb">🎭</span>
          <span class="vme-tx">
            <b>Ruh halin nasıl?</b>
            <i>İyi, kötü, kırgın, yorgun, aşık… dokun ve içeriden seç</i>
          </span>
          <span class="vme-cta">Seç ${I.chevron(14)}</span>
        `;
      } else {
        moodEntryBtn.classList.add('filled');
        moodEntryBtn.innerHTML = `
          <div class="vme-top">
            <span class="vme-kicker">Seçilen ruh halleri (${chosen.length})</span>
            <span class="vme-edit">Düzenle ${I.chevron(13)}</span>
          </div>
          <div class="vme-pills">
            ${chosen
              .map(
                (m) =>
                  `<span class="vme-pill tone-${m.cat}"><span>${m.icon}</span><b>${escapeHtml(m.label)}</b></span>`,
              )
              .join('')}
          </div>
        `;
      }
    };
    renderMoodTrigger();

    moodEntryBtn.addEventListener('click', () => {
      ta.blur();
      openMoodPickerSheet(selectedMoods, renderMoodTrigger);
    });

    const syncTextareaHeight = () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(124, ta.scrollHeight)}px`;
    };

    const checkValid = () => {
      const ok = Boolean(ta.value.trim()) || Boolean(attachedPhoto) || Boolean(attachedVoice);
      sealBtn.disabled = !ok || Boolean(recorder);
    };

    const renderScrapTray = () => {
      scrapTray.innerHTML = '';
      if (!attachedPhoto && !recorder && !attachedVoice) {
        scrapTray.classList.add('hide');
        return;
      }
      scrapTray.classList.remove('hide');

      if (attachedPhoto) {
        const fig = h(`<figure class="v-photo-stamp">
          <span class="v-washi left"></span><span class="v-washi right"></span>
          <div class="v-ps-frame">
            <img src="${attachedPhoto.preview}" alt="">
            <button type="button" class="v-ps-rm" aria-label="Fotoğrafı kaldır">${I.close(13)}</button>
          </div>
          <figcaption class="v-ps-cap">${pinkRibbonSVG(20)}<span>hatıra karesi</span></figcaption>
        </figure>`);
        $('.v-ps-rm', fig).addEventListener('click', () => {
          if (attachedPhoto) URL.revokeObjectURL(attachedPhoto.preview);
          attachedPhoto = null;
          photoInp.value = '';
          renderScrapTray();
          checkValid();
        });
        scrapTray.appendChild(fig);
      }

      if (recorder) {
        const recCard = h(`<div class="v-cassette spinning recording">
          <div class="cas-top">
            ${cassetteReelSVG()}
            <span class="cas-lbl">KAYDEDİLİYOR</span>
            ${cassetteReelSVG()}
          </div>
          <div class="cas-bot">
            <span class="cas-rec-dot"></span>
            <span class="cas-dur" data-rt>0:00</span>
            <span class="grow"></span>
            <button type="button" class="cas-stop" data-stop>Bitir</button>
          </div>
        </div>`);
        $('[data-stop]', recCard).addEventListener('click', () => void finishRecording());
        scrapTray.appendChild(recCard);
      } else if (attachedVoice) {
        const v = attachedVoice;
        const peaks = v.peaks?.length ? v.peaks.slice(0, 16) : Array.from({ length: 16 }, () => 0.48);
        const casCard = h(`<div class="v-cassette">
          <div class="cas-top">
            ${cassetteReelSVG()}
            <span class="cas-lbl">SES HATIRASI</span>
            ${cassetteReelSVG()}
            <button type="button" class="cas-rm" data-vrm aria-label="Sesi kaldır">${I.close(13)}</button>
          </div>
          <div class="cas-bot">
            <button type="button" class="cas-play" data-vplay aria-label="Dinle">${I.play(13)}</button>
            <div class="cas-bars">${peaks.map((p) => `<i style="height:${Math.round(6 + p * 15)}px"></i>`).join('')}</div>
            <span class="cas-dur">${fmtSec(v.dur)}</span>
          </div>
        </div>`);
        const playB = $('[data-vplay]', casCard);
        playB.addEventListener('click', () => {
          if (!previewAudio) {
            previewAudio = new Audio(v.previewUrl);
            previewAudio.addEventListener('ended', () => {
              casCard.classList.remove('spinning');
              playB.innerHTML = I.play(13);
            });
          }
          if (previewAudio.paused) {
            void previewAudio.play();
            casCard.classList.add('spinning');
            playB.innerHTML = I.pause(13);
          } else {
            previewAudio.pause();
            casCard.classList.remove('spinning');
            playB.innerHTML = I.play(13);
          }
        });
        $('[data-vrm]', casCard).addEventListener('click', () => {
          if (previewAudio) {
            previewAudio.pause();
            previewAudio.src = '';
            previewAudio = null;
          }
          URL.revokeObjectURL(v.previewUrl);
          attachedVoice = null;
          voiceLbl.textContent = 'Ses';
          renderScrapTray();
          checkValid();
        });
        scrapTray.appendChild(casCard);
      }
    };

    photoInp.addEventListener('change', async () => {
      const f = photoInp.files?.[0];
      if (!f) return;
      try {
        if (attachedPhoto) URL.revokeObjectURL(attachedPhoto.preview);
        attachedPhoto = await compressMemoryPhoto(f);
        renderScrapTray();
        checkValid();
        scrapTray.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch {
        toast('Fotoğraf okunamadı', I.info(14));
      }
    });

    const finishRecording = async () => {
      if (!recorder) return;
      clearInterval(recTimer);
      const r = recorder;
      recorder = null;
      voiceBtn.classList.remove('on');
      try {
        if (attachedVoice) URL.revokeObjectURL(attachedVoice.previewUrl);
        attachedVoice = await r.stop();
        voiceLbl.textContent = 'Yenile';
      } catch (err) {
        toast((err as Error)?.message || 'Ses kaydedilemedi', I.info(14));
      }
      renderScrapTray();
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
        voiceLbl.textContent = 'Bitir';
        renderScrapTray();
        checkValid();
        scrapTray.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        clearInterval(recTimer);
        recTimer = window.setInterval(() => {
          if (!recorder) return;
          const elSec = recorder.elapsedSec();
          const rt = scrapTray.querySelector('[data-rt]');
          if (rt) rt.textContent = fmtSec(elSec);
          if (elSec >= 90) void finishRecording();
        }, 250);
      } catch (err) {
        toast((err as Error)?.message || 'Mikrofon açılamadı', I.info(14));
      }
    });

    $('[data-close]', body).addEventListener('click', () => void sh.close());
    ta.addEventListener('input', () => {
      syncTextareaHeight();
      checkValid();
    });

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
        const targetKey = prepareTargetBottleForCast(bStyle);
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
          voicePeaks: attachedVoice?.peaks?.slice(0, 20),
          entryDate: dateIso,
        });
        void sh.close();
        await Promise.all([
          playCastIntoSea(toDbWho(state.me), bStyle, pStyle, targetKey, fromRect, text || 'Bir anı…'),
          saveP,
        ]);
        await reload(targetKey);
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
  void reload();
}
