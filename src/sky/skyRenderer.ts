import type { StarRecord, Who } from '../types';
import { PlaneController } from './plane';
import {
  currentDecimalHour,
  formatHour,
  getMoonPhaseInfo,
  getOrbPlacement,
  skyAtHour,
  type MoonPhaseInfo,
} from './solar';
import { buildTravelMonths, drawMonthCardOnCanvas, type TravelMonthItem } from './travel';

export const PANO = 4;

export type SkyColorKey = 'blue' | 'pink' | 'gold';

interface DustParticle {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  alpha: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: SkyColorKey;
  life: number;
  max: number;
  size: number;
}

interface BurstRing {
  x: number;
  y: number;
  color: SkyColorKey;
  big: boolean;
  life: number;
  max: number;
}

interface FlyingComet {
  from: { x: number; y: number };
  to: { x: number; y: number };
  ctrl?: { x: number; y: number };
  color: SkyColorKey;
  t0: number;
  dur: number;
  tail: number;
  lastSpark: number;
  prevX: number;
  prevY: number;
  ang: number;
  ease: (t: number) => number;
  onDone: () => void;
}

interface DragState {
  pointerId: number;
  x0: number;
  ox0: number;
  moving: boolean;
  lastX: number;
  lastT: number;
  v: number;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bandY(f: number): number {
  return 0.5 + 0.26 * Math.sin(f * Math.PI * 2 * 1.15 + 0.6) + 0.07 * Math.sin(f * Math.PI * 2 * 3.1 + 2);
}

const COLOR_HEX: Record<SkyColorKey, { core: string; mid: string; glow: string }> = {
  blue: { core: '#eef5ff', mid: '#a8d4ff', glow: 'rgba(84,150,255,' },
  pink: { core: '#fff2f8', mid: '#ffb3da', glow: 'rgba(255,92,172,' },
  gold: { core: '#fff7e0', mid: '#ffd56e', glow: 'rgba(255,196,92,' },
};

export interface SkyEngineOptions {
  canvas: HTMLCanvasElement;
  moonCanvas?: HTMLCanvasElement;
  skyElement: HTMLElement;
  compassElement: HTMLElement;
  compassThumb: HTMLElement;
  travelLabelElement: HTMLElement;
  getWickPos?: () => { x: number; y: number } | null;
  getBloomPositions?: () => { x: number; y: number }[];
  getAllStars?: () => StarRecord[];
  getViewMonth?: () => number;
  getNowMs?: () => number;
  onSelectMonth?: (monthK: number, item: TravelMonthItem) => void;
  onOrbTap?: (orb: 'sun' | 'moon', center: { x: number; y: number }) => void;
  onOrbDoubleTap?: (orb: 'sun' | 'moon') => void;
  onWithoutChange?: (active: boolean) => void;
  onHeartStart?: () => void;
  onStarTap?: (star: StarRecord, center: { x: number; y: number }) => void;
  onSkyEmptyTap?: (pt: { x: number; y: number }) => void;
  onCaption?: (title: string, sub: string, ms: number) => void;
  onTimelapseEnd?: () => void;
}

export class SkyEngine {
  private readonly cv: HTMLCanvasElement;
  private readonly cx: CanvasRenderingContext2D;
  private readonly skyEl: HTMLElement;
  private readonly compassEl: HTMLElement;
  private readonly thumbEl: HTMLElement;
  private readonly reducedMotion: boolean;
  private readonly opts: SkyEngineOptions;

  // Offscreen pre-baked layers (Rule 3: baked once, drawn via drawImage)
  private readonly skyBgCanvas = document.createElement('canvas');
  private readonly nebCanvas = document.createElement('canvas');
  private readonly moonCanvas: HTMLCanvasElement;
  private readonly sunDayCanvas = document.createElement('canvas');
  private readonly sunLowCanvas = document.createElement('canvas');
  private readonly flameHaloCanvas = document.createElement('canvas');
  private readonly flameOutCanvas = document.createElement('canvas');
  private readonly flameMidCanvas = document.createElement('canvas');
  private readonly dustSprite = document.createElement('canvas');
  private readonly glintSprite = document.createElement('canvas');
  private readonly starHalos: Record<SkyColorKey, HTMLCanvasElement> = {
    blue: document.createElement('canvas'),
    pink: document.createElement('canvas'),
    gold: document.createElement('canvas'),
  };
  private readonly starCores: Record<SkyColorKey, HTMLCanvasElement> = {
    blue: document.createElement('canvas'),
    pink: document.createElement('canvas'),
    gold: document.createElement('canvas'),
  };
  private lastBakedSkyKey = '';
  private cachedWickPos: { x: number; y: number } | null = null;
  private cachedBloomPos: { x: number; y: number }[] = [];

  private readonly planeCtrl = new PlaneController();

  private W = 0;
  private H = 0;
  private DPR = 1;
  private skyTop = 84;
  private skyHeight = 460;
  private worldW = 1600;
  private nebScale = 1;

  // Panorama state
  private ox = 0;
  private vx = 0;
  private panRaf = 0;
  private drag: DragState | null = null;
  private compassTimer = 0;

  // Sky time & orbs
  private skyHourOverride: number | null = null;
  private timelapseActive = false;
  private timelapseRaf = 0;
  private moonInfo: MoonPhaseInfo = getMoonPhaseInfo();
  private lastMoonBake = 0;
  private currentCols: [string, string, string, string] = ['#03050e', '#08122b', '#17284d', '#3e5480'];
  private currentDaylight = 0;
  private lastSkySampleMs = 0;

  private sunScreen = { up: false, low: false, x: 0, y: 0, r: 20 };
  private moonScreen = { up: false, x: 0, y: 0, r: 26 };

  // Stars & Links state
  private me: Who = 'beto';
  private stars: StarRecord[] = [];
  private links: [StarRecord, StarRecord][] = [];
  private pairedIds = new Set<string>();
  private hiddenStarIds = new Set<string>();
  private bornAt = new Map<string, number>();
  private shakeUntil = new Map<string, number>();
  private goldifyAt = new Map<string, number>();
  private unlockWakeAt = new Map<string, number>();
  private glintStarId: string | null = null;
  private glintStart = 0;
  private nextGlintAt = 2400;

  // Particles & Comets
  private dust: DustParticle[] = [];
  private meteors: Meteor[] = [];
  private sparks: SparkParticle[] = [];
  private rings: BurstRing[] = [];
  private comets: FlyingComet[] = [];
  private embers: { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }[] = [];
  private smoke: { x: number; y: number; d: number; life: number; max: number; ph: number; r: number }[] = [];
  private candleHearts: { x: number; y: number; s: number; life: number; max: number; sw: number; rise: number }[] = [];
  private pollen: { x: number; y: number; vx: number; vy: number; life: number; max: number; sw: number }[] = [];
  private nextMeteorAt = 4000;
  private nextEmberAt = 0;
  private nextSmokeAt = 18000;
  private nextCandleHeartAt = 0;
  private nextPollenAt = 0;
  private breeze = 0;
  private breezeT = 0;
  private breezeNext = 8000;
  private flareAt = -1e9;
  private lastFrameT = 0;
  private mainRaf = 0;
  private idleTimer = 0;
  private loopPaused = false;
  private boostUntil = 0;
  private stateObserver: MutationObserver | null = null;
  private readonly perfDraws: number[] = [];
  private readonly onVisibility = () => {
    this.updateLoopState();
  };

  // Stage 6: "Sensiz gökyüzü", Heart Formation, Tap Hearts, Month Travel
  private withoutMode = false;
  private withoutAlpha = 1;
  private heartStartAt = -1;
  private readonly heartDur = 7000;
  private tapRings: { x: number; y: number; life: number; max: number }[] = [];
  private tapHearts: { x: number; y: number; dx: number; dy: number; rot: number; life: number; max: number }[] = [];

  private pressTimer = 0;
  private orbPressTimer = 0;
  private suppressNextClick = false;
  private lastOrbTapAt = 0;
  private singleOrbTapTimer = 0;
  private revealAt = 0;
  private docOrbPointerId: number | null = null;
  private docOrbStartX = 0;
  private docOrbStartY = 0;
  private docOrbMoved = false;
  private onDocPointerDown?: (e: PointerEvent) => void;
  private onDocPointerMove?: (e: PointerEvent) => void;
  private onDocPointerUp?: (e: PointerEvent) => void;

  private trav = {
    on: false,
    busy: false,
    ending: false,
    f: 0,
    zoom: 1,
    list: [] as TravelMonthItem[],
    x0: null as number | null,
    f0: 0,
    v: 0,
    lx: 0,
    lt: 0,
    tok: 0,
    shown: -1,
    lastOpen: 0,
    viewK: 0,
  };
  private readonly tLabelEl: HTMLElement;

  // FPS & frame telemetry (last 120 frames)
  private fpsFrames = 0;
  private fpsWindowStart = 0;
  private currentFps = 60;
  private currentMode: 'active' | 'idle' | 'quiet' | 'paused' = 'idle';

  constructor(opts: SkyEngineOptions) {
    this.opts = opts;
    this.cv = opts.canvas;
    this.moonCanvas = opts.moonCanvas ?? document.createElement('canvas');
    const ctx = this.cv.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context oluşturulamadı');
    this.cx = ctx;
    this.skyEl = opts.skyElement;
    this.compassEl = opts.compassElement;
    this.thumbEl = opts.compassThumb;
    this.tLabelEl = opts.travelLabelElement;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.bakeStarSprites();
    this.bakeFlameSprites();
    this.bakeSunSprites();
    this.bakeMoonSprite();
    this.bindEvents();
    this.resize();
    this.syncSkyState(true);
    this.refreshCachedPositions();
    this.startLoop();
  }

  public refreshCachedPositions(): void {
    this.cachedWickPos = this.opts.getWickPos?.() ?? null;
    this.cachedBloomPos = this.opts.getBloomPositions?.() ?? [];
  }

  public triggerFlameFlare(): void {
    const now = performance.now();
    this.flareAt = now;
    this.nextSmokeAt = Math.min(this.nextSmokeAt, now + 1400);
    this.boostMotion(1900);
  }

  public triggerEnterReveal(): void {
    this.revealAt = this.reducedMotion ? 0 : performance.now();
    this.boostMotion(1600);
  }

  public launchPlane(): boolean {
    if (this.reducedMotion || document.hidden || this.timelapseActive || this.trav.on || this.withoutMode) {
      return false;
    }
    const ok = this.planeCtrl.launch(this.me, this.skyTop, this.skyHeight);
    if (ok) this.boostMotion(600);
    return ok;
  }

  public stopPlane(): void {
    this.planeCtrl.stop();
  }

  public isTraveling(): boolean {
    return this.trav.on;
  }

  public isWithoutMode(): boolean {
    return this.withoutMode;
  }

  public startHeartFormation(): boolean {
    if (this.heartStartAt >= 0 || this.stars.length === 0 || this.reducedMotion || this.trav.on) {
      return false;
    }
    this.heartStartAt = performance.now();
    this.boostMotion(this.heartDur + 200);
    this.opts.onHeartStart?.();
    return true;
  }

