// Hava katmanları (sinematik):
//  • Bulutlar: iki perspektifli tabaka (yüksek: arka, alçak: ön). Worker'da üretilir, yavaşça kayar,
//    25 sn'de bir yeni konumla yeniden üretilip 6 sn'de çapraz soluşur (bulutlar şekil değiştirir).
//  • Yağmur: 3 derinlik katmanı + yağmur peçesi.
//  • Kar: 3 derinlik; yakın taneler büyük ve odak dışı.
//  • Sis: alçak bulut tabakası + ufuktan yükselen pus.
//  • Şimşek: bulut İÇTEN aydınlanır, düzensiz titreme; nadiren dallı yıldırım.
import { SkyState } from './skyState';
import { Weather } from './weather';
import { SkyGeom, drawWrapped } from './skyGeom';
import { SkyWorker } from './workerClient';
import { layersFor, CloudParams } from './cloudGen';
import { rng, clamp, lerp, reducedMotion } from './util';

type Tex = { img: CanvasImageSource; w: number; h: number };
type Layer = { cur: Tex | null; prev: Tex | null; t0: number; drift: number; prevDrift: number; ox: number; pending: boolean; key: string };
type P = { x: number; y: number; v: number; s: number; ph: number; on: boolean };

const CS = 3; // bulut dokusu 360°'yi 1/3 çözünürlükte kaplar (sarmalı, kesintisiz)

export class WeatherRenderer {
  private low: Layer = mkLayer();
  private high: Layer = mkLayer();
  private rain: P[][] = [[], [], []];
  private snow: P[][] = [[], [], []];
  private splash: { x: number; t: number }[] = [];
  private r = rng(42);
  private w: Weather;
  private eff = { rain: 0, snow: 0, fog: 0 };
  private shower = { on: true, until: 0 };
  private flash = { t: -1, next: 0, seq: [] as [number, number][], bolt: null as null | { pts: number[]; x: number } };
  private lastRegen = -Infinity;
  private veil: CanvasGradient | null = null;
  private veilKey = '';
  maxParticles = 320;
  lightningEnabled = true;

  constructor(
    private worker: SkyWorker,
    private back: CanvasRenderingContext2D,
    private front: CanvasRenderingContext2D,
    private flashEl: HTMLElement,
    public g: SkyGeom,
    initial: Weather,
  ) {
    this.w = initial;
    const sizes = [150, 80, 16];
    for (let l = 0; l < 3; l++) {
      for (let i = 0; i < sizes[l]; i++) this.rain[l].push({ x: 0, y: 0, v: 0, s: 0, ph: 0, on: false });
      for (let i = 0; i < [110, 60, 14][l]; i++) this.snow[l].push({ x: 0, y: 0, v: 0, s: 0, ph: 0, on: false });
    }
  }

  setWeather(w: Weather) { this.w = w; this.lastRegen = -Infinity; }

  private regen(s: SkyState, now: number) {
    const { low, high } = layersFor(this.w.kind, this.w.cloud, this.w.precip);
    const g = this.g;
    const texW = Math.round(g.panoW / CS);
    const texH = Math.round(g.horizonY / CS);
    const amb = ambient(s);
    const sunLight = s.sunAlt > -4 ? s.sunLight : ([0.05, 0.06, 0.09].map((v) => v * (0.3 + s.moonLight * 1.6)) as [number, number, number]);
    const evolve = now / 1000 / 400;
    for (const [L, par, seed] of [[this.low, low, 7], [this.high, high, 19]] as const) {
      if (L.pending) continue;
      if (par.coverage <= 0) { if (L.cur) { L.prev = L.cur; L.cur = null; L.t0 = now; } continue; }
      L.ox -= (this.w.windSign || 1) * (1.2 + this.w.wind * 5) * 25 * 5.2;
      const p: CloudParams = {
        w: texW, h: texH, pxPerDeg: texW / 360, horizonY: texH,
        centerX: texW / 2, ...par, seed, ox: L.ox, oz: 0, evolve,
        sunAlt: s.sunAlt, sunAz: s.sunVaz, sunColor: sunLight,
        ambTop: amb.top, ambHor: amb.hor, cityGlow: s.daylight < 0.3 ? s.cityGlow : 0,
      };
      L.pending = true;
      this.worker.run({ type: 'clouds', p }).then((t) => {
        L.pending = false;
        L.prev = L.cur; L.prevDrift = L.drift;
        L.cur = t; L.drift = 0; L.t0 = performance.now();
      });
    }
  }

