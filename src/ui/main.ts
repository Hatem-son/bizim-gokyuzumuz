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
import { playIntro } from '../gokyuzu/intro';
import { Weather, WeatherKind, kindFromCode, KIND_TR, startWeather } from '../gokyuzu/weather';
import { clamp, hash } from '../gokyuzu/util';
import { initKeyboard } from '../gokyuzu/keyboard';
import { Beach } from './beach';
import { OceanHeart } from './ocean';
import { PALM_CSS } from './palm';
import { ART_CSS } from './art';
import { LILY_CSS } from './lily';
import { Wind } from './wind';
import { core } from './core';
import { initUI, $, $$, h, toast, sleep, clearPageStack, closeIsland, island } from './ui';
import { state, PEOPLE, Star, Kind, setMe, toUiWho, toDbWho } from './state';
import { buildHome, buildForeground, placeForeground, showLive, sendHeart, partnerOnline } from './home';
import { openCompose, freeSpot } from './compose';
import { openBoard, openWatch, renderDrawing, demoDrawing, Stroke, DrawLivePacket } from './draw';
import { encodeDrawingBytes, decodeDrawingBytes } from '../lib/drawCodec';
import { openStar, openArchive, openSettings, openCountdown } from './pages';
import { runAuth, runLock, applyPersona, faceAuth } from './auth';
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
// Geçiş animasyonu (translateX) sırasında odaklanan öğelerin kapsayıcıyı kaydırmasını engelle
app.addEventListener('scroll', () => {
  if (app.scrollLeft || app.scrollTop) app.scrollTo(0, 0);
});
window.addEventListener('scroll', () => {
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
});

// iOS 26: ana ekran uygulamasında fixed + inset:0 alt ~48pt'yi boş bırakır → standalone'da gerçek ekran yüksekliği (--app-h)
const standalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia('(display-mode: standalone)').matches;
function fitViewport() {
  const h = standalone() ? Math.max(window.innerHeight, window.screen.height) : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  const ae = document.activeElement as HTMLElement | null;
  const typing = !!ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName);
  // iOS'a yeniden ölçtür (klavye açıkken/yazı alanı odaktayken yapma: display:none odağı düşürür)
  if (standalone() && !typing && !document.documentElement.classList.contains('kb-open')) {
    app.style.display = 'none';
    void app.offsetHeight;
    app.style.display = '';
  }
}
fitViewport();
addEventListener('resize', fitViewport);
addEventListener('pageshow', fitViewport);
setTimeout(fitViewport, 300);

initKeyboard({
  hideWhenOpen: () => [...app.querySelectorAll<HTMLElement>('.dock, .gk-cons, .gk-edge, .gk-hint-txt')],
});

// GERÇEK ekran boyutu: getBoundingClientRect() / clientHeight'tan alınır ve resize/pageshow/orientationchange'de yeniden ölçülür
function measureApp() {
  const r = app.getBoundingClientRect();
  const w = Math.round(r.width || app.clientWidth || 390);
  const h = Math.round(r.height || app.clientHeight || 844);
  return { w, h };
}
const initDim = measureApp();
let W = initDim.w;
let H = initDim.h;
const HORIZON = Math.round(H * 0.71);
const st = document.createElement('style');
st.textContent = ART_CSS + PALM_CSS + LILY_CSS + '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(st);
initUI(app);

// ---------- katmanlar ----------
app.insertAdjacentHTML(
  'afterbegin',
  `
  <div id="skyWrap" class="layer"><canvas id="cSky"></canvas><canvas id="cWBack"></canvas><canvas id="cStars"></canvas><div id="planeHost" class="layer" style="pointer-events:none"></div><canvas id="cWFront"></canvas></div>
  <div id="groundWrap" class="layer" style="pointer-events:none"><canvas id="cGround"></canvas></div>
  <canvas id="cOcean"></canvas>
  <canvas id="cFx"></canvas>
  <div id="fgWrap" class="layer" style="pointer-events:none;z-index:4"></div>
  <div id="flash" class="layer" style="background:#dfe6ff;opacity:0;pointer-events:none;z-index:6"></div>`
);