  public spawnTapHearts(x: number, y: number): void {
    if (this.reducedMotion) return;
    this.boostMotion(1300);
    this.tapRings.push({ x, y, life: 0, max: 1100 });
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      this.tapHearts.push({
        x,
        y,
        dx: Math.cos(a) * (36 + Math.random() * 32),
        dy: Math.sin(a) * (52 + Math.random() * 40),
        rot: (Math.random() - 0.5) * 1.2,
        life: -i * 35,
        max: 1150,
      });
    }
  }

  public abortTravel(): void {
    if (!this.trav.on) return;
    this.trav.tok++;
    this.trav.on = false;
    this.trav.busy = false;
    this.trav.ending = false;
    this.trav.zoom = 1;
    document.body.classList.remove('trav');
  }

  public setWho(who: Who): void {
    this.me = who;
  }

  public setStarsData(stars: StarRecord[], links: [StarRecord, StarRecord][]): void {
    this.stars = stars;
    this.links = links;
    this.pairedIds = new Set<string>();
    for (const [a, b] of links) {
      this.pairedIds.add(a.id);
      this.pairedIds.add(b.id);
    }
  }

  public hideStarTemporarily(id: string, hidden: boolean): void {
    if (hidden) this.hiddenStarIds.add(id);
    else this.hiddenStarIds.delete(id);
  }

  public markStarBorn(id: string): void {
    this.bornAt.set(id, performance.now());
    this.boostMotion(1000);
  }

  public markStarShake(id: string): void {
    this.shakeUntil.set(id, performance.now() + 550);
    this.boostMotion(600);
  }

  public markStarGoldify(id: string): void {
    this.goldifyAt.set(id, performance.now());
    this.boostMotion(1500);
  }

  public markStarUnlockWake(id: string): void {
    this.unlockWakeAt.set(id, performance.now());
    this.boostMotion(1800);
  }

  public getStarScreenPos(star: StarRecord): { x: number; y: number } {
    const sw = this.getSkyW();
    return {
      x: (star.x / 100) * sw * PANO - this.ox,
      y: this.skyTop + (star.y / 100) * this.skyHeight,
    };
  }

  public revealStarThen(star: StarRecord, done: () => void): void {
    const sw = this.getSkyW();
    const xw = (star.x / 100) * sw * PANO;
    if (xw - this.ox < 60 || xw - this.ox > sw - 60) {
      this.panTo(xw - sw / 2, 900, done);
    } else {
      done();
    }
  }

