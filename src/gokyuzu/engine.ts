// Tek rAF döngüsü + kare hızı politikası + sekme gizliyken durma + gökyüzü güncelleme + Düşük Güç tespiti.
import { SkyAnimator, skyState, applyCssVars, SkyState } from './skyState';
import { Weather, CLEAR } from './weather';
import { SkyGeom } from './skyGeom';

export type Loc = { lat: number; lon: number };

export class Engine {
  private subs: ((now: number, dt: number, sky: SkyState) => void)[] = [];
  private last = 0;
  private raf = 0;
  private lastInteraction = performance.now();
  private busyUntil = 0;
  private skyTimer = 0;
  private cssT = 0;
  private lowStreak = 0;
  sky: SkyAnimator;
  weather: Weather = CLEAR;
  timeOverride: Date | null = null;
  /** Yeni hedef durum: gökyüzü/bulut dokularını iste (skyRender.request, weather.setWeather) */
  onTarget?: (s: SkyState, ms: number) => void;
  /** CSS renkleri için gök dokusundan örnek (skyRender.sampleColors) */
  sampleSky?: () => { top: string; mid: string; hor: string } | null;
  /** Düşük Güç tespiti (fps <= 32 -> true) */
  onLowPower?: (low: boolean) => void;
  lowPower = false;
  /** Sayfa/sheet açıkken arka planı seyrelt: kareler arası en az bu kadar ms (0 = kapalı) */
  throttle = 0;
  stats = { fps: 0, slow: 0, frames: 0, longTasks: 0 };
  private fpsAcc = 0; private fpsN = 0;

  constructor(private loc: () => Loc, public geom: SkyGeom) {
    this.sky = new SkyAnimator(skyState(this.now(), loc(), geom, this.weather));
    document.addEventListener('visibilitychange', this.onVis);
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
      addEventListener(ev, () => (this.lastInteraction = performance.now()), { passive: true });
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const obs = new PerformanceObserver((list) => {
          if (!document.hidden) this.stats.longTasks += list.getEntries().length;
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch {
        // Desteklemeyen tarayıcılarda sessizce geç
      }
    }
  }

  now() { return this.timeOverride ?? new Date(); }
  add(fn: (now: number, dt: number, sky: SkyState) => void) { this.subs.push(fn); }
  busy(ms: number) { this.busyUntil = Math.max(this.busyUntil, performance.now() + ms); }
  resetStats() { this.stats.slow = 0; this.stats.frames = 0; this.stats.longTasks = 0; }

  setWeather(w: Weather, ms = 4000) { this.weather = w; this.retarget(ms); }

  retarget(ms = 2500) {
    const t = skyState(this.now(), this.loc(), this.geom, this.weather);
    this.sky.setTarget(t, ms);
    this.onTarget?.(t, ms);
  }

  start() {
    if (this.raf) cancelAnimationFrame(this.raf);
    clearInterval(this.skyTimer);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.skyTimer = window.setInterval(() => this.retarget(2500), 30_000);
    this.retarget(0);
  }
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearInterval(this.skyTimer);
  }
  private onVis = () => {
    if (document.hidden) this.stop();
    else { this.start(); this.retarget(1500); }
  };

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const idleFor = now - this.lastInteraction;
    const busy = now < this.busyUntil || idleFor < 1500;
    // Boşta 30 fps; 20 sn dokunulmazsa ~20 fps. Meşgulken (kaydırma/animasyon) her kare.
    const minGap = Math.max(this.throttle, busy ? 0 : idleFor > 20000 ? 48 : 31);
    if (now - this.last < minGap) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.fpsAcc += now - this.last; this.fpsN++;
    if (busy && now - this.last > 25) this.stats.slow++;
    this.stats.frames++;
    if (this.fpsAcc > 1000) {
      this.stats.fps = Math.round((this.fpsN * 1000) / this.fpsAcc);
      this.fpsAcc = 0; this.fpsN = 0;
      if (busy) {
        if (this.stats.fps > 0 && this.stats.fps <= 32) {
          this.lowStreak++;
          if (this.lowStreak >= 2 && !this.lowPower) {
            this.lowPower = true;
            this.onLowPower?.(true);
          }
        } else if (this.stats.fps >= 46) {
          this.lowStreak = 0;
          if (this.lowPower) {
            this.lowPower = false;
            this.onLowPower?.(false);
          }
        }
      }
    }
    this.last = now;

    this.sky.tick(now);
    // CSS değişkenleri: geçiş sırasında ~8 kez/sn yeter (layout yok, sadece değişken)
    if (now - this.cssT > 120) { this.cssT = now; applyCssVars(this.sky.current, this.sampleSky?.() ?? null); }
    for (const s of this.subs) s(now, dt, this.sky.current);
  };
}