function cv(id: string, maxDpr = 1.5, extraH = 0) {
  const d = Math.min(devicePixelRatio || 1, maxDpr);
  const c = document.getElementById(id) as HTMLCanvasElement;
  const ch = H + extraH;
  c.width = Math.round(W * d);
  c.height = Math.round(ch * d);
  c.style.width = `${W}px`;
  c.style.height = `${ch}px`;
  const x = c.getContext('2d')!;
  x.setTransform(d, 0, 0, d, 0, 0);
  return x;
}

const geom = makeGeom(W, HORIZON);
const P = geom.panoW;
const X0 = P / 2;
Object.assign(core, { W, H, skyW: P, horizonY: HORIZON });

const worker = new SkyWorker();
const engine = new Engine(defaultLocation, geom);
const sky = new SkyRenderer(cv('cSky', 1.5), geom, worker);
sky.moonTint = null;

// Safari üst çubuk rengi = gökyüzünün üst rengi (alt zemin rengi beach.ts içinde kumsal rengine eşitlenir)
const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
let chromeAt = 0;
let chromeCol = '';
const mkEdge = (c: string) => {
  const e = document.createElement('div');
  e.className = 'edge ' + c;
  document.body.appendChild(e);
  return e;
};
const edgeT = mkEdge('t');
const edgeB = mkEdge('b');
function syncChrome(now: number) {
  if (now - chromeAt < 1500) return;
  chromeAt = now;
  const col = sky.sampleColors()?.top;
  if (!col || col === chromeCol) return;
  chromeCol = col;
  themeMeta?.setAttribute('content', col);
  if (standalone()) return;
  document.documentElement.style.backgroundColor = col;
  edgeT.style.background = col;
  try {
    // alt kenar: sahnenin GÖRÜNEN en alt satırı (tuvalin +96px tamponu değil)
    const g = document.getElementById('cGround') as HTMLCanvasElement;
    const row = Math.max(0, Math.round((g.height * H) / (H + 96)) - 2);
    const p = g.getContext('2d')!.getImageData(Math.floor(g.width / 2), row, 1, 1).data;
    edgeB.style.background = `rgb(${p[0]},${p[1]},${p[2]})`;
  } catch {
    // Ignore read errors
  }
}

const weatherRenderer = new WeatherRenderer(worker, cv('cWBack', 1.5), cv('cWFront', 1.5), $('#flash'), geom, engine.weather);
weatherRenderer.lightningEnabled = state.settings.lightning;
const beach = new Beach(cv('cGround', 1.5, 96), { W, H, horizonY: HORIZON, skyW: P, x0: X0 });
const ocean = new OceanHeart(cv('cOcean', 1.5), geom, beach.shoreY);
let fg: HTMLElement | null = null;
const wind = new Wind();
const fx = new Effects(cv('cFx', 1.5), { w: W, h: H });
fx.flashEl = $('#flash');
const starsCtx = cv('cStars', 1.5);
const starsCv = document.getElementById('cStars') as HTMLCanvasElement;
let starOp = '';

engine.onLowPower = (low) => {
  weatherRenderer.maxParticles = low ? 160 : 320;
};
engine.sampleSky = () => sky.sampleColors();
engine.onTarget = (s, ms) => sky.request(s, ms);

