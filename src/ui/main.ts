import './fonts';
import './style.css';
import './screens.css';

import { Engine } from '../gokyuzu/engine';
import { makeGeom, skyToScreen, wrapX, mod } from '../gokyuzu/skyGeom';
import { defaultLocation } from '../gokyuzu/astro';
import { SkyWorker } from '../gokyuzu/workerClient';
import { SkyRenderer } from '../gokyuzu/skyRender';
import { WeatherRenderer } from '../gokyuzu/weatherRender';
import { Effects, drawUserStar } from '../gokyuzu/effects';
import { Plane, schedulePlane } from '../gokyuzu/plane';
import { SwipeHint } from '../gokyuzu/swipeHint';
import { prepare, playIntro } from '../gokyuzu/intro';
import { clamp, hash } from '../gokyuzu/util';
import { initKeyboard } from '../gokyuzu/keyboard';
import { startWeather } from '../gokyuzu/weather';
import { Beach } from './beach';
import { OceanHeart } from './ocean';
import { PALM_CSS } from './palm';
import { ART_CSS } from './art';
import { LILY_CSS } from './lily';
import { Wind } from './wind';
import { core } from './core';
import { initUI, $, $$, h, toast, stagger, sleep, clearPageStack, closeIsland, island } from './ui';
import { state, PEOPLE, Star, Kind, setMe, toUiWho, toDbWho } from './state';
import { buildHome, buildForeground, placeForeground, showLive, sendHeart, partnerOnline } from './home';
import { openCompose } from './compose';
import { openBoard, openWatch, renderDrawing, Stroke, DrawLivePacket } from './draw';
import { encodeDrawingBytes, decodeDrawingBytes } from '../lib/drawCodec';
import { openStar, openArchive, openSettings, openCountdown } from './pages';
import { runAuth, runLock, applyPersona } from './auth';
import { I } from './icons';
import { registerServiceWorker } from '../lib/pwa';
import { isSupabaseConfigured, getSessionFast, inferWhoFromEmail, signOutSupabase } from '../lib/supabase';
import { loadSavedKey, clearActiveKey } from '../lib/crypto';
import { hasBiometric, BACKGROUND_LOCK_MS } from '../lib/lock';
import { STORAGE_KEYS, store } from '../lib/storage';
import {
  fetchAllStars,
  getServerNowMs,
  subscribeStarsRealtime,
  markStarUnlockNotified,
  uploadPreparedStar,
  decryptStarPayload,
  OfflineNetworkError,
  isOfflineLikeError,
} from '../lib/stars';
import { listQueuedStars, removeQueuedStar } from '../lib/outbox';
import { PairRealtime } from '../lib/realtime';
import { isStarHazel } from '../lib/hazel';
import type { StarRecord } from '../types';

void registerServiceWorker();

const app = document.getElementById('app')!;
const st = document.createElement('style');
st.textContent = ART_CSS + PALM_CSS + LILY_CSS + '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(st);
initUI(app);

// ÖNCE tam ekran yüksekliğini (--app-h: 100lvh / screen.height) ayarla ki tuval telefonun en altına kadar kesintisiz insin
initKeyboard({
  hideWhenOpen: () => [...app.querySelectorAll<HTMLElement>('.dock, .gk-cons, .gk-edge, .gk-hint-txt')],
});

const cssAppH = parseInt(document.documentElement.style.getPropertyValue('--app-h'), 10) || 0;
const W = Math.max(320, Math.round(app.clientWidth || window.innerWidth || 390));
const H = Math.max(540, Math.round(app.clientHeight || cssAppH || window.innerHeight || 844));
const HORIZON = Math.round(H * 0.71);

app.insertAdjacentHTML('afterbegin', `
  <div id="skyWrap" class="layer"><canvas id="cSky"></canvas><canvas id="cWBack"></canvas><canvas id="cStars"></canvas><div id="planeHost" class="layer" style="pointer-events:none"></div><canvas id="cWFront"></canvas></div>
  <div id="groundWrap" class="layer" style="pointer-events:none"><canvas id="cGround"></canvas></div>
  <canvas id="cOcean"></canvas>
  <canvas id="cFx"></canvas>
  <div id="fgWrap" class="layer" style="pointer-events:none;z-index:4"></div>
  <div id="flash" class="layer" style="background:#dfe6ff;opacity:0;pointer-events:none;z-index:6"></div>`);

function cv(id: string, maxDpr = 2, extraH = 0) {
  const d = Math.min(devicePixelRatio || 1, maxDpr);
  const c = document.getElementById(id) as HTMLCanvasElement;
  const ch = H + extraH;
  c.width = Math.round(W * d);
  c.height = Math.round(ch * d);
  c.style.width = `${W}px`;
  c.style.height = `${ch}px`;
  const x = c.getContext('2d')!;
  x.scale(d, d);
  return x;
}

const geom = makeGeom(W, HORIZON);
const P = geom.panoW;
const X0 = P / 2;
Object.assign(core, { W, H, skyW: P, horizonY: HORIZON });

