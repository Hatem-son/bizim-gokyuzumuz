import { computeLinks, starMonthIdx } from '../lib/links';
import { store } from '../lib/storage';
import type { StarRecord, Who } from '../types';

/**
 * Yumuşak, tombul tek kalp yolu (gölgesiz, blürsüz) — mumdan yükselen kalp ve
 * "AYNI AN" kalbi aynı SVG yolunu ve bileşeni paylaşır.
 */
export const WHITE_HEART_PATH =
  'M12 21.2C12 21.2 3.2 15.4 2.2 9.4C1.5 5.4 4.7 2.8 7.9 3.1C10.1 3.3 11.4 4.7 12 6.1C12.6 4.7 13.9 3.3 16.1 3.1C19.3 2.8 22.5 5.4 21.8 9.4C20.8 15.4 12 21.2 12 21.2Z';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Paylaşılan tek beyaz kalp DOM/SVG bileşeni (gölgesiz, filtresiz, salt transform/opacity). */
export function createWhiteHeartEl(className: string, sizePx: number, label = ''): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.setAttribute('aria-hidden', 'true');
  if (label) wrap.dataset.heartKind = label;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(sizePx));
  svg.setAttribute('height', String(sizePx));
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', WHITE_HEART_PATH);
  path.setAttribute('fill', '#ffffff');

  svg.appendChild(path);
  wrap.appendChild(svg);
  return wrap;
}

