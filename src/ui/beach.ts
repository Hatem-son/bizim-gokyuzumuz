// Kumsal: ufukta gökyüzünü yansıtan deniz + ay/güneş/fener ışık yolu + kıyıya gelip giden dalga köpüğü +
// ıslak kum parıltısı + kuru kum (gren, rüzgâr çizgileri, ikimizin ayak izleri) + mumların kuma düşen ışığı.
import { rng } from '../gokyuzu/util';
import { mod } from '../gokyuzu/skyGeom';

const SAND_BLEED_B = 96; // ekranın en altına kadar kesintisiz kum uzantısı (safe-area / dinamik bar payı)

type RGB = [number, number, number];
const parse = (c: string): RGB => (c.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a})`;

export class Beach {
  private sand: HTMLCanvasElement;
  private sandKey = '';
  private grain: CanvasPattern | null = null;
  private r = rng(77);
  private prints: { x: number; y: number; a: number; s: number; who: 0 | 1 }[] = [];
  private readonly bleedX: number;
  private readonly sandW: number;
  readonly shoreY: number;

  constructor(private c: CanvasRenderingContext2D, private o: { W: number; H: number; horizonY: number; skyW: number }) {
    this.shoreY = Math.round(o.horizonY + (o.H - o.horizonY) * (92 / 244));
    this.bleedX = o.W;
    this.sandW = o.skyW + this.bleedX * 2;
    const d = Math.min(devicePixelRatio || 1, 2);
    this.sand = document.createElement('canvas');
    this.sand.width = Math.ceil(this.sandW * d);
    this.sand.height = Math.ceil((o.H - this.shoreY + SAND_BLEED_B) * d);
    this.sand.getContext('2d')!.scale(d, d);
    const g = document.createElement('canvas');
    g.width = g.height = 96;
    const gx = g.getContext('2d')!;
    const im = gx.createImageData(96, 96);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = this.r() * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = this.r() < 0.5 ? 26 : 0;
    }
    gx.putImageData(im, 0, 0);
    this.grain = this.sand.getContext('2d')!.createPattern(g, 'repeat');
    const startX = this.bleedX + o.skyW * 0.5 - 40;
    for (let k = 0; k < 18; k++) {
      const t = k / 17;
      const y = (o.H - this.shoreY) * (1 - t) + 6;
      const persp = 0.45 + 0.55 * (1 - t);
      const sway = Math.sin(t * 5) * 10 * persp;
      for (const who of [0, 1] as const) {
        const side = k % 2 ? 1 : -1;
        this.prints.push({ x: startX + (who ? 34 : 0) * persp + sway + side * 4 * persp + t * 30, y: y - (who ? 4 : 0), a: -0.15 + t * 0.2, s: persp * (who ? 0.82 : 1), who });
      }
    }
  }

  private drawSand(hor: RGB, top: RGB, day: number, sun: RGB) {
    const c = this.sand.getContext('2d')!;
    const skyW = this.sandW;
    const h = this.o.H - this.shoreY + SAND_BLEED_B;
    const dayS: RGB = [222 * (0.75 + 0.25 * sun[0]), 202 * (0.75 + 0.25 * sun[1]), 168 * (0.7 + 0.3 * sun[2])];
    const nightS: RGB = mix([28, 30, 40], top, 0.25);
    const base = mix(nightS, dayS, Math.pow(day, 0.8));
    const near = mix(base, [0, 0, 0], 0.22 + 0.2 * (1 - day));
    c.clearRect(0, 0, skyW, h);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(mix(base, hor, 0.15)));
    g.addColorStop(1, css(near));
    c.fillStyle = g;
    c.fillRect(0, 0, skyW, h);
    c.strokeStyle = css(mix(base, [255, 255, 255], 0.25), 0.18 + 0.1 * day);
    c.lineWidth = 0.7;
    const rr = rng(5);
    for (let i = 0; i < 70; i++) {
      const y = 10 + rr() * (h - 10), x = rr() * skyW, L = 30 + rr() * 80, pers = 0.4 + y / h;
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(x + L * 0.3, y - 2 * pers, x + L * 0.7, y + 2 * pers, x + L, y);
      c.stroke();
    }
    const rb = rng(17);
    for (let i = 0; i < 46; i++) {
      const x = rb() * skyW, y = rb() * h, r = 30 + rb() * 90;
      const g2 = c.createRadialGradient(x, y, 0, x, y, r);
      const tone = rb() < 0.5 ? [255, 250, 235] : [90, 70, 50];
      g2.addColorStop(0, css(tone as RGB, 0.05 + 0.05 * day));
      g2.addColorStop(1, css(tone as RGB, 0));
      c.fillStyle = g2; c.fillRect(x - r, y - r * 0.4, r * 2, r * 0.8);
    }
    for (let i = 0; i < 2600; i++) {
      const y = Math.pow(rb(), 0.8) * h, x = rb() * skyW;
      const sz = 0.35 + (y / h) * 1.1 * rb();
      c.fillStyle = rb() < 0.55 ? css(mix(base, [255, 255, 255], 0.35), 0.18 + 0.12 * day) : css(mix(base, [0, 0, 0], 0.4), 0.16);
      c.fillRect(x, y, sz, sz * 0.8);
    }
    for (let i = 0; i < 420; i++) {
      const x = rb() * skyW, y = 34 + Math.sin(x * 0.02) * 4 + (rb() - 0.5) * 6;
      c.fillStyle = css(mix(base, [0, 0, 0], 0.5), 0.35 * rb());
      c.fillRect(x, y, 0.8 + rb() * 1.5, 0.7);
    }
    for (let i = 0; i < 26; i++) {
      const x = rb() * skyW, y = 40 + Math.pow(rb(), 0.7) * (h - 50), sc = 0.6 + (y / h) * 1.3;
      c.save(); c.translate(x, y); c.scale(sc, sc * 0.75);
      if (rb() < 0.55) {
        const pc = mix(base, rb() < 0.5 ? [120, 110, 100] : [200, 190, 175], 0.5);
        c.fillStyle = css(mix(pc, [0, 0, 0], 0.35), 0.4); c.beginPath(); c.ellipse(0.6, 0.8, 3.2, 2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(pc, 0.95); c.beginPath(); c.ellipse(0, 0, 3, 1.9, rb(), 0, Math.PI * 2); c.fill();
        c.fillStyle = css(mix(pc, [255, 255, 255], 0.5), 0.6 * (0.3 + day)); c.beginPath(); c.ellipse(-0.8, -0.6, 1.1, 0.6, 0, 0, Math.PI * 2); c.fill();
      } else {
        c.rotate((rb() - 0.5) * 1.2);
        const sc2 = mix(base, rb() < 0.5 ? [255, 214, 222] : [255, 240, 225], 0.65);
        c.fillStyle = css(mix(sc2, [0, 0, 0], 0.3), 0.35); c.beginPath(); c.ellipse(0.8, 1, 4.2, 2.4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(sc2, 0.95); c.beginPath(); c.moveTo(0, 2.4); c.arc(0, 2.4, 4.2, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); c.fill();
        c.strokeStyle = css(mix(sc2, [0, 0, 0], 0.25), 0.6); c.lineWidth = 0.35;
        for (let r2 = -3; r2 <= 3; r2++) { c.beginPath(); c.moveTo(0, 2.4); c.lineTo(r2 * 1.15, -1.4); c.stroke(); }
      }
      c.restore();
    }
    for (const p of this.prints) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      c.scale(p.s, p.s * 0.55);
      c.fillStyle = css(mix(base, [0, 0, 0], 0.35), 0.45);
      c.beginPath(); c.ellipse(0, 0, 3.6, 8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0.4, -10.5, 2.6, 3.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(mix(base, [255, 255, 255], 0.3), 0.25);
      c.beginPath(); c.ellipse(-1.2, 1.5, 2.4, 6.4, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    if (this.grain) { c.fillStyle = this.grain; c.globalAlpha = 0.5 + 0.5 * day; c.fillRect(0, 0, skyW, h); c.globalAlpha = 1; }
  }

  frame(now: number, scrollX: number, skyCanvas: HTMLCanvasElement, colors: { hor: string; top: string }, day: number, sun: RGB,
    glints: { x: number; k: number; warm: boolean }[], candles: { x: number; y: number; k: number }[]) {
    const c = this.c, { W, H, horizonY } = this.o;
    const hor = parse(colors.hor), top = parse(colors.top);
    const shore = this.shoreY;
    c.clearRect(0, horizonY - 2, W, H - horizonY + SAND_BLEED_B);

    const deep: RGB = mix([6, 10, 20], [28, 70, 96], day);
    const g = c.createLinearGradient(0, horizonY, 0, shore);
    g.addColorStop(0, css(mix(hor, deep, 0.25)));
    g.addColorStop(1, css(mix(top, deep, 0.55)));
    c.fillStyle = g;
    c.fillRect(0, horizonY, W, shore - horizonY + 2);

    const d = skyCanvas.width / W;
    const t = now / 1000;
    for (let y = horizonY; y < shore; y += 2) {
      const k = (y - horizonY) / (shore - horizonY);
      const srcY = horizonY - 2 - (y - horizonY) * (2.2 + 6 * k);
      if (srcY < 0) break;
      const off = Math.sin(t * 1.1 + y * 0.42) * (0.6 + 6 * k) + Math.sin(t * 0.7 + y * 0.13) * 2 * k;
      c.globalAlpha = 0.5 * (1 - 0.6 * k);
      c.drawImage(skyCanvas, 0, srcY * d, skyCanvas.width, 2 * d, off, y, W, 2);
    }
    c.globalAlpha = 1;

    const hi = css(mix(hor, [255, 255, 255], 0.35 + 0.25 * day), 1), lo = css(mix(deep, [0, 0, 0], 0.35), 1);
    for (let y = horizonY + 2; y < shore - 3; y += 2) {
      const k = (y - horizonY) / (shore - horizonY);
      const n = 4 + Math.floor(k * 12);
      for (let i = 0; i < n; i++) {
        const h1 = Math.sin(y * 7.13 + i * 31.7) * 43758.5453, f1 = h1 - Math.floor(h1);
        const h2 = Math.sin(y * 3.71 + i * 17.3) * 24634.6345, f2 = h2 - Math.floor(h2);
        const x = (((f1 * (W + 60) + t * (3 + 9 * k) * (i % 2 ? 1 : -0.6) - scrollX * 0.9) % (W + 60)) + W + 60) % (W + 60) - 30;
        const len = 2 + (4 + 16 * k) * f2;
        c.globalAlpha = (0.05 + 0.16 * k) * (0.5 + 0.5 * Math.sin(t * 1.7 + i + y));
        c.fillStyle = i % 3 === 0 ? lo : hi;
        c.fillRect(x, y, len, k > 0.5 ? 1.2 : 0.8);
      }
    }
    c.globalAlpha = 1;

    const haze = c.createLinearGradient(0, horizonY - 6, 0, horizonY + 14);
    haze.addColorStop(0, css(hor, 0)); haze.addColorStop(0.4, css(mix(hor, [255, 255, 255], 0.15), 0.35)); haze.addColorStop(1, css(hor, 0));
    c.fillStyle = haze; c.fillRect(0, horizonY - 6, W, 20);

    for (const gl of glints) {
      if (gl.k < 0.02) continue;
      const col = gl.warm ? '255,214,160' : '235,240,255';
      for (let y = horizonY + 2; y < shore; y += 3) {
        const k = (y - horizonY) / (shore - horizonY);
        const spread = 6 + 46 * k;
        const n = 2 + Math.floor(3 * k);
        for (let i = 0; i < n; i++) {
          const h = Math.sin(y * 12.9898 + i * 78.233 + Math.floor(t * 6 + i) * 3.17) * 43758.5453;
          const fr = h - Math.floor(h);
          const x = gl.x + (fr - 0.5) * 2 * spread;
          const a = gl.k * (0.25 + 0.6 * fr) * (1 - 0.3 * k);
          c.fillStyle = `rgba(${col},${a.toFixed(3)})`;
          c.fillRect(x, y, 2 + 6 * k * fr, 1);
          if (gl.warm === false && day > 0.5 && fr > 0.93) {
            c.fillStyle = `rgba(255,255,255,${(a * 1.4).toFixed(3)})`;
            c.fillRect(x - 3, y, 7, 0.7); c.fillRect(x + 0.2, y - 2.5, 0.7, 6);
          }
        }
      }
    }
    c.fillStyle = css(mix(hor, [255, 255, 255], 0.35), 0.5);
    c.fillRect(0, horizonY, W, 1);

    const key = colors.hor + colors.top + Math.round(day * 30) + sun.map((v) => v.toFixed(1)).join();
    if (key !== this.sandKey) { this.sandKey = key; this.drawSand(hor, top, day, sun); }
    for (let sx = -mod(scrollX + this.bleedX, this.sandW); sx < W; sx += this.sandW) {
      c.drawImage(this.sand, Math.round(sx), shore - 6, this.sandW, H - shore + SAND_BLEED_B);
    }

    const T = 6.5, ph = (t % T) / T;
    for (let k = 0; k < 4; k++) {
      const p = (ph + k / 4) % 1;
      const pe = Math.pow(p, 1.7);
      const y = horizonY + 3 + (shore - horizonY - 6) * pe;
      const amp = 0.4 + 2.6 * pe, lw = 0.6 + 2.2 * pe;
      const a = (0.1 + 0.55 * pe) * (p > 0.94 ? (1 - p) / 0.06 : 1);
      c.strokeStyle = css(mix(deep, [0, 0, 0], 0.4), 0.22 * pe);
      c.lineWidth = lw * 2.2;
      c.beginPath();
      for (let x = -4; x <= W + 4; x += 5) { const yy = y + lw * 1.4 + Math.sin(x * 0.03 + k * 2 + t * 0.8 + scrollX * 0.02) * amp; x < 0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
      c.stroke();
      c.strokeStyle = css(mix(hor, [255, 255, 255], 0.45 + 0.3 * day), a);
      c.lineWidth = lw;
      c.beginPath();
      for (let x = -4; x <= W + 4; x += 5) { const yy = y + Math.sin(x * 0.03 + k * 2 + t * 0.8 + scrollX * 0.02) * amp; x < 0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
      c.stroke();
    }
    const up = ph < 0.38 ? 1 - Math.pow(1 - ph / 0.38, 3) : ph < 0.95 ? 1 - Math.pow((ph - 0.38) / 0.57, 1.6) : 0;
    const maxReach = 34;
    const edge = (x: number) => shore + 2 + up * maxReach + Math.sin(x * 0.04 + t * 0.5) * (2 + 3 * up) + Math.sin(x * 0.013 - 1.3) * 5 * up;
    const dry = ph < 0.38 ? 0 : (ph - 0.38) / 0.62;
    const wetTo = shore + 2 + maxReach + 4;
    const wg = c.createLinearGradient(0, shore, 0, wetTo);
    wg.addColorStop(0, css(mix(hor, [0, 0, 0], 0.35), 0.5));
    wg.addColorStop(1, css(mix(hor, [0, 0, 0], 0.35), 0.16 * (1 - dry)));
    c.fillStyle = wg;
    c.fillRect(0, shore - 2, W, wetTo - shore + 4);
    if (ph > 0.38) {
      c.fillStyle = css(mix(hor, [255, 255, 255], 0.2), 0.18 * (1 - dry));
      c.beginPath(); c.moveTo(-6, shore);
      for (let x = -6; x <= W + 6; x += 6) c.lineTo(x, edge(x + scrollX) + 3);
      for (let x = W + 6; x >= -6; x -= 6) c.lineTo(x, shore + 2 + maxReach * (1 - dry * 0.6) + Math.sin(x * 0.04) * 3);
      c.closePath(); c.fill();
    }
    const sheet = c.createLinearGradient(0, shore - 8, 0, shore + maxReach + 8);
    sheet.addColorStop(0, css(mix(mix(hor, deep, 0.45), [255, 255, 255], 0.08), 0.95));
    sheet.addColorStop(1, css(mix(hor, [255, 255, 255], 0.25), 0.55));
    c.fillStyle = sheet;
    c.beginPath(); c.moveTo(-5, shore - 8);
    for (let x = -5; x <= W + 5; x += 5) c.lineTo(x, edge(x + scrollX));
    c.lineTo(W + 5, shore - 8); c.closePath(); c.fill();
    const foamA = (0.55 + 0.4 * day) * (ph < 0.38 ? 1 : 0.35 + 0.65 * up);
    const band = 6 + 10 * up;
    for (let k = 0; k < 4; k++) {
      c.fillStyle = `rgba(255,255,255,${(foamA * 0.22 * (1 - k / 4)).toFixed(3)})`;
      c.beginPath();
      for (let x = -5; x <= W + 5; x += 5) { const y = edge(x + scrollX) - (band * k) / 4 + Math.sin(x * 0.11 + t * 2 + k) * 1.2; x > -5 ? c.lineTo(x, y) : c.moveTo(x, y); }
      for (let x = W + 5; x >= -5; x -= 5) c.lineTo(x, edge(x + scrollX) - band * (k + 1) / 4 - 1);
      c.closePath(); c.fill();
    }
    c.strokeStyle = `rgba(255,255,255,${foamA.toFixed(3)})`;
    c.lineWidth = 2.2 + 2 * up;
    c.lineCap = 'round';
    c.beginPath();
    for (let x = -5; x <= W + 5; x += 5) x > -5 ? c.lineTo(x, edge(x + scrollX)) : c.moveTo(x, edge(x + scrollX));
    c.stroke();
    const lace = Math.round(60 + 70 * up);
    for (let i = 0; i < lace; i++) {
      const hx = Math.sin(i * 91.7 + 0.3) * 43758.5453, fx = hx - Math.floor(hx);
      const hy = Math.sin(i * 12.3 + 1.7) * 23421.631, fy = hy - Math.floor(hy);
      const x = fx * W;
      const ey = edge(x + scrollX);
      const y = ey - 2 - fy * (10 + 18 * (1 - up));
      if (y < shore - 8) continue;
      const rr = 0.5 + fy * 1.2;
      c.fillStyle = `rgba(255,255,255,${(foamA * (0.25 + 0.6 * (1 - fy))).toFixed(3)})`;
      c.beginPath(); c.ellipse(x + Math.sin(t * 1.5 + i) * 1.5, y, rr * 2.2, rr * 0.7, 0, 0, Math.PI * 2); c.fill();
    }
    const burst = ph < 0.12 ? 1 - ph / 0.12 : 0;
    if (burst > 0) {
      c.fillStyle = `rgba(255,255,255,${(0.35 * burst * (0.5 + 0.5 * day)).toFixed(3)})`;
      c.fillRect(0, shore - 7, W, 6);
    }

    const nightK = 1 - day;
    for (const m of candles) {
      if (m.k <= 0) continue;
      const rg = c.createRadialGradient(m.x, m.y, 2, m.x, m.y, 90);
      rg.addColorStop(0, `rgba(255,190,120,${(0.32 * nightK + 0.06) * m.k})`);
      rg.addColorStop(1, `rgba(255,170,90,0)`);
      c.fillStyle = rg;
      c.fillRect(m.x - 90, m.y - 60, 180, 140);
    }
  }
}