const worker = new SkyWorker();
const engine = new Engine(defaultLocation, geom);
const sky = new SkyRenderer(cv('cSky', 1.5, 4), geom, worker);
const weatherRenderer = new WeatherRenderer(worker, cv('cWBack', 1.5), cv('cWFront', 1.5), $('#flash'), geom, engine.weather);
weatherRenderer.lightningEnabled = state.settings.lightning;
const beach = new Beach(cv('cGround', 2, 96), { W, H, horizonY: HORIZON, skyW: P, x0: X0 });
const ocean = new OceanHeart(cv('cOcean', 1.5), geom, beach.shoreY);
const skyCanvas = document.getElementById('cSky') as HTMLCanvasElement;
const starsCtx = cv('cStars');
const starsCv = document.getElementById('cStars') as HTMLCanvasElement;
let starOp = '';
let fg: HTMLElement | null = null;
const wind = new Wind();
const fx = new Effects(cv('cFx'), { w: W, h: H });
fx.flashEl = $('#flash');

engine.onLowPower = (low) => {
  weatherRenderer.maxParticles = low ? 160 : 320;
};
engine.sampleSky = () => sky.sampleColors();
engine.onTarget = (s, ms) => sky.request(s, ms);

let stopWeather = startWeather(defaultLocation, (w) => {
  engine.setWeather(w, 3000);
  weatherRenderer.setWeather(w);
  core.refreshHome();
});
core.reloadWeather = () => {
  stopWeather();
  stopWeather = startWeather(defaultLocation, (w) => {
    engine.setWeather(w, 2500);
    weatherRenderer.setWeather(w);
    core.refreshHome();
  });
};

const plane = new Plane({
  host: $('#planeHost'),
  fontFamily: '"Cormorant Garamond", serif',
  view: () => ({ w: W, topY: Math.round(H * 0.22), bottomY: Math.round(H * 0.39) }),
  messages: () =>
    state.me === 'ham'
      ? ['Beto, seni çok özledim', '9 Ocak yakında', 'Gökyüzümüz seninle güzel', 'Seni seviyorum Betooo', 'Aklımdasın hep güzelim']
      : ['Ham ham, seni çok özledim', '9 Ocak yakında', 'Aklımdasın hep', 'Seni seviyorum Ham hammm', 'Gökyüzümüz seninle güzel'],
  daylight: () => engine.sky.current.daylight,
  wind: () => engine.weather.wind,
  onTap: (t) => toast(t, I.heart(14)),
});
const tickPlane = schedulePlane(plane, () => engine.weather.kind !== 'thunder' && engine.weather.fog < 0.65);

const pairRealtime = new PairRealtime({
  onPartnerOnline: (online) => partnerOnline(online),
  onPartnerActivity: (act) => {
    if (!inHome) return;
    if (act === 'idle') {
      void closeIsland();
      return;
    }
    if (act === 'drawing') {
      showLive('drawing', { onWatch: () => openWatch() });
      return;
    }
    showLive(act);
  },
  onPartnerHeart: () => {
    if (!inHome) return;
    partnerOnline(true);
    sendHeart(true);
    toast(`${PEOPLE[state.partner].name} sana bir kalp gönderdi · sen de mumuna dokun`, I.heartFill(14), 3400);
  },
});

let stopStarsRealtime: (() => void) | null = null;
let realtimeActiveWho: string | null = null;

/** Yıldızın 360° silindirik gök kubbedeki ekran konumu + Ay koruma yarıçapı. */
function computeStarScreenPos(
  t: Star,
  scrollX = core.scrollX,
  moonPos?: { x: number; y: number } | null,
): { x: number; y: number } {
  let x = wrapX(geom, t.x, scrollX);
  let y = t.y;
  const mp =
    moonPos !== undefined
      ? moonPos
      : engine.sky.current.moonAlpha > 0.01
        ? skyToScreen(geom, engine.sky.current.moonDisp, engine.sky.current.moonVaz, scrollX)
        : null;
  if (mp) {
    const dx = x - mp.x, dy = y - mp.y;
    const d = Math.hypot(dx, dy);
    const minDist = 38;
    if (d < minDist) {
      const ang = d > 0.5 ? Math.atan2(dy, dx) : ((hash(t.id) % 628) / 100);
      x = mp.x + Math.cos(ang) * minDist;
      y = clamp(mp.y + Math.sin(ang) * minDist, 64, HORIZON - 48);
    }
  }
  return { x, y };
}

function rebuildFg() {
  fg?.remove();
  fg = buildForeground(P, H, beach.shoreY, X0);
  $('#fgWrap').innerHTML = '';
  $('#fgWrap').appendChild(fg);
  wind.attach(fg);
  placeForeground(fg, geom, core.scrollX);
}

let fgPersona: string | null = null;

