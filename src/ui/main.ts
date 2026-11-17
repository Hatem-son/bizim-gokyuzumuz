import './fonts';
import './style.css';
import './screens.css';

import { Engine } from '../gokyuzu/engine';
import { makeGeom } from '../gokyuzu/skyGeom';
import { defaultLocation } from '../gokyuzu/astro';
import { SkyWorker } from '../gokyuzu/workerClient';
import { SkyRenderer } from '../gokyuzu/skyRender';
import { WeatherRenderer } from '../gokyuzu/weatherRender';
import { Effects } from '../gokyuzu/effects';
import { Plane, schedulePlane } from '../gokyuzu/plane';
import { prepare, playIntro, introMode } from '../gokyuzu/intro';
import { initKeyboard } from '../gokyuzu/keyboard';
import { startWeather } from '../gokyuzu/weather';
import { core } from './core';
import { initUI, $, $$, h, toast, sleep } from './ui';
import { state, setMe, toUiWho } from './state';
import { runAuth, runLock, applyPersona } from './auth';
import { I } from './icons';
import { registerServiceWorker } from '../lib/pwa';
import { isSupabaseConfigured, getSessionFast, inferWhoFromEmail } from '../lib/supabase';
import { loadSavedKey } from '../lib/crypto';
import { hasBiometric, BACKGROUND_LOCK_MS } from '../lib/lock';
import { STORAGE_KEYS, store } from '../lib/storage';

void registerServiceWorker();

const app = document.getElementById('app')!;
const st = document.createElement('style');
st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
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

Object.assign(core, { engine, fx, sky, weatherRenderer, worker, plane, geom });
core.scrollX = (SKY_W - W) / 2;
applyPersona();

initKeyboard({
  hideWhenOpen: () => [...app.querySelectorAll<HTMLElement>('.dock, .gk-cons, .gk-edge, .gk-hint-txt')],
});

engine.add((now, dt, s) => {
  const sx = core.scrollX;
  sky.frame(now, s, sx);
  weatherRenderer.frame(now, dt, s, sx);
  tickPlane(now);
  if (fx.frame(now, dt)) engine.busy(200);
});

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

let inHome = false;
async function boot(mode?: 'auth' | 'lock' | 'home') {
  const resolved = mode ?? (await resolveBootMode());
  applyPersona();
  $$('.screen.home,.auth,.page,.sheet,.backdrop,.board,.watch,.cdpage,.scene-fg,.island-pop').forEach((x) => x.remove());
  inHome = false;
  const overlay = h(`<div class="layer" style="background:#05070d;z-index:90"></div>`);
  app.appendChild(overlay);
  sky.intro.stars = [0, 0, 0];
  const ready = new Promise<void>((r) => {
    const c = () => (sky.ready ? r() : setTimeout(c, 30));
    c();
  });
  await prepare([ready], ['italic 600 40px "Cormorant Garamond"', '500 15px "Inter"']);
  const reveal = playIntro(
    { overlay, sky: $('#skyWrap'), ground: $('#groundWrap'), setStars: (a, b, c) => (sky.intro.stars = [a, b, c]) },
    introMode()
  );
  if (resolved === 'home') {
    await reveal;
    inHome = true;
    return;
  }
  await sleep(900);
  const after = () => {
    inHome = true;
  };
  if (resolved === 'lock') runLock(app, after);
  else runAuth(app, after);
}

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
