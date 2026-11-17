import './fonts';
import './style.css';
import './screens.css';

import { Engine } from '../gokyuzu/engine';
import { makeGeom, skyToScreen } from '../gokyuzu/skyGeom';
import { defaultLocation } from '../gokyuzu/astro';
import { SkyWorker } from '../gokyuzu/workerClient';
import { SkyRenderer } from '../gokyuzu/skyRender';
import { WeatherRenderer } from '../gokyuzu/weatherRender';
import { Effects, drawUserStar } from '../gokyuzu/effects';
import { Plane, schedulePlane } from '../gokyuzu/plane';
import { SwipeHint } from '../gokyuzu/swipeHint';
import { prepare, playIntro, introMode } from '../gokyuzu/intro';
import { initKeyboard } from '../gokyuzu/keyboard';
import { startWeather } from '../gokyuzu/weather';
import { Beach } from './beach';
import { PALM_CSS } from './palm';
import { ART_CSS } from './art';
import { LILY_CSS } from './lily';
import { Wind } from './wind';
import { core } from './core';
import { initUI, $, $$, h, toast, stagger, sleep, clearPageStack, closeIsland, island } from './ui';
import { state, PEOPLE, Star, Kind, setMe, toUiWho, toDbWho } from './state';
import { buildHome, buildForeground, showLive, sendHeart, partnerOnline } from './home';
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
import { fetchAllStars, getServerNowMs, subscribeStarsRealtime, markStarUnlockNotified } from '../lib/stars';
import { PairRealtime } from '../lib/realtime';
import { isStarHazel } from '../lib/hazel';
import type { StarRecord } from '../types';

void registerServiceWorker();

const app = document.getElementById('app')!;
const st = document.createElement('style');
st.textContent = ART_CSS + PALM_CSS + LILY_CSS + '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(st);
initUI(app);

const W = Math.max(320, app.clientWidth || window.innerWidth);
const H = Math.max(540, app.clientHeight || window.innerHeight);
const HORIZON = Math.round(H * (600 / 844));
const SKY_W = Math.round(W * 2.2);
Object.assign(core, { W, H, skyW: SKY_W, horizonY: HORIZON });