Object.assign(core, {
  engine,
  fx,
  sky,
  weatherRenderer,
  worker,
  plane,
  geom,
  starScreenPos: (stObj: Star) => computeStarScreenPos(stObj),
  scrollToStar: (stObj: Star, ms = 650) => {
    const delta = wrapX(geom, stObj.x, core.scrollX) - W / 2;
    core.scrollTo(core.scrollX + delta, ms);
  },
  onPersona: () => {
    app.dataset.me = state.me;
    if (fg && fgPersona !== state.me) {
      fgPersona = state.me;
      rebuildFg();
    }
  },
  triggerOcean: () => {
    ocean.resetCooldown();
    if (ocean.start(performance.now(), core.scrollX)) engine.busy(1000);
  },
  openCompose,
  openArchive,
  openSettings,
  openCountdown,
  openStar: (stObj: Star) => void openStar(stObj),
  openBoard: (existing?: unknown[] | null) => openBoard((existing as Stroke[] | null) ?? null),
  renderDrawingPreview: (cvEl: HTMLCanvasElement, strokes: unknown[], upTo?: number) =>
    renderDrawing(cvEl, strokes as Stroke[], 1, upTo ?? Infinity),
  encodeDrawing: (strokes: unknown[]) => encodeDrawingBytes(strokes as Stroke[]),
  decodeDrawing: (bytes: Uint8Array<ArrayBuffer>) => decodeDrawingBytes(bytes),
  sendDrawPacket: (pkt: DrawLivePacket) => void pairRealtime.sendDrawPacket(pkt),
  onDrawPacket: (cb: (pkt: DrawLivePacket) => void) => pairRealtime.onDrawPacket(cb),
  onSendHeart: () => pairRealtime.sendHeart(),
  onOutboxChange: () => void syncOfflineAndOutbox(),
  setMyLiveActivity: (act: 'writing' | 'sending' | 'drawing' | 'photo' | 'voice' | 'idle') =>
    pairRealtime.setMyActivity(act),
});
core.scrollX = X0 - W / 2;
applyPersona();

// ---------- zemin ışığı → lilyum, palmiye ve kavanoz renkleri ----------
const lerpHex = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const FLORA: Record<string, [string, string]> = {
  '--petal-base': ['#8d8aa6', '#fff6f4'], '--petal-mid': ['#a88fa8', '#ffdbe6'], '--petal-tip': ['#9c9ab4', '#ffffff'],
  '--petal-throat': ['#b9a074', '#f4d27e'], '--petal-vein': ['#a05f86', '#ef8fb2'], '--petal-spot': ['#6e3d5c', '#c4577f'],
  '--palm-leaf': ['#080b14', '#2f5a35'], '--palm-leaf-2': ['#05070d', '#24452a'], '--palm-leaf-hi': ['#0f1420', '#5f8f4c'], '--palm-rachis': ['#0c1019', '#6d7f3e'],
  '--palm-dead': ['#0d0e14', '#8a6a3e'], '--palm-dead-2': ['#08090e', '#6b4f2c'],
  '--palm-trunk': ['#0d1019', '#8a6c4e'], '--palm-trunk-2': ['#06080e', '#5b4532'],
  '--palm-ring': ['#161a26', '#46331f'], '--palm-coco': ['#06080e', '#5a4026'], '--palm-coco-hi': ['#141824', '#9b7a4c'],
};
let floraKey = -1;
function updateFlora(day: number) {
  const k = Math.round(day * 40);
  if (k === floraKey) return;
  floraKey = k;
  const r = document.documentElement.style;
  for (const [v, [n, d]] of Object.entries(FLORA)) r.setProperty(v, lerpHex(n, d, day));
  r.setProperty('--jar-inner', `rgba(255,190,110,${(0.25 + 0.5 * (1 - day)).toFixed(2)})`);
  r.setProperty('--wind', String(engine.weather.wind));
  r.setProperty('--rope', day > 0.5 ? 'rgba(70,52,36,.9)' : 'rgba(150,140,130,.55)');
}

// ---------- ana döngü ----------
let starsShown = false;
let nextMeteor = performance.now() + 30_000;
let oceanDwell = 0;
let oceanAt = 180; // sn: ana ekranda kalma süresi / ilk selam eşiği (3 dk)

