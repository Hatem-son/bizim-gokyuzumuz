// "Deniz selamı": arada bir denizden ışıldayan mavi bir su şeridi yükselir, kalp çizer, kalp yumuşakça
// "seni seviyorum" yazısına dönüşür ve su yazıdan denize geri akar. Özgün tasarım; yüz, göz, el yok: yalnızca akışkan su.
// Tek canvas, tek rAF döngüsü (main.ts engine.add). Aktif değilken hiçbir şey çizmez.
import { rng, clamp } from '../gokyuzu/util';
import { wrapX, SkyGeom } from '../gokyuzu/skyGeom';

type V = { x: number; y: number };
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

// zaman çizelgesi (sn)
const T_RISE = 1.7, T_TRACE = 3.6, T_PULSE = 4.4, T_MORPH = 6.4, T_HOLD = 7.7, T_END = 9.6;

type P = { sx: number; sy: number; tx: number; ty: number; cx: number; cy: number; d: number; r: number; ph: number };

export class OceanHeart {
  private t0 = -1;
  private wx = 0;
  private path: V[] = [];       // yükselen sap + kalp konturu (ekran koordinatı, merkez = 0,0 → sonra yerleştirilir)
  private stem = 0;             // sap uzunluğu (nokta sayısı)
  private parts: P[] = [];
  private txt: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private rev: HTMLCanvasElement | null = null;
  private r = rng(4242);
  private cool = 0;
  private cyc = 0;             // kalp merkezi y

  constructor(private ctx: CanvasRenderingContext2D, private g: SkyGeom, _shoreY?: number) {}

  get active() { return this.t0 >= 0; }

  resetCooldown() { this.cool = 0; }