app.insertAdjacentHTML('afterbegin', `
  <div id="skyWrap" class="layer"><canvas id="cSky"></canvas><canvas id="cWBack"></canvas><div id="planeHost" class="layer" style="pointer-events:none"></div><canvas id="cWFront"></canvas></div>
  <div id="groundWrap" class="layer" style="pointer-events:none"><canvas id="cGround"></canvas></div>
  <canvas id="cStars"></canvas><canvas id="cFx"></canvas>
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

const geom = makeGeom(W, HORIZON, SKY_W);
const worker = new SkyWorker();
const engine = new Engine(defaultLocation, geom);
const sky = new SkyRenderer(cv('cSky', 1.5), geom, worker);
const weatherRenderer = new WeatherRenderer(worker, cv('cWBack', 1.5), cv('cWFront', 1.5), $('#flash'), geom, engine.weather);
weatherRenderer.lightningEnabled = state.settings.lightning;
const beach = new Beach(cv('cGround', 2, 6), { W, H, horizonY: HORIZON, skyW: SKY_W });
const skyCanvas = document.getElementById('cSky') as HTMLCanvasElement;
let fg: HTMLElement | null = null;
const wind = new Wind();
const fx = new Effects(cv('cFx'), { w: W, h: H });
fx.flashEl = $('#flash');
const starsCtx = cv('cStars');

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

Object.assign(core, {
  engine,
  fx,
  sky,
  weatherRenderer,
  worker,
  plane,
  geom,
  openCompose,
  openArchive,
  openSettings,
  openCountdown,
  openStar: (st: Star) => void openStar(st),
  openBoard: (existing?: unknown[] | null) => openBoard((existing as Stroke[] | null) ?? null),
  renderDrawingPreview: (cvEl: HTMLCanvasElement, strokes: unknown[], upTo?: number) =>
    renderDrawing(cvEl, strokes as Stroke[], 1, upTo ?? Infinity),
  encodeDrawing: (strokes: unknown[]) => encodeDrawingBytes(strokes as Stroke[]),
  decodeDrawing: (bytes: Uint8Array<ArrayBuffer>) => decodeDrawingBytes(bytes),
  sendDrawPacket: (pkt: DrawLivePacket) => void pairRealtime.sendDrawPacket(pkt),
  onDrawPacket: (cb: (pkt: DrawLivePacket) => void) => pairRealtime.onDrawPacket(cb),
  onSendHeart: () => pairRealtime.sendHeart(),
  setMyLiveActivity: (act: 'writing' | 'sending' | 'drawing' | 'photo' | 'voice' | 'idle') =>
    pairRealtime.setMyActivity(act),
});
core.scrollX = (SKY_W - W) / 2;
applyPersona();

initKeyboard({
  hideWhenOpen: () => [...app.querySelectorAll<HTMLElement>('.dock, .gk-cons, .gk-edge, .gk-hint-txt')],
});

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
let fgX = NaN;
let nextMeteor = performance.now() + 30_000;

engine.add((now, dt, s) => {
  const sx = core.scrollX;
  sky.frame(now, s, sx);
  weatherRenderer.frame(now, dt, s, sx);
  tickPlane(now);
  const css = getComputedStyle(document.documentElement);
  updateFlora(s.daylight);
  wind.strength = engine.weather.wind;
  wind.frame(dt);

  const glints: { x: number; k: number; warm: boolean }[] = [];
  if (s.moonAlpha > 0.02) {
    glints.push({ x: skyToScreen(geom, s.moonDisp, s.moonVaz, sx).x, k: s.moonAlpha * s.phase.fraction * (1 - s.daylight) * 0.9, warm: false });
  }
  if (s.sunAlpha > 0.02) {
    glints.push({ x: skyToScreen(geom, s.sunDisp, s.sunVaz, sx).x, k: s.sunAlpha * (0.35 + 0.65 * (1 - Math.min(1, s.sunAlt / 25))), warm: s.sunAlt < 12 });
  }
  if (fg) {
    for (const l of fg.querySelectorAll('.lantern')) {
      if (l.classList.contains('partner') && !l.classList.contains('on')) continue;
      glints.push({ x: parseFloat((l as HTMLElement).style.left) - sx, k: 0.42 * (1 - s.daylight) + 0.05, warm: true });
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

  if (fg && fgX !== Math.round(sx * 10)) {
    fgX = Math.round(sx * 10);
    fg.style.transform = `translate3d(${-sx}px,0,0)`;
  }

  starsCtx.clearRect(0, 0, W, H);
  if (starsShown) {
    const srvNow = getServerNowMs();
    for (const t of state.stars) {
      if (!t.visible) continue;
      const x = t.x - sx;
      if (x < -30 || x > W + 30) continue;
      const unread = t.from === state.partner && !t.opened && !(t.unlockAt && t.unlockAt > srvNow);
      drawUserStar(starsCtx, x, t.y, t.id, now, {
        tint: PEOPLE[t.from].color,
        daylight: s.daylight,
        arrivedAt: t.arrivedAt,
        unread,
        hazel: t.hazel,
      });
    }
  }

  if (fx.frame(now, dt)) engine.busy(200);
  if (now > nextMeteor) {
    if (s.starVis[1] > 0.6 && engine.weather.cloud < 0.4) fx.decorative(now);
    nextMeteor = now + 40_000 + Math.random() * 60_000;
  }
});

// ---------- gökyüzü: sürükle (kaydır) + dokun (yıldız aç) ----------
const maxScroll = SKY_W - W;
let anim = 0;
let hint: SwipeHint | null = null;
const prog = () => hint?.setProgress(Math.max(0, Math.min(1, core.scrollX / maxScroll)));

core.scrollTo = (x, ms = 600) => {
  cancelAnimationFrame(anim);
  const from = core.scrollX, to = Math.max(0, Math.min(maxScroll, x)), t0 = performance.now();
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
  let x = drag.sx - dx;
  if (x < 0) x = x / 3;
  if (x > maxScroll) x = maxScroll + (x - maxScroll) / 3;
  core.scrollX = x;
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
  const x = e.clientX - r.left + core.scrollX, y = e.clientY - r.top;
  let best: Star | null = null, bd = 30;
  for (const t of state.stars) {
    if (!t.visible) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) {
    fx.land({ x: best.x - core.scrollX, y: best.y }, { now: performance.now() - 700, tint: PEOPLE[best.from].color });
    engine.busy(800);
    const chosen = best;
    setTimeout(() => core.openStar(chosen), 120);
  }
}

// ---------- Supabase StarRecord -> UI Star dönüşümü ----------
export function mapRecordToStar(rec: StarRecord, allRecords: StarRecord[], visible = true): Star {
  const kind: Kind =
    rec.kind === 'photo' ? 'photo' : rec.kind === 'voice' ? 'voice' : rec.kind === 'draw' ? 'draw' : 'text';
  const x = Math.max(24, Math.min(SKY_W - 24, (rec.x / 100) * SKY_W));
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
  const records = await fetchAllStars(toDbWho(state.me));
  state.stars = records.map((r) => mapRecordToStar(r, records, false));
}

// ---------- açılış + giriş + ana ekran ----------
let inHome = false;

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

async function enterHome() {
  await loadStarsFromBackend();
  // Kişiye göre ön plan fenerlerini güncelle
  $('#fgWrap').innerHTML = '';
  fg = buildForeground(SKY_W, H, beach.shoreY);
  $('#fgWrap').appendChild(fg);
  wind.attach(fg);
  $('#fgWrap').classList.remove('pre');
  fgX = NaN;

  [...document.querySelectorAll('#fgWrap .jar.mine')].forEach((j) =>
    (j as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 400, easing: 'ease-out', fill: 'backwards' })
  );
  const home = buildHome();
  app.appendChild(home);
  inHome = true;

  hint = new SwipeHint(home, PEOPLE[state.me].color);
  prog();
  firstRunNudge();
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
      fx.land({ x: t.x - core.scrollX, y: t.y }, { now: performance.now() - 650, tint: PEOPLE[t.from].color, onSettle: () => (t.visible = true) });
      engine.busy(1500);
    }, 300 + i * 90)
  );
  core.refreshHome();

  // Özel Realtime kanalları ve yıldız INSERT/UPDATE aboneliği
  pairRealtime.start(toDbWho(state.me));
  stopStarsRealtime?.();
  stopStarsRealtime = subscribeStarsRealtime(toDbWho(state.me), {
    onInsert: (rec) => {
      if (state.stars.some((s) => s.id === rec.id)) return;
      const allRecs = [...(state.stars.map((s) => s.raw).filter(Boolean) as StarRecord[]), rec];
      const stNew = mapRecordToStar(rec, allRecs, false);
      state.stars.push(stNew);
      if (stNew.from === state.partner) {
        if (stNew.x < core.scrollX + 24 || stNew.x > core.scrollX + W - 24) {
          core.scrollTo(stNew.x - W / 2, 550);
        }
        const screenSpot = { x: Math.max(36, Math.min(W - 36, stNew.x - core.scrollX)), y: stNew.y };
        engine.busy(2600);
        fx.incoming(screenSpot, {
          now: performance.now(),
          tint: PEOPLE[state.partner].color,
          onSettle: () => {
            stNew.visible = true;
            stNew.arrivedAt = performance.now();
          },
        });
        setTimeout(() => {
          showLive('left', { star: stNew });
          core.refreshHome();
        }, 1250);
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
  const resolved = mode ?? (await resolveBootMode());
  applyPersona();
  clearPageStack();
  $$('.screen.home,.auth,.page,.sheet,.backdrop,.board,.watch,.cdpage,.scene-fg,.island-pop').forEach((x) => x.remove());
  core.homeEl = null as unknown as HTMLElement;
  inHome = false;
  fg = buildForeground(SKY_W, H, beach.shoreY);
  $('#fgWrap').innerHTML = '';
  $('#fgWrap').appendChild(fg);
  wind.attach(fg);
  $('#fgWrap').classList.add('pre');
  fgX = NaN;
  starsShown = false;

  const overlay = h(`<div class="layer" style="background:#05070d;z-index:90"></div>`);
  app.appendChild(overlay);
  sky.intro.stars = [0, 0, 0];
  const ready = new Promise<void>((r) => {
    const c = () => (sky.ready ? r() : setTimeout(c, 30));
    c();
  });
  await prepare([ready], ['italic 600 40px "Cormorant Garamond"', '500 15px "Inter"']);
  $('#fgWrap').animate([{ transform: 'translate3d(0,90px,0)' }, { transform: 'none' }], { duration: 2800, easing: 'cubic-bezier(.25,.1,.12,1)' });
  const reveal = playIntro(
    { overlay, sky: $('#skyWrap'), ground: $('#groundWrap'), setStars: (a, b, c) => (sky.intro.stars = [a, b, c]) },
    introMode()
  );
  if (resolved === 'home') {
    await reveal;
    await enterHome();
    return;
  }
  await sleep(900);
  const after = () => void enterHome();
  if (resolved === 'lock') runLock(app, after);
  else runAuth(app, after);
}

core.logout = async () => {
  pairRealtime.stop();
  stopStarsRealtime?.();
  stopStarsRealtime = null;
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
  } else if (inHome && hiddenAt && Date.now() - hiddenAt >= BACKGROUND_LOCK_MS && state.settings.faceId && hasBiometric()) {
    hiddenAt = 0;
    inHome = false;
    runLock(app, () => {
      inHome = true;
    });
  }
});

engine.start();
void boot();