engine.add((now, dt, s) => {
  const sx = core.scrollX;
  sky.frame(now, s, sx);
  weatherRenderer.frame(now, dt, s, sx);
  tickPlane(now);
  const css = getComputedStyle(document.documentElement);
  updateFlora(s.daylight);

  wind.strength = Math.max(
    engine.weather.wind,
    engine.weather.kind === 'thunder'
      ? 0.75
      : engine.weather.kind === 'heavyRain' || engine.weather.kind === 'heavySnow'
        ? 0.6
        : 0
  );
  wind.dir = engine.weather.windSign || 1;
  beach.wind = wind.strength;
  beach.windDir = wind.dir;
  wind.frame(dt);

  const moonPos = s.moonAlpha > 0.02 ? skyToScreen(geom, s.moonDisp, s.moonVaz, sx) : null;
  const glints: { x: number; k: number; warm: boolean }[] = [];
  if (moonPos) {
    glints.push({ x: moonPos.x, k: s.moonAlpha * s.phase.fraction * (1 - s.daylight) * 0.9, warm: false });
  }
  if (s.sunAlpha > 0.02) {
    glints.push({ x: skyToScreen(geom, s.sunDisp, s.sunVaz, sx).x, k: s.sunAlpha * (0.35 + 0.65 * (1 - Math.min(1, s.sunAlt / 25))), warm: s.sunAlt < 12 });
  }
  if (fg && !fg.parentElement?.classList.contains('pre')) {
    const mineX = wrapX(geom, X0 + 7, sx);
    if (mineX > -60 && mineX < W + 60) {
      glints.push({ x: mineX, k: 0.42 * (1 - s.daylight) + 0.05, warm: true });
    }
    const partnerLanternOn = Boolean(fg.querySelector('.lantern.partner.on'));
    if (partnerLanternOn) {
      const pX = wrapX(geom, X0 - 41, sx);
      if (pX > -60 && pX < W + 60) {
        glints.push({ x: pX, k: 0.42 * (1 - s.daylight) + 0.05, warm: true });
      }
    }
  }

  beach.frame(
    now,
    sx,
    skyCanvas,
    { hor: css.getPropertyValue('--sky-hor') || 'rgb(50,56,81)', top: css.getPropertyValue('--sky-top') || 'rgb(26,32,58)' },
    s.daylight,
    s.sunLight,
    glints,
    []
  );

  if (fg) placeForeground(fg, geom, sx);

  // Kişisel yıldızlar: cWBack ile cWFront ARASINDA (alçak bulut/sis/yağışın arkasında); yoğun bulutta %45'e kadar soluklaşır
  const so = Math.max(0.45, 1 - 0.55 * Math.max(engine.weather.cloud, engine.weather.precip)).toFixed(2);
  if (so !== starOp) {
    starOp = so;
    starsCv.style.opacity = so;
  }
  starsCtx.clearRect(0, 0, W, H);
  if (starsShown) {
    const srvNow = getServerNowMs();
    const exposure = sky.intro.stars[0] ?? 1;
    for (const t of state.stars) {
      if (!t.visible) continue;
      const pos = computeStarScreenPos(t, sx, moonPos);
      if (pos.x < -30 || pos.x > W + 30) continue;
      const altDeg = (HORIZON - pos.y) / geom.pxPerDeg;
      const ext = clamp(altDeg / 14) * 0.72 + 0.28;
      const unread = t.from === state.partner && !t.opened && !(t.unlockAt && t.unlockAt > srvNow);
      drawUserStar(starsCtx, pos.x, pos.y, t.id, now, {
        tint: PEOPLE[t.from].color,
        daylight: s.daylight,
        arrivedAt: t.arrivedAt,
        unread,
        hazel: t.hazel,
        ext,
        exposure,
      });
    }
  }

  if (ocean.frame(now, sx, s.daylight, matchMedia('(prefers-reduced-motion: reduce)').matches)) engine.busy(200);
  if (fx.frame(now, dt)) engine.busy(200);
  if (now > nextMeteor) {
    if (s.starVis[1] > 0.6 && engine.weather.cloud < 0.4) fx.decorative(now);
    nextMeteor = now + 40_000 + Math.random() * 60_000;
  }

  // Deniz selamı: ana ekranda ~3 dk kalınırsa gelir; sonrasında ancak 8–12 dk daha kalınırsa tekrarlar
  const overlayOpen = Boolean(app.querySelector('.sheet,.page,.board,.watch,.auth,.cdpage'));
  if (inHome && starsShown && !overlayOpen && document.visibilityState === 'visible') {
    oceanDwell += dt;
    if (oceanDwell >= oceanAt && engine.weather.precip < 0.5 && ocean.start(now, sx)) {
      engine.busy(1000);
      oceanDwell = 0;
      oceanAt = 480 + Math.random() * 240;
    }
  } else if (overlayOpen) {
    oceanDwell = Math.max(0, oceanDwell - dt * 0.5);
  }
});

// ---------- gökyüzü: sınırsız 360° sürükle (kaydır) + dokun (yıldız aç / deniz selamı) ----------
let anim = 0;
let hint: SwipeHint | null = null;
const prog = () => hint?.setProgress(mod(core.scrollX - (X0 - W / 2), P) / P);

core.scrollTo = (x, ms = 600) => {
  cancelAnimationFrame(anim);
  const from = core.scrollX, to = x, t0 = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / ms);
    core.scrollX = from + (to - from) * (1 - Math.pow(1 - t, 3));
    prog();
    engine.busy(100);
    if (t < 1) anim = requestAnimationFrame(step);
  };
  step();
};

let drag: { x: number; y: number; sx: number; t: number; moved: boolean; v: number; lx: number; lt: number } | null = null;
app.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button,input,textarea,select,label,.sheet,.page,.board,.watch,.auth,.cdpage,.jar,.backdrop,.island-pop')) return;
  if (!core.homeEl) return;
  cancelAnimationFrame(anim);
  drag = { x: e.clientX, y: e.clientY, sx: core.scrollX, t: performance.now(), moved: false, v: 0, lx: e.clientX, lt: performance.now() };
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; hint?.onScrollStart(); }
  if (!drag.moved) return;
  core.scrollX = drag.sx - dx; // sınırsız 360°: kenar, lastik ya da boşluk yok
  prog();
  const now = performance.now();
  drag.v = (e.clientX - drag.lx) / Math.max(1, now - drag.lt);
  drag.lx = e.clientX;
  drag.lt = now;
  engine.busy(300);
});
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) { tapSky(e); return; }
  core.scrollTo(core.scrollX - d.v * 260, 650);
  hint?.onScrollEnd();
});
addEventListener('pointercancel', () => { drag = null; });

