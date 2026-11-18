// Meteor (kayan yıldız) ve yıldızın yerine yerleşmesi — gerçekçi ve ölçülü.
// Gerçek meteor: çok kısa (0.4–0.8 sn), ince, başı beyaz-yeşilimsi, iz hızla söner; ortada parlar sonra yanıp biter.
// Gelen yıldız: meteor gibi süzülür, hedefte YAVAŞLAR ve yumuşak bir ışık açılmasıyla yıldıza dönüşür.
// Halka, konfeti, çizgi film ışını YOK. Tek canvas, DOM elemanı yok.
import { clamp, lerp, ease, rng, hash } from './util';

type V = { x: number; y: number };
type Meteor = {
  a: V; b: V; t0: number; dur: number; incoming: boolean; tint: string; dim: number;
  onLand?: () => void; landed: boolean; settle?: () => void;
  hist: V[]; // iz için son konumlar
};

/** Önbellekli yumuşak ışık lekesi (radyal gradyan, bir kez çizilir). */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glow(color: string, size = 64) {
  const k = color + size;
  let c = glowCache.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(size, size, 0, size, size, size);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.08, rgba(color, 0.9));
    g.addColorStop(0.25, rgba(color, 0.32));
    g.addColorStop(0.55, rgba(color, 0.08));
    g.addColorStop(1, rgba(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, size * 2, size * 2);
    glowCache.set(k, c);
  }
  return c;
}

export class Effects {
  private list: Meteor[] = [];
  private r = rng(7);
  flashEl?: HTMLElement;
  constructor(private ctx: CanvasRenderingContext2D, public view: { w: number; h: number }) {}

  get busy() { return this.list.length > 0; }

  /** Gelen/gönderilen yıldız. tint: kişinin rengi (çok hafif uygulanır). */
  incoming(target: V, o: { now: number; tint: string; dim?: number; onLand?: () => void; onSettle?: () => void }) {
    const fromRight = target.x < this.view.w * 0.5;
    const a = { x: fromRight ? target.x + 240 : target.x - 240, y: Math.max(-20, target.y - 210) };
    this.list.push({ a, b: target, t0: o.now, dur: 1150, incoming: true, tint: o.tint, dim: o.dim ?? 1, onLand: o.onLand, settle: o.onSettle, landed: false, hist: [] });
  }

  /** Yalnızca yerleşme (uçuş başka yerde yapıldıysa, ör. yazma kartından gönderim). */
  land(target: V, o: { now: number; tint: string; onSettle?: () => void }) {
    this.list.push({ a: target, b: target, t0: o.now - 1150, dur: 1150, incoming: true, tint: o.tint, dim: 1, settle: o.onSettle, landed: false, hist: [] });
  }

  /** Dekoratif meteor (gece, açık hava; 45–120 sn'de bir). */
  decorative(now: number) {
    const W = this.view.w, H = this.view.h;
    const a = { x: W * (0.1 + this.r() * 0.8), y: H * (0.04 + this.r() * 0.25) };
    const dir = this.r() < 0.5 ? -1 : 1;
    const len = 110 + this.r() * 140;
    const ang = (18 + this.r() * 30) * (Math.PI / 180);
    const b = { x: a.x + Math.cos(ang) * len * dir, y: a.y + Math.sin(ang) * len };
    this.list.push({ a, b, t0: now, dur: 420 + this.r() * 380, incoming: false, tint: '#e9fff3', dim: 1, landed: false, hist: [] });
  }

  frame(now: number, _dt: number): boolean {
    const c = this.ctx;
    c.clearRect(0, 0, this.view.w, this.view.h);
    if (!this.list.length) return false;
    c.globalCompositeOperation = 'lighter';
    for (const m of this.list) m.incoming ? this.drawIncoming(m, now) : this.drawMeteor(m, now);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    this.list = this.list.filter((m) => now - m.t0 < m.dur + (m.incoming ? 1300 : 500));
    return true;
  }