  /** Tetikle: güncel ekran ortasındaki denizden yükselir. */
  start(now: number, scrollX: number, text = 'seni seviyorum') {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (this.active || now < this.cool) return false;
    const g = this.g;
    this.t0 = now;
    this.wx = scrollX + g.W / 2;                              // dünya x'ine bağlı: kaydırınca birlikte kayar
    const hy = g.horizonY, cy = hy - 175, s = Math.min(5.2, g.W / 78);
    this.cyc = cy;
    // kalp konturu: t = π (alt uç) → 0 (çentik) → −π (alt uç)
    const heart: V[] = [];
    const N = 150;
    for (let i = 0; i <= N; i++) {
      const t = Math.PI - (i / N) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      heart.push({ x: x * s, y: cy + y * s });
    }
    const tip = heart[0];
    // sap: denizden alt uca dalgalı yükselir
    const stem: V[] = [];
    const M = 50, seaY = hy + 5;
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      stem.push({ x: tip.x + Math.sin(u * 5.2) * 9 * (1 - u) * (u > 0 ? 1 : 0), y: seaY + (tip.y - seaY) * u });
    }
    this.stem = stem.length;
    this.path = [...stem, ...heart.slice(1)];
    // yazı: el yazısı (Great Vibes), genişliğe sığdırılır. İki katman: keskin maske (parçacık hedefleri) ve önceden pişirilmiş ışıltılı su yazısı.
    const w = Math.ceil(g.W), fs0 = 64;
    const meas = document.createElement('canvas').getContext('2d')!;
    meas.font = `400 ${fs0}px "Great Vibes", "Cormorant Garamond", cursive`;
    const fs = Math.min(74, fs0 * Math.min(1.25, (g.W * 0.8) / meas.measureText(text).width));
    const h = Math.ceil(fs * 1.9);
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const font = `400 ${fs}px "Great Vibes", "Cormorant Garamond", cursive`;
    const c = mk(), x = c.getContext('2d')!;
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    x.fillText(text, w / 2, h / 2);
    this.txt = c;
    // ışıltılı su yazısı: geniş mavi hale + dar hale + beyazdan açık camgöbeğine degrade dolgu + ince parlak kenar
    const gl = mk(), gx = gl.getContext('2d')!;
    gx.font = font; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    gx.shadowColor = 'rgba(80,185,255,.95)'; gx.shadowBlur = 22; gx.fillStyle = 'rgba(120,205,255,.55)'; gx.fillText(text, w / 2, h / 2);
    gx.shadowBlur = 8; gx.fillText(text, w / 2, h / 2);
    gx.shadowBlur = 0;
    const gr = gx.createLinearGradient(0, h / 2 - fs * 0.6, 0, h / 2 + fs * 0.6);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e4f8ff'); gr.addColorStop(1, '#a9defa');
    gx.fillStyle = gr; gx.fillText(text, w / 2, h / 2);
    gx.lineWidth = 0.8; gx.strokeStyle = 'rgba(255,255,255,.9)'; gx.strokeText(text, w / 2, h / 2);
    this.glow = gl; this.rev = mk();
    const id = x.getImageData(0, 0, w, h).data;
    const pts: V[] = [];
    for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) if (id[(yy * w + xx) * 4 + 3] > 140) pts.push({ x: xx - w / 2, y: yy - h / 2 + cy });
    const K = 340;
    const tg: V[] = [];
    for (let i = 0; i < K && pts.length; i++) tg.push(pts[Math.floor(this.r() * pts.length)]);
    tg.sort((a, b) => a.x - b.x);
    const src: V[] = [];
    for (let i = 0; i < K; i++) src.push(heart[Math.floor((i / K) * (heart.length - 1))]);
    src.sort((a, b) => a.x - b.x + (this.r() - 0.5) * 6);
    this.parts = src.map((a, i) => {
      const b = tg[i] ?? a, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, off = (this.r() - 0.5) * 120;
      return { sx: a.x, sy: a.y, tx: b.x, ty: b.y, cx: mx + Math.cos(ang) * off, cy: my + Math.sin(ang) * off - 30, d: this.r() * 0.35, r: 0.9 + this.r() * 1.5, ph: this.r() * 6.28 };
    });
    return true;
  }

  /** Her karede. Döner: çiziyor mu (motor meşgul kalsın). */
  frame(now: number, scrollX: number, day: number, reduced = false): boolean {
    const c = this.ctx, g = this.g;
    if (this.t0 < 0) return false;
    const t = (now - this.t0) / 1000;
    c.clearRect(0, 0, g.W, g.horizonY + 40);
    if (t > T_END || reduced) { this.t0 = -1; this.cool = now + 20000; return false; }
    const shift = wrapX(g, this.wx, scrollX) - g.W / 2;                    // ekranda ne kadar kaydı
    c.save();
    c.translate(g.W / 2 + shift, 0);
    const night = 1 - day;
    const hy = g.horizonY;
    // ---- renk: gündüz doygun turkuaz-mavi, gece ışıyan camgöbeği (eklemeli)
    const mode: GlobalCompositeOperation = night > 0.35 ? 'lighter' : 'source-over';
    const glow = night > 0.35 ? 'rgba(70,170,255,' : 'rgba(30,120,210,';
    const mid = night > 0.35 ? 'rgba(110,210,255,' : 'rgba(40,150,230,';
    const core = 'rgba(235,252,255,';
    // ---- 1) sap yükselir, 2) kalbi çizer, sonra sap geri çekilir (kuyruk kalbe katılır)
    const total = this.path.length;
    const rise = easeOut(seg(t, 0, T_RISE));
    const trace = easeIO(seg(t, T_RISE - 0.25, T_TRACE));
    const head = Math.floor(rise * this.stem) + Math.floor(trace * (total - this.stem));
    const tail = Math.floor(easeIO(seg(t, T_TRACE - 0.5, T_PULSE)) * (this.stem - 1));
    const fade = 1 - ease(seg(t, T_PULSE + 0.6, T_MORPH - 0.6));   // kontur yazıya dönüşürken söner
    const pulse = 1 + 0.06 * Math.sin(seg(t, T_TRACE, T_PULSE) * Math.PI);
    const bob = Math.sin(t * 1.6) * 3 * seg(t, T_TRACE, T_PULSE + 1);
    c.globalCompositeOperation = mode;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (fade > 0.01 && head > tail + 1) {
      const cxh = 0, cyh = 0;
      for (const [wid, col, al] of [[15, glow, 0.16], [8, mid, 0.5], [3.4, core, 0.85]] as const) {
        c.beginPath();
        for (let i = tail; i <= Math.min(head, total - 1); i++) {
          const p = this.path[i];
          // su dalgası: şerit boyunca ilerleyen küçük ondülasyon (kalp oturdukça sönümlenir)
          const settle = 1 - 0.7 * seg(t, T_TRACE, T_PULSE);
          const wv = Math.sin(i * 0.33 - t * 5) * 1.7 * settle * (wid > 10 ? 1.4 : 1);
          const dx = i < total - 1 ? this.path[i + 1].y - p.y : 0, dy = i < total - 1 ? -(this.path[i + 1].x - p.x) : 0;
          const L = Math.hypot(dx, dy) || 1;
          const px = (p.x + (dx / L) * wv) * pulse + cxh, py = hy - (hy - p.y) * pulse + (dy / L) * wv + bob + cyh;
          i === tail ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.strokeStyle = col + (al * fade).toFixed(3) + ')';
        c.lineWidth = wid * (0.75 + 0.25 * Math.min(1, (head - tail) / 30));
        c.stroke();
      }
      // uç damla: baş ışıldar
      if (t < T_TRACE + 0.2) {
        const hp = this.path[Math.min(head, total - 1)];
        const gr = c.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 16);
        gr.addColorStop(0, core + '0.9)'); gr.addColorStop(0.4, mid + '0.4)'); gr.addColorStop(1, mid + '0)');
        c.fillStyle = gr; c.fillRect(hp.x - 16, hp.y - 16, 32, 32);
      }
    }
    // kalbin içi: kapandığında yumuşak ışık nabzı
    const fill = seg(t, T_TRACE, T_PULSE) * (1 - seg(t, T_PULSE + 0.2, T_MORPH - 0.8));
    if (fill > 0.01) {
      const cy0 = this.cyc;
      const gr = c.createRadialGradient(0, cy0 + 8, 0, 0, cy0 + 8, 92);
      gr.addColorStop(0, mid + (0.34 * fill).toFixed(3) + ')'); gr.addColorStop(1, mid + '0)');
      c.fillStyle = gr; c.fillRect(-100, cy0 - 90, 200, 200);
    }
    // ---- 3) dönüşüm: kontur parçacıkları yazı piksellerine akar; yazı yumuşakça belirir
    if (t > T_PULSE && this.txt) {
      const k = seg(t, T_PULSE + 0.15, T_MORPH);           // 0..1 akış
      const out = seg(t, T_HOLD, T_END);                   // geri akış
      for (const p of this.parts) {
        const u = easeIO(clamp((k - p.d) / (1 - 0.35)));
        let x = (1 - u) * (1 - u) * p.sx + 2 * (1 - u) * u * p.cx + u * u * p.tx;
        let y = (1 - u) * (1 - u) * p.sy + 2 * (1 - u) * u * p.cy + u * u * p.ty;
        let a = Math.min(1, u * 3) * (u < 0.02 ? 0 : 1) * (u >= 1 ? 0.22 : 1); // yerleşince yazının önünde ince ışıltı olarak kalır
        if (out > 0) { // su, yazıdan denize geri akar: aşağı ve hafif yana, hızlanarak
          const f = easeIO(clamp((out - p.d * 0.6) / 0.7));
          x += Math.sin(p.ph + f * 3) * 14 * f; y += (hy + 4 - y) * f * f;
          a = Math.max(a, 0.22 * (1 - f) + 0.75 * f * (1 - seg(f, 0.75, 1))) * (1 - seg(f, 0.8, 1));
        }
        if (a <= 0.01) continue;
        const sz = p.r * (u < 1 ? 1.3 : 1);
        c.fillStyle = mid + (0.4 * a).toFixed(3) + ')';
        c.beginPath(); c.arc(x, y, sz * 1.6, 0, 6.2832); c.fill();
        c.fillStyle = core + (0.85 * a).toFixed(3) + ')';
        c.beginPath(); c.arc(x, y, sz * 0.8, 0, 6.2832); c.fill();
      }
      // yazı: soldan sağa suyla "yazılır" (yumuşak kenarlı sızıntı), sonra geri akarken solar
      const wr = ease(seg(t, T_MORPH - 1.5, T_MORPH + 0.5)), hide = 1 - ease(seg(t, T_HOLD, T_HOLD + 1.0));
      if (wr > 0.003 && hide > 0.01 && this.glow && this.rev) {
        const w = this.glow.width, h = this.glow.height, rx = this.rev.getContext('2d')!;
        rx.clearRect(0, 0, w, h);
        rx.globalCompositeOperation = 'source-over'; rx.drawImage(this.glow, 0, 0);
        rx.globalCompositeOperation = 'destination-in';
        const edge = wr * (w + 90) - 45, mk = rx.createLinearGradient(edge - 45, 0, edge + 45, 0);
        mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
        rx.fillStyle = mk; rx.fillRect(0, 0, w, h);
        rx.globalCompositeOperation = 'source-over';
        const y0 = this.cyc - h / 2 + Math.sin(t * 1.7) * 1.6, up = 1 - hide;
        c.globalCompositeOperation = night > 0.35 ? 'lighter' : 'source-over';
        c.globalAlpha = hide * (night > 0.35 ? 0.9 : 1);
        c.drawImage(this.rev, -w / 2, y0 - up * 6);
        c.globalAlpha = 1;
      }
    }
    // ---- halkalar: denizin yüzeyinde, sap yükselirken ve su geri dönerken
    const ring = (u: number, a: number) => {
      if (u <= 0 || u >= 1) return;
      c.strokeStyle = `rgba(210,240,255,${(a * (1 - u)).toFixed(3)})`;
      c.lineWidth = 1;
      c.beginPath(); c.ellipse(0, hy + 7, 8 + u * 110, 1.6 + u * 13, 0, 0, 6.2832); c.stroke();
    };
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 3; i++) ring(seg(t, 0.1 + i * 0.35, 1.9 + i * 0.35), 0.5);
    for (let i = 0; i < 4; i++) ring(seg(t, T_HOLD + 0.3 + i * 0.28, T_END + 0.5), 0.45);
    c.restore();
    c.globalCompositeOperation = 'source-over';
    return true;
  }
}