function tapSky(e: PointerEvent) {
  const r = app.getBoundingClientRect();
  const tx = e.clientX - r.left, ty = e.clientY - r.top;
  if (ty > geom.horizonY && ty < beach.shoreY && ocean.start(performance.now(), core.scrollX)) {
    engine.busy(1000);
    return;
  }
  let best: Star | null = null, bd = 30;
  let bestPos = { x: 0, y: 0 };
  for (const t of state.stars) {
    if (!t.visible) continue;
    const pos = computeStarScreenPos(t);
    const d = Math.hypot(pos.x - tx, pos.y - ty);
    if (d < bd) { bd = d; best = t; bestPos = pos; }
  }
  if (best) {
    fx.land(bestPos, { now: performance.now() - 700, tint: PEOPLE[best.from].color });
    engine.busy(800);
    const chosen = best;
    setTimeout(() => core.openStar(chosen), 120);
  }
}

// ---------- Supabase StarRecord -> UI Star dönüşümü (360° dünya koordinatı) ----------
export function mapRecordToStar(rec: StarRecord, allRecords: StarRecord[], visible = true): Star {
  const kind: Kind =
    rec.kind === 'photo' ? 'photo' : rec.kind === 'voice' ? 'voice' : rec.kind === 'draw' ? 'draw' : 'text';
  const x = mod((rec.x / 100) * geom.panoW, geom.panoW);
  const y = Math.max(70, Math.min(HORIZON - 56, 70 + (rec.y / 100) * (HORIZON - 130)));
  const unlockAt = rec.unlockAt ? Date.parse(rec.unlockAt) : undefined;
  const locked = Boolean(unlockAt && unlockAt > getServerNowMs());
  const hazel = !locked && rec.from === 'beto' && isStarHazel(rec, allRecords);
  return {
    id: rec.id,
    from: toUiWho(rec.from),
    kind,
    createdAt: Date.parse(rec.createdAt) || Date.now(),
    unlockAt: Number.isFinite(unlockAt) ? unlockAt : undefined,
    opened: Boolean(rec.openedAt),
    x,
    y,
    hazel,
    visible,
    raw: rec,
  };
}

async function loadStarsFromBackend() {
  const dbMe = toDbWho(state.me);
  const records = await fetchAllStars(dbMe);
  const mapped = records.map((r) => mapRecordToStar(r, records, false));
  const queued = await listQueuedStars(dbMe);
  for (const q of queued) {
    if (!mapped.some((s) => s.id === q.id)) {
      const kind: Kind = q.kind === 'photo' ? 'photo' : q.kind === 'voice' ? 'voice' : q.kind === 'draw' ? 'draw' : 'text';
      mapped.push({
        id: q.id,
        from: state.me,
        kind,
        createdAt: q.queuedAt,
        unlockAt: q.unlockAt ? Date.parse(q.unlockAt) : undefined,
        opened: false,
        x: mod((q.x / 100) * geom.panoW, geom.panoW),
        y: Math.max(70, Math.min(HORIZON - 56, 70 + (q.y / 100) * (HORIZON - 130))),
        visible: false,
      });
    }
  }
  state.stars = mapped;
}

// ---------- çevrimdışı uyarısı + şifreli giden kutusu (IndexedDB) ----------
let offlineEl: HTMLElement | null = null;
let flushingOutbox = false;

function setOfflineBanner(text: string | null) {
  if (!text) {
    if (offlineEl) {
      const el = offlineEl;
      offlineEl = null;
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(() => el.remove());
    }
    return;
  }
  if (!offlineEl) {
    offlineEl = h(`<div class="offline toast glass-strong" role="status" aria-live="polite">${I.cloud(14)}<span></span></div>`);
    app.appendChild(offlineEl);
    offlineEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, fill: 'forwards' });
  }
  offlineEl.querySelector('span')!.textContent = text;
}

