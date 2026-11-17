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
import { initKeyboard } from '../gokyuzu/keyboard';
import { startWeather } from '../gokyuzu/weather';
import { core } from './core';
import { initUI, $, toast } from './ui';
import { state, PEOPLE } from './state';
import { I } from './icons';
import { registerServiceWorker } from '../lib/pwa';

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
sky.moonTint = state.me === 'beto' ? [1.0, 0.94, 0.82] : null;
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
app.dataset.me = state.me;
document.documentElement.style.setProperty('--me', PEOPLE[state.me].color);
document.documentElement.style.setProperty('--partner', PEOPLE[state.partner].color);

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

engine.start();