  frame(now: number, dt: number, s: SkyState, scrollX: number) {
    const g = this.g, W = g.W, H = g.horizonY;
    const w = this.w, rm = reducedMotion();
    if (now - this.lastRegen > 25000) { this.lastRegen = now; this.regen(s, now); }
    const k = clamp(dt / 4);

    let showerMul = 1;
    if (w.kind === 'showers') {
      if (now > this.shower.until) {
        this.shower.on = !this.shower.on;
        this.shower.until = now + (this.shower.on ? 40 + this.r() * 50 : 20 + this.r() * 20) * 1000;
      }
      showerMul = this.shower.on ? 1 : 0;
    }
    const isSnow = w.kind === 'snow' || w.kind === 'heavySnow';
    this.eff.rain = lerp(this.eff.rain, isSnow ? 0 : w.precip * showerMul * (w.kind === 'sleet' ? 0.5 : 1), k);
    this.eff.snow = lerp(this.eff.snow, isSnow ? w.precip : w.kind === 'sleet' ? w.precip * 0.5 : 0, k);
    this.eff.fog = lerp(this.eff.fog, w.fog, k);

    const b = this.back, f = this.front;
    b.clearRect(0, 0, W, g.horizonY + 400);
    f.clearRect(0, 0, W, g.horizonY + 400);

    const cloudX = scrollX;
    const speed = (this.w.windSign || 1) * (1.2 + this.w.wind * 5) * (rm ? 0.3 : 1);
    this.drawLayer(b, this.high, now, dt, cloudX, speed * 0.5);
    this.drawLayer(f, this.low, now, dt, cloudX, speed);

    this.lightning(now, dt, f, cloudX, rm);

    if (this.eff.fog > 0.03) {
      const col = s.daylight > 0.4 ? '205,212,222' : '60,66,88';
      const gr = f.createLinearGradient(0, H, 0, H - g.pxPerDeg * 30);
      gr.addColorStop(0, `rgba(${col},${0.85 * this.eff.fog})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      f.fillStyle = gr;
      f.fillRect(0, H - g.pxPerDeg * 30, W, g.pxPerDeg * 30 + 2);
    }

    const precipNow = Math.max(this.eff.rain, this.eff.snow * 0.7);
    if (precipNow > 0.03) {
      const key = `${Math.round(s.daylight * 10)}`;
      if (key !== this.veilKey || !this.veil) {
        this.veilKey = key;
        const col = s.daylight > 0.4 ? '170,178,190' : '34,38,54';
        this.veil = f.createLinearGradient(0, 0, 0, H);
        this.veil.addColorStop(0, `rgba(${col},0.10)`);
        this.veil.addColorStop(1, `rgba(${col},0.42)`);
      }
      f.globalAlpha = precipNow;
      f.fillStyle = this.veil;
      f.fillRect(0, 0, W, H);
      f.globalAlpha = 1;
    }

    const budget = this.maxParticles * (rm ? 0.35 : 1);
    const wind = this.w.wind * (this.w.windSign || 1);
    const ang = wind * 0.32;
    const sx = Math.sin(ang), cy = Math.cos(ang);
    const rc = s.daylight > 0.4 ? '225,232,242' : '150,165,200';
    const RAIN = [
      { n: 150, len: [5, 9], w: 0.6, a: 0.22, v: 520 },
      { n: 80, len: [14, 22], w: 0.9, a: 0.26, v: 780 },
      { n: 16, len: [60, 95], w: 1.5, a: 0.09, v: 1350 },
    ];
    if (this.eff.rain > 0.01 || this.rain[0].some((p) => p.on)) {
      RAIN.forEach((cfg, l) => {
        const target = Math.round(Math.min(cfg.n, budget * (cfg.n / 246)) * this.eff.rain);
        f.strokeStyle = `rgba(${rc},${cfg.a})`;
        f.lineWidth = cfg.w;
        f.lineCap = 'round';
        f.beginPath();
        let on = 0;
        for (const p of this.rain[l]) {
          if (!p.on) { if (on < target) this.spawnRain(p, cfg, true); else continue; }
          on++;
          p.x += sx * p.v * dt; p.y += cy * p.v * dt;
          f.moveTo(p.x, p.y);
          f.lineTo(p.x - sx * p.s, p.y - cy * p.s);
          if (p.y - p.s > H) {
            if (l === 1 && this.splash.length < 14 && this.r() < 0.25) this.splash.push({ x: p.x, t: 0 });
            if (on <= target) this.spawnRain(p, cfg, false); else p.on = false;
          }
        }
        f.stroke();
      });
      f.fillStyle = `rgba(${rc},0.22)`;
      for (const sp of this.splash) {
        sp.t += dt / 0.18;
        f.globalAlpha = 1 - sp.t;
        f.fillRect(sp.x - 2 - sp.t * 3, H - 1.5, 4 + sp.t * 6, 1);
      }
      f.globalAlpha = 1;
      this.splash = this.splash.filter((p) => p.t < 1);
    }

    if (this.eff.snow > 0.01 || this.snow[0].some((p) => p.on)) {
      const SNOW = [
        { n: 110, r: [0.7, 1.2], a: 0.75, v: 26 },
        { n: 60, r: [1.4, 2.2], a: 0.8, v: 48 },
        { n: 14, r: [5, 9], a: 0.22, v: 110 },
      ];
      SNOW.forEach((cfg, l) => {
        const target = Math.round(cfg.n * this.eff.snow);
        let on = 0;
        for (const p of this.snow[l]) {
          if (!p.on) { if (on < target) this.spawnSnow(p, cfg, true); else continue; }
          on++;
          p.ph += dt * (0.6 + l * 0.3);
          p.x += (Math.sin(p.ph) * (8 + l * 10) + wind * 40) * dt;
          p.y += p.v * dt;
          if (l === 2) {
            const gr = f.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
            gr.addColorStop(0, `rgba(255,255,255,${cfg.a})`);
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            f.fillStyle = gr;
            f.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
          } else {
            f.globalAlpha = cfg.a;
            f.fillStyle = '#fff';
            f.beginPath(); f.arc(p.x, p.y, p.s, 0, 6.2832); f.fill();
            f.globalAlpha = 1;
          }
          if (p.y > H + 10) { if (on <= target) this.spawnSnow(p, cfg, false); else p.on = false; }
        }
      });
    }
  }

  private drawLayer(c: CanvasRenderingContext2D, L: Layer, now: number, dt: number, scrollX: number, speed: number) {
    const H = this.g.horizonY;
    L.drift += speed * dt;
    L.prevDrift += speed * dt;
    const k = L.cur ? clamp((now - L.t0) / 6000) : 1;
    if (L.prev && k < 1) {
      c.globalAlpha = L.cur ? 1 - k : clamp(1 - (now - L.t0) / 6000);
      drawWrapped(c, L.prev.img, this.g, scrollX, 0, H, L.prevDrift);
    }
    if (L.cur) {
      c.globalAlpha = k;
      drawWrapped(c, L.cur.img, this.g, scrollX, 0, H, L.drift);
    }
    c.globalAlpha = 1;
  }

  private lightning(now: number, dt: number, f: CanvasRenderingContext2D, cloudX: number, rm: boolean) {
    const F = this.flash;
    if (this.w.kind === 'thunder' && this.lightningEnabled && !rm) {
      if (!F.next) F.next = now + 6000 + this.r() * 12000;
      if (now > F.next && F.t < 0) {
        F.t = 0;
        F.next = now + Math.max(8000, 12000 + this.r() * 18000);
        const n = 2 + Math.floor(this.r() * 3);
        F.seq = [];
        let t = 0;
        for (let i = 0; i < n; i++) { t += 40 + this.r() * 110; F.seq.push([t, 0.45 + this.r() * 0.55]); }
        F.bolt = this.r() < 0.3 ? { pts: boltPath(this.r, this.g.horizonY), x: this.g.W * (0.15 + this.r() * 0.7) } : null;
      }
    }
    if (F.t < 0) return;
    F.t += dt * 1000;
    let a = 0;
    for (const [t, amp] of F.seq) {
      const d = F.t - t;
      if (d > -20 && d < 200) a = Math.max(a, amp * (d < 0 ? (d + 20) / 20 : Math.exp(-d / 60)));
    }
    if (a > 0.01 && this.low.cur) {
      f.globalCompositeOperation = 'lighter';
      f.globalAlpha = a * 0.9;
      drawWrapped(f, this.low.cur.img, this.g, cloudX, 0, this.g.horizonY, this.low.drift);
      f.globalCompositeOperation = 'source-over';
    }
    this.flashEl.style.opacity = (a * 0.18).toFixed(3);
    if (F.bolt && F.t < 240) {
      const bx = F.bolt.x, p = F.bolt.pts;
      const al = F.t < 140 ? 1 : 1 - (F.t - 140) / 100;
      for (const [lw, col] of [[7, `rgba(170,185,255,${0.12 * al})`], [2.6, `rgba(210,220,255,${0.45 * al})`], [1, `rgba(255,255,255,${al})`]] as const) {
        f.strokeStyle = col; f.lineWidth = lw; f.lineJoin = 'round';
        f.beginPath();
        for (let i = 0; i < p.length; i += 2) i ? f.lineTo(bx + p[i], p[i + 1]) : f.moveTo(bx + p[i], p[i + 1]);
        f.stroke();
      }
    }
    if (F.t > (F.seq[F.seq.length - 1]?.[0] ?? 0) + 400) { F.t = -1; this.flashEl.style.opacity = '0'; }
  }

  private spawnRain(p: P, cfg: { len: number[]; v: number }, anywhere: boolean) {
    p.on = true;
    p.x = this.r() * (this.g.W + 160) - 80;
    p.y = anywhere ? this.r() * this.g.horizonY : -this.r() * 80;
    p.s = lerp(cfg.len[0], cfg.len[1], this.r());
    p.v = cfg.v * (0.85 + this.r() * 0.3);
  }
  private spawnSnow(p: P, cfg: { r: number[]; v: number }, anywhere: boolean) {
    p.on = true;
    p.x = this.r() * this.g.W;
    p.y = anywhere ? this.r() * this.g.horizonY : -12;
    p.s = lerp(cfg.r[0], cfg.r[1], this.r());
    p.v = cfg.v * (0.8 + this.r() * 0.4);
    p.ph = this.r() * 6.28;
  }
}

function mkLayer(): Layer {
  return { cur: null, prev: null, t0: 0, drift: 0, prevDrift: 0, ox: 0, pending: false, key: '' };
}

function ambient(s: SkyState): { top: [number, number, number]; hor: [number, number, number] } {
  const day = s.daylight;
  const L = s.sunLight;
  const top: [number, number, number] = [
    lerp(0.006, 0.17, day) * (0.6 + 0.4 * L[0]), lerp(0.008, 0.24, day) * (0.7 + 0.3 * L[1]), lerp(0.022, 0.40, day),
  ];
  const hor: [number, number, number] = [
    lerp(0.012, 0.42, day) * (0.5 + 0.5 * L[0]), lerp(0.014, 0.44, day) * (0.6 + 0.4 * L[1]), lerp(0.03, 0.48, day) * (0.7 + 0.3 * L[2]),
  ];
  const moon = s.moonLight * 0.05;
  return {
    top: top.map((v) => v + moon) as [number, number, number],
    hor: hor.map((v) => v + moon) as [number, number, number],
  };
}

function boltPath(r: () => number, H: number): number[] {
  const pts: number[] = [0, H * 0.28];
  let x = 0, y = H * 0.28;
  while (y < H) {
    x += (r() - 0.5) * 22;
    y += 8 + r() * 16;
    pts.push(x, y);
  }
  return pts;
}