async function syncOfflineAndOutbox() {
  if (!inHome) {
    setOfflineBanner(null);
    return;
  }
  const dbMe = toDbWho(state.me);
  const queued = await listQueuedStars(dbMe);
  const online = navigator.onLine !== false;

  if (!online) {
    setOfflineBanner(
      queued.length > 0
        ? `Çevrimdışı · ${queued.length} yıldız bağlantı gelince gidecek`
        : 'Çevrimdışı · yıldızların bağlantı gelince gidecek'
    );
    return;
  }

  if (queued.length === 0) {
    setOfflineBanner(null);
    return;
  }

  if (flushingOutbox) return;
  flushingOutbox = true;
  setOfflineBanner(`Bekleyen ${queued.length} yıldız gökyüzüne bırakılıyor…`);
  let sentCount = 0;
  try {
    for (const env of queued) {
      try {
        const uploaded = await uploadPreparedStar(env);
        await removeQueuedStar(env.id);
        const stLocal = state.stars.find((s) => s.id === env.id);
        if (stLocal) stLocal.raw = uploaded;
        sentCount++;
      } catch (err) {
        if (err instanceof OfflineNetworkError || isOfflineLikeError(err)) break;
        await removeQueuedStar(env.id);
      }
    }
  } finally {
    flushingOutbox = false;
  }

  const remaining = await listQueuedStars(dbMe);
  if (remaining.length > 0) {
    setOfflineBanner(`Çevrimdışı · ${remaining.length} yıldız bağlantı gelince gidecek`);
  } else {
    setOfflineBanner(null);
    if (sentCount > 0) {
      island({
        avatar: I.starFill(18),
        color: PEOPLE[state.me].color,
        title: 'Yıldızların ulaştı',
        sub: `${PEOPLE[state.partner].of} gökyüzünde`,
        ms: 3200,
      });
    }
  }
  core.refreshHome();
}

window.addEventListener('online', () => void syncOfflineAndOutbox());
window.addEventListener('offline', () => void syncOfflineAndOutbox());

// ---------- açılış + giriş + ana ekran ----------
let inHome = false;
let isFirstOpen = true;

/** Saate göre selam (yalnızca tekrar açılışlarda): büyük yazı süzülerek gelir, kısa kalır, süzülerek gider. */
function greetingFor(hr: number, name: string): [string, string] {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  if (hr >= 5 && hr < 11) return [`Günaydın, ${name}`, pick(['Yeni bir gün, aynı gökyüzü.', 'Kahveni al, gökyüzüne bak.', 'Sabah ışığı seninle.'])];
  if (hr >= 11 && hr < 17) return [`İyi günler, ${name}`, pick(['Gökyüzü şu an sana bakıyor.', 'Gün bitmeden bir yıldız bırak.', 'Aklımda sen varsın.'])];
  if (hr >= 17 && hr < 22) return [`İyi akşamlar, ${name}`, pick(['Gün batımı sana ayrıldı.', 'Yıldızlar yakında çıkacak.', 'Akşam seninle güzel.'])];
  if (hr >= 22 || hr < 2) return [`İyi geceler, ${name}`, pick(['Rüyanda gökyüzümüzü gör.', 'Yıldızlar seni bekliyordu.', 'Bu gece de aynı gökyüzü altındayız.'])];
  return [`Hâlâ uyumadın mı, ${name}?`, pick(['Gecenin bu saati sadece bize ait.', 'Yıldızlar da uyanık.'])];
}

function showGreeting() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  app.querySelector('.greet')?.remove();
  const name = PEOPLE[state.me].name;
  const [title, line] = greetingFor(new Date().getHours(), name);
  const srvNow = getServerNowMs();
  const unread = state.stars.filter((t) => t.from === state.partner && !t.opened && !(t.unlockAt && t.unlockAt > srvNow)).length;
  const sub = unread ? `${unread} yeni yıldız seni bekliyor` : line;
  const el = h(`<div class="greet" aria-live="polite"><b>${title}</b><i>${sub}</i></div>`);
  app.appendChild(el);
  const kf = [
    { opacity: 0, transform: 'translate3d(0,10px,0)' },
    { opacity: 1, transform: 'none', offset: 0.18 },
    { opacity: 1, transform: 'none', offset: 0.78 },
    { opacity: 0, transform: 'translate3d(0,-8px,0)' },
  ];
  el.animate(kf, { duration: 3200, delay: 350, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).finished.then(
    () => el.remove(),
    () => el.remove()
  );
}

/** Tek kalıcı Realtime aboneliği: kimlik doğrulama biter bitmez kurulur; ekran değişince yeniden kurulmaz. */
function ensureRealtimeStarted() {
  const dbMe = toDbWho(state.me);
  if (realtimeActiveWho === dbMe) return;
  realtimeActiveWho = dbMe;
  pairRealtime.start(dbMe);
  stopStarsRealtime?.();
  stopStarsRealtime = subscribeStarsRealtime(dbMe, {
    onInsert: (rec) => {
      if (state.stars.some((s) => s.id === rec.id)) return;
      const tRecv = performance.now();
      const allRecs = [...(state.stars.map((s) => s.raw).filter(Boolean) as StarRecord[]), rec];
      const stNew = mapRecordToStar(rec, allRecs, false);
      state.stars.push(stNew);
      if (stNew.from === state.partner) {
        const curPos = computeStarScreenPos(stNew);
        let targetScrollX = core.scrollX;
        if (curPos.x < 24 || curPos.x > W - 24) {
          targetScrollX = core.scrollX + (curPos.x - W / 2);
          core.scrollTo(targetScrollX, 550);
        }
        const screenSpot = computeStarScreenPos(stNew, targetScrollX);
        engine.busy(2600);
        fx.incoming(
          { x: Math.max(36, Math.min(W - 36, screenSpot.x)), y: screenSpot.y },
          {
            now: performance.now(),
            tint: PEOPLE[state.partner].color,
            onSettle: () => {
              stNew.visible = true;
              stNew.arrivedAt = performance.now();
            },
          }
        );
        // 3.8.f: Çentik bildirimi yıldız düşerken AYNI ANDA gelir (şifre çözme ve görsel beklenmez)
        showLive('left', { star: stNew });
        core.lastInsertLatencyMs = Math.round((performance.now() - tRecv) * 100) / 100;
        core.refreshHome();

        // Çözülen içerik kilitli değilse arkadan sessizce ısıtılır (UI engellenmez)
        if (!stNew.unlockAt || stNew.unlockAt <= getServerNowMs()) {
          void decryptStarPayload(rec, dbMe)
            .then((pl) => {
              stNew.text = pl.text || undefined;
              stNew.caption = pl.caption;
              if (pl.dur) stNew.voiceSec = pl.dur;
              if (pl.peaks) stNew.voicePeaks = pl.peaks;
            })
            .catch(() => undefined);
        }
      } else {
        stNew.visible = true;
        core.refreshHome();
      }
    },
    onUpdate: (rec) => {
      const ex = state.stars.find((s) => s.id === rec.id);
      if (ex) {
        ex.opened = Boolean(rec.openedAt);
        ex.raw = rec;
        core.refreshHome();
      }
    },
  });
}

