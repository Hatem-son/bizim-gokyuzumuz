// Kumsal süsleri. Kum önbelleğine bir kez çizilenler: dalga kenarında yosun ve yosunlu kayalar, gelgit havuzu,
// sürüklenmiş kütük, deniz yıldızları, hindistan cevizleri, düşmüş hibiskus/frangipani çiçekleri, kumda sürünen çiçekli
// sarmaşıklar (kumsal sabah sefası), kumsal otları, kıyıya çekilmiş ahşap kano ve kuma çizilmiş kalp (H ♥ B).
// Canlı olanlar (her kare): yan yan yürüyüp deliğine saklanan yengeçler, gece ateş böcekleri.
import { rng } from '../gokyuzu/util';

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a.toFixed(3)})`;

/** gece rengi: ay ışığında renkler solar ve maviye kayar */
const lit = (col: RGB, day: number, hor: RGB) => mix(mix(mix(col, [40, 46, 66], 0.55), hor, 0.15), col, Math.pow(day, 0.7));

function wrapX(x: number, P: number, m: number) { const a = [x]; if (x < m) a.push(x + P); if (x > P - m) a.push(x - P); return a; }

export function paintDecor(c: CanvasRenderingContext2D, o: { P: number; h: number; x0: number; sand: RGB; day: number; hor: RGB; sun: RGB }) {
  const { P, h, x0, day, hor } = o;
  void o.sun;
  const r = rng(2024);
  const L = (col: RGB) => lit(col, day, hor);
  const shadow = (x: number, y: number, rx: number, ry: number, a = 0.28) => {
    const g = c.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, css(mix(o.sand, [0, 0, 0], 0.55), a)); g.addColorStop(1, css(mix(o.sand, [0, 0, 0], 0.55), 0));
    c.save(); c.translate(x, y); c.scale(1, ry / rx); c.translate(-x, -y); c.fillStyle = g; c.fillRect(x - rx, y - rx, rx * 2, rx * 2); c.restore();
  };
  const sc = (y: number) => 0.95 + 1.0 * (y / h);            // perspektif: önde iri (görünür boyut)

  // ---- 1) ıslak kenarda yosun şeritleri ve deniz çöpü (sonra dalga üstünü örter)
  for (let i = 0; i < 40; i++) {
    const x = r() * P, y = 30 + r() * 14, len = 8 + r() * 22;
    for (const xx of wrapX(x, P, 40)) {
      c.strokeStyle = css(L(r() < 0.5 ? [52, 74, 38] : [86, 70, 40]), 0.55); c.lineWidth = 0.9 + r() * 0.8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(xx, y); c.bezierCurveTo(xx + len * 0.3, y - 2, xx + len * 0.6, y + 2, xx + len, y - 0.5); c.stroke();
    }
  }

  // ---- 2) yosunlu kaya kümeleri (ıslak parlaklık) + yanında gelgit havuzu (göğü yansıtır)
  const rocks = [x0 - 330, x0 + 250, x0 + P * 0.27, x0 + P * 0.52, x0 - P * 0.22];
  for (const rx0 of rocks) {
    const y = 40 + r() * 10, k = sc(y) * (0.9 + r() * 0.4);
    for (const bx of wrapX(((rx0 % P) + P) % P, P, 80)) {
      // gelgit havuzu
      const px = bx + 26 * k, py = y + 6 * k;
      c.save(); c.translate(px, py); c.scale(1, 0.32);
      const pg = c.createRadialGradient(0, 0, 0, 0, 0, 16 * k);
      pg.addColorStop(0, css(mix(hor, [255, 255, 255], 0.25), 0.85)); pg.addColorStop(0.8, css(mix(hor, [0, 0, 0], 0.2), 0.8)); pg.addColorStop(1, css(mix(o.sand, [0, 0, 0], 0.4), 0.6));
      c.fillStyle = pg; c.beginPath(); c.arc(0, 0, 16 * k, 0, Math.PI * 2); c.fill(); c.restore();
      c.strokeStyle = css(mix(o.sand, [0, 0, 0], 0.4), 0.5); c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(px, py, 16 * k, 5.1 * k, 0, 0, Math.PI * 2); c.stroke();
      // kayalar
      for (let q = 0; q < 4; q++) {
        const qx = bx + (q - 1.5) * 9 * k + (r() - 0.5) * 6 * k, qy = y - (q % 2) * 3 * k, w = (7 + r() * 9) * k, hh = (5 + r() * 7) * k;
        shadow(qx + 2, qy + 1, w * 1.1, w * 0.3, 0.35);
        const base = L(mix([86, 84, 80], [60, 58, 56], r()));
        const g = c.createLinearGradient(qx - w, qy - hh, qx + w, qy);
        g.addColorStop(0, css(mix(base, [255, 255, 255], 0.25))); g.addColorStop(1, css(mix(base, [0, 0, 0], 0.35)));
        c.fillStyle = g;
        c.beginPath(); c.moveTo(qx - w, qy);
        c.bezierCurveTo(qx - w, qy - hh * 0.8, qx - w * 0.4, qy - hh * 1.1, qx + w * 0.1, qy - hh);
        c.bezierCurveTo(qx + w * 0.7, qy - hh * 0.9, qx + w, qy - hh * 0.4, qx + w, qy); c.closePath(); c.fill();
        c.fillStyle = css(L([70, 104, 52]), 0.65);                                          // yosun
        c.beginPath(); c.ellipse(qx - w * 0.2, qy - hh * 0.78, w * 0.55, hh * 0.22, -0.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = css([255, 255, 255], 0.22 + 0.2 * day);                              // ıslak parlaklık
        c.beginPath(); c.ellipse(qx - w * 0.35, qy - hh * 0.55, w * 0.18, hh * 0.08, -0.4, 0, Math.PI * 2); c.fill();
      }
    }
  }

  // ---- 3) sürüklenmiş kütükler (dal güdükleri, damar çizgileri, gölge)
  for (const [wx, y, len, ang] of [[x0 - 150, 58, 60, -0.08], [x0 + P * 0.36, 70, 90, 0.06], [x0 - P * 0.4, 58, 60, 0.1]] as const) {
    const k = sc(y);
    for (const bx of wrapX(((wx % P) + P) % P, P, 120)) {
      c.save(); c.translate(bx, y); c.rotate(ang);
      const Lk = len * k, R = 4.2 * k;
      shadow(3, R + 1, Lk * 0.55, R * 0.7, 0.35);
      const wood = L([168, 150, 128]);
      const g = c.createLinearGradient(0, -R, 0, R);
      g.addColorStop(0, css(mix(wood, [255, 255, 255], 0.25))); g.addColorStop(0.6, css(wood)); g.addColorStop(1, css(mix(wood, [0, 0, 0], 0.4)));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-Lk / 2, -R * 0.8); c.quadraticCurveTo(0, -R * 1.15, Lk / 2, -R * 0.6); c.lineTo(Lk / 2 + 2, R * 0.5);
      c.quadraticCurveTo(0, R * 1.1, -Lk / 2, R * 0.9); c.closePath(); c.fill();
      c.fillStyle = css(mix(wood, [0, 0, 0], 0.2)); c.beginPath(); c.ellipse(-Lk / 2, 0, R * 0.35, R * 0.85, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = css(mix(wood, [90, 70, 50], 0.5), 0.6); c.lineWidth = 0.5;
      for (let q = 0; q < 5; q++) { const yy = -R * 0.6 + q * R * 0.3; c.beginPath(); c.moveTo(-Lk * 0.45, yy); c.bezierCurveTo(-Lk * 0.1, yy - 0.8, Lk * 0.15, yy + 0.8, Lk * 0.45, yy); c.stroke(); }
      c.strokeStyle = css(wood); c.lineWidth = 2.2 * k; c.lineCap = 'round';                // dal güdükleri
      c.beginPath(); c.moveTo(Lk * 0.12, -R * 0.8); c.lineTo(Lk * 0.2, -R * 2.6); c.lineTo(Lk * 0.28, -R * 3.1); c.stroke();
      c.lineWidth = 1.4 * k; c.beginPath(); c.moveTo(-Lk * 0.25, -R * 0.9); c.lineTo(-Lk * 0.32, -R * 2); c.stroke();
      c.restore();
    }
  }

  // ---- 4) ahşap kano (kıyıya çekilmiş): gövde, yan denge kütüğü, iki kol, içinde kürek
  { const wx = (((x0 - 300) % P) + P) % P, y = 62, k = sc(y) * 0.9;
    for (const bx of wrapX(wx, P, 160)) {
      c.save(); c.translate(bx, y); c.rotate(-0.12);
      const Lk = 120 * k, D = 9 * k;
      shadow(4, D * 0.9, Lk * 0.55, D * 0.6, 0.4);
      const wood = L([132, 86, 52]), wood2 = L([170, 122, 78]);
      // denge kütüğü (arkada) ve kollar
      c.fillStyle = css(L([150, 128, 104])); c.beginPath(); c.ellipse(Lk * 0.05, -D * 2.1, Lk * 0.33, D * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = css(mix(wood, [0, 0, 0], 0.2)); c.lineWidth = 1.3 * k;
      for (const ax of [-0.14, 0.2]) { c.beginPath(); c.moveTo(Lk * ax, -D * 0.4); c.lineTo(Lk * ax + 2, -D * 2.1); c.stroke(); }
      // gövde
      const g = c.createLinearGradient(0, -D, 0, D);
      g.addColorStop(0, css(wood2)); g.addColorStop(0.5, css(wood)); g.addColorStop(1, css(mix(wood, [0, 0, 0], 0.45)));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-Lk / 2, -D * 0.6);
      c.quadraticCurveTo(-Lk * 0.1, -D * 0.2, Lk / 2, -D * 0.9);
      c.quadraticCurveTo(Lk * 0.45, D * 0.6, Lk * 0.3, D * 0.7);
      c.lineTo(-Lk * 0.35, D * 0.7);
      c.quadraticCurveTo(-Lk * 0.48, D * 0.3, -Lk / 2, -D * 0.6); c.closePath(); c.fill();
      // iç (koyu) ve küpeşte çizgisi
      c.fillStyle = css(mix(wood, [0, 0, 0], 0.55));
      c.beginPath(); c.ellipse(Lk * 0.02, -D * 0.45, Lk * 0.4, D * 0.22, -0.02, 0, Math.PI * 2); c.fill();
      c.strokeStyle = css(mix(wood2, [255, 255, 255], 0.2), 0.7); c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(-Lk / 2, -D * 0.6); c.quadraticCurveTo(-Lk * 0.1, -D * 0.2, Lk / 2, -D * 0.9); c.stroke();
      // boyalı şerit (gövde boyunca ince desen)
      c.strokeStyle = css(L([196, 70, 60]), 0.7); c.lineWidth = 1.1 * k;
      c.beginPath(); c.moveTo(-Lk * 0.42, D * 0.05); c.quadraticCurveTo(0, D * 0.35, Lk * 0.4, -D * 0.2); c.stroke();
      // kürek (kanoya yaslı)
      c.strokeStyle = css(wood2); c.lineWidth = 1.2 * k;
      c.beginPath(); c.moveTo(-Lk * 0.1, -D * 0.6); c.lineTo(Lk * 0.38, D * 1.6); c.stroke();
      c.fillStyle = css(wood2); c.beginPath(); c.ellipse(Lk * 0.42, D * 1.9, 3 * k, 7 * k, -0.6, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  // ---- 5) kumsal sabah sefası: kumda sürünen sarmaşık, kalp biçimli yapraklar, pembe-mor çiçekler (6 yer)
  const vine = (sx: number, sy: number, len: number, seed: number) => {
    const rr = rng(seed); let x = sx, y = sy, a = rr() * 6.28;
    const leaf = L([62, 128, 66]), leaf2 = L([40, 92, 50]), stem = L([96, 120, 60]);
    c.strokeStyle = css(stem, 0.85); c.lineWidth = 0.9; c.lineCap = 'round';
    for (let i = 0; i < len; i++) {
      const k = sc(y);
      a += (rr() - 0.5) * 0.7; const nx = x + Math.cos(a) * 6 * k, ny = Math.max(52, Math.min(h - 4, y + Math.sin(a) * 2.2 * k));
      c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      if (i % 2 === 0) {                                             // kalp yaprak
        const lx = nx + (rr() - 0.5) * 3, ly = ny - 2 * k, s = (2.4 + rr() * 1.4) * k;
        c.fillStyle = css(rr() < 0.5 ? leaf : leaf2);
        c.beginPath(); c.moveTo(lx, ly + s); c.bezierCurveTo(lx - s * 1.3, ly, lx - s * 0.7, ly - s * 1.1, lx, ly - s * 0.3);
        c.bezierCurveTo(lx + s * 0.7, ly - s * 1.1, lx + s * 1.3, ly, lx, ly + s); c.fill();
      }
      if (rr() < 0.18) {                                             // huni çiçek: pembe-mor, ortası açık
        const fx = nx, fy = ny - 2.5 * k, fr = (2.6 + rr() * 1.2) * k;
        const petal = L(rr() < 0.5 ? [226, 128, 192] : [198, 114, 214]);
        c.fillStyle = css(petal, 0.92);
        c.beginPath(); c.ellipse(fx, fy, fr * 1.15, fr * 0.85, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(L([255, 246, 226]), 0.9);
        c.beginPath(); c.arc(fx, fy, fr * 0.36, 0, Math.PI * 2); c.fill();
      }
      x = nx; y = ny;
    }
  };
  const vineSpots = [x0 - 205, x0 + 140, x0 + P * 0.18, x0 + P * 0.41, x0 - P * 0.19, x0 - P * 0.34];
  vineSpots.forEach((vx0, idx) => {
    const vy = 76 + (idx % 3) * 18;
    for (const bx of wrapX(((vx0 % P) + P) % P, P, 140)) vine(bx, vy, 16 + (idx % 3) * 4, 310 + idx * 17);
  });

  // ---- 6) kumsal otu (70 tutam)
  for (let i = 0; i < 70; i++) {
    const wx = r() * P, y = 56 + Math.pow(r(), 0.75) * Math.max(12, h - 62), k = sc(y) * (0.7 + r() * 0.55);
    const blades = 4 + Math.floor(r() * 5);
    for (const bx of wrapX(wx, P, 40)) {
      shadow(bx, y + 1, 5 * k, 1.6 * k, 0.2);
      for (let b = 0; b < blades; b++) {
        const spread = ((b / (blades - 1 || 1)) - 0.5) * 1.3 + (r() - 0.5) * 0.25;
        const bh = (8 + r() * 11) * k;
        c.strokeStyle = css(L(b % 2 ? [78, 128, 62] : [118, 146, 76]), 0.82);
        c.lineWidth = (0.7 + r() * 0.4) * Math.min(1.4, k);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(bx + spread * 2, y);
        c.quadraticCurveTo(bx + spread * bh * 0.45, y - bh * 0.65, bx + spread * bh * 0.95, y - bh);
        c.stroke();
      }
    }
  }

  // ---- 7) deniz yıldızları (18 adet, kıyıya yakın ıslak/nemli kumda)
  for (let i = 0; i < 18; i++) {
    const wx = (i === 0 ? x0 + 68 : r() * P), y = i === 0 ? 48 : 34 + r() * 34, k = sc(y) * (0.65 + r() * 0.35);
    const rot = r() * 6.28;
    const col = L(r() < 0.6 ? [228, 114, 86] : [236, 158, 96]);
    for (const bx of wrapX(((wx % P) + P) % P, P, 30)) {
      c.save(); c.translate(bx, y); c.scale(1, 0.58); c.rotate(rot);
      shadow(0.6, 1, 5.5 * k, 5.5 * k, 0.3);
      c.fillStyle = css(col, 0.92);
      c.beginPath();
      for (let p = 0; p < 10; p++) {
        const ang = (p / 10) * Math.PI * 2, rad = (p % 2 === 0 ? 5.2 : 2.0) * k;
        p ? c.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad) : c.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      c.closePath(); c.fill();
      c.fillStyle = css(mix(col, [255, 240, 220], 0.45), 0.7);
      c.beginPath(); c.arc(0, 0, 1.1 * k, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  // ---- 8) hindistan cevizi ve yarım kabuk (10 adet)
  const cocoSpots = [x0 - 168, x0 - 154, x0 + 118, ...Array.from({ length: 7 }, () => r() * P)];
  cocoSpots.forEach((wx0, i) => {
    const y = i < 2 ? 84 + i * 7 : 58 + r() * Math.max(14, h - 72), k = sc(y) * 0.85;
    const half = i % 3 === 1;
    for (const bx of wrapX(((wx0 % P) + P) % P, P, 36)) {
      shadow(bx + 1.5, y + 1.8 * k, 5.8 * k, 2.2 * k, 0.36);
      const husk = L([104, 72, 46]), huskHi = L([148, 108, 72]);
      if (!half) {
        const g = c.createRadialGradient(bx - 1.5 * k, y - 1.5 * k, 0.5, bx, y, 5 * k);
        g.addColorStop(0, css(huskHi)); g.addColorStop(1, css(mix(husk, [0, 0, 0], 0.35)));
        c.fillStyle = g;
        c.beginPath(); c.ellipse(bx, y, 4.8 * k, 3.8 * k, -0.2, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = css(husk);
        c.beginPath(); c.ellipse(bx, y, 4.6 * k, 2.8 * k, 0.15, 0, Math.PI); c.fill();
        c.fillStyle = css(L([244, 238, 226]), 0.92);
        c.beginPath(); c.ellipse(bx, y - 0.3 * k, 4.2 * k, 1.6 * k, 0.15, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(mix(husk, [0, 0, 0], 0.25), 0.55);
        c.beginPath(); c.ellipse(bx, y - 0.2 * k, 2.7 * k, 0.95 * k, 0.15, 0, Math.PI * 2); c.fill();
      }
    }
  });

  // ---- 9) düşmüş hibiskus ve frangipani çiçekleri (ana palmiyenin dibinde)
  for (let i = 0; i < 16; i++) {
    const wx = x0 - 205 + (r() - 0.35) * 96, y = 74 + r() * Math.max(12, h - 84), k = sc(y) * (0.72 + r() * 0.3);
    const hib = i % 3 === 0;
    for (const bx of wrapX(((wx % P) + P) % P, P, 40)) {
      c.save(); c.translate(bx, y); c.scale(1, 0.65); c.rotate(r() * 6.28);
      const pet = hib ? L([232, 74, 108]) : L([252, 246, 234]);
      for (let p = 0; p < 5; p++) {
        const ang = (p / 5) * Math.PI * 2;
        c.fillStyle = css(pet, 0.92);
        c.beginPath(); c.ellipse(Math.cos(ang) * 2.3 * k, Math.sin(ang) * 2.3 * k, 2.2 * k, 1.35 * k, ang, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = css(hib ? L([250, 210, 92]) : L([248, 204, 78]), 0.95);
      c.beginPath(); c.arc(0, 0, 1.1 * k, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  // ---- 10) kuma çizilmiş "H + B" kalbi (ana sahnede ayak izlerinin yanında, dock'un üstünde görünür kuru kumda)
  { const hx0 = (((x0 + 54) % P) + P) % P, hy = 56;
    for (const bx of wrapX(hx0, P, 80)) {
      c.save();
      c.translate(bx, hy);
      c.rotate(-0.08);
      c.scale(1, 0.62); // kum perspektifi
      const s = 1.45;
      const heartPath = () => {
        c.beginPath();
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          const px = 16 * Math.pow(Math.sin(t), 3) * s;
          const py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
      };
      // parmakla kuma kazınmış oluk: açık kenar + koyu çukur
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.save(); c.translate(-0.9, 1.3); heartPath();
      c.strokeStyle = css(mix(o.sand, [255, 255, 255], 0.36), 0.42 + 0.16 * day); c.lineWidth = 2.6; c.stroke(); c.restore();
      heartPath();
      c.strokeStyle = css(mix(o.sand, [0, 0, 0], 0.48), 0.55); c.lineWidth = 1.8; c.stroke();

      // içinde "H + B" harfleri (parmak izi oluğu)
      c.font = '600 10.5px "Cormorant Garamond", Georgia, serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = css(mix(o.sand, [255, 255, 255], 0.35), 0.38);
      c.fillText('H + B', -0.6, 2.8);
      c.fillStyle = css(mix(o.sand, [0, 0, 0], 0.52), 0.62);
      c.fillText('H + B', 0, 2);
      c.restore();
    }
  }
}

/** Canlı kumsal: 25–75 sn'de bir yan yan yürüyüp deliğine giren yengeç + gece 18 ateş böceği ('lighter'). */
export class BeachLife {
  private crabAt = performance.now() + 18_000 + Math.random() * 25_000;
  private crab: { t0: number; dur: number; wx0: number; wx1: number; y: number; dir: number } | null = null;
  private flies: { u: number; v: number; ph: number; sp: number; r: number }[] = [];

  constructor() {
    const r = rng(1408);
    for (let i = 0; i < 18; i++) {
      this.flies.push({ u: r(), v: r(), ph: r() * 6.28, sp: 0.55 + r() * 0.85, r: 1.4 + r() * 1.5 });
    }
  }

  draw(c: CanvasRenderingContext2D, now: number, scrollX: number, W: number, P: number, topY: number, h: number, day: number, hor: RGB) {
    // ---- 1) yengeç: 25–75 sn'de bir deliğinden çıkıp yan yan yürür ve deliğine girer
    if (!this.crab && now > this.crabAt) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const wx0 = scrollX + W * (0.22 + Math.random() * 0.56);
      this.crab = { t0: now, dur: 5200 + Math.random() * 2600, wx0, wx1: wx0 + dir * (48 + Math.random() * 44), y: topY + 34 + Math.random() * Math.max(16, h * 0.32), dir };
    }
    if (this.crab) {
      const cr = this.crab, u = (now - cr.t0) / cr.dur;
      if (u >= 1) {
        this.crab = null;
        this.crabAt = now + 25_000 + Math.random() * 50_000;
      } else {
        // duraksayarak yan yan yürüyüş + başta/sonda deliğe giriş-çıkış
        const burrow = Math.min(1, u * 7) * Math.min(1, (1 - u) * 7);
        const walk = u + Math.sin(u * Math.PI * 6) * 0.025;
        let sx = cr.wx0 + (cr.wx1 - cr.wx0) * walk - scrollX;
        sx -= P * Math.round((sx - W / 2) / P);
        const holeX = cr.wx1 - scrollX - P * Math.round((cr.wx1 - scrollX - W / 2) / P);
        if (holeX > -20 && holeX < W + 20) {
          c.fillStyle = css(mix(hor, [0, 0, 0], 0.72), 0.45);
          c.beginPath(); c.ellipse(holeX, cr.y + 1.5, 3.4, 1.4, 0, 0, Math.PI * 2); c.fill();
        }
        if (sx > -20 && sx < W + 20 && burrow > 0.02) {
          const col = lit([206, 92, 68], day, hor);
          c.save(); c.translate(sx, cr.y + (1 - burrow) * 2.5); c.scale(burrow, burrow);
          c.strokeStyle = css(mix(col, [0, 0, 0], 0.25), 0.9); c.lineWidth = 0.8;
          const leg = Math.sin(now * 0.028) * 1.4;
          for (const sgn of [-1, 1]) {
            for (let l = 0; l < 3; l++) {
              const ly = -0.5 + l * 0.9, off = (l % 2 ? leg : -leg) * 0.5;
              c.beginPath(); c.moveTo(sgn * 2.2, ly); c.lineTo(sgn * (4.6 + off), ly + 1.6); c.stroke();
            }
            // kıskaçlar
            c.beginPath(); c.moveTo(sgn * 2, -1.2); c.lineTo(sgn * 3.8, -2.8); c.stroke();
          }
          c.fillStyle = css(col, 0.95);
          c.beginPath(); c.ellipse(0, 0, 3.1, 2.1, 0, 0, Math.PI * 2); c.fill();
          c.restore();
        }
      }
    }

    // ---- 2) gece ateş böcekleri (18 adet, 'lighter')
    const night = 1 - day;
    if (night > 0.35) {
      const t = now / 1000, kNight = (night - 0.35) / 0.65;
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const f of this.flies) {
        const pulse = Math.max(0, Math.sin(t * f.sp * 2.1 + f.ph));
        const a = Math.pow(pulse, 2.2) * kNight;
        if (a < 0.03) continue;
        const wx = f.u * P + Math.sin(t * 0.45 + f.ph) * 26;
        let x = wx - scrollX; x -= P * Math.round((x - W / 2) / P);
        if (x < -16 || x > W + 16) continue;
        const y = topY - 18 + f.v * Math.max(36, h * 0.72) + Math.cos(t * 0.6 + f.ph * 1.7) * 9;
        const rr = f.r * 5.5;
        const g = c.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(235,255,175,${(0.75 * a).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(185,238,110,${(0.32 * a).toFixed(3)})`);
        g.addColorStop(1, 'rgba(160,225,90,0)');
        c.fillStyle = g;
        c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      c.restore();
    }
  }
}