function isUiOverlayBlocking(): boolean {
  if (!document.body.classList.contains('awake')) return true;
  return Boolean(document.querySelector('.sheet.open, .modal.open, #lock:not(.gone), #onboard:not(.gone)'));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/* ---------- 1) Mumdan yükselen beyaz kalp ---------- */

const CANDLE_MIN_INTERVAL_MS = 25_000;
const CANDLE_MAX_INTERVAL_MS = 40_000;
const CANDLE_FLOAT_DURATION_MS = 5400;
const CANDLE_REDUCED_DURATION_MS = 4200;
const CANDLE_HEART_SIZE_PX = 13; // Mevcut ~8-10px mavi kalplere kıyasla ≈1.3×

export interface CandleWhiteHeartOptions {
  getWickPos: () => { x: number; y: number } | null;
}

/**
 * Her 25–40 sn'de bir mumdan saf beyaz (#ffffff, %85 opaklık) tek kalp yükseltir.
 * Aynı anda en fazla 1 kalp görünür, arayüz engellerinden kaçar ve arka planda durur.
 */
export class CandleWhiteHeartController {
  private readonly getWickPos: () => { x: number; y: number } | null;
  private timerId = 0;
  private nextSpawnAt = 0;
  private remainingMs = 0;
  private activeEl: HTMLDivElement | null = null;
  private activeAnim: Animation | null = null;
  private side: 1 | -1 = 1;
  private destroyed = false;

  constructor(opts: CandleWhiteHeartOptions) {
    this.getWickPos = opts.getWickPos;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.scheduleNext();
  }

  private randomInterval(): number {
    return CANDLE_MIN_INTERVAL_MS + Math.random() * (CANDLE_MAX_INTERVAL_MS - CANDLE_MIN_INTERVAL_MS);
  }

  private scheduleNext(delayMs = this.randomInterval()): void {
    window.clearTimeout(this.timerId);
    this.timerId = 0;
    if (this.destroyed) return;

    if (document.hidden) {
      this.remainingMs = Math.max(1000, delayMs);
      return;
    }

    this.remainingMs = 0;
    this.nextSpawnAt = Date.now() + delayMs;
    this.timerId = window.setTimeout(() => {
      this.timerId = 0;
      this.nextSpawnAt = 0;
      this.trySpawn();
      this.scheduleNext();
    }, delayMs);
  }

  private readonly onVisibilityChange = (): void => {
    if (this.destroyed) return;
    if (document.hidden) {
      if (this.timerId && this.nextSpawnAt > 0) {
        this.remainingMs = Math.max(1000, this.nextSpawnAt - Date.now());
      }
      window.clearTimeout(this.timerId);
      this.timerId = 0;
      this.nextSpawnAt = 0;
      this.activeAnim?.pause();
      return;
    }

    if (this.activeAnim && this.activeAnim.playState === 'paused') {
      this.activeAnim.play();
    }
    if (!this.timerId) {
      this.scheduleNext(this.remainingMs > 0 ? this.remainingMs : this.randomInterval());
    }
  };

  private canSpawn(): boolean {
    if (this.destroyed || document.hidden || this.activeEl) return false;
    if (isUiOverlayBlocking()) return false;
    return true;
  }

  public trySpawn(): boolean {
    if (!this.canSpawn()) return false;
    const wick = this.getWickPos();
    if (!wick) return false;

    const vw = window.innerWidth || 390;
    const missRect = document.getElementById('btn-miss')?.getBoundingClientRect();
    const writeRect = document.getElementById('btn-write')?.getBoundingClientRect();
    const compassRect = document.getElementById('compass')?.getBoundingClientRect();

    const buttonTop = Math.min(
      missRect?.height ? missRect.top : Infinity,
      writeRect?.height ? writeRect.top : Infinity
    );

    const side = this.side;
    this.side = side === 1 ? -1 : 1;

    // Duman (wick.x ± 18) ve alttaki butonlardan uzak, temiz başlangıç noktası
    const startX = Math.max(22, Math.min(vw - 22, wick.x + side * 26));
    const safeStartTop = Number.isFinite(buttonTop) ? Math.min(wick.y - 38, buttonTop - 12) : wick.y - 38;
    const startY = Math.max(120, safeStartTop);
    const endY = Math.max(84, startY - 96);

    // Yukarı çıkarken DOĞU–BATI çubuğuna binmemesi için gerekiyorsa yatay olarak dışa kaydır
    let endX = startX + side * 32;
    if (compassRect && compassRect.width > 0 && endY <= compassRect.bottom + 10) {
      endX = side > 0 ? Math.max(compassRect.right + 16, startX + 58) : Math.min(compassRect.left - 16, startX - 58);
    }
    endX = Math.max(20, Math.min(vw - 20, endX));

    const el = createWhiteHeartEl('white-heart candle-white-heart', CANDLE_HEART_SIZE_PX, 'candle');
    el.style.willChange = 'transform, opacity';
    document.body.appendChild(el);
    this.activeEl = el;

    const half = CANDLE_HEART_SIZE_PX / 2;
    const tx = (x: number, y: number, s: number) =>
      `translate3d(${(x - half).toFixed(1)}px, ${(y - half).toFixed(1)}px, 0) scale(${s})`;

    const reduced = prefersReducedMotion();
    const keyframes: Keyframe[] = reduced
      ? [
          { transform: tx(startX, startY - 8, 1), opacity: 0, offset: 0 },
          { transform: tx(startX, startY - 8, 1), opacity: 0.85, offset: 0.2 },
          { transform: tx(startX, startY - 8, 1), opacity: 0.85, offset: 0.78 },
          { transform: tx(startX, startY - 8, 1), opacity: 0, offset: 1 },
        ]
      : [
          { transform: tx(startX, startY, 0.84), opacity: 0, offset: 0 },
          {
            transform: tx(startX + (endX - startX) * 0.22 + side * 6, startY - 18, 1),
            opacity: 0.85,
            offset: 0.16,
          },
          {
            transform: tx(startX + (endX - startX) * 0.54 - side * 5, startY - 54, 1),
            opacity: 0.85,
            offset: 0.56,
          },
          {
            transform: tx(startX + (endX - startX) * 0.84 + side * 4, startY - 80, 0.96),
            opacity: 0.5,
            offset: 0.82,
          },
          { transform: tx(endX, endY, 0.9), opacity: 0, offset: 1 },
        ];

    const anim = el.animate(keyframes, {
      duration: reduced ? CANDLE_REDUCED_DURATION_MS : CANDLE_FLOAT_DURATION_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    this.activeAnim = anim;

    const cleanup = () => {
      el.style.willChange = 'auto';
      if (this.activeEl === el) this.activeEl = null;
      if (this.activeAnim === anim) this.activeAnim = null;
      el.remove();
    };
    anim.onfinish = cleanup;
    anim.oncancel = cleanup;
    return true;
  }

  public destroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.timerId);
    this.timerId = 0;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.activeAnim?.cancel();
    this.activeAnim = null;
    this.activeEl?.remove();
    this.activeEl = null;
  }
}

/* ---------- 2) "AYNI AN" beyaz kalbi + olay tekilleştirme ---------- */

const SYNC_HEART_SIZE_PX = 160; // ≈ 120 pt
const SYNC_SEEN_KEY_PREFIX = 'gokyuzu.syncHeartSeen.v1.';

let activeSyncEl: HTMLDivElement | null = null;
let activeSyncAnim: Animation | null = null;
let activeSyncVisHandler: (() => void) | null = null;

function syncPairKey(a: StarRecord, b: StarRecord): string {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

export function collectAllSyncPairs(stars: StarRecord[], nowMs: number): { key: string; latestMs: number }[] {
  const byMonth = new Map<number, StarRecord[]>();
  for (const s of stars) {
    const mk = starMonthIdx(s);
    const list = byMonth.get(mk);
    if (list) list.push(s);
    else byMonth.set(mk, [s]);
  }

  const pairs: { key: string; latestMs: number }[] = [];
  byMonth.forEach((group) => {
    for (const [a, b] of computeLinks(group, nowMs)) {
      const ta = a.unlockAt ? Date.parse(a.unlockAt) : Date.parse(a.createdAt);
      const tb = b.unlockAt ? Date.parse(b.unlockAt) : Date.parse(b.createdAt);
      pairs.push({ key: syncPairKey(a, b), latestMs: Math.max(ta, tb) });
    }
  });
  return pairs;
}

/**
 * Daha önce gösterilmemiş yeni bir "AYNI AN" olayı varsa olay id'lerini yerelde kaydeder
 * ve true döner (aynı olay iki kez gösterilmez).
 */
export function claimUnseenSyncPair(who: Who, stars: StarRecord[], nowMs: number): boolean {
  const allPairs = collectAllSyncPairs(stars, nowMs);
  if (allPairs.length === 0) return false;

  const storageKey = `${SYNC_SEEN_KEY_PREFIX}${who}`;
  const seen = new Set(store.get<string[]>(storageKey, []));
  const hasUnseen = allPairs.some((p) => !seen.has(p.key));
  if (!hasUnseen) return false;

  for (const p of allPairs) seen.add(p.key);
  store.set(storageKey, Array.from(seen).slice(-300));
  return true;
}

/**
 * Ekranın ortasında ≈120 pt büyük beyaz kalbi tek seferlik oynatır:
 * 400 ms'de %0→%70 opaklık + 0.8→1.0 ölçek, 1.2 sn kalır, 800 ms'de yukarı kayarak solar.
 */
export function showSyncWhiteHeart(): void {
  if (document.hidden) return;
  clearActiveSyncWhiteHeart();

  const size = Math.min(SYNC_HEART_SIZE_PX, Math.round((window.innerWidth || 390) * 0.42));
  const el = createWhiteHeartEl('white-heart sync-white-heart', size, 'sync');
  el.style.willChange = 'transform, opacity';
  document.body.appendChild(el);
  activeSyncEl = el;

  const reduced = prefersReducedMotion();
  const baseTransform = 'translate3d(-50%, -50%, 0)';
  const keyframes: Keyframe[] = reduced
    ? [
        { transform: `${baseTransform} scale(1)`, opacity: 0, offset: 0, easing: 'ease-out' },
        { transform: `${baseTransform} scale(1)`, opacity: 0.7, offset: 0.1667, easing: 'linear' },
        { transform: `${baseTransform} scale(1)`, opacity: 0.7, offset: 0.6667, easing: 'ease-out' },
        { transform: `${baseTransform} scale(1)`, opacity: 0, offset: 1 },
      ]
    : [
        { transform: `${baseTransform} scale(0.8)`, opacity: 0, offset: 0, easing: 'cubic-bezier(.22, .61, .36, 1)' },
        { transform: `${baseTransform} scale(1)`, opacity: 0.7, offset: 0.1667, easing: 'linear' },
        { transform: `${baseTransform} scale(1)`, opacity: 0.7, offset: 0.6667, easing: 'cubic-bezier(.32, .08, .24, 1)' },
        { transform: 'translate3d(-50%, calc(-50% - 44px), 0) scale(1.03)', opacity: 0, offset: 1 },
      ];

  const anim = el.animate(keyframes, {
    duration: 2400, // 400 ms giriş + 1200 ms bekleme + 800 ms çıkış
    easing: 'linear',
    fill: 'forwards',
  });
  activeSyncAnim = anim;

  const onVis = () => {
    if (document.hidden) {
      anim.pause();
    } else if (anim.playState === 'paused') {
      anim.play();
    }
  };
  activeSyncVisHandler = onVis;
  document.addEventListener('visibilitychange', onVis);

  const cleanup = () => {
    el.style.willChange = 'auto';
    if (activeSyncVisHandler === onVis) {
      document.removeEventListener('visibilitychange', onVis);
      activeSyncVisHandler = null;
    }
    if (activeSyncEl === el) activeSyncEl = null;
    if (activeSyncAnim === anim) activeSyncAnim = null;
    el.remove();
  };
  anim.onfinish = cleanup;
  anim.oncancel = cleanup;
}

export function clearActiveSyncWhiteHeart(): void {
  if (activeSyncVisHandler) {
    document.removeEventListener('visibilitychange', activeSyncVisHandler);
    activeSyncVisHandler = null;
  }
  activeSyncAnim?.cancel();
  activeSyncAnim = null;
  activeSyncEl?.remove();
  activeSyncEl = null;
}