async function resolveBootMode(): Promise<'auth' | 'lock' | 'home'> {
  const hasKey = await loadSavedKey();
  if (!isSupabaseConfigured) {
    const savedMe = store.get<string | null>(STORAGE_KEYS.me, null);
    if (!savedMe || !hasKey) return 'auth';
    return state.settings.faceId && hasBiometric() ? 'lock' : 'home';
  }
  const { session, networkFailed } = await getSessionFast();
  if (session?.user?.email) {
    const inferred = inferWhoFromEmail(session.user.email);
    if (inferred) setMe(toUiWho(inferred));
  }
  if (!session && !networkFailed) return 'auth';
  if (!hasKey) return 'auth';
  return state.settings.faceId && hasBiometric() ? 'lock' : 'home';
}

async function enterHome(preloaded = false) {
  ensureRealtimeStarted();
  if (!preloaded) {
    await loadStarsFromBackend();
    fgPersona = state.me;
    rebuildFg();
  }
  $('#fgWrap').classList.remove('pre');

  [...document.querySelectorAll('#fgWrap .jar.mine')].forEach((j) =>
    (j as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 400, easing: 'ease-out', fill: 'backwards' })
  );
  const home = buildHome();
  app.appendChild(home);
  inHome = true;

  hint = new SwipeHint(home, PEOPLE[state.me].color);
  prog();
  firstRunNudge();
  if (!isFirstOpen) showGreeting();
  const top = [$('.counter', home), $('.top-r', home)], dock = $('.dock', home), flora = $('.cnum', home);
  stagger(top, { y: -8, gap: 90, dur: 700 });
  drawLily(flora);
  dock.animate(
    [{ opacity: 0, transform: 'translate(-50%,16px)' }, { opacity: 1, transform: 'translate(-50%,0)' }],
    { duration: 700, delay: 260, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'backwards' }
  );

  starsShown = true;
  const sorted = [...state.stars].sort((a, b) => a.createdAt - b.createdAt);
  sorted.forEach((t) => (t.visible = false));
  sorted.forEach((t, i) =>
    setTimeout(() => {
      const pos = computeStarScreenPos(t);
      fx.land(pos, { now: performance.now() - 650, tint: PEOPLE[t.from].color, onSettle: () => (t.visible = true) });
      engine.busy(1500);
    }, 300 + i * 90)
  );
  core.refreshHome();
  void syncOfflineAndOutbox();

  // Bildirimden açıldıysa ilgili yıldıza odaklan
  const sp = new URLSearchParams(location.search);
  const targetStarId = sp.get('star');
  if (targetStarId) {
    const found = state.stars.find((s) => s.id === targetStarId);
    if (found) {
      core.scrollToStar(found, 500);
      setTimeout(() => void openStar(found), 600);
    }
    history.replaceState(null, '', '/');
  }
}

function drawLily(cnum: HTMLElement) {
  [...cnum.querySelectorAll('.lily-b')].reverse().forEach((el, i) =>
    (el as HTMLElement).animate(
      [{ opacity: 0, transform: 'scale(.3) rotate(-40deg)' }, { opacity: 1, transform: 'none' }],
      { duration: 1100, delay: 900 + i * 260, easing: 'cubic-bezier(.3,1.3,.45,1)', fill: 'backwards' }
    )
  );
}

