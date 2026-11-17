// Gök katmanı: atmosfer dokusu (worker), samanyolu, yıldız alanı (gerçek parlaklık dağılımı ve renk
// sıcaklığı), kişisel yıldızlar, güneş diski, gerçekçi ay. Dokular iki yanda tam ekran genişliği kadar
// gerçek taşma payıyla (bleedX) üretilir ve ötesinde aynalı döşenir → sağa/sola ne kadar kaydırılırsa
// kaydırılsın dikişsiz, simetrisiz, pikselsiz sonsuz gökyüzü görünür.
import { SkyState } from './skyState';
import { SkyGeom, ALT_TOP, skyToScreen, CELESTIAL_PARALLAX } from './skyGeom';
import { SkyWorker } from './workerClient';
import { rng, lerp, clamp } from './util';

type Tex = { img: CanvasImageSource; w: number; h: number; data: Uint8ClampedArray };
type Star = { x: number; y: number; r: number; a: number; c: string; grp: 0 | 1 | 2; tw: number; ph: number };

const STAR_COLORS = ['#cdd9ff', '#e4ebff', '#ffffff', '#ffffff', '#fff5ea', '#ffe6cc', '#ffd2a8'];

/** Yatayda aynalı döşeme: kenar pikselleri kendisiyle eşleştiği için dikişsiz sonsuz devam eder. */
export function drawMirrorTiledX(
  c: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x0: number,
  y: number,
  tw: number,
  th: number,
  viewW: number,
) {
  if (tw <= 0) return;
  const kMin = Math.floor(-x0 / tw);
  const kMax = Math.ceil((viewW - x0) / tw) - 1;
  for (let k = kMin; k <= kMax; k++) {
    const dx = x0 + k * tw;
    if ((k & 1) === 0) {
      c.drawImage(img, dx, y, tw, th);
    } else {
      c.save();
      c.translate(dx + tw, y);
      c.scale(-1, 1);
      c.drawImage(img, 0, 0, tw, th);
      c.restore();
    }
  }
}

export class SkyRenderer {
  private atmo: { cur: Tex | null; prev: Tex | null; t0: number; dur: number } = { cur: null, prev: null, t0: 0, dur: 1 };
  private milkyTex: Tex | null = null;
  private moonTex: Tex | null = null;
  private moonKey = '';
  private stars: Star[] = [];
  private layers: HTMLCanvasElement[] = [];
  private bright: Star[] = [];
  private dither: CanvasPattern | null = null;
  private pending = false;
  private lastKey = '';
  private readonly bleedX: number;
  private readonly texW: number;
  /** açılış: yıldız grubu görünürlüğü çarpanı (0..1), sinematik pozlama */
  intro = { stars: [1, 1, 1] as number[] };
  moonTint: [number, number, number] | null = null;
  /** Gönderilen yıldızları doğrudan gök kubbe katmanında (Güneş ve Ay'ın arkasında) çizmek için kanca */
  onDrawUserStars?: (
    c: CanvasRenderingContext2D,
    now: number,
    s: SkyState,
    scrollX: number,
    moonPos: { x: number; y: number } | null,
  ) => void;

  constructor(private ctx: CanvasRenderingContext2D, public g: SkyGeom, private worker: SkyWorker) {
    this.bleedX = g.W;
    this.texW = g.panoW + this.bleedX * 2;
    this.buildStars();
    this.buildDither();
    worker.run({ type: 'milky', w: Math.round(this.texW / 2), h: Math.round(g.horizonY / 2), seed: 11 }).then((t) => (this.milkyTex = t));
  }

  private buildStars() {
    const { horizonY } = this.g;
    const texW = this.texW;
    const r = rng(1987);
    const N = Math.round((texW * horizonY) / 520);
    for (let i = 0; i < N; i++) {
      const m = -1.2 + Math.log10(1 + r() * 9999) * 1.85;
      const lum = Math.pow(10, -0.4 * (m - 6.2));
      const y = Math.pow(r(), 1.15) * horizonY * 0.97;
      const altDeg = (horizonY - y) / this.g.pxPerDeg;
      const ext = clamp(altDeg / 14) * 0.85 + 0.15;
      const grp: 0 | 1 | 2 = m < 2 ? 0 : m < 4 ? 1 : 2;
      this.stars.push({
        x: r() * texW, y,
        r: clamp(0.38 + Math.log10(lum) * 0.3, 0.38, 1.5),
        a: clamp((0.2 + Math.log10(lum) * 0.3) * ext, 0.1, 1),
        c: STAR_COLORS[Math.min(STAR_COLORS.length - 1, Math.floor(r() * STAR_COLORS.length))],
        grp, tw: 1.5 + r() * 3, ph: r() * 6.28,
      });
    }
    for (let gi = 0; gi < 3; gi++) {
      const c = document.createElement('canvas');
      const d = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.ceil(texW * d); c.height = Math.ceil(horizonY * d);
      const x = c.getContext('2d')!;
      x.scale(d, d);
      for (const s of this.stars) {
        if (s.grp !== gi || (gi === 0 && s.r > 1.25)) continue;
        x.globalAlpha = s.a;
        x.fillStyle = s.c;
        x.beginPath(); x.arc(s.x, s.y, s.r, 0, 6.2832); x.fill();
      }
      this.layers.push(c);
    }
    this.bright = this.stars.filter((s) => s.grp === 0 && s.r > 1.25);
  }