  public spawnBurst(x: number, y: number, color: SkyColorKey, big = true): void {
    if (this.reducedMotion) return;
    this.boostMotion(1300);
    this.rings.push({ x, y, color, big, life: 0, max: 950 });
    const count = big ? 18 : 10;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const spd = (0.03 + Math.random() * (big ? 0.065 : 0.035));
      this.sparks.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        life: 0,
        max: 650 + Math.random() * 550,
        size: big ? 1.8 : 1.4,
      });
    }
  }

  public launchComet(params: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    ctrl?: { x: number; y: number };
    color: SkyColorKey;
    dur: number;
    tail: number;
    ease?: (t: number) => number;
  }, onDone: () => void): void {
    if (this.reducedMotion) {
      onDone();
      return;
    }
    const t0 = performance.now();
    this.boostMotion(params.dur + 200);
    this.comets.push({
      from: params.from,
      to: params.to,
      ctrl: params.ctrl,
      color: params.color,
      t0,
      dur: params.dur,
      tail: params.tail,
      lastSpark: t0,
      prevX: params.from.x,
      prevY: params.from.y,
      ang: Math.atan2(params.to.y - params.from.y, params.to.x - params.from.x),
      ease: params.ease ?? ((t) => 1 - Math.pow(1 - t, 3)),
      onDone,
    });
  }

  public getSkyW(): number {
    return this.skyEl.clientWidth || window.innerWidth;
  }

  public getSkyRect(): { top: number; height: number; width: number } {
    return { top: this.skyTop, height: this.skyHeight, width: this.getSkyW() };
  }

  public getMaxOx(): number {
    return Math.max(0, this.getSkyW() * (PANO - 1));
  }

  public getOx(): number {
    return this.ox;
  }

  public getMoonInfo(): MoonPhaseInfo {
    return this.moonInfo;
  }

  public getCurrentHour(): number {
    return this.skyHourOverride ?? currentDecimalHour();
  }

  public isTimelapseActive(): boolean {
    return this.timelapseActive;
  }

  public getPerfStats(): {
    avgMs: number;
    maxMs: number;
    fps: number;
    mode: 'active' | 'idle' | 'quiet' | 'paused';
    samples: number;
  } {
    const n = this.perfDraws.length;
    if (n === 0) {
      return { avgMs: 0, maxMs: 0, fps: this.currentFps, mode: this.currentMode, samples: 0 };
    }
    let sum = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const v = this.perfDraws[i];
      sum += v;
      if (v > max) max = v;
    }
    return {
      avgMs: +(sum / n).toFixed(2),
      maxMs: +max.toFixed(2),
      fps: this.currentFps,
      mode: this.currentMode,
      samples: n,
    };
  }

  public setOx(nextOx: number): void {
    this.ox = nextOx;
    const max = this.getMaxOx();
    const frac = max > 0 ? Math.max(0, Math.min(1, this.ox / max)) : 0.5;
    this.thumbEl.style.transform = `translateX(${(frac * 300).toFixed(1)}%)`;
  }

  public centerPanorama(): void {
    this.setOx(this.getMaxOx() * 0.5);
  }

  public panTo(target: number, ms = 800, done?: () => void): void {
    this.stopPan();
    this.boostMotion(ms + 200);
    const from = this.ox;
    const to = Math.max(0, Math.min(this.getMaxOx(), target));
    const t0 = performance.now();

    if (this.reducedMotion || Math.abs(to - from) < 1) {
      this.setOx(to);
      done?.();
      return;
    }

    this.compassActive();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const ease = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.setOx(from + (to - from) * ease);
      if (k < 1) {
        this.panRaf = requestAnimationFrame(step);
      } else {
        this.panRaf = 0;
        this.compassIdle();
        done?.();
      }
    };
    this.panRaf = requestAnimationFrame(step);
  }

  public startTimelapse(fromH: number, deltaHours: number, delayMs = 900, keepEnd = false): void {
    if (this.reducedMotion || this.timelapseActive) return;
    this.timelapseActive = true;
    this.boostMotion(delayMs + 10_000);
    document.body.classList.add('timelapse');
    this.skyHourOverride = ((fromH % 24) + 24) % 24;
    this.syncSkyState(true);

    const ms = Math.min(9000, 5200 + Math.abs(deltaHours) * 240);
    const toH = fromH + deltaHours;

    window.setTimeout(() => {
      if (!this.timelapseActive) return;
      this.opts.onCaption?.('', `${formatHour(fromH)}  →  ${formatHour(toH)}`, ms + 1400);
      const t0 = performance.now();
      const step = (now: number) => {
        if (!this.timelapseActive) return;
        const k = Math.min(1, (now - t0) / ms);
        const ease = (1 - Math.cos(Math.PI * k)) / 2;
        this.skyHourOverride = (((fromH + deltaHours * ease) % 24) + 24) % 24;
        this.syncSkyState(true);
        if (k < 1) {
          this.timelapseRaf = requestAnimationFrame(step);
        } else {
          this.timelapseActive = false;
          document.body.classList.remove('timelapse');
          this.skyHourOverride = keepEnd ? (((toH % 24) + 24) % 24) : null;
          this.syncSkyState(true);
          this.opts.onTimelapseEnd?.();
        }
      };
      this.timelapseRaf = requestAnimationFrame(step);
    }, delayMs);
  }

  public stopTimelapse(): void {
    if (!this.timelapseActive) return;
    this.timelapseActive = false;
    cancelAnimationFrame(this.timelapseRaf);
    document.body.classList.remove('timelapse');
    this.skyHourOverride = null;
    this.syncSkyState(true);
  }

  public hitTestStar(clientX: number, clientY: number): { star: StarRecord; x: number; y: number } | null {
    let best: { star: StarRecord; x: number; y: number; dist: number } | null = null;
    for (const s of this.stars) {
      if (this.hiddenStarIds.has(s.id)) continue;
      const pos = this.getStarScreenPos(s);
      if (pos.x < -30 || pos.x > this.W + 30) continue;
      const d = Math.hypot(clientX - pos.x, clientY - pos.y);
      if (d <= 26 && (!best || d < best.dist)) {
        best = { star: s, x: pos.x, y: pos.y, dist: d };
      }
    }
    return best ? { star: best.star, x: best.x, y: best.y } : null;
  }

  public hitTestOrb(clientX: number, clientY: number): { orb: 'sun' | 'moon'; x: number; y: number } | null {
    if (this.sunScreen.up) {
      const dist = Math.hypot(clientX - this.sunScreen.x, clientY - this.sunScreen.y);
      if (dist <= 46) {
        return { orb: 'sun', x: this.sunScreen.x, y: this.sunScreen.y };
      }
    }
    if (this.moonScreen.up) {
      const dist = Math.hypot(clientX - this.moonScreen.x, clientY - this.moonScreen.y);
      if (dist <= 48) {
        return { orb: 'moon', x: this.moonScreen.x, y: this.moonScreen.y };
      }
    }
    return null;
  }

  public resize = (): void => {
    this.DPR = Math.min(2, window.devicePixelRatio || 1);
    const cvRect = this.cv.getBoundingClientRect();
    this.W = Math.max(window.innerWidth, Math.ceil(cvRect.width));
    this.H = Math.max(window.innerHeight, Math.ceil(cvRect.height));
    this.cv.width = Math.floor(this.W * this.DPR);
    this.cv.height = Math.floor(this.H * this.DPR);
    this.cx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);

    const sr = this.skyEl.getBoundingClientRect();
    this.skyTop = sr.top || 84;
    this.skyHeight = sr.height || this.H * 0.6;
    this.worldW = (sr.width || this.W) * PANO;

    const rnd = mulberry32(4);
    const dustCount = Math.min(560, Math.round((this.worldW * this.H) / 5200));
    this.dust = Array.from({ length: dustCount }, () => {
      const f = rnd();
      const inBand = rnd() < 0.45;
      const y = inBand
        ? this.skyTop + (bandY(f) + (rnd() + rnd() + rnd() - 1.5) * 0.12) * this.skyHeight
        : rnd() * this.H * 0.88;
      return {
        x: f * this.worldW,
        y,
        r: rnd() * 1.15 + 0.45,
        phase: rnd() * Math.PI * 2,
        speed: 0.45 + rnd() * 1.55,
        alpha: 0.28 + rnd() * 0.62,
      };
    });

    this.lastBakedSkyKey = '';
    this.bakeSkyBackground();
    this.bakeNebula();
    this.setOx(Math.max(0, Math.min(this.getMaxOx(), this.ox)));
    this.refreshCachedPositions();
    if (this.reducedMotion) {
      this.drawFrame(performance.now());
    }
  };

  private stopPan(): void {
    if (this.panRaf) {
      cancelAnimationFrame(this.panRaf);
      this.panRaf = 0;
    }
  }

  private compassActive(): void {
    window.clearTimeout(this.compassTimer);
    this.compassEl.classList.add('active');
  }

  private compassIdle(): void {
    window.clearTimeout(this.compassTimer);
    this.compassTimer = window.setTimeout(() => {
      this.compassEl.classList.remove('active');
    }, 900);
  }

  private glide(): void {
    this.stopPan();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(34, now - last);
      last = now;
      const max = this.getMaxOx();
      const tgt = this.ox < 0 ? 0 : this.ox > max ? max : null;

      if (tgt !== null) {
        this.vx = this.vx * Math.exp(-0.022 * dt) + (tgt - this.ox) * 0.0003 * dt;
      } else {
        this.vx *= Math.exp(-dt / 340);
      }

      const nx = this.ox + this.vx * dt;
      if (
        (tgt !== null && Math.abs(this.vx) < 0.02 && Math.abs(tgt - nx) < 0.6) ||
        (tgt === null && Math.abs(this.vx) < 0.008)
      ) {
        this.setOx(tgt !== null ? tgt : nx);
        this.panRaf = 0;
        this.compassIdle();
        return;
      }

      this.setOx(nx);
      this.panRaf = requestAnimationFrame(step);
    };
    this.panRaf = requestAnimationFrame(step);
  }

  private tweenTravel(ms: number, ease: (k: number) => number, fn: (e: number) => void): Promise<boolean> {
    const tok = this.trav.tok;
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (tok !== this.trav.tok) {
          res(false);
          return;
        }
        const k = Math.min(1, (now - t0) / ms);
        fn(ease(k));
        if (k < 1) requestAnimationFrame(step);
        else res(true);
      };
      requestAnimationFrame(step);
    });
  }

  private updateTravelLabel(): void {
    const n = Math.max(0, Math.min(this.trav.list.length - 1, Math.round(this.trav.f)));
    if (n === this.trav.shown) return;
    this.trav.shown = n;
    const it = this.trav.list[n];
    if (!it) return;
    const b = this.tLabelEl.querySelector('b');
    const small = this.tLabelEl.querySelector('small');
    if (b) b.textContent = it.title;
    if (small) {
      small.textContent = it.locked
        ? it.gold
          ? "9 OCAK'TA AÇILACAK"
          : 'HENÜZ GELMEDİ'
        : it.n
          ? `${it.n} YILDIZ`
          : 'HENÜZ YILDIZ YOK';
    }
    const inner = this.tLabelEl.querySelector('.tl-in');
    if (inner && !this.reducedMotion) {
      inner.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)' }
      );
    }
  }

  private async startTravel(): Promise<void> {
    const allStars = this.opts.getAllStars?.() ?? this.stars;
    if (this.trav.on || !document.body.classList.contains('awake')) {
      return;
    }
    const viewK = this.opts.getViewMonth?.() ?? 0;
    this.trav.on = true;
    this.boostMotion(1000);
    this.trav.busy = true;
    this.trav.ending = false;
    this.trav.tok++;
    this.trav.x0 = null;
    this.trav.v = 0;
    this.trav.shown = -1;
    this.trav.viewK = viewK;
    this.trav.list = buildTravelMonths(allStars);
    this.trav.f = Math.max(
      0,
      this.trav.list.findIndex((it) => it.k === viewK)
    );
    this.trav.zoom = 1;
    this.trav.lastOpen = this.trav.list.reduce((acc, it, idx) => (it.locked ? acc : idx), 0);

    this.tLabelEl.style.top = `${this.skyTop + this.skyHeight * 0.77 + 14}px`;
    this.tLabelEl.classList.remove('moved');
    document.body.classList.add('trav');
    this.stopPan();

    if (this.drag) {
      try {
        this.skyEl.setPointerCapture(this.drag.pointerId);
      } catch {
        // Ignore
      }
    }

    this.updateTravelLabel();
    const ok = await this.tweenTravel(
      this.reducedMotion ? 180 : 720,
      (k) => 1 - Math.pow(1 - k, 3),
      (e) => {
        this.trav.zoom = 1 - 0.48 * e;
      }
    );
    if (ok) this.trav.busy = false;
  }

  private travelMove(e: PointerEvent): void {
    if (this.trav.busy && this.trav.zoom > 0.9) return;
    if (this.trav.x0 === null) {
      this.trav.x0 = e.clientX;
      this.trav.f0 = this.trav.f;
      this.trav.lx = e.clientX;
      this.trav.lt = performance.now();
      this.tLabelEl.classList.add('moved');
    }
    const gap = this.getSkyW() * 0.52 * 1.04 + 14;
    let f = this.trav.f0 - (e.clientX - this.trav.x0) / gap;
    if (f < 0) f *= 0.4;
    else if (f > this.trav.lastOpen) f = this.trav.lastOpen + (f - this.trav.lastOpen) * 0.4;
    this.trav.f = f;
    this.updateTravelLabel();

    const now = performance.now();
    const dt = Math.max(1, now - this.trav.lt);
    this.trav.v = this.trav.v * 0.6 + (-(e.clientX - this.trav.lx) / gap / dt) * 0.4;
    this.trav.lx = e.clientX;
    this.trav.lt = now;
  }

  private async travelEnd(): Promise<void> {
    if (!this.trav.on || this.trav.ending) return;
    this.trav.ending = true;
    const tok = this.trav.tok;

    let t = Math.round(this.trav.f + Math.max(-0.7, Math.min(0.7, this.trav.v * 180)));
    t = Math.max(0, Math.min(this.trav.lastOpen, t));
    const chosenItem = this.trav.list[t];
    const f0 = this.trav.f;

    await this.tweenTravel(
      340 + Math.min(300, Math.abs(t - f0) * 160),
      (k) => 1 - Math.pow(1 - k, 3),
      (e) => {
        this.trav.f = f0 + (t - f0) * e;
        this.updateTravelLabel();
      }
    );
    if (tok !== this.trav.tok) return;

    const z0 = this.trav.zoom;
    await this.tweenTravel(
      chosenItem.k === this.trav.viewK ? 520 : 740,
      (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
      (e) => {
        this.trav.zoom = z0 + (1 - z0) * e;
      }
    );
    if (tok !== this.trav.tok) return;

    document.body.classList.remove('trav');
    this.trav.on = false;
    this.trav.busy = false;
    this.trav.ending = false;
    this.trav.zoom = 1;
    this.trav.tok++;

    if (chosenItem) {
      this.opts.onSelectMonth?.(chosenItem.k, chosenItem);
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.resize);
    this.skyEl.addEventListener('contextmenu', (e) => e.preventDefault());
    this.skyEl.addEventListener('selectstart', (e) => e.preventDefault());
    // Prevent iOS Safari native long-press callout / pointercancel while holding sky or Moon/Sun
    this.skyEl.addEventListener(
      'touchstart',
      (e) => {
        if (document.body.classList.contains('awake')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    const releaseWithout = () => {
      window.clearTimeout(this.orbPressTimer);
      if (!this.withoutMode) return;
      this.withoutMode = false;
      this.opts.onWithoutChange?.(false);
    };

    const handleSkyTap = (clientX: number, clientY: number) => {
      if (!document.body.classList.contains('awake') || this.trav.on) return;

      const starHit = this.hitTestStar(clientX, clientY);
      if (starHit) {
        this.opts.onStarTap?.(starHit.star, { x: starHit.x, y: starHit.y });
        return;
      }

      const orbHit = this.hitTestOrb(clientX, clientY);
      if (orbHit) {
        const now = Date.now();
        if (now - this.lastOrbTapAt < 400) {
          window.clearTimeout(this.singleOrbTapTimer);
          this.lastOrbTapAt = 0;
          this.startHeartFormation();
          this.opts.onOrbDoubleTap?.(orbHit.orb);
        } else {
          this.lastOrbTapAt = now;
          this.singleOrbTapTimer = window.setTimeout(() => {
            this.opts.onOrbTap?.(orbHit.orb, { x: orbHit.x, y: orbHit.y });
          }, 400);
        }
        return;
      }

      this.spawnTapHearts(clientX, clientY);
      this.opts.onSkyEmptyTap?.({ x: clientX, y: clientY });
    };

    this.skyEl.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !document.body.classList.contains('awake') || this.timelapseActive) return;

      this.boostMotion(900);
      this.suppressNextClick = false;
      window.clearTimeout(this.pressTimer);
      window.clearTimeout(this.orbPressTimer);

      try {
        this.skyEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      const orbHit = this.hitTestOrb(e.clientX, e.clientY);
      const starHit = this.hitTestStar(e.clientX, e.clientY);

      if (orbHit) {
        this.orbPressTimer = window.setTimeout(() => {
          if (this.trav.on) return;
          this.withoutMode = true;
          this.suppressNextClick = true;
          this.opts.onWithoutChange?.(true);
        }, 500);
      } else if (!starHit) {
        this.pressTimer = window.setTimeout(() => {
          this.suppressNextClick = true;
          void this.startTravel();
        }, 500);
      }

      this.stopPan();
      this.vx = 0;
      this.drag = {
        pointerId: e.pointerId,
        x0: e.clientX,
        ox0: this.ox,
        moving: false,
        lastX: e.clientX,
        lastT: performance.now(),
        v: 0,
      };
    });

    this.skyEl.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.pointerId) return;
      if (this.trav.on) {
        this.travelMove(e);
        return;
      }
      const dx = e.clientX - this.drag.x0;
      if (!this.drag.moving) {
        if (Math.abs(dx) < 14) return;
        this.drag.moving = true;
        window.clearTimeout(this.pressTimer);
        window.clearTimeout(this.orbPressTimer);
        this.compassActive();
      }
      const max = this.getMaxOx();
      let next = this.drag.ox0 - dx;
      if (next < 0) next *= 0.35;
      else if (next > max) next = max + (next - max) * 0.35;
      this.setOx(next);
      this.boostMotion(700);

      const now = performance.now();
      const dtt = Math.max(1, now - this.drag.lastT);
      this.drag.v = this.drag.v * 0.55 + (-(e.clientX - this.drag.lastX) / dtt) * 0.45;
      this.drag.lastX = e.clientX;
      this.drag.lastT = now;
    });

    const endDrag = (e: PointerEvent, isCancel: boolean) => {
      window.clearTimeout(this.pressTimer);
      releaseWithout();
      if (!this.drag || e.pointerId !== this.drag.pointerId) return;
      const d = this.drag;
      this.drag = null;
      if (this.trav.on) {
        void this.travelEnd();
        return;
      }
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }
      if (!d.moving) {
        if (!isCancel) {
          handleSkyTap(e.clientX, e.clientY);
        }
        return;
      }
      this.vx = performance.now() - d.lastT > 90 ? 0 : Math.max(-4.5, Math.min(4.5, d.v));
      this.glide();
    };

    this.skyEl.addEventListener('pointerup', (e) => endDrag(e, false));
    this.skyEl.addEventListener('pointercancel', (e) => endDrag(e, true));

    // Sağ üstte sabit Ay (#sky üstünde durduğu için dokunuş/uzun basma yakalama)
    const triggerOrbTap = (orb: { orb: 'sun' | 'moon'; x: number; y: number }) => {
      const now = Date.now();
      if (now - this.lastOrbTapAt < 400) {
        window.clearTimeout(this.singleOrbTapTimer);
        this.lastOrbTapAt = 0;
        this.startHeartFormation();
        this.opts.onOrbDoubleTap?.(orb.orb);
      } else {
        this.lastOrbTapAt = now;
        this.singleOrbTapTimer = window.setTimeout(() => {
          this.opts.onOrbTap?.(orb.orb, { x: orb.x, y: orb.y });
        }, 400);
      }
    };

    this.onDocPointerDown = (e: PointerEvent) => {
      if (e.button > 0 || !document.body.classList.contains('awake') || this.timelapseActive || this.trav.on) return;
      if (document.querySelector('.sheet.open, .modal.open, #lock:not(.gone), #onboard:not(.gone)')) return;
      const target = e.target as Element | null;
      if (target?.closest('button, a, input, textarea, #sky')) return;
      if (!this.moonScreen.up) return;
      const dist = Math.hypot(e.clientX - this.moonScreen.x, e.clientY - this.moonScreen.y);
      if (dist > 34) return;

      this.boostMotion(900);
      this.docOrbPointerId = e.pointerId;
      this.docOrbStartX = e.clientX;
      this.docOrbStartY = e.clientY;
      this.docOrbMoved = false;
      this.suppressNextClick = false;
      window.clearTimeout(this.orbPressTimer);
      this.orbPressTimer = window.setTimeout(() => {
        if (this.trav.on) return;
        this.withoutMode = true;
        this.suppressNextClick = true;
        this.opts.onWithoutChange?.(true);
      }, 500);
    };

    this.onDocPointerMove = (e: PointerEvent) => {
      if (this.docOrbPointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - this.docOrbStartX, e.clientY - this.docOrbStartY) > 14) {
        this.docOrbMoved = true;
        window.clearTimeout(this.orbPressTimer);
      }
    };

    this.onDocPointerUp = (e: PointerEvent) => {
      if (this.docOrbPointerId !== e.pointerId) return;
      const moved = this.docOrbMoved;
      this.docOrbPointerId = null;
      window.clearTimeout(this.orbPressTimer);
      releaseWithout();
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }
      if (!moved && e.type === 'pointerup' && this.moonScreen.up) {
        triggerOrbTap({ orb: 'moon', x: this.moonScreen.x, y: this.moonScreen.y });
      }
    };

    document.addEventListener('pointerdown', this.onDocPointerDown);
    document.addEventListener('pointermove', this.onDocPointerMove);
    document.addEventListener('pointerup', this.onDocPointerUp);
    document.addEventListener('pointercancel', this.onDocPointerUp);

    window.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('awake') || this.trav.on) return;
      if (document.querySelector('.sheet.open, .modal.open, #lock:not(.gone)')) return;
      if (e.key === 'ArrowRight') this.panTo(this.ox + this.getSkyW() * 0.6, 560);
      if (e.key === 'ArrowLeft') this.panTo(this.ox - this.getSkyW() * 0.6, 560);
    });
  }

  private bakeStarSprites(): void {
    // 1. Dust pinpoint dot sprite (soft anti-aliased pinpoint, no blocky pixels)
    {
      const ds = 16;
      this.dustSprite.width = ds;
      this.dustSprite.height = ds;
      const dg = this.dustSprite.getContext('2d');
      if (dg) {
        const m = ds / 2;
        const grad = dg.createRadialGradient(m, m, 0, m, m, m);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.28, 'rgba(240,246,255,0.72)');
        grad.addColorStop(0.65, 'rgba(210,225,255,0.14)');
        grad.addColorStop(1, 'rgba(210,225,255,0)');
        dg.fillStyle = grad;
        dg.fillRect(0, 0, ds, ds);
      }
    }

    // 2. Tapered 4-point diffraction glint sprite (shown only during brief glint flash)
    {
      const gs = 128;
      this.glintSprite.width = gs;
      this.glintSprite.height = gs;
      const gg = this.glintSprite.getContext('2d');
      if (gg) {
        const m = gs / 2;
        gg.save();
        gg.translate(m, m);
        for (let r = 0; r < 2; r++) {
          const len = r === 0 ? 52 : 40;
          const sg = gg.createLinearGradient(-len, 0, len, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.38, 'rgba(255,255,255,0.45)');
          sg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
          sg.addColorStop(0.62, 'rgba(255,255,255,0.45)');
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          gg.fillStyle = sg;
          gg.beginPath();
          gg.moveTo(-len, 0);
          gg.lineTo(0, -1.3);
          gg.lineTo(len, 0);
          gg.lineTo(0, 1.3);
          gg.closePath();
          gg.fill();
          gg.rotate(Math.PI / 2);
        }
        gg.restore();
      }
    }

    // 3. Separate soft radial halo + crisp pinpoint core per star color (no constant crossbars)
    const keys: SkyColorKey[] = ['blue', 'pink', 'gold'];
    for (const key of keys) {
      const pal = COLOR_HEX[key];

      // Soft multi-stop halo (128x128)
      const hc = this.starHalos[key];
      const hs = 128;
      hc.width = hs;
      hc.height = hs;
      const hg = hc.getContext('2d');
      if (hg) {
        const mid = hs / 2;
        const halo = hg.createRadialGradient(mid, mid, 0, mid, mid, 58);
        halo.addColorStop(0, `${pal.glow}0.62)`);
        halo.addColorStop(0.22, `${pal.glow}0.32)`);
        halo.addColorStop(0.5, `${pal.glow}0.10)`);
        halo.addColorStop(0.8, `${pal.glow}0.02)`);
        halo.addColorStop(1, `${pal.glow}0)`);
        hg.fillStyle = halo;
        hg.fillRect(0, 0, hs, hs);
      }

      // Crisp luminous core (64x64)
      const cc = this.starCores[key];
      const cs = 64;
      cc.width = cs;
      cc.height = cs;
      const cg = cc.getContext('2d');
      if (cg) {
        const mid = cs / 2;
        const core = cg.createRadialGradient(mid, mid, 0, mid, mid, 14);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.26, '#ffffff');
        core.addColorStop(0.48, pal.core);
        core.addColorStop(0.75, pal.mid);
        core.addColorStop(1, `${pal.glow}0)`);
        cg.fillStyle = core;
        cg.beginPath();
        cg.arc(mid, mid, 14, 0, Math.PI * 2);
        cg.fill();
      }
    }
  }

  private bakeNebula(): void {
    const w = Math.max(1, this.worldW);
    const h = Math.max(1, this.H);
    this.nebScale = Math.min(this.DPR, Math.sqrt(12e6 / Math.max(1, w * h)));
    this.nebCanvas.width = Math.ceil(w * this.nebScale);
    this.nebCanvas.height = Math.ceil(h * this.nebScale);

    const n = this.nebCanvas.getContext('2d');
    if (!n) return;
    n.setTransform(this.nebScale, 0, 0, this.nebScale, 0, 0);
    n.clearRect(0, 0, w, h);

    const rnd = mulberry32(9);
    const cols = ['120,150,215', '160,150,210', '110,160,220'];
    const by = (f: number) => this.skyTop + bandY(f) * this.skyHeight;

    const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
      const g = n.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      n.fillStyle = g;
      n.fillRect(x - r, y - r, r * 2, r * 2);
    };

    for (let i = 0; i < 36 * PANO; i++) {
      const f = rnd();
      blob(f * w, by(f) + (rnd() - 0.5) * this.skyHeight * 0.24, 60 + rnd() * 150, cols[i % 3], 0.03 + rnd() * 0.05);
    }
    for (let i = 0; i < 26 * PANO; i++) {
      const f = rnd();
      blob(f * w, by(f) + (rnd() - 0.5) * this.skyHeight * 0.07, 22 + rnd() * 48, '236,232,255', 0.03 + rnd() * 0.04);
    }
    for (let i = 0; i < 16 * PANO; i++) {
      const f = rnd();
      const x = f * w;
      const y = by(f) + (rnd() - 0.4) * this.skyHeight * 0.05;
      const ang = Math.atan2(by(f + 0.002) - by(f), 0.002 * w);
      n.save();
      n.translate(x, y);
      n.rotate(ang);
      n.scale(1, 0.26);
      const r = 40 + rnd() * 90;
      const g = n.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(2,4,12,.22)');
      g.addColorStop(1, 'rgba(2,4,12,0)');
      n.fillStyle = g;
      n.fillRect(-r, -r, r * 2, r * 2);
      n.restore();
    }

    const tint = () => {
      const k = rnd();
      return k < 0.14 ? '255,226,196' : k < 0.28 ? '200,214,255' : '255,255,255';
    };

    const bandStarCount = Math.round((w * h) / 520);
    for (let i = 0; i < bandStarCount; i++) {
      const f = rnd();
      const g = (rnd() + rnd() + rnd() - 1.5) * 0.14;
      n.fillStyle = `rgba(${tint()},${(rnd() * 0.42).toFixed(2)})`;
      const sz = 0.7 + rnd() * 0.55;
      n.fillRect(f * w, by(f) + g * this.skyHeight, sz, sz);
    }

    const bgStarCount = Math.round((w * h) / 2600);
    for (let i = 0; i < bgStarCount; i++) {
      n.fillStyle = `rgba(${tint()},${(0.08 + rnd() * 0.34).toFixed(2)})`;
      const sz = 0.6 + rnd() * 0.5;
      n.fillRect(rnd() * w, rnd() * h * 0.9, sz, sz);
    }
  }

  private bakeFlameSprites(): void {
    // Halo sprite
    {
      const size = 180;
      this.flameHaloCanvas.width = size;
      this.flameHaloCanvas.height = size;
      const g = this.flameHaloCanvas.getContext('2d');
      if (g) {
        const mid = size / 2;
        const halo = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
        halo.addColorStop(0, 'rgba(255, 217, 160, 0.72)');
        halo.addColorStop(0.32, 'rgba(255, 182, 126, 0.25)');
        halo.addColorStop(1, 'rgba(255, 154, 198, 0)');
        g.fillStyle = halo;
        g.fillRect(0, 0, size, size);
      }
    }

    // Outer flame teardrop sprite (anchor: bottom-center wick at (32, 86) in 64x96 canvas)
    {
      const w = 64;
      const h = 96;
      this.flameOutCanvas.width = w;
      this.flameOutCanvas.height = h;
      const g = this.flameOutCanvas.getContext('2d');
      if (g) {
        g.translate(32, 88);
        const fOut = g.createLinearGradient(0, 2, 0, -44);
        fOut.addColorStop(0, 'rgba(107, 149, 255, 0.85)');
        fOut.addColorStop(0.16, 'rgba(255, 154, 60, 0.92)');
        fOut.addColorStop(0.62, 'rgba(255, 179, 71, 0.95)');
        fOut.addColorStop(1, 'rgba(255, 122, 46, 0)');
        g.fillStyle = fOut;
        g.beginPath();
        g.moveTo(0, -40);
        g.bezierCurveTo(11, -25, 12, -8, 0, 2);
        g.bezierCurveTo(-12, -8, -11, -25, 0, -40);
        g.fill();

        const fMid = g.createRadialGradient(0, -8, 1, 0, -14, 18);
        fMid.addColorStop(0, '#fffbea');
        fMid.addColorStop(0.5, '#ffe28e');
        fMid.addColorStop(1, 'rgba(255, 179, 71, 0)');
        g.fillStyle = fMid;
        g.beginPath();
        g.moveTo(0, -31);
        g.bezierCurveTo(8, -19, 9, -6, 0, 1);
        g.bezierCurveTo(-9, -6, -8, -19, 0, -31);
        g.fill();
      }
    }

    // Inner bright core sprite
    {
      const w = 32;
      const h = 48;
      this.flameMidCanvas.width = w;
      this.flameMidCanvas.height = h;
      const g = this.flameMidCanvas.getContext('2d');
      if (g) {
        g.translate(16, 42);
        g.fillStyle = '#fffef6';
        g.beginPath();
        g.moveTo(0, -19);
        g.bezierCurveTo(3.4, -12, 3.8, -4, 0, 0);
        g.bezierCurveTo(-3.8, -4, -3.4, -12, 0, -19);
        g.fill();
        g.fillStyle = 'rgba(127, 176, 255, 0.78)';
        g.beginPath();
        g.ellipse(0, 0.5, 2.8, 1.8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private bakeSkyBackground(): void {
    const key = `${this.W}x${this.H}:${this.currentCols.join(',')}`;
    if (key === this.lastBakedSkyKey || this.W <= 0 || this.H <= 0) return;
    this.lastBakedSkyKey = key;

    this.skyBgCanvas.width = this.W;
    this.skyBgCanvas.height = this.H;
    const g = this.skyBgCanvas.getContext('2d', { alpha: false });
    if (!g) return;

    const [c1, c2, c3, horizon] = this.currentCols;
    const grad = g.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, c1);
    grad.addColorStop(0.52, c2);
    grad.addColorStop(1, c3);
    g.fillStyle = grad;
    g.fillRect(0, 0, this.W, this.H);

    g.save();
    g.translate(this.W * 0.5, this.H * 1.06);
    g.scale(1.4, 0.46);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(this.W, this.H));
    rg.addColorStop(0, horizon);
    rg.addColorStop(0.62, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(-this.W, -this.H * 2, this.W * 2, this.H * 4);
    g.restore();
  }

  private bakeSunSprites(): void {
    const makeSun = (canvas: HTMLCanvasElement, low: boolean) => {
      const size = 220;
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext('2d');
      if (!g) return;
      const c = size / 2;

      const halo = g.createRadialGradient(c, c, 0, c, c, low ? 105 : 88);
      if (low) {
        halo.addColorStop(0, 'rgba(255,214,160,0.42)');
        halo.addColorStop(0.32, 'rgba(255,155,105,0.16)');
        halo.addColorStop(0.7, 'rgba(255,120,95,0.04)');
        halo.addColorStop(1, 'rgba(255,120,95,0)');
      } else {
        halo.addColorStop(0, 'rgba(255,248,225,0.45)');
        halo.addColorStop(0.28, 'rgba(255,228,170,0.16)');
        halo.addColorStop(0.68, 'rgba(255,214,150,0.03)');
        halo.addColorStop(1, 'rgba(255,214,150,0)');
      }
      g.fillStyle = halo;
      g.fillRect(0, 0, size, size);

      const r = low ? 18 : 16;
      const disc = g.createRadialGradient(c - 3, c - 3, 1, c, c, r);
      if (low) {
        disc.addColorStop(0, '#fff7e6');
        disc.addColorStop(0.45, '#ffd79c');
        disc.addColorStop(0.85, '#ffa266');
        disc.addColorStop(1, '#ff8555');
      } else {
        disc.addColorStop(0, '#fffefa');
        disc.addColorStop(0.55, '#fff6da');
        disc.addColorStop(0.85, '#ffe7a8');
        disc.addColorStop(1, '#ffd98a');
      }
      g.fillStyle = disc;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fill();
    };

    makeSun(this.sunDayCanvas, false);
    makeSun(this.sunLowCanvas, true);
  }

  private bakeMoonSprite(): void {
    this.moonInfo = getMoonPhaseInfo();
    this.lastMoonBake = Date.now();

    const size = 80;
    this.moonCanvas.width = size;
    this.moonCanvas.height = size;
    const g = this.moonCanvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, size, size);

    const c = size / 2;
    const r = 34;
    const p = this.moonInfo.phase;

    // Neredeyse sıfır parlama, filtre yok
    const glow = g.createRadialGradient(c, c, r * 0.9, c, c, size / 2);
    glow.addColorStop(0, 'rgba(255, 246, 222, 0.08)');
    glow.addColorStop(1, 'rgba(255, 246, 222, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);

    // Karanlık tarafta çok hafif "dünya ışığı" (Earthshine)
    g.fillStyle = 'rgba(155, 178, 225, 0.14)';
    g.strokeStyle = 'rgba(215, 228, 255, 0.14)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    // Kuzey yarımküre astronomik terminatör elipsi (büyüyen Ay sağdan aydınlanır)
    const rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
    const litPath = new Path2D();
    if (p < 0.5) {
      litPath.moveTo(c, c - r);
      litPath.arc(c, c, r, -Math.PI / 2, Math.PI / 2, false);
      litPath.ellipse(c, c, Math.max(0.01, rx), r, 0, Math.PI / 2, -Math.PI / 2, p < 0.25);
    } else {
      litPath.moveTo(c, c - r);
      litPath.arc(c, c, r, -Math.PI / 2, Math.PI / 2, true);
      litPath.ellipse(c, c, Math.max(0.01, rx), r, 0, Math.PI / 2, -Math.PI / 2, p < 0.75);
    }
    litPath.closePath();

    g.save();
    g.clip(litPath);

    const moonGrad = g.createRadialGradient(c - 8, c - 9, 3, c, c, r * 1.35);
    moonGrad.addColorStop(0, '#fffef6');
    moonGrad.addColorStop(0.7, '#f6ebd0');
    moonGrad.addColorStop(1, '#e3d2ae');
    g.fillStyle = moonGrad;
    g.fillRect(c - r - 2, c - r - 2, r * 2 + 4, r * 2 + 4);

    g.fillStyle = 'rgba(182, 162, 122, 0.32)';
    const craters: [number, number, number][] = [
      [c - 8, c - 8, 6.8],
      [c + 11, c + 4, 7.6],
      [c - 7, c + 11, 4.2],
      [c + 14, c - 15, 2.8],
      [c - 18, c + 3, 2.5],
      [c + 2, c + 21, 2.2],
    ];
    for (const [cx0, cy0, cr] of craters) {
      g.beginPath();
      g.arc(cx0, cy0, cr, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private syncSkyState(force = false): void {
    const nowMs = Date.now();
    if (!force && nowMs - this.lastSkySampleMs < 1000) return;
    this.lastSkySampleMs = nowMs;

    if (nowMs - this.lastMoonBake > 10 * 60 * 1000) {
      this.bakeMoonSprite();
    }

    const hour = this.getCurrentHour();
    const { cols, daylight } = skyAtHour(hour);
    this.currentCols = cols;
    this.currentDaylight = daylight;

    const vars = ['--sky-1', '--sky-2', '--sky-3', '--horizon'];
    vars.forEach((v, i) => document.body.style.setProperty(v, cols[i]));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cols[0]);

    const orbs = getOrbPlacement(hour, this.moonInfo.phase);
    const skyW = this.getSkyW();
    const maxOx = this.getMaxOx();
    const parallaxX = -(this.ox - maxOx * 0.5) * 0.12;

    this.sunScreen = {
      up: orbs.sunUp,
      low: orbs.sunLow,
      x: (orbs.sunX / 100) * skyW + parallaxX,
      y: this.skyTop + (orbs.sunY / 100) * this.skyHeight,
      r: 20,
    };

    this.moonCanvas.classList.toggle('day-hidden', !orbs.moonUp);
    const moonRect = this.moonCanvas.getBoundingClientRect();
    this.moonScreen = {
      up: orbs.moonUp,
      x: moonRect.width > 0 ? moonRect.left + moonRect.width / 2 : this.W - 35,
      y: moonRect.height > 0 ? moonRect.top + moonRect.height / 2 : 45,
      r: 17,
    };
  }

  private drawSkyBackdrop(): void {
    this.bakeSkyBackground();
    this.cx.drawImage(this.skyBgCanvas, 0, 0, this.W, this.H);
  }

  private drawStarsAndLinks(t: number, ts: number, dt: number): void {
    const ctx = this.cx;

    // Smooth "Sensiz gökyüzü" fade
    const targetWithout = this.withoutMode ? 0 : 1;
    const step = Math.min(1, dt / 420);
    this.withoutAlpha += (targetWithout - this.withoutAlpha) * step;
    if (this.withoutAlpha <= 0.01) return;

    // Heart formation progress (0..7000ms)
    let heartProgress = -1;
    let heartBlend = 0;
    if (this.heartStartAt >= 0) {
      const elapsed = t - this.heartStartAt;
      if (elapsed >= this.heartDur) {
        this.heartStartAt = -1;
      } else {
        heartProgress = elapsed / this.heartDur;
        if (heartProgress < 0.25) {
          const k = heartProgress / 0.25;
          heartBlend = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        } else if (heartProgress < 0.72) {
          heartBlend = 1;
        } else {
          const k = (heartProgress - 0.72) / 0.28;
          heartBlend = 1 - (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        }
      }
    }

    const skyW = this.getSkyW();
    const heartCenter = { x: skyW / 2, y: this.skyTop + this.skyHeight * 0.44 };
    const heartScale = Math.min(skyW, this.skyHeight) / 36;
    const heartPoint = (ang: number): [number, number] => [
      heartCenter.x + 16 * Math.pow(Math.sin(ang), 3) * heartScale,
      heartCenter.y -
        (13 * Math.cos(ang) - 5 * Math.cos(2 * ang) - 2 * Math.cos(3 * ang) - Math.cos(4 * ang)) *
          heartScale,
    ];

    // Golden dashed heart outline during heart formation
    if (heartProgress >= 0) {
      const outlineAlpha =
        heartProgress < 0.3
          ? (heartProgress / 0.3) * 0.85
          : heartProgress < 0.7
            ? 0.85
            : ((1 - heartProgress) / 0.3) * 0.85;
      if (outlineAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha = outlineAlpha * this.withoutAlpha;
        ctx.strokeStyle = '#ffdc93';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 6]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const [hx, hy] = heartPoint((i / 120) * Math.PI * 2);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 1. Gold "aynı an" link lines between paired stars (hidden while in heart formation)
    const linkFade = this.withoutAlpha * (1 - heartBlend);
    if (this.links.length > 0 && linkFade > 0.02) {
      ctx.save();
      ctx.lineWidth = 1;
      for (const [a, b] of this.links) {
        if (this.hiddenStarIds.has(a.id) || this.hiddenStarIds.has(b.id)) continue;
        const pa = this.getStarScreenPos(a);
        const pb = this.getStarScreenPos(b);
        if (Math.max(pa.x, pb.x) < -20 || Math.min(pa.x, pb.x) > this.W + 20) continue;

        ctx.strokeStyle = `rgba(255, 220, 147, ${(0.48 * linkFade).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();

        const mx = (pa.x + pb.x) * 0.5;
        const my = (pa.y + pb.y) * 0.5;
        const pulse = (0.65 + 0.35 * Math.sin(ts * 2.4)) * linkFade;
        ctx.fillStyle = `rgba(255, 220, 147, ${pulse.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Occasional glint star picker
    if (!this.reducedMotion && this.stars.length > 0 && t > this.nextGlintAt) {
      this.nextGlintAt = t + 2300;
      const visible = this.stars.filter((s) => !this.hiddenStarIds.has(s.id));
      if (visible.length > 0) {
        const pick = visible[Math.floor(Math.random() * visible.length)];
        this.glintStarId = pick.id;
        this.glintStart = t;
      }
    }

    // 2. Sent stars (with choreographed staggered entrance after login)
    const nowMs = this.opts.getNowMs?.() ?? Date.now();
    const starTotal = Math.max(1, this.stars.length);
    const revealElapsed = this.revealAt > 0 ? t - this.revealAt : -1;
    const revealStepMs = starTotal > 1 ? Math.min(120, Math.floor(800 / (starTotal - 1))) : 0;
    if (this.revealAt > 0 && revealElapsed > 1400) {
      this.revealAt = 0;
    }

    for (let idx = 0; idx < this.stars.length; idx++) {
      const s = this.stars[idx];
      if (this.hiddenStarIds.has(s.id)) continue;

      let revealAlpha = 1;
      let revealScale = 1;
      if (this.revealAt > 0) {
        const raw = (revealElapsed - idx * revealStepMs) / 380;
        if (raw <= 0) continue;
        if (raw < 1) {
          const ease = 1 - Math.pow(1 - raw, 3);
          revealAlpha = ease;
          revealScale = 0.6 + 0.4 * ease;
        }
      }
      let { x, y } = this.getStarScreenPos(s);

      if (heartBlend > 0.001) {
        const [hx, hy] = heartPoint((idx / starTotal) * Math.PI * 2 + Math.PI / starTotal);
        x = x + (hx - x) * heartBlend;
        y = y + (hy - y) * heartBlend;
      }

      if (x < -48 || x > this.W + 48) continue;

      const shUntil = this.shakeUntil.get(s.id);
      if (shUntil) {
        if (t < shUntil) {
          const prog = (shUntil - t) / 550;
          x += Math.sin(prog * Math.PI * 5) * 4 * prog;
        } else {
          this.shakeUntil.delete(s.id);
        }
      }

      const mine = s.from === this.me;
      const isPaired = this.pairedIds.has(s.id);
      const colorKey: SkyColorKey = isPaired ? 'gold' : s.from === 'hamham' ? 'blue' : 'pink';

      let hash = 0;
      for (let i = 0; i < s.id.length; i++) hash = (hash * 31 + s.id.charCodeAt(i)) | 0;
      const phase = (Math.abs(hash) % 628) / 100;
      const twSpeed = 1.4 + (Math.abs(hash >> 4) % 12) / 10;

      let bornScale = 1;
      const bAt = this.bornAt.get(s.id);
      if (bAt) {
        const k = Math.min(1, (t - bAt) / 950);
        if (k < 1) {
          bornScale = k < 0.4 ? (k / 0.4) * 1.65 : 1.65 - ((k - 0.4) / 0.6) * 0.65;
        } else {
          this.bornAt.delete(s.id);
        }
      }

      let goldScale = 1;
      const gAt = this.goldifyAt.get(s.id);
      if (gAt) {
        const k = Math.min(1, (t - gAt) / 1400);
        if (k < 1) {
          goldScale = 1 + Math.sin(k * Math.PI) * 0.7;
        } else {
          this.goldifyAt.delete(s.id);
        }
      }

      const isLocked = Boolean(s.unlockAt && Date.parse(s.unlockAt) > nowMs);
      let wakeWave = 0;
      if (!isLocked) {
        const wAt = this.unlockWakeAt.get(s.id);
        if (wAt) {
          const wk = Math.min(1, (t - wAt) / 1700);
          if (wk < 1) {
            wakeWave = Math.sin(wk * Math.PI);
          } else {
            this.unlockWakeAt.delete(s.id);
          }
        }
      }

      const scale =
        (s.size / 8.5) * bornScale * goldScale * revealScale * (1 + 0.25 * heartBlend + wakeWave * 0.45);
      const scint = this.reducedMotion || isLocked
        ? 1
        : 0.78 +
          0.14 * Math.sin(ts * twSpeed + phase) +
          0.08 * Math.sin(ts * (twSpeed * 2.37) + phase * 1.7);
      const lockDim = isLocked ? 0.36 : 1;
      const dayDim = Math.max(0.45, 1 - 0.35 * this.currentDaylight) * this.withoutAlpha * lockDim * revealAlpha;

      // Soft pulsing outer ring for recipient's unlocked & unopened stars
      if (!isLocked && !mine && !s.openedAt) {
        const auraP =
          (this.reducedMotion ? 0.32 : 0.16 + 0.26 * (0.5 + 0.5 * Math.sin(ts * 2.1 + phase))) *
          this.withoutAlpha;
        const auraR = s.size * 2.1;
        ctx.strokeStyle = `${COLOR_HEX[colorKey].glow}${auraP.toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, auraR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Locked timed-star visual: dashed ring + tiny gold padlock
      if (isLocked) {
        const lockR = Math.max(10.5, s.size * 1.85);
        ctx.save();
        ctx.globalAlpha = this.withoutAlpha * 0.85;
        ctx.strokeStyle = 'rgba(255, 220, 147, 0.56)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2.8, 3]);
        ctx.beginPath();
        ctx.arc(x, y, lockR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tiny gold padlock on top-right of the ring
        const lx = x + lockR * 0.78;
        const ly = y - lockR * 0.72;
        ctx.strokeStyle = '#ffd56e';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(lx, ly - 1.6, 2.2, Math.PI, 0, false);
        ctx.stroke();
        ctx.fillStyle = '#ffd56e';
        ctx.beginPath();
        ctx.roundRect(lx - 3.1, ly - 0.8, 6.2, 4.8, 1.3);
        ctx.fill();
        ctx.restore();
      } else if (wakeWave > 0.02) {
        // Golden wake-up shimmer when a timed star unlocks
        const wk = Math.min(1, (t - (this.unlockWakeAt.get(s.id) ?? t)) / 1700);
        ctx.save();
        ctx.globalAlpha = wakeWave * 0.72 * this.withoutAlpha;
        ctx.strokeStyle = '#ffd56e';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, s.size * (1.6 + wk * 2.8), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (s.kind === 'photo') {
        const rad = s.size * 1.45;
        ctx.save();
        ctx.globalAlpha = this.withoutAlpha * (isLocked ? 0.45 : 1);
        ctx.strokeStyle = `${COLOR_HEX[colorKey].glow}${s.spent ? '0.16)' : '0.42)'}`;
        ctx.lineWidth = 0.9;
        if (s.once && !s.spent) {
          ctx.setLineDash([3, 3]);
        }
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (s.kind === 'voice' && !isLocked) {
        const wave = this.reducedMotion ? 0.5 : (ts * 0.4 + phase) % 1;
        const rad = s.size * (0.9 + wave * 1.5);
        const alpha = (1 - wave) * 0.5 * this.withoutAlpha;
        ctx.strokeStyle = `${COLOR_HEX[colorKey].glow}${alpha.toFixed(2)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Additive starlight: breathing soft halo + crisp pinpoint core (NO permanent crossbars!)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const haloSprite = this.starHalos[colorKey];
      const haloSize = 44 * scale * (0.92 + 0.18 * scint);
      ctx.globalAlpha = (0.42 + 0.34 * scint) * dayDim;
      ctx.drawImage(haloSprite, x - haloSize / 2, y - haloSize / 2, haloSize, haloSize);

      if (wakeWave > 0.02) {
        const wSize = 58 * scale * (0.9 + 0.35 * wakeWave);
        ctx.globalAlpha = wakeWave * 0.85 * this.withoutAlpha;
        ctx.drawImage(this.starHalos.gold, x - wSize / 2, y - wSize / 2, wSize, wSize);
      }

      const coreSprite = this.starCores[colorKey];
      const coreSize = 18 * scale * (0.9 + 0.14 * scint);
      ctx.globalAlpha = (0.78 + 0.22 * scint) * dayDim;
      ctx.drawImage(coreSprite, x - coreSize / 2, y - coreSize / 2, coreSize, coreSize);

      // Brief tapered 4-point diffraction glint (only on the single unlocked glinting star)
      if (!isLocked && this.glintStarId === s.id) {
        const gk = (t - this.glintStart) / 1400;
        if (gk < 1) {
          const gWave = Math.sin(gk * Math.PI);
          const gSize = 48 * scale * (0.35 + 0.65 * gWave);
          ctx.globalAlpha = gWave * 0.92 * dayDim;
          ctx.drawImage(this.glintSprite, x - gSize / 2, y - gSize / 2, gSize, gSize);
        } else {
          this.glintStarId = null;
        }
      }
      ctx.restore();

      ctx.globalAlpha = 1;
    }
  }

  private drawEffects(t: number, dt: number): void {
    const ctx = this.cx;

    // Active comets
    const remainingComets: FlyingComet[] = [];
    for (const c of this.comets) {
      const k = Math.min(1, (t - c.t0) / c.dur);
      const e = c.ease(k);
      let x: number;
      let y: number;
      if (c.ctrl) {
        const u = 1 - e;
        x = u * u * c.from.x + 2 * u * e * c.ctrl.x + e * e * c.to.x;
        y = u * u * c.from.y + 2 * u * e * c.ctrl.y + e * e * c.to.y;
      } else {
        x = c.from.x + (c.to.x - c.from.x) * e;
        y = c.from.y + (c.to.y - c.from.y) * e;
      }

      if (Math.abs(x - c.prevX) + Math.abs(y - c.prevY) > 0.3) {
        c.ang = Math.atan2(y - c.prevY, x - c.prevX);
      }
      c.prevX = x;
      c.prevY = y;

      if (t - c.lastSpark > 24) {
        c.lastSpark = t;
        this.sparks.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 0.025,
          vy: (Math.random() - 0.5) * 0.025 + 0.01,
          color: c.color,
          life: 0,
          max: 500 + Math.random() * 450,
          size: 1.5,
        });
      }

      const tailLen = c.tail * (1 - e * 0.8);
      const tx = x - Math.cos(c.ang) * tailLen;
      const ty = y - Math.sin(c.ang) * tailLen;
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, `${COLOR_HEX[c.color].glow}0)`);
      g.addColorStop(0.7, `${COLOR_HEX[c.color].glow}0.75)`);
      g.addColorStop(1, '#ffffff');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();

      const haloHead = this.starHalos[c.color];
      const coreHead = this.starCores[c.color];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(haloHead, x - 18, y - 18, 36, 36);
      ctx.drawImage(coreHead, x - 9, y - 9, 18, 18);
      ctx.restore();

      if (k < 1) {
        remainingComets.push(c);
      } else {
        c.onDone();
      }
    }
    this.comets = remainingComets;

    // Expanding burst rings & flashes
    this.rings = this.rings.filter((r) => (r.life += dt) < r.max);
    for (const r of this.rings) {
      const k = r.life / r.max;
      const ease = 1 - Math.pow(1 - k, 3);
      const rad = 4 + ease * (r.big ? 38 : 24);
      const alpha = (1 - k) * 0.9;
      ctx.strokeStyle = `${COLOR_HEX[r.color].glow}${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();

      if (r.big && k < 0.7) {
        const fk = k / 0.7;
        const fl = Math.sin(fk * Math.PI) * 58;
        ctx.strokeStyle = `rgba(255,255,255,${((1 - fk) * 0.85).toFixed(2)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(r.x - fl, r.y);
        ctx.lineTo(r.x + fl, r.y);
        ctx.moveTo(r.x, r.y - fl * 0.8);
        ctx.lineTo(r.x, r.y + fl * 0.8);
        ctx.stroke();
      }
    }

    // Sparks
    this.sparks = this.sparks.filter((s) => (s.life += dt) < s.max);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = s.life / s.max;
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.fillStyle = s.color === 'gold' ? '#ffdc93' : s.color === 'blue' ? '#a8d4ff' : '#ffb3da';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    // Tap rings & rising mini hearts
    this.tapRings = this.tapRings.filter((r) => (r.life += dt) < r.max);
    for (const r of this.tapRings) {
      const k = r.life / r.max;
      const rad = 6 + (1 - Math.pow(1 - k, 3)) * 52;
      ctx.strokeStyle = `rgba(255,255,255,${((1 - k) * 0.45).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.tapHearts = this.tapHearts.filter((h) => (h.life += dt) < h.max);
    ctx.fillStyle = this.me === 'hamham' ? '#5b9dff' : '#ff6fb0';
    for (const h of this.tapHearts) {
      if (h.life < 0) continue;
      const k = h.life / h.max;
      const ease = 1 - Math.pow(1 - k, 3);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.translate(h.x + h.dx * ease, h.y + h.dy * ease);
      ctx.rotate(h.rot * ease);
      const sz = 4 + ease * 8;
      this.drawHeartPath(0, -sz / 2, sz);
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  private drawFrame(t: number): void {
    const dt = this.lastFrameT ? Math.min(50, t - this.lastFrameT) : 16.6;
    this.lastFrameT = t;
    const ts = t / 1000;

    this.syncSkyState(false);

    const skyW = this.getSkyW();
    const maxOx = this.getMaxOx();
    const parallaxX = -(this.ox - maxOx * 0.5) * 0.12;
    const hour = this.getCurrentHour();
    const orbs = getOrbPlacement(hour, this.moonInfo.phase);
    this.sunScreen.x = (orbs.sunX / 100) * skyW + parallaxX;
    this.moonScreen.x = (orbs.moonX / 100) * skyW + parallaxX;

    const ctx = this.cx;

    // 1. Sky gradient + horizon
    this.drawSkyBackdrop();

    // 2. Pre-baked Milky Way nebula & deep starfield
    const nebAlpha = Math.max(0, 1 - 0.88 * this.currentDaylight);
    if (nebAlpha > 0.01) {
      const swN = Math.min(this.nebCanvas.width, this.W * this.nebScale);
      const sx = Math.max(0, Math.min(this.nebCanvas.width - swN, this.ox * this.nebScale));
      ctx.globalAlpha = nebAlpha;
      ctx.drawImage(
        this.nebCanvas,
        sx,
        0,
        swN,
        this.H * this.nebScale,
        sx / this.nebScale - this.ox,
        0,
        swN / this.nebScale,
        this.H
      );
    }

    // 3. Soft twinkling dust pinpoints (anti-aliased sprite, never square pixels)
    const dim = 1 - 0.65 * this.currentDaylight;
    if (dim > 0.03) {
      for (const d of this.dust) {
        const x = d.x - this.ox;
        if (x < -4 || x > this.W + 4) continue;
        const tw = this.reducedMotion ? 1 : 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(ts * d.speed + d.phase));
        const sz = 2.6 + d.r * 2.8;
        ctx.globalAlpha = dim * d.alpha * tw;
        ctx.drawImage(this.dustSprite, x - sz * 0.5, d.y - sz * 0.5, sz, sz);
      }
    }

    // 4. Shooting stars (night/twilight only)
    if (!this.reducedMotion && this.currentDaylight < 0.75) {
      if (t > this.nextMeteorAt) {
        this.nextMeteorAt = t + 8500 + Math.random() * 11500;
        this.meteors.push({
          x: this.W * (0.35 + Math.random() * 0.65),
          y: this.skyTop + Math.random() * this.skyHeight * 0.4,
          vx: -(0.55 + Math.random() * 0.3),
          vy: 0.25 + Math.random() * 0.14,
          life: 0,
          max: 950,
        });
      }
      this.meteors = this.meteors.filter((m) => (m.life += dt) < m.max);
      for (const m of this.meteors) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const al = Math.sin((m.life / m.max) * Math.PI) * 0.85 * (1 - this.currentDaylight);
        const len = 82;
        const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * len, m.y - m.vy * len);
        g.addColorStop(0, `rgba(255,255,255,${al.toFixed(2)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * len, m.y - m.vy * len);
        ctx.stroke();
      }
    }

    // 5. Sun (Moon renders on #sky-moon fixed top-right layer)
    ctx.globalAlpha = 1;
    if (this.sunScreen.up) {
      const sprite = this.sunScreen.low ? this.sunLowCanvas : this.sunDayCanvas;
      const half = sprite.width / 2;
      ctx.drawImage(sprite, this.sunScreen.x - half, this.sunScreen.y - half);
    }

    // 6. Airplane + rippling cloth banner (single canvas)
    if (!this.reducedMotion && document.body.classList.contains('awake') && !this.timelapseActive && !this.trav.on && !this.withoutMode) {
      this.planeCtrl.draw(ctx, t, this.W);
    }

    // 7. Sent stars, gold links, comets & sparks (plus travel card zoom / 3D month carousel)
    if (this.trav.on) {
      const skyW = this.getSkyW();
      const z = this.trav.zoom;
      const curIdx = this.trav.list.findIndex((it) => it.k === this.trav.viewK);
      const d = curIdx >= 0 ? curIdx - this.trav.f : 0;
      const ad = Math.abs(d);
      const gap = skyW * z * 1.04 + 14 * z;
      const sc = z * (1 - 0.12 * Math.min(1, ad));
      const ry = Math.max(-1.2, Math.min(1.2, d)) * -26;
      const horizTilt = Math.cos((ry * Math.PI) / 180);

      // Darken outer space backdrop around the zooming sky card
      const spaceFade = Math.min(1, (1 - z) / 0.45);
      if (spaceFade > 0.01) {
        ctx.fillStyle = `rgba(2, 3, 10, ${(spaceFade * 0.84).toFixed(3)})`;
        ctx.fillRect(0, 0, this.W, this.H);
      }

      // Adjacent month cards
      const cardW = skyW * z;
      const cardH = this.skyHeight * z;
      const cy = this.skyTop + this.skyHeight * 0.5;
      this.trav.list.forEach((it, i) => {
        if (it.k === this.trav.viewK) return;
        const dist = i - this.trav.f;
        const absDist = Math.abs(dist);
        if (absDist > 2.3) return;
        const itemScale = 1 - 0.12 * Math.min(1, absDist);
        const itemTilt = Math.max(-1.2, Math.min(1.2, dist)) * -26;
        const itemOpacity = (1 - 0.55 * Math.min(1, Math.max(0, absDist - 0.1))) * spaceFade;
        drawMonthCardOnCanvas({
          ctx,
          item: it,
          cx: this.W / 2 + dist * gap,
          cy,
          cardW: cardW * itemScale,
          cardH: cardH * itemScale,
          tiltAngleDeg: itemTilt,
          opacity: itemOpacity,
          skyCols: this.currentCols,
          nowMs: this.opts.getNowMs?.() ?? Date.now(),
        });
      });

      // Active sky card (zoomed & clipped inside rounded border)
      const activeW = skyW * sc * Math.max(0.45, horizTilt);
      const activeH = this.skyHeight * sc;
      const activeCx = this.W / 2 + d * gap;
      const activeOpacity = 1 - 0.55 * Math.min(1, Math.max(0, ad - 0.1));
      const radius = 34 * spaceFade;

      ctx.save();
      ctx.globalAlpha = activeOpacity;
      ctx.beginPath();
      ctx.roundRect(activeCx - activeW / 2, cy - activeH / 2, activeW, activeH, radius);
      ctx.save();
      ctx.clip();
      ctx.translate(activeCx, cy);
      ctx.scale(sc * Math.max(0.45, horizTilt), sc);
      ctx.translate(-this.W / 2, -(this.skyTop + this.skyHeight / 2));

      this.drawSkyBackdrop();
      this.drawStarsAndLinks(t, ts, dt);
      ctx.restore();

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 * spaceFade).toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(activeCx - activeW / 2, cy - activeH / 2, activeW, activeH, radius);
      ctx.stroke();
      ctx.restore();
    } else {
      this.drawStarsAndLinks(t, ts, dt);
      this.drawEffects(t, dt);
    }

    // 8. Candle flame (noise flicker + gust + flare), embers, smoke, rising hearts & lily pollen
    if (document.body.classList.contains('awake') && !this.trav.on) {
      this.drawCandleAndGardenParticles(t, ts, dt);
    }

    ctx.globalAlpha = 1;
  }

  private drawHeartPath(x: number, y: number, s: number): void {
    const ctx = this.cx;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.05, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.05, x, y, x, y + s * 0.3);
    ctx.fill();
  }

  private drawCandleAndGardenParticles(t: number, ts: number, dt: number): void {
    const ctx = this.cx;
    const wick = this.cachedWickPos;
    if (!wick) return;

    // Giriş animasyonunda mum alevi en son (~850 ms sonra) yanar
    let igniteAlpha = 1;
    if (this.revealAt > 0) {
      const rel = (t - this.revealAt - 850) / 400;
      if (rel <= 0) return;
      if (rel < 1) {
        igniteAlpha = 1 - Math.pow(1 - rel, 3);
      }
    }

    // Multi-harmonic noise + occasional wind gust
    if (t > this.breezeNext) {
      this.breezeNext = t + 7000 + Math.random() * 14000;
      this.breezeT = t;
      this.breeze = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6);
    }
    const bk = Math.max(0, 1 - (t - this.breezeT) / 2600);
    const gust = this.reducedMotion
      ? 0
      : this.breeze * Math.sin(Math.min(1, (t - this.breezeT) / 2600) * Math.PI) * bk;

    const n1 = this.reducedMotion
      ? 0
      : Math.sin(ts * 7.3) * 0.45 + Math.sin(ts * 13.1 + 1.3) * 0.3 + Math.sin(ts * 23.7 + 2.1) * 0.25;
    const n2 = this.reducedMotion ? 0 : Math.sin(ts * 4.9 + 0.7) * 0.55 + Math.sin(ts * 17.3 + 0.2) * 0.45;
    const fa = Math.max(0, 1 - (t - this.flareAt) / 1800);
    const boost = fa * fa;

    const sx = 1 + n2 * 0.03 - Math.abs(gust) * 0.05 + boost * 0.1;
    const sy = 1 + n1 * 0.055 + Math.abs(gust) * 0.04 + boost * 0.35;
    const skew = (n2 * 2 + gust * 9) * (Math.PI / 180);

    // Pre-baked flame halo
    const haloScale = 1 + n1 * 0.035 + boost * 0.35;
    const haloSize = 150 * haloScale;
    ctx.globalAlpha = Math.min(1, 0.78 + n1 * 0.1 + boost * 0.22) * igniteAlpha;
    ctx.drawImage(this.flameHaloCanvas, wick.x - haloSize / 2, wick.y - 24 - haloSize / 2, haloSize, haloSize);

    // Pre-baked flame sprites (zero gradient allocations per frame)
    ctx.save();
    ctx.translate(wick.x, wick.y + 1);
    ctx.transform(1, 0, Math.tan(skew), 1, 0, 0);
    ctx.scale(sx, sy);
    ctx.globalAlpha = igniteAlpha;
    ctx.drawImage(this.flameOutCanvas, -32, -88);
    ctx.globalAlpha = Math.min(1, 0.84 + n1 * 0.1 + boost * 0.08) * igniteAlpha;
    ctx.drawImage(this.flameMidCanvas, -16, -42);
    ctx.restore();

    if (this.reducedMotion) return;

    // Rising embers
    if (t > this.nextEmberAt) {
      this.nextEmberAt = t + 650 + Math.random() * 900;
      this.embers.push({
        x: wick.x + (Math.random() - 0.5) * 4,
        y: wick.y - 26,
        vx: (Math.random() - 0.5) * 0.012,
        vy: -(0.03 + Math.random() * 0.03),
        life: 0,
        max: 1400 + Math.random() * 1200,
        r: 0.6 + Math.random() * 0.8,
      });
    }
    this.embers = this.embers.filter((e) => (e.life += dt) < e.max);
    for (const e of this.embers) {
      e.x += (e.vx + gust * 0.02) * dt + Math.sin(e.life / 180) * 0.15;
      e.y += e.vy * dt;
      const k = e.life / e.max;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = k < 0.4 ? '#ffd27a' : '#ff8a3c';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }

    // Occasional smoke wisp
    if (t > this.nextSmokeAt) {
      this.nextSmokeAt = t + 22000 + Math.random() * 20000;
      for (let i = 0; i < 24; i++) {
        this.smoke.push({
          x: wick.x,
          y: wick.y - 34,
          d: i * 70,
          life: 0,
          max: 3600,
          ph: Math.random() * 6.3,
          r: 1.2 + Math.random(),
        });
      }
    }
    this.smoke = this.smoke.filter((p) => {
      if (p.d > 0) {
        p.d -= dt;
        return true;
      }
      return (p.life += dt) < p.max;
    });
    ctx.fillStyle = '#e8e4f2';
    for (const p of this.smoke) {
      if (p.d > 0) continue;
      const k = p.life / p.max;
      const y = p.y - p.life * 0.028;
      const x = p.x + Math.sin(p.life / 420 + p.ph) * (4 + k * 14) + gust * k * 30;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.12;
      ctx.beginPath();
      ctx.arc(x, y, p.r + k * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Floating mini hearts rising from the flame
    if (t > this.nextCandleHeartAt && this.candleHearts.length < 6) {
      this.nextCandleHeartAt = t + 2400 + Math.random() * 1800;
      this.candleHearts.push({
        x: wick.x,
        y: wick.y - 34,
        s: 5 + Math.random() * 4,
        life: 0,
        max: 4800 + Math.random() * 1500,
        sw: Math.random() * 6.3,
        rise: 0.02 + Math.random() * 0.012,
      });
    }
    this.candleHearts = this.candleHearts.filter((h) => (h.life += dt) < h.max);
    ctx.fillStyle = this.me === 'hamham' ? '#5b9dff' : '#ff6fb0';
    for (const h of this.candleHearts) {
      const k = h.life / h.max;
      ctx.globalAlpha = Math.min(1, k * 5) * (1 - k) * 0.55;
      this.drawHeartPath(h.x + Math.sin(h.life / 650 + h.sw) * 9, h.y - h.life * h.rise - 6, h.s);
    }

    // Golden pollen flecks drifting from the lilies
    if (t > this.nextPollenAt && this.pollen.length < 12) {
      this.nextPollenAt = t + 950 + Math.random() * 900;
      const blooms = this.cachedBloomPos;
      const b = blooms[Math.floor(Math.random() * blooms.length)];
      if (b) {
        this.pollen.push({
          x: b.x,
          y: b.y,
          life: 0,
          max: 5000 + Math.random() * 3000,
          vx: (Math.random() - 0.5) * 0.012,
          vy: -(0.008 + Math.random() * 0.012),
          sw: Math.random() * 6.3,
        });
      }
    }
    this.pollen = this.pollen.filter((p) => (p.life += dt) < p.max);
    ctx.fillStyle = '#ffe6a6';
    for (const p of this.pollen) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 6) * (1 - k) * 0.75;
      ctx.beginPath();
      ctx.arc(p.x + p.life * p.vx + Math.sin(p.life / 700 + p.sw) * 6, p.y + p.life * p.vy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hasActiveMotion(now: number): boolean {
    if (now < this.boostUntil) return true;
    if (this.drag !== null || this.panRaf !== 0 || this.timelapseActive || this.trav.on) return true;
    if (this.planeCtrl.isActive()) return true;
    if (
      this.comets.length > 0 ||
      this.sparks.length > 0 ||
      this.rings.length > 0 ||
      this.meteors.length > 0 ||
      this.tapRings.length > 0 ||
      this.tapHearts.length > 0
    ) {
      return true;
    }
    if (
      this.bornAt.size > 0 ||
      this.shakeUntil.size > 0 ||
      this.goldifyAt.size > 0 ||
      this.unlockWakeAt.size > 0 ||
      this.heartStartAt >= 0
    ) {
      return true;
    }
    return false;
  }

  private isCompletelyBlocked(): boolean {
    if (document.hidden) return true;
    return Boolean(document.querySelector('#lock:not(.gone), .modal.open'));
  }

  private isQuietSheetOpen(): boolean {
    return (
      document.body.classList.contains('typing') ||
      Boolean(document.querySelector('.sheet.open'))
    );
  }

  private boostMotion(ms: number): void {
    const until = performance.now() + ms;
    if (until > this.boostUntil) this.boostUntil = until;
    if (this.reducedMotion || this.loopPaused || this.isCompletelyBlocked()) return;
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = 0;
      if (!this.mainRaf) {
        this.mainRaf = requestAnimationFrame(this.loopStep);
      }
    }
  }

  private readonly loopStep = (t: number): void => {
    this.mainRaf = 0;
    if (this.reducedMotion) return;

    if (this.isCompletelyBlocked()) {
      this.pauseLoop();
      return;
    }

    const quiet = this.isQuietSheetOpen();
    if (document.body.classList.contains('quiet') !== quiet) {
      document.body.classList.toggle('quiet', quiet);
    }

    const tStart = performance.now();
    this.drawFrame(t);
    const drawDur = performance.now() - tStart;

    this.perfDraws.push(drawDur);
    if (this.perfDraws.length > 120) this.perfDraws.shift();

    this.fpsFrames++;
    const elapsed = t - this.fpsWindowStart;
    if (elapsed >= 500) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / elapsed);
      this.fpsFrames = 0;
      this.fpsWindowStart = t;
    }

    const active = this.hasActiveMotion(tStart);
    this.currentMode = quiet ? 'quiet' : active ? 'active' : 'idle';

    // Aktif dokunuş/animasyonda tam hız (0 ms), yazarken/pencere açıkken 10 fps (100 ms), boşta ~25 fps (40 ms)
    const delay = quiet ? 100 : active ? 0 : 40;
    if (delay === 0) {
      this.mainRaf = requestAnimationFrame(this.loopStep);
    } else {
      this.idleTimer = window.setTimeout(() => {
        this.idleTimer = 0;
        if (!this.loopPaused && !this.mainRaf && !this.isCompletelyBlocked()) {
          this.mainRaf = requestAnimationFrame(this.loopStep);
        }
      }, delay);
    }
  };

  private pauseLoop(): void {
    this.loopPaused = true;
    this.currentMode = 'paused';
    this.currentFps = 0;
    if (!document.body.classList.contains('quiet')) {
      document.body.classList.add('quiet');
    }
    if (this.mainRaf) {
      cancelAnimationFrame(this.mainRaf);
      this.mainRaf = 0;
    }
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = 0;
    }
  }

  private updateLoopState(): void {
    if (this.reducedMotion) return;
    if (this.isCompletelyBlocked()) {
      this.pauseLoop();
      return;
    }
    const quiet = this.isQuietSheetOpen();
    if (document.body.classList.contains('quiet') !== quiet) {
      document.body.classList.toggle('quiet', quiet);
    }
    if (this.loopPaused || (!this.mainRaf && !this.idleTimer)) {
      this.loopPaused = false;
      this.lastFrameT = 0;
      this.fpsWindowStart = performance.now();
      this.fpsFrames = 0;
      this.mainRaf = requestAnimationFrame(this.loopStep);
    }
  }

  private startLoop(): void {
    this.fpsWindowStart = performance.now();
    document.addEventListener('visibilitychange', this.onVisibility);

    this.stateObserver = new MutationObserver(() => {
      this.updateLoopState();
    });
    const observeAttr = { attributes: true, attributeFilter: ['class'] };
    this.stateObserver.observe(document.body, observeAttr);
    ['#lock', '#letter-modal', '#compose', '#settings'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) this.stateObserver?.observe(el, observeAttr);
    });

    if (this.reducedMotion) {
      this.drawFrame(performance.now());
      return;
    }
    this.updateLoopState();
  }

  public destroy(): void {
    this.pauseLoop();
    cancelAnimationFrame(this.panRaf);
    cancelAnimationFrame(this.timelapseRaf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stateObserver?.disconnect();
    this.stateObserver = null;
    window.removeEventListener('resize', this.resize);
    if (this.onDocPointerDown) document.removeEventListener('pointerdown', this.onDocPointerDown);
    if (this.onDocPointerMove) document.removeEventListener('pointermove', this.onDocPointerMove);
    if (this.onDocPointerUp) {
      document.removeEventListener('pointerup', this.onDocPointerUp);
      document.removeEventListener('pointercancel', this.onDocPointerUp);
    }
  }
}