function firstRunNudge(force = false) {
  let n = 0;
  try {
    n = +(localStorage.getItem('gk.nudge') || 0);
    localStorage.setItem('gk.nudge', String(n + 1));
  } catch {
    // Ignore
  }
  if ((n >= 2 && !force) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setTimeout(() => {
    if (drag || !inHome) return;
    const from = core.scrollX;
    hint?.onScrollStart();
    hint?.showText(2600);
    core.scrollTo(from + 46, 520);
    setTimeout(() => {
      core.scrollTo(from, 820);
      hint?.onScrollEnd();
    }, 560);
  }, 3200);
}

async function boot(mode?: 'auth' | 'lock' | 'home') {
  clearPageStack();
  $$('.screen.home,.auth,.page,.sheet,.backdrop,.board,.watch,.cdpage,.scene-fg,.island-pop,.greet').forEach((x) => x.remove());
  const overlay = h(`<div class="layer" style="background:#05070d;z-index:90"></div>`);
  app.appendChild(overlay);
  core.homeEl = null as unknown as HTMLElement;
  inHome = false;
  starsShown = false;
  oceanDwell = 0;
  sky.intro.stars = [0, 0, 0];

  const resolved = mode ?? (await resolveBootMode());
  if (resolved === 'home' || resolved === 'lock') {
    // Kimlik doğrulama hazır olur olmaz kalıcı Realtime kanalını başlat
    ensureRealtimeStarted();
  }
  applyPersona();
  fgPersona = state.me;
  rebuildFg();
  $('#fgWrap').classList.add('pre');

  const ready = new Promise<void>((r) => {
    const c = () => (sky.ready ? r() : setTimeout(c, 30));
    c();
  });
  const preloadTasks: Promise<unknown>[] = [ready];
  if (resolved === 'home') preloadTasks.push(loadStarsFromBackend());
  await prepare(preloadTasks, ['italic 600 40px "Cormorant Garamond"', '500 15px "Inter"', '400 40px "Great Vibes"']);

  let first = true;
  try {
    first = !localStorage.getItem('gk.seen');
    localStorage.setItem('gk.seen', '1');
  } catch {
    // Ignore storage errors
  }
  isFirstOpen = first;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introKind: 'full' | 'short' = first && !reduced ? 'full' : 'short';
  $('#fgWrap').animate([{ transform: 'translate3d(0,90px,0)' }, { transform: 'none' }], {
    duration: introKind === 'short' ? 1260 : 2800,
    easing: 'cubic-bezier(.25,.1,.12,1)',
  });
  const reveal = playIntro(
    { overlay, sky: $('#skyWrap'), ground: $('#groundWrap'), setStars: (a, b, c) => (sky.intro.stars = [a, b, c]) },
    introKind
  );
  if (resolved === 'home') {
    await reveal;
    await enterHome(true);
    return;
  }
  await sleep(introKind === 'short' ? 420 : 900);
  const after = () => {
    ensureRealtimeStarted();
    void enterHome(false);
  };
  if (resolved === 'lock') runLock(app, after);
  else runAuth(app, after);
}

core.logout = async () => {
  pairRealtime.stop();
  stopStarsRealtime?.();
  stopStarsRealtime = null;
  realtimeActiveWho = null;
  await signOutSupabase();
  await clearActiveKey();
  store.del(STORAGE_KEYS.me);
  state.stars = [];
  await boot('auth');
};

// Zamanlı yıldızların kilit açılma anı kontrolü (sekme açıkken)
window.setInterval(() => {
  if (document.hidden || !inHome) return;
  const now = getServerNowMs();
  for (const s of state.stars) {
    if (s.from === state.partner && s.unlockAt && s.unlockAt <= now && s.raw && !s.raw.unlockNotified) {
      void markStarUnlockNotified(s.raw);
      const allRecs = state.stars.map((x) => x.raw).filter(Boolean) as StarRecord[];
      s.hazel = s.raw.from === 'beto' && isStarHazel(s.raw, allRecs);
      island({
        avatar: I.starFill(18),
        color: PEOPLE[state.partner].color,
        title: `${PEOPLE[state.partner].of} yıldızı açıldı`,
        sub: 'Şimdi okuyabilirsin',
        action: { label: 'Aç', onClick: () => void openStar(s) },
        ms: 5200,
      });
      core.refreshHome();
    }
  }
}, 15_000);

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    oceanDwell = 0;
  } else {
    void syncOfflineAndOutbox();
    if (inHome && hiddenAt && Date.now() - hiddenAt >= BACKGROUND_LOCK_MS && state.settings.faceId && hasBiometric()) {
      hiddenAt = 0;
      inHome = false;
      runLock(app, () => {
        inHome = true;
      });
    }
  }
});

// 3.8.b: Ekran boyutu önemli ölçüde değişirse (döndürme vb.; klavye hariç) sahneyi yeniden kur
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (document.documentElement.classList.contains('kb-open')) return;
    const nw = app.clientWidth;
    const nh = app.clientHeight;
    if (nw > 0 && nh > 0 && (Math.abs(nw - W) > 40 || Math.abs(nh - H) > 120)) {
      location.reload();
    }
  }, 400);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const data = ev.data as { type?: string; starId?: string } | null;
    if (data?.type === 'notification-open' && data.starId && inHome) {
      const found = state.stars.find((s) => s.id === data.starId);
      if (found) {
        core.scrollToStar(found, 500);
        setTimeout(() => void openStar(found), 550);
      }
    }
  });
}

engine.start();
void boot();