let wxOverridden = false;
let stopWeather = startWeather(defaultLocation, (w) => {
  if (wxOverridden) return;
  engine.setWeather(w, 3000);
  weatherRenderer.setWeather(w);
  core.refreshHome();
});
core.reloadWeather = () => {
  wxOverridden = false;
  stopWeather();
  stopWeather = startWeather(defaultLocation, (w) => {
    if (wxOverridden) return;
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
  moonPos?: { x: number; y: number } | null
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
      const ang = d > 0.5 ? Math.atan2(dy, dx) : (hash(t.id) % 628) / 100;
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
    sky.moonTint = state.me === 'beto' ? [1.06, 0.99, 0.84] : null;
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

// ---------- zemin ışığı → lilyum ve kavanoz renkleri ----------
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
let lastDayBool: boolean | null = null;
function updateFlora(day: number) {
  const k = Math.round(day * 40);
  if (k === floraKey) return;
  floraKey = k;
  const r = document.documentElement.style;
  for (const [v, [n, d]] of Object.entries(FLORA)) r.setProperty(v, lerpHex(n, d, day));
  r.setProperty('--jar-inner', `rgba(255,190,110,${(0.25 + 0.5 * (1 - day)).toFixed(2)})`);
  r.setProperty('--wind', String(engine.weather.wind));
  r.setProperty('--rope', day > 0.5 ? 'rgba(70,52,36,.9)' : 'rgba(150,140,130,.55)');
  const isDay = day > 0.5;
  if (lastDayBool !== isDay) {
    lastDayBool = isDay;
    core.refreshHome();
  }
}

// ---------- ana döngü ----------
let starsShown = false;
let inHome = false;
let home: HTMLElement | null = null;
let nextMeteor = performance.now() + 30_000;
let oceanDwell = 0;
let oceanAt = 180; // sn: ana ekranda kalma süresi / ilk selam eşiği (3 dk)

engine.add((now, dt, s) => {
  syncChrome(now);
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
  // balina: ana ekrandayken arada bir (2.5–6 dk), fırtınada ve hareket azalt açıkken değil
  if (
    home &&
    inHome &&
    !beach.whale.active &&
    now > beach.whale.next &&
    engine.weather.kind !== 'thunder' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    beach.whale.start(now, core.scrollX, W);
  }
  if (beach.whale.active) engine.busy(200);
  wind.frame(dt);

  const moonPos = s.moonAlpha > 0.02 ? skyToScreen(geom, s.moonDisp, s.moonVaz, sx) : null;
  const glints: { x: number; k: number; warm: boolean }[] = [];
  if (moonPos) {
    glints.push({ x: moonPos.x, k: s.moonAlpha * s.phase.fraction * (1 - s.daylight) * 0.9, warm: false });
  }
  if (s.sunAlpha > 0.02) {
    glints.push({
      x: skyToScreen(geom, s.sunDisp, s.sunVaz, sx).x,
      k: s.sunAlpha * (0.35 + 0.65 * (1 - Math.min(1, s.sunAlt / 25))),
      warm: s.sunAlt < 12,
    });
  }
  // fenerler: denize sıcak ışık yolu — DÜNYA KOORDİNATINA SABİT (palmiye ekran dışına çıkıp display:none olduğunda x=0'da solda takılı kalmaz!)
  if (fg && !fg.parentElement?.classList.contains('pre')) {
    const mineX = wrapX(geom, mod(X0 - 22, P), sx);
    if (mineX > -120 && mineX < W + 120) {
      glints.push({ x: mineX, k: 0.42 * (1 - s.daylight) + 0.05, warm: true });
    }
    if (fg.querySelector('.lantern.partner.on')) {
      const partnerX = wrapX(geom, mod(X0 - 70, P), sx);
      if (partnerX > -120 && partnerX < W + 120) {
        glints.push({ x: partnerX, k: 0.42 * (1 - s.daylight) + 0.05, warm: true });
      }
    }
  }
  const candles: { x: number; y: number; k: number }[] = [];
  beach.frame(
    now,
    sx,
    sky.refl,
    { hor: css.getPropertyValue('--sky-hor') || 'rgb(50,56,81)', top: css.getPropertyValue('--sky-top') || 'rgb(26,32,58)' },
    s.daylight,
    s.sunLight,
    glints,
    candles
  );

  if (fg) placeForeground(fg, geom, sx);

  // bulut örtüsü: yıldızlar alçak bulutların ARKASINDA kalır (katman sırası) + yoğun bulutta soluklaşır, tamamen kaybolmaz
  const so = Math.max(0.45, 1 - 0.45 * Math.max(engine.weather.cloud, engine.weather.precip)).toFixed(2);
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

  // deniz selamı: ana ekranda ~3 dk KALINIRSA gelir; sonrasında ancak 8–12 dk daha kalınırsa gösterir
  const overlayOpen = Boolean(app.querySelector('.sheet,.page,.board,.watch,.auth,.cdpage'));
  if (home?.isConnected && inHome && starsShown && !overlayOpen && document.visibilityState === 'visible') {
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
  core.scrollX = drag.sx - dx;
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
  if (!isSupabaseConfigured) return;
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

/** Tek kalıcı Realtime aboneliği: kimlik doğrulama biter bitmez kurulur; ekran değişince yeniden kurulmaz. */
function ensureRealtimeStarted() {
  if (!isSupabaseConfigured) return;
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
        showLive('left', { star: stNew });
        core.lastInsertLatencyMs = Math.round((performance.now() - tRecv) * 100) / 100;
        core.refreshHome();

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
    return state.settings.faceId ? 'lock' : 'home';
  }
  const { session, networkFailed } = await getSessionFast();
  if (session?.user?.email) {
    const inferred = inferWhoFromEmail(session.user.email);
    if (inferred) setMe(toUiWho(inferred));
  }
  if (!session && !networkFailed) return 'auth';
  if (!hasKey) return 'auth';
  return state.settings.faceId ? 'lock' : 'home';
}

async function enterHome(preloaded = false, fadeDelay = 150) {
  ensureRealtimeStarted();
  if (!preloaded) {
    await loadStarsFromBackend();
  }
  if (fgPersona !== state.me || !fg) {
    fgPersona = state.me;
    rebuildFg();
  }
  // Animasyonun ÜSTÜNE hiçbir şey binmez: selam yazısı, kaydırma ipucu, tek tek kayan sayaç/dock, açılan zambak, yanıp sönen yıldız YOK.
  // Arayüz (sayaç, hava, dock, zambak) kamera yerleşirken TEK parça hâlinde, sade bir solmayla görünür.
  $('#fgWrap').classList.remove('pre');
  [...document.querySelectorAll('#fgWrap .jar.mine')].forEach((j) =>
    (j as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: fadeDelay, easing: 'ease-out', fill: 'backwards' })
  );

  home = buildHome();
  app.appendChild(home);
  inHome = true;

  hint = new SwipeHint(home, PEOPLE[state.me].color); // yalnızca kullanıcı kaydırınca görünür
  prog();
  home.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: fadeDelay, easing: 'ease-out', fill: 'backwards' });

  starsShown = true;
  for (const t of state.stars) t.visible = true; // yıldızlar hazır yerinde
  core.refreshHome();
  void syncOfflineAndOutbox();

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

const urlQuery = new URLSearchParams(location.search);

async function boot(mode?: 'auth' | 'lock' | 'home') {
  // Ayarlar → "Face ID ile aç" kapalıysa kilit ekranı hiç gelmez: oturum açıksa doğrudan ana ekran (iPhone'un kendi kilidi korur).
  if (mode === 'lock' && !state.settings.faceId && !faceAuth.sim) mode = 'home';
  clearPageStack();
  $$('.screen.home,.auth,.page,.sheet,.backdrop,.board,.watch,.cdpage,.scene-fg,.island-pop').forEach((x) => x.remove());
  core.homeEl = null as unknown as HTMLElement;
  home = null;
  inHome = false;
  starsShown = false;
  oceanDwell = 0;

  document.getElementById('boot')?.remove(); // lacivert pozlama/bekleme katmanı YOK: sahne ilk andan görünür
  const overlay = document.createElement('div'); // yalnızca playIntro imzası için; ekrana eklenmez
  sky.intro.stars = [0, 0, 0];

  applyPersona();
  fgPersona = state.me;
  rebuildFg();
  $('#fgWrap').classList.add('pre');

  const sessionTask = (async () => {
    let resolved = mode ?? (await resolveBootMode());
    if (resolved === 'lock' && !state.settings.faceId && !faceAuth.sim) resolved = 'home';
    applyPersona();
    if (resolved === 'home' || resolved === 'lock') {
      ensureRealtimeStarted();
    }
    if (resolved === 'home') {
      await loadStarsFromBackend();
    }
    return resolved;
  })();

  const ready = new Promise<void>((r) => {
    const c = () => (sky.ready ? r() : setTimeout(c, 30));
    c();
  });
  app.style.visibility = 'hidden'; // yarım çizilmiş kare görünmesin (sahne hazır olunca animasyonla birlikte açılır)
  await ready;
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));

  // Üst boşluk dolgusu: gökyüzü atmosferinin en üst satırı + 2B grenle dikişsiz doldurulur; intro bitince temizlenir.
  const capH = Math.ceil(H * 0.46);
  const capDpr = Math.min(devicePixelRatio || 1, 1.5);
  const skyCap = document.createElement('canvas');
  skyCap.width = Math.round(W * capDpr);
  skyCap.height = Math.round((capH + 2) * capDpr);
  skyCap.style.cssText = `position:absolute;left:0;top:${-capH}px;width:${W}px;height:${capH + 2}px;pointer-events:none`;
  $('#skyWrap').prepend(skyCap);
  const capCtx = skyCap.getContext('2d')!;
  capCtx.scale(capDpr, capDpr);
  const follow = (until: number) => {
    try {
      sky.drawCap(capCtx, W, capH + 2, core.scrollX);
    } catch {
      // Ignore transient draw error
    }
    if (performance.now() < until) requestAnimationFrame(() => follow(until));
    else skyCap.remove();
  };
  follow(performance.now() + 3600);
  app.style.visibility = ''; // gökyüzü ilk karesini çizer çizmez başlar; font/ısınma beklemesi YOK (fontlar gömülü)

  let first = true;
  try {
    first = !localStorage.getItem('gk.seen') || urlQuery.get('intro') === 'full';
    localStorage.setItem('gk.seen', '1');
  } catch {
    // Ignore storage errors
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introKind: 'full' | 'short' = first && !reduced ? 'full' : 'short';
  const introK = introKind === 'short' ? 0.45 : 1;
  $('#fgWrap').animate([{ transform: `translate3d(0,${Math.round(H * 0.62)}px,0)` }, { transform: 'none' }], {
    duration: 3200 * introK,
    easing: 'cubic-bezier(.25,.1,.12,1)',
  });
  const reveal = playIntro(
    { overlay, sky: $('#skyWrap'), ground: $('#groundWrap'), setStars: (a, b, c) => (sky.intro.stars = [a, b, c]) },
    introKind
  );

  const resolved = await sessionTask;
  if (resolved === 'home') {
    await enterHome(true, Math.round(1500 * introK));
    await reveal;
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

// ---------- Test paneli (Ayarlar → Uygulama → Test paneli): YALNIZCA bu telefonda görsel simülasyon ----------
const PRE: Record<WeatherKind, [number, number, number, number, number]> = {
  clear: [0, 0, 0.1, 15000, 0], partly: [2, 35, 0.2, 15000, 0], cloudy: [3, 70, 0.3, 12000, 0], overcast: [3, 98, 0.3, 9000, 0],
  fog: [45, 60, 0.05, 400, 0], drizzle: [53, 90, 0.2, 6000, 0.25], rain: [63, 95, 0.35, 5000, 0.6], heavyRain: [65, 100, 0.6, 2500, 0.95],
  showers: [81, 80, 0.45, 6000, 0.6], snow: [73, 95, 0.15, 3000, 0.55], heavySnow: [75, 100, 0.4, 900, 0.9], sleet: [67, 100, 0.3, 3000, 0.55], thunder: [95, 100, 0.7, 3000, 0.95],
};

function applyWxKind(kk: WeatherKind) {
  wxOverridden = true;
  const [code, cloud, wnd, vis, precip] = PRE[kk];
  const wx: Weather = {
    kind: kindFromCode(code, cloud / 100),
    cloud: cloud / 100,
    precip,
    wind: wnd,
    windSign: -1,
    fog: vis < 1000 ? 0.85 : 0,
    temp: [13, 16, 12, 11, 9, 10, 9, 8, 10, 1, -1, 2, 11][Object.keys(PRE).indexOf(kk)],
    ts: Date.now(),
  };
  engine.setWeather(wx, 3000);
  weatherRenderer.setWeather(wx);
  if (state.settings.weather === 'off') state.settings.weather = 'geo';
  core.refreshHome();
}

function setHourOverride(hh: number | null) {
  if (hh === null) {
    engine.timeOverride = null;
    engine.retarget(1200);
    return;
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + hh * 3600_000);
  engine.timeOverride = d;
  engine.retarget(600);
}

async function partnerSends() {
  if (!home || !inHome) return;
  partnerOnline(true);
  showLive('writing');
  await sleep(3200);
  if (!inHome) return;
  showLive('sending');
  await sleep(1600);
  if (!inHome) return;
  const spot = freeSpot();
  const s: Star = {
    id: 'sim-p-' + Date.now(),
    from: state.partner,
    kind: 'text',
    text: 'Şu an gökyüzümüze bakıyorum, sen de bak.',
    createdAt: Date.now(),
    opened: false,
    x: mod(spot.x + core.scrollX, P),
    y: spot.y,
    visible: false,
  };
  state.stars.push(s);
  engine.busy(2600);
  fx.incoming(spot, {
    now: performance.now(),
    tint: PEOPLE[state.partner].color,
    onSettle: () => {
      s.visible = true;
      s.arrivedAt = performance.now();
    },
  });
  showLive('left', { star: s });
  core.refreshHome();
}

async function partnerDraws() {
  if (!home || !inHome) return;
  partnerOnline(true);
  const simStrokes = demoDrawing();
  const landDrawing = () => {
    const spot = freeSpot();
    const s: Star = {
      id: 'sim-d-' + Date.now(),
      from: state.partner,
      kind: 'draw',
      draw: simStrokes,
      createdAt: Date.now(),
      opened: false,
      x: mod(spot.x + core.scrollX, P),
      y: spot.y,
      visible: false,
    };
    state.stars.push(s);
    fx.land(spot, {
      now: performance.now(),
      tint: PEOPLE[state.partner].color,
      onSettle: () => {
        s.visible = true;
        s.arrivedAt = performance.now();
      },
    });
    engine.busy(1500);
    showLive('left', { star: s });
    core.refreshHome();
  };
  showLive('drawing', { onWatch: () => openWatch(() => landDrawing(), simStrokes) });
}

function showWhale() {
  beach.whale.start(performance.now(), core.scrollX, W);
  engine.busy(1000);
}

function offlineToast() {
  const b = h(`<div class="offline toast glass-strong" style="top:calc(var(--safe-t) + 6px);bottom:auto">${I.cloud(14)}<span>Çevrimdışı · yıldızların bağlantı gelince gidecek</span></div>`);
  app.appendChild(b);
  b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  setTimeout(() => b.remove(), 3500);
}

core.test = {
  weatherKinds: (Object.keys(PRE) as WeatherKind[]).map((k) => ({ k, label: KIND_TR[k] })),
  setWeather: (k) => {
    if (k) applyWxKind(k as WeatherKind);
    else core.reloadWeather();
  },
  setHour: (hh) => setHourOverride(hh),
  hourNow: () => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  },
  get groups() {
    return [
      {
        title: 'Açılış ve giriş',
        items: [
          {
            label: 'Açılış animasyonu (ilk açılış)',
            leave: true,
            run: () => {
              try { localStorage.removeItem('gk.seen'); } catch {}
              void boot('home');
            },
          },
          {
            label: 'Açılış animasyonu (tekrar açılış)',
            leave: true,
            run: () => {
              try { localStorage.setItem('gk.seen', '1'); } catch {}
              void boot('home');
            },
          },
          {
            label: 'Face ID kilidi',
            leave: true,
            run: () => {
              faceAuth.sim = 'ok';
              void boot('lock');
              setTimeout(() => { faceAuth.sim = null; }, 4500);
            },
          },
          {
            label: 'Face ID okuyamazsa → şifre',
            leave: true,
            run: () => {
              faceAuth.sim = 'fail';
              void boot('lock');
              setTimeout(() => { faceAuth.sim = null; }, 4500);
            },
          },
          {
            label: 'İlk kurulum (giriş akışı)',
            leave: true,
            run: () => void boot('auth'),
          },
        ],
      },
      {
        title: `${PEOPLE[state.partner].name} (canlı)`,
        items: [
          { label: 'Yazıyor → yıldız bırakır', leave: true, run: () => void partnerSends() },
          { label: 'Çiziyor → canlı izle', leave: true, run: () => void partnerDraws() },
          {
            label: 'Uygulamaya girdi / çıktı (mum)',
            leave: true,
            run: () => {
              const on = !document.querySelector('.jar.partner.on');
              partnerOnline(on);
            },
          },
          {
            label: 'Mumdan kalp gönderir',
            leave: true,
            run: () => {
              if (!home) return;
              partnerOnline(true);
              sendHeart(true);
              toast(`${PEOPLE[state.partner].name} sana bir kalp gönderdi · sen de mumuna dokun`, I.heartFill(14), 3400);
            },
          },
        ],
      },
      {
        title: 'Gökyüzü ve deniz',
        items: [
          {
            label: 'Deniz selamı (seni seviyorum)',
            leave: true,
            run: () => {
              ocean.resetCooldown();
              ocean.start(performance.now(), core.scrollX);
              engine.busy(1000);
            },
          },
          { label: 'Balina', leave: true, run: () => showWhale() },
          { label: 'Uyuyan Kadın dağına git', leave: true, run: () => core.scrollTo(X0 + 400 - W / 2, 1600) },
          { label: 'Uçak', leave: true, run: () => void plane.launch() },
          {
            label: 'Meteor',
            leave: true,
            run: () => {
              fx.decorative(performance.now());
              engine.busy(1200);
            },
          },
          { label: 'Kaydırma ipucu', leave: true, run: () => firstRunNudge(true) },
          { label: 'Çevrimdışı uyarısı', leave: true, run: offlineToast },
        ],
      },
    ];
  },
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
    const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    void syncOfflineAndOutbox();
    if (inHome && awayMs >= BACKGROUND_LOCK_MS && state.settings.faceId && hasBiometric()) {
      inHome = false;
      runLock(app, () => {
        inHome = true;
      });
    }
  }
});

// resize + pageshow + orientationchange: canvas boyutları getBoundingClientRect() / clientHeight'tan yeniden ölçülür
const resizeScene = () => {
  if (document.documentElement.classList.contains('kb-open')) return;
  const { w: nw, h: nh } = measureApp();
  if (nw <= 0 || nh <= 0 || (nw === W && nh === H)) return;
  W = nw;
  H = nh;
  geom.W = W;
  Object.assign(core, { W, H });
  cv('cSky', 1.5);
  cv('cWBack', 1.5);
  cv('cStars', 1.5);
  cv('cWFront', 1.5);
  cv('cGround', 1.5, 96);
  cv('cOcean', 1.5);
  cv('cFx', 1.5);
  fx.view.w = W;
  fx.view.h = H;
  beach.resize(W, H);
  if (fg) rebuildFg();
};
window.addEventListener('resize', resizeScene);
window.addEventListener('pageshow', resizeScene);
window.addEventListener('orientationchange', () => setTimeout(resizeScene, 250));
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(resizeScene).observe(app);
}

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