  private buildDither() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const im = x.createImageData(128, 128);
    const r = rng(5);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 128 + (r() - 0.5) * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    this.dither = this.ctx.createPattern(c, 'repeat');
  }

  refreshMoon(s: SkyState) {
    const tintKey = this.moonTint ? this.moonTint.join(',') : 'std';
    const mk = `${Math.round(s.phase.fraction * 60)}${s.phase.waxing}:${tintKey}`;
    if (mk !== this.moonKey) {
      this.moonKey = mk;
      this.worker.run({ type: 'moon', size: 192, fraction: s.phase.fraction, waxing: s.phase.waxing, tint: this.moonTint })
        .then((t) => (this.moonTex = t));
    }
  }

  request(s: SkyState, ms = 2500) {
    this.refreshMoon(s);
    const key = [s.sunAlt.toFixed(1), s.sunVaz.toFixed(1), s.moonAlt.toFixed(0), s.haze.toFixed(2), s.overcast.toFixed(2)].join('|');
    if (key === this.lastKey || this.pending) return;
    this.lastKey = key;
    this.pending = true;
    const g = this.g;
    this.worker.run({
      type: 'atmo',
      p: {
        cols: Math.round(this.texW / 8), rows: Math.round(g.horizonY / 8),
        azSpan: this.texW / g.pxPerDeg, altTop: ALT_TOP,
        sunAlt: s.sunDisp < 48 ? s.sunAlt : s.sunDisp, sunAz: s.sunVaz,
        moonAlt: s.moonAlt, moonAz: s.moonVaz, moonFrac: s.phase.fraction,
        haze: s.haze, overcast: s.overcast, cityGlow: s.cityGlow,
      },
    }).then((t) => {
      this.pending = false;
      this.atmo = { prev: this.atmo.cur, cur: t, t0: performance.now(), dur: this.atmo.cur ? ms : 0 };
    });
  }

  get ready() { return !!this.atmo.cur; }

  sampleColors(): { top: string; mid: string; hor: string } | null {
    const { cur, prev } = this.atmo;
    if (!cur) return null;
    const k = this.fade();
    const at = (t: Tex, fy: number) => {
      const x = Math.floor(t.w / 2), y = Math.min(t.h - 1, Math.floor(fy * (t.h - 1)));
      const i = (y * t.w + x) * 4;
      return [t.data[i], t.data[i + 1], t.data[i + 2]];
    };
    const mix = (fy: number) => {
      const a = at(cur, fy);
      const b = prev && k < 1 ? at(prev, fy) : a;
      return `rgb(${a.map((v, i) => Math.round(lerp(b[i], v, k))).join(',')})`;
    };
    return { top: mix(0), mid: mix(0.55), hor: mix(0.97) };
  }

  private fade() {
    const a = this.atmo;
    return a.dur <= 0 ? 1 : clamp((performance.now() - a.t0) / a.dur);
  }

  private drawAtmo(c: CanvasRenderingContext2D, tx0: number, W: number, H: number) {
    const { cur, prev } = this.atmo;
    const k = this.fade();
    if (prev && k < 1) {
      c.globalAlpha = 1;
      drawMirrorTiledX(c, prev.img, tx0, 0, this.texW, H, W);
      c.globalAlpha = k;
    }
    if (cur) drawMirrorTiledX(c, cur.img, tx0, 0, this.texW, H, W);
    c.globalAlpha = 1;
  }

  frame(now: number, s: SkyState, scrollX: number) {
    const c = this.ctx, g = this.g;
    const W = g.W, H = g.horizonY;
    const ox = -scrollX * CELESTIAL_PARALLAX;
    const tx0 = ox - this.bleedX;
    const texW = this.texW;

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H + 4);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';

    // 1) atmosfer dokusu
    this.drawAtmo(c, tx0, W, H);

    // 2) samanyolu ve arka plan yıldızları
    c.globalCompositeOperation = 'lighter';
    if (this.milkyTex && s.milky > 0.01) {
      c.globalAlpha = 0.32 * s.milky * this.intro.stars[2];
      drawMirrorTiledX(c, this.milkyTex.img, tx0, 0, texW, H, W);
    }
    for (let gi = 2; gi >= 0; gi--) {
      const a = s.starVis[gi] * this.intro.stars[gi];
      if (a < 0.01) continue;
      c.globalAlpha = a;
      drawMirrorTiledX(c, this.layers[gi], tx0, 0, texW, H, W);
    }
    const ba = s.starVis[0] * this.intro.stars[0];
    if (ba > 0.01 && texW > 0) {
      const kMin = Math.floor(-tx0 / texW);
      const kMax = Math.ceil((W - tx0) / texW) - 1;
      for (let k = kMin; k <= kMax; k++) {
        const tileX = tx0 + k * texW;
        const flip = (k & 1) !== 0;
        for (const st of this.bright) {
          const x = tileX + (flip ? texW - st.x : st.x);
          if (x < -4 || x > W + 4) continue;
          const nearH = 1 - clamp((H - st.y) / (g.pxPerDeg * 25));
          const tw = 1 - (0.12 + 0.3 * nearH) * (0.5 + 0.5 * Math.sin((now / 1000) * st.tw * (1 + nearH) + st.ph));
          c.globalAlpha = ba * st.a * tw;
          c.fillStyle = st.c;
          c.beginPath(); c.arc(x, st.y, st.r, 0, 6.2832); c.fill();
          c.globalAlpha = ba * st.a * tw * 0.18;
          c.beginPath(); c.arc(x, st.y, st.r * 3.2, 0, 6.2832); c.fill();
        }
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // 2b) kişisel yıldızlar: gök kubbeye sabit (Güneş, Ay, bulutlar ve palmiyelerin arkasında)
    const moonPos = this.moonTex && s.moonAlpha > 0.01 ? skyToScreen(g, s.moonDisp, s.moonVaz, scrollX) : null;
    this.onDrawUserStars?.(c, now, s, scrollX, moonPos);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // 3) güneş
    if (s.sunAlpha > 0.01) {
      c.globalCompositeOperation = 'lighter';
      const p = skyToScreen(g, s.sunDisp, s.sunVaz, scrollX);
      const L = s.sunLight;
      const col = (m: number) => `rgb(${L.map((v) => Math.round(255 * Math.min(1, Math.pow(v * m, 1 / 2.2)))).join(',')})`;
      const r = 13;
      const squash = 1 - 0.12 * clamp(1 - s.sunAlt / 3);
      c.globalAlpha = s.sunAlpha * 0.35;
      const gr = c.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, r * 3);
      gr.addColorStop(0, col(1.2)); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.fillRect(p.x - r * 3, p.y - r * 3, r * 6, r * 6);
      c.globalAlpha = s.sunAlpha;
      c.fillStyle = col(1.6);
      c.beginPath(); c.ellipse(p.x, p.y, r, r * squash, 0, 0, 6.2832); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }

    // 4) ay: gerçekçi katı küre (karanlık yüzü dahil arkasındaki hiçbir yıldızı geçirmez)
    if (this.moonTex && moonPos && s.moonAlpha > 0.01) {
      const p = moonPos;
      const size = 46;
      const limbR = size * (88 / 192);
      if (this.atmo.cur) {
        c.save();
        c.beginPath();
        c.arc(p.x, p.y, limbR, 0, Math.PI * 2);
        c.clip();
        c.globalCompositeOperation = 'source-over';
        this.drawAtmo(c, tx0, W, H);
        c.restore();
      }
      if (s.daylight < 0.6) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = s.moonAlpha * 0.14 * s.phase.fraction * (1 - s.daylight);
        const gr = c.createRadialGradient(p.x, p.y, size * 0.4, p.x, p.y, size * 2.4);
        gr.addColorStop(0, this.moonTint ? '#f0e2be' : '#dfe6ff');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.fillRect(p.x - size * 2.4, p.y - size * 2.4, size * 4.8, size * 4.8);
        c.globalCompositeOperation = 'source-over';
      }
      c.globalCompositeOperation = s.daylight > 0.3 ? 'screen' : 'source-over';
      c.globalAlpha = s.moonAlpha;
      c.drawImage(this.moonTex.img, p.x - size / 2, p.y - size / 2, size, size);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }

    // 5) gren
    if (this.dither) {
      c.globalCompositeOperation = 'soft-light';
      c.globalAlpha = 0.035;
      c.fillStyle = this.dither;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
  }
}