  /** İnce, konik iz: geçmiş konumlardan çizilen, başa doğru kalınlaşan ve parlaklaşan şerit. */
  private trail(m: Meteor, head: V, maxLen: number, bright: number, color: string) {
    const c = this.ctx;
    m.hist.unshift({ ...head });
    if (m.hist.length > 26) m.hist.pop();
    // izi uzunluk sınırına kırp
    let acc = 0;
    const pts: V[] = [head];
    for (let i = 1; i < m.hist.length && acc < maxLen; i++) {
      acc += Math.hypot(m.hist[i].x - m.hist[i - 1].x, m.hist[i].y - m.hist[i - 1].y);
      pts.push(m.hist[i]);
    }
    if (pts.length < 2) return;
    // Tek parça, sivrilen şerit: kuyrukta 0.2 px → başta 1.6 px; uzunluk boyunca gradyan (boncuklanma yok)
    const left: V[] = [], right: V[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const w = 0.1 + 0.8 * Math.pow(1 - i / (pts.length - 1), 1.5);
      left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
      right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
    }
    const tail = pts[pts.length - 1];
    const g = c.createLinearGradient(head.x, head.y, tail.x, tail.y);
    g.addColorStop(0, rgba(color, 0.95 * bright));
    g.addColorStop(0.25, rgba(color, 0.45 * bright));
    g.addColorStop(1, rgba(color, 0));
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) c.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
    c.closePath();
    c.fill();
  }

  private drawMeteor(m: Meteor, now: number) {
    const c = this.ctx;
    const t = (now - m.t0) / m.dur;
    if (t <= 1) {
      const p = { x: lerp(m.a.x, m.b.x, t), y: lerp(m.a.y, m.b.y, t) };
      // parlaklık eğrisi: belirir, ortada parlar, söner
      const br = Math.sin(Math.PI * clamp(t)) ** 0.7;
      this.trail(m, p, 90, br, '#f2fff8');
      c.globalAlpha = br;
      c.drawImage(glow('#d8ffe8', 10), p.x - 10, p.y - 10, 20, 20);
    } else {
      // kalıcı iz (train): çok soluk, kısa süre
      const k = 1 - (now - m.t0 - m.dur) / 500;
      c.globalAlpha = 0.12 * k;
      c.strokeStyle = '#dfe8ff';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(lerp(m.a.x, m.b.x, 0.35), lerp(m.a.y, m.b.y, 0.35));
      c.lineTo(lerp(m.a.x, m.b.x, 0.85), lerp(m.a.y, m.b.y, 0.85));
      c.stroke();
    }
  }

  private drawIncoming(m: Meteor, now: number) {
    const c = this.ctx;
    const el = now - m.t0;
    const t = clamp(el / m.dur);
    // hafif kavisli yol, sona doğru belirgin yavaşlama
    const e = ease.outCubic(t);
    const ctrl = { x: lerp(m.a.x, m.b.x, 0.6), y: lerp(m.a.y, m.b.y, 0.15) };
    const u = 1 - e;
    const p = { x: u * u * m.a.x + 2 * u * e * ctrl.x + e * e * m.b.x, y: u * u * m.a.y + 2 * u * e * ctrl.y + e * e * m.b.y };
    const speed = 3 * (1 - t) * (1 - t); // outCubic türevi
    const col = mix('#ffffff', m.tint, 0.35);
    if (t < 1) {
      this.trail(m, p, lerp(10, 120, clamp(speed / 2.2)), m.dim, col);
      c.globalAlpha = m.dim;
      c.drawImage(glow(col, 14), p.x - 14, p.y - 14, 28, 28);
    } else if (!m.landed) {
      m.landed = true;
      m.onLand?.();
      this.flashEl?.animate([{ opacity: 0 }, { opacity: 0.035 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
    }
    // yerleşme: ışık 220 ms'de açılır, 1 sn'de yıldız boyutuna iner; çok ince, kısa difraksiyon ışınları
    const st = el - m.dur;
    if (st > -60) {
      const s = clamp(st / 1200);
      const open = st < 220 ? ease.outCubic(clamp((st + 60) / 280)) : 1;
      const size = lerp(46, 16, ease.inOutCubic(s)) * open;
      c.globalAlpha = m.dim * (st < 900 ? 1 : 1 - clamp((st - 900) / 300));
      c.drawImage(glow(col, 48), m.b.x - size, m.b.y - size, size * 2, size * 2);
      const ray = lerp(34, 12, ease.inOutCubic(s)) * open;
      c.globalAlpha *= 0.4;
      c.strokeStyle = col;
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(m.b.x - ray, m.b.y); c.lineTo(m.b.x + ray, m.b.y);
      c.moveTo(m.b.x, m.b.y - ray); c.lineTo(m.b.x, m.b.y + ray);
      c.stroke();
      if (s >= 1 && m.settle) { const cb = m.settle; m.settle = undefined; cb(); }
    }
  }
}

/**
 * Gönderilen (kalıcı) yıldızı çiz: kimin yıldızı olduğu (Ham ham mavi, Beto pembe, Ela altın-kehribar)
 * ilk bakışta net seçilsin diye doygun renkli dış hale + renkli korona halkası + parlak çekirdek + 4 difraksiyon ışını.
 */
export function drawUserStar(
  c: CanvasRenderingContext2D, x: number, y: number, id: string, now: number,
  o: { tint: string; daylight: number; arrivedAt?: number; unread?: boolean; hazel?: boolean; ext?: number; exposure?: number },
) {
  const exp = o.exposure ?? 1;
  if (exp < 0.01) return;
  const ext = o.ext ?? 1;
  const h = hash(id);
  const period = 2800 + (h % 2400), ph = ((h >>> 9) % 1000) / 1000;
  const sn = Math.sin(((now / period + ph) % 1) * Math.PI * 2);
  const boost = o.arrivedAt && now - o.arrivedAt < 10000 ? 1.4 : 1;
  const a = clamp(0.88 + 0.1 * sn * boost, 0.72, 1) * ext * exp;
  const sc = 1 + 0.04 * sn * boost;

  // Doygun renk: mavi (#6b9bff) / pembe (#ff669e) / ela (#e5a84b)
  const isPink = /ff8db5|ffadcc|f0457c/i.test(o.tint);
  const baseHue = o.hazel ? '#e5a84b' : isPink ? '#ff629a' : '#6396ff';
  const haloCol = mix('#ffffff', baseHue, 0.88);
  const coreRingCol = mix('#ffffff', baseHue, 0.72);
  const centerCol = mix('#ffffff', baseHue, 0.25);

  if (o.daylight > 0.25) {
    const d = o.daylight * exp;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.28 * d;
    c.drawImage(glow('#091028', 24), x - 10, y - 10, 20, 20);
    c.globalAlpha = 0.88 * d * a;
    c.drawImage(glow(haloCol, 48), x - 12 * sc, y - 12 * sc, 24 * sc, 24 * sc);
    c.globalAlpha = 0.92 * d;
    c.fillStyle = coreRingCol;
    c.beginPath(); c.arc(x, y, 2.4 * sc, 0, 6.2832); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x, y, 1.25, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    if (o.daylight > 0.72) return;
  }

  // 1) Dış renkli atmosfer halesi (source-over katmanı rengin beyaza patlamasını önler ve rengi net gösterir)
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = a * 0.55;
  const gOuter = 15.5 * sc;
  c.drawImage(glow(baseHue, 48), x - gOuter, y - gOuter, gOuter * 2, gOuter * 2);

  // 2) Parlak renkli iç hale + difraksiyon ışınları
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = a * 0.85;
  const gMid = 10.5 * sc;
  c.drawImage(glow(haloCol, 48), x - gMid, y - gMid, gMid * 2, gMid * 2);

  c.globalAlpha = a * 0.52;
  c.strokeStyle = coreRingCol;
  c.lineWidth = 0.85;
  const r = 10.5 * sc;
  c.beginPath();
  c.moveTo(x - r, y); c.lineTo(x + r, y);
  c.moveTo(x, y - r); c.lineTo(x, y + r);
  c.stroke();

  // 3) Renkli korona halkası + sıcak beyaz merkez çekirdek
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = a * 0.95;
  c.fillStyle = coreRingCol;
  c.beginPath(); c.arc(x, y, 2.5 * sc, 0, 6.2832); c.fill();

  c.globalAlpha = a;
  c.fillStyle = centerCol;
  c.beginPath(); c.arc(x, y, 1.35, 0, 6.2832); c.fill();

  if (o.unread) {
    c.globalCompositeOperation = 'lighter';
    const t = ((now + (h % 6000)) % 6000) / 1600;
    if (t < 1) {
      c.globalAlpha = 0.36 * Math.sin(Math.PI * t) * ext * exp;
      const s = 14 + 13 * t;
      c.drawImage(glow(haloCol, 48), x - s, y - s, s * 2, s * 2);
    }
  }
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return '#' + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
