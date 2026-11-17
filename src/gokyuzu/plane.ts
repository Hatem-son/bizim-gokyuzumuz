// Uçak + pankart. Yay rota, sabit hız (yay uzunluğu tablosu), yatış, seyir ışıkları, dalgalanan pankart.
// Yazı NETLİĞİ: pankart yazısı cihaz pikseli çözünürlüğünde bir kez çizilir, ölçeklenmez, döndürülmez,
// konumu cihaz pikseline yuvarlanır. Uçak hafifçe yatar (döner) ama pankart düz kalır.
// KULLANICI KURALI KORUNDU: Uçak her zaman soldan sağa burnu önde uçar (dir = 1); pankart arkadan çekilir, ters geliş yok.
import { clamp, lerp, rng } from './util';

type V = { x: number; y: number };

const bez = (p0: V, p1: V, p2: V, p3: V, t: number): V => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/** Yay uzunluğuna göre eşit aralıklı örnekleme: hız virajda değişmez. */
export function arcTable(p: V[], n = 200) {
  const pts: V[] = [];
  const len: number[] = [0];
  for (let i = 0; i <= n; i++) pts.push(bez(p[0], p[1], p[2], p[3], i / n));
  for (let i = 1; i <= n; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = len[n];
  /** d: 0..total → nokta ve teğet açısı */
  const at = (d: number) => {
    d = clamp(d, 0, total);
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (len[m] < d) lo = m; else hi = m;
    }
    const t = (d - len[lo]) / (len[hi] - len[lo] || 1);
    const a = pts[lo], b = pts[hi];
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  return { at, total };
}

export type PlaneOpts = {
  host: HTMLElement;              // gökyüzü kaplaması (position:absolute; inset:0)
  view: () => { w: number; topY: number; bottomY: number }; // uçuş bandı (sayacın altı – üst üçte bir)
  messages: () => string[];       // kişiye göre havuz (≤ 26 karakter)
  daylight: () => number;
  wind: () => number;
  onTap?: (text: string) => void; // ortada okunaklı hap göstermek için
  fontFamily: string;             // pankart yazı tipi (yüklenmiş olmalı)
};

const DPR = () => Math.min(window.devicePixelRatio || 1, 3);

export class Plane {
  private el: HTMLDivElement;
  private planeCv: HTMLCanvasElement;
  private bannerCv: HTMLCanvasElement;
  private textBmp: HTMLCanvasElement | null = null;
  private path: ReturnType<typeof arcTable> | null = null;
  private start = 0;
  private dur = 18000;
  private dir: 1 | -1 = 1;
  private text = '';
  private lastText = '';
  private angle = 0;
  private r = rng(Date.now() & 0xffff);
  active = false;

  // pankart ölçüleri (CSS px)
  private BW = 170; private BH = 30; private ROPE = 34; private SLICES = 48;

  constructor(private o: PlaneOpts) {
    this.el = document.createElement('div');
    this.el.className = 'gk-plane';
    Object.assign(this.el.style, {
      position: 'absolute', left: '0', top: '0', width: '0', height: '0',
      pointerEvents: 'none', opacity: '0', willChange: 'transform',
    });
    this.planeCv = document.createElement('canvas');
    this.bannerCv = document.createElement('canvas');
    for (const c of [this.planeCv, this.bannerCv]) {
      c.style.position = 'absolute';
      c.style.pointerEvents = 'auto';
      c.addEventListener('click', () => this.o.onTap?.(this.text));
      this.el.appendChild(c);
    }
    this.size(this.planeCv, 64, 34);
    this.size(this.bannerCv, this.BW + this.ROPE + 10, this.BH + 24);
    o.host.appendChild(this.el);
  }

  private size(c: HTMLCanvasElement, w: number, h: number) {
    const d = DPR();
    c.width = Math.round(w * d);
    c.height = Math.round(h * d);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
  }

  /** Yeni uçuş. Font yüklenmeden çağrılmaz (await document.fonts.load). */
  async launch(now = performance.now()) {
    if (this.active) return;
    const pool = this.o.messages().filter((m) => m.length <= 26 && m !== this.lastText);
    if (!pool.length) return;
    this.text = pool[Math.floor(this.r() * pool.length)];
    this.lastText = this.text;
    await document.fonts.load(`italic 700 19px ${this.o.fontFamily}`);
    this.renderText();
    const v = this.o.view();
    // Korunan kural: her zaman soldan sağa, burnu önde ileri uçuş
    this.dir = 1;
    const y0 = lerp(v.topY, v.bottomY, 0.55 + this.r() * 0.35);
    const amp = 30 + this.r() * 30;
    const out = this.BW + this.ROPE + 80;
    const x0 = -80;
    const x3 = v.w + out;
    const pts = [
      { x: x0, y: y0 },
      { x: lerp(x0, x3, 0.33), y: y0 - amp },
      { x: lerp(x0, x3, 0.66), y: y0 - amp * 0.8 },
      { x: x3, y: y0 + amp * 0.3 },
    ];
    this.path = arcTable(pts);
    this.dur = 16000 + this.r() * 6000;
    this.start = now;
    this.angle = this.path.at(0).ang;
    this.active = true;
    this.el.style.opacity = '1';
  }

  /** Yazıyı cihaz çözünürlüğünde, kumaş arka planıyla birlikte bitmap'e çiz. */
  private renderText() {
    const d = DPR();
    const c = document.createElement('canvas');
    c.width = Math.round(this.BW * d);
    c.height = Math.round(this.BH * d);
    const x = c.getContext('2d')!;
    x.scale(d, d);
    // kumaş
    x.fillStyle = '#fbf3e4';
    roundRect(x, 0, 0, this.BW, this.BH, 4);
    x.fill();
    // kumaş kıvrımı: çok hafif dikey gölge bantları
    for (let i = 1; i < 4; i++) {
      const g = x.createLinearGradient((this.BW / 4) * i - 10, 0, (this.BW / 4) * i + 10, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(120,90,60,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect((this.BW / 4) * i - 10, 0, 20, this.BH);
    }
    // yazı: koyu lacivert, kontrast ≥ 7:1
    x.fillStyle = '#1b2350';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    let size = 19;
    do {
      x.font = `italic 700 ${size}px ${this.o.fontFamily}`;
      size -= 0.5;
    } while (x.measureText(this.text).width > this.BW - 18 && size > 14);
    x.fillText(this.text, this.BW / 2, this.BH / 2 + 1);
    this.textBmp = c;
  }

  frame(now: number) {
    if (!this.active || !this.path) return;
    const d = DPR();
    const el = now - this.start;
    const t = clamp(el / this.dur);
    const r = 1500 / this.dur;
    const v = 1 / (1 - r);
    const frac = t < r ? (v * t * t) / (2 * r) : t > 1 - r ? 1 - (v * (1 - t) * (1 - t)) / (2 * r) : v * (t - r / 2);
    const dist = this.path.total * frac;
    const p = this.path.at(dist);
    const ahead = this.path.at(dist + 12);
    const curve = Math.atan2(Math.sin(ahead.ang - p.ang), Math.cos(ahead.ang - p.ang));
    const target = p.ang + clamp(curve * 6, -0.105, 0.105);
    const diff = Math.atan2(Math.sin(target - this.angle), Math.cos(target - this.angle));
    this.angle += diff * 0.08;
    const bob = Math.sin(now / 510) * 1.5 * (1 + this.o.wind() * 0.5);

    const px = p.x, py = p.y + bob;
    const tf = this.dir > 0
      ? `rotate(${this.angle}rad)`
      : `rotate(${this.angle - Math.PI}rad) scaleX(-1)`;
    this.planeCv.style.transform = `translate3d(${px - 32}px,${py - 17}px,0) ${tf}`;
    this.drawPlane(now);

    const tail = { x: px - this.dir * 26, y: py + 2 };
    const bw = this.BW + this.ROPE + 10;
    const bx = this.dir > 0 ? tail.x - bw : tail.x;
    const by = tail.y - 12;
    const rx = Math.round(bx * d) / d, ry = Math.round(by * d) / d;
    this.bannerCv.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    this.drawBanner(now);

    if (t >= 1) {
      this.active = false;
      this.el.style.opacity = '0';
    }
  }

  private drawPlane(now: number) {
    const c = this.planeCv.getContext('2d')!;
    const d = DPR();
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, 64, 34);
    const day = this.o.daylight();
    const night = 1 - day;
    const body = c.createLinearGradient(0, 12, 0, 22);
    if (day > 0.35) {
      body.addColorStop(0, '#ffffff'); body.addColorStop(0.55, '#e6eaf1'); body.addColorStop(1, '#9ea7b8');
    } else {
      body.addColorStop(0, '#2a3150'); body.addColorStop(1, '#0d1124');
    }
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(52, 15.2);
    c.bezierCurveTo(55.5, 15.5, 56.5, 17.2, 55.8, 18.6);
    c.bezierCurveTo(54.5, 20.2, 50, 20.6, 44, 20.6);
    c.lineTo(22, 19.4);
    c.bezierCurveTo(16, 19, 11, 18.4, 7, 17.6);
    c.lineTo(7, 16.4);
    c.bezierCurveTo(14, 15.6, 24, 13.4, 33, 12.4);
    c.bezierCurveTo(40, 11.8, 46, 12.6, 52, 15.2);
    c.fill();
    c.beginPath();
    c.moveTo(8.5, 16.6); c.lineTo(5.2, 8.6); c.lineTo(8.6, 8.4); c.lineTo(14.5, 15.4); c.closePath(); c.fill();
    c.fillStyle = day > 0.35 ? '#c7cede' : '#151a33';
    c.fillRect(5, 16.4, 9, 1.1);
    c.fillStyle = day > 0.35 ? '#dfe4ec' : '#1a1f3a';
    c.beginPath(); c.moveTo(26, 11.6); c.lineTo(43, 11.2); c.lineTo(43.6, 12.4); c.lineTo(26, 12.9); c.closePath(); c.fill();
    c.strokeStyle = day > 0.35 ? 'rgba(110,120,140,.8)' : 'rgba(40,46,80,.9)';
    c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(36, 12.6); c.lineTo(39.5, 19.4); c.stroke();
    if (day > 0.35) {
      c.fillStyle = 'rgba(32,52,110,.85)';
      c.beginPath(); c.moveTo(12, 17.4); c.lineTo(54, 18.2); c.lineTo(54, 18.9); c.lineTo(12, 18.2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(70,95,140,.75)';
      c.beginPath(); c.moveTo(38, 13.2); c.lineTo(47, 13.6); c.lineTo(50.5, 15.6); c.lineTo(38, 15.4); c.closePath(); c.fill();
    } else {
      c.fillStyle = 'rgba(255,214,150,.55)';
      c.fillRect(40, 14, 7, 1.2);
    }
    c.strokeStyle = day > 0.35 ? 'rgba(80,88,104,.9)' : 'rgba(20,24,44,1)';
    c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(42, 20.4); c.lineTo(43, 23.2); c.stroke();
    c.fillStyle = c.strokeStyle;
    c.beginPath(); c.arc(43.1, 23.6, 1.15, 0, 6.2832); c.fill();
    const pa = 0.18 + 0.06 * Math.sin(now / 17);
    c.fillStyle = day > 0.35 ? `rgba(60,70,90,${pa})` : `rgba(160,170,210,${pa * 0.6})`;
    c.beginPath(); c.ellipse(56.6, 17.4, 0.9, 6.2, 0, 0, 6.2832); c.fill();
    const L = 0.35 + 0.65 * night;
    const glowDot = (x: number, y: number, r: number, col: string, a: number) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.35, `rgba(${col},${a * 0.5})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    };
    glowDot(43, 11.8, 1.1, this.dir > 0 ? '255,60,60' : '60,255,120', 0.9 * L);
    if (now % 1000 < 120) glowDot(30, 12.2, 1.2, '255,40,40', L);
    const s = now % 1500;
    if (s < 50 || (s > 140 && s < 190)) glowDot(5.6, 8.8, 1.4, '255,255,255', 0.6 + 0.4 * night);
  }

  private drawBanner(now: number) {
    if (!this.textBmp) return;
    const c = this.bannerCv.getContext('2d')!;
    const d = DPR();
    const W = this.BW + this.ROPE + 10;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    const ropeX0 = this.dir > 0 ? W : 0;
    const clothX = this.dir > 0 ? 0 : this.ROPE + 10;
    const sw = this.BW / this.SLICES;
    const wave = (i: number) => Math.round(Math.sin((i / this.SLICES) * 7.2 - (now / 260) * this.dir) * 2.4 * d) / d;
    const attachX = this.dir > 0 ? clothX + this.BW : clothX;
    const attachY = 12 + wave(this.dir > 0 ? this.SLICES - 1 : 0) + this.BH / 2;
    c.strokeStyle = this.o.daylight() > 0.5 ? 'rgba(60,70,100,.7)' : 'rgba(200,210,240,.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(ropeX0, 12);
    c.quadraticCurveTo((ropeX0 + attachX) / 2, attachY + 6, attachX, attachY);
    c.stroke();
    bow(c, (ropeX0 + attachX) / 2, (12 + attachY) / 2 + 3);
    const day = this.o.daylight();
    for (let i = 0; i < this.SLICES; i++) {
      const sx = Math.round(i * sw * d);
      const sW = Math.round((i + 1) * sw * d) - sx;
      const dy = 12 + wave(i);
      const x = clothX + sx / d;
      c.drawImage(this.textBmp, sx, 0, sW, this.textBmp.height, x, dy, sW / d, this.BH);
      const slope = Math.cos((i / this.SLICES) * 7.2 - (now / 260) * this.dir);
      c.fillStyle = slope > 0 ? `rgba(40,30,20,${0.13 * slope})` : `rgba(255,250,240,${-0.10 * slope})`;
      c.fillRect(x, dy, sW / d + 0.3, this.BH);
      if (day < 0.6) {
        c.fillStyle = `rgba(14,18,40,${0.55 * (1 - day / 0.6)})`;
        c.fillRect(x, dy, sW / d + 0.3, this.BH);
      }
    }
  }

  destroy() { this.el.remove(); }
}

function bow(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = '#ff9fc4';
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 6, y - 5, x - 6, y); c.quadraticCurveTo(x - 6, y + 5, x, y); c.fill();
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 5, x + 6, y); c.quadraticCurveTo(x + 6, y + 5, x, y); c.fill();
  c.fillStyle = '#e77fa8'; c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
}
function roundRect(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
  x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
  x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
  x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
}

/** Zamanlayıcı: 6–12 dk'da bir; fırtına/yoğun siste uçmaz. */
export function schedulePlane(plane: Plane, canFly: () => boolean) {
  let next = performance.now() + 60_000 + Math.random() * 120_000; // ilk uçuş 1–3 dk
  return (now: number) => {
    if (!plane.active && now > next) {
      if (canFly()) void plane.launch(now);
      next = now + (6 + Math.random() * 6) * 60_000;
    }
    plane.frame(now);
  };
}
