// Tropik volkanik dağ boyayıcı (gerçek manzara: Samoa/Tahiti tarzı yemyeşil, oyuntulu sırtlar).
// Siluet yükseklikleri verilir; önbellek tuvaline şunlar çizilir: ormanlık gövde, güneş/ay ışığı alan yamaçlar,
// gölgede kalan vadiler, tepeden inen erozyon oyukları, ağaç tepeleri dokusu, eteğe doğru pus, sırtta ışık çizgisi.
import { rng } from '../gokyuzu/util';

export type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a.toFixed(3)})`;

export type MtPal = { lit: RGB; base: RGB; shade: RGB; haze: RGB; rim: RGB; rimA: number; contrast: number };

/** @param depth 0 yakın (canlı) … 1 uzak (puslu) */
export function mtPalette(hor: RGB, day: number, sun: RGB, depth: number): MtPal {
  const d = Math.pow(Math.max(0, Math.min(1, day)), 0.8);
  const sunT: RGB = [0.8 + 0.2 * sun[0], 0.8 + 0.2 * sun[1], 0.75 + 0.25 * sun[2]];
  const dayLit: RGB = [126 * sunT[0], 184 * sunT[1], 92 * sunT[2]], dayBase: RGB = [48, 108, 60], dayShade: RGB = [16, 58, 40];
  const nLit: RGB = [44, 58, 72], nBase: RGB = [13, 21, 28], nShade: RGB = [5, 9, 15];
  const hz = depth * 0.6 + (1 - d) * 0.12;
  const toHaze = (c: RGB) => mix(c, hor, hz);
  return {
    lit: toHaze(mix(nLit, dayLit, d)), base: toHaze(mix(nBase, dayBase, d)), shade: toHaze(mix(nShade, dayShade, d)),
    haze: mix(hor, [255, 255, 255], 0.1 * d),
    rim: d > 0.3 ? mix([255, 246, 210], hor, 0.2) : [178, 192, 222], rimA: (d > 0.3 ? 0.32 : 0.34) * (1 - depth * 0.6),
    contrast: (0.35 + 0.65 * d) * (1 - depth * 0.55),
  };
}

/**
 * @param h her sütunun yüksekliği (px); sütun genişliği dx
 * @param Hc önbellek yüksekliği (taban = Hc)
 * @param canopy ağaç dokusu yoğunluğu (0..1)
 */
export function paintMountain(c: CanvasRenderingContext2D, h: ArrayLike<number>, dx: number, Hc: number, pal: MtPal, seed: number, canopy = 1, wrap = false) {
  // wrap (360° dikişsiz sıra): son örnekten sonra ilk örneğe dönülür; tuval tam bir periyot (n*dx) çizilir → dikişte 1-2 px boşluk kalmaz
  if (wrap) { const he = new Float32Array(h.length + 1); for (let i = 0; i < h.length; i++) he[i] = h[i]; he[h.length] = h[0]; h = he; }
  const n = wrap ? h.length - 1 : h.length, Wd = wrap ? n * dx : (n - 1) * dx;
  let maxH = 1; for (let i = 0; i < n; i++) maxH = Math.max(maxH, h[i]);
  const at = (i: number) => (wrap ? h[((i % n) + n) % n] : h[Math.max(0, Math.min(n - 1, i))]);
  const path = () => { c.beginPath(); c.moveTo(0, Hc); for (let i = 0; i <= (wrap ? n : n - 1); i++) c.lineTo(i * dx, Hc - h[i]); c.lineTo(Wd, Hc); c.closePath(); };
  path();
  const g = c.createLinearGradient(0, Hc - maxH, 0, Hc);
  g.addColorStop(0, css(mix(pal.base, pal.lit, 0.25))); g.addColorStop(0.6, css(pal.base)); g.addColorStop(1, css(mix(pal.base, pal.haze, 0.35)));
  c.fillStyle = g; c.fill();
  c.save(); path(); c.clip();
  // 1) yamaç ışığı: ışık sol-üstten. Eğim yumuşatılır (dikey bant/çizgi görünmez); ışık sırta yakın güçlü, eteğe doğru azalır
  const k = Math.max(3, Math.round(9 / dx));
  for (let i = 0; i < n; i++) {
    if (h[i] < 0.5) continue;
    let s = 0; for (let j = 1; j <= k; j++) s += at(i + j) - at(i - j);
    s /= k * k * dx;
    const a = Math.max(-1, Math.min(1, s * 2.2)) * pal.contrast;
    const top = Hc - h[i], len = h[i] * 0.9;
    const gr = c.createLinearGradient(0, top, 0, top + len);
    const col = a > 0 ? pal.lit : pal.shade, aa = Math.abs(a) * (a > 0 ? 0.6 : 0.7);
    gr.addColorStop(0, css(col, aa)); gr.addColorStop(1, css(col, aa * 0.15));
    c.fillStyle = gr; c.fillRect(i * dx, top, dx, len);
  }
  // 2) erozyon oyukları: her zirveden aşağı ayrılan kaburgalar (tropik volkanik dağların imzası)
  const r = rng(seed);
  const peaks: number[] = [];
  const win = Math.max(6, Math.round(24 / dx));
  for (let i = 0; i < n; i++) {
    if (h[i] < maxH * 0.3) continue;
    let ok = true; for (let j = -win; j <= win && ok; j++) if (at(i + j) > h[i]) ok = false;
    if (ok) peaks.push(i);
  }
  c.lineCap = 'round';
  for (const p of peaks) {
    const px = p * dx, py = Hc - h[p], ribs = 3 + Math.floor(h[p] / 14);
    for (let q = 0; q < ribs; q++) {
      const side = q % 2 ? 1 : -1, spread = (0.25 + r() * 0.9) * side;
      const sx = px + side * (1 + r() * 4) * dx, sy = py + 2 + r() * 3;
      const ex = sx + spread * h[p] * 0.9, ey = Hc - (r() * 0.25) * h[p];
      // içbükey, yumuşak oyuk: üstte dar ve belirgin, aşağıda genişleyip silikleşir (çizik gibi değil)
      const mx = sx + spread * h[p] * 0.08 + (r() - 0.5) * 4, my = sy + (ey - sy) * 0.6;
      const gr = c.createLinearGradient(0, sy, 0, ey);
      gr.addColorStop(0, css(pal.shade, 0.3 * pal.contrast + 0.05)); gr.addColorStop(1, css(pal.shade, 0));
      for (const [lw, al] of [[4.5, 0.35], [2.2, 0.7]] as const) {
        c.strokeStyle = gr; c.globalAlpha = al; c.lineWidth = lw * (0.7 + r() * 0.6);
        c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
      }
      c.globalAlpha = 1;
      const gl = c.createLinearGradient(0, sy, 0, ey);
      gl.addColorStop(0, css(pal.lit, 0.25 * pal.contrast)); gl.addColorStop(1, css(pal.lit, 0));
      c.strokeStyle = gl; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(sx - 2.2 * side, sy + 1); c.quadraticCurveTo(mx - 2.6 * side, my, ex - 3 * side, ey); c.stroke();
    }
  }
  // 3) orman dokusu: ağaç tepeleri (küçük yuvarlak kümeler), ışıklı tarafta açık, gölgede koyu
  const cnt = Math.round(((Wd * maxH) / 22) * canopy);
  for (let q = 0; q < cnt; q++) {
    const i = Math.floor(r() * n); if (h[i] < 1) continue;
    const x = i * dx + r() * dx, y = Hc - h[i] + 1 + Math.pow(r(), 0.8) * h[i];
    const t = r();
    c.fillStyle = css(t < 0.4 ? pal.lit : t < 0.75 ? pal.base : pal.shade, (0.22 + 0.25 * r()) * (0.4 + 0.6 * pal.contrast));
    c.beginPath(); c.arc(x, y, 0.7 + r() * 1.6, 0, Math.PI * 2); c.fill();
  }
  // 4) eteğe doğru pus (denize karışır)
  const hz = c.createLinearGradient(0, Hc - maxH * 0.5, 0, Hc);
  hz.addColorStop(0, css(pal.haze, 0)); hz.addColorStop(1, css(pal.haze, 0.55));
  c.fillStyle = hz; c.fillRect(0, Hc - maxH * 0.5, Wd, maxH * 0.5);
  c.restore();
  // 5) sırtta ince ışık çizgisi (güneş ya da ay)
  c.beginPath(); for (let i = 0; i <= (wrap ? n : n - 1); i++) i ? c.lineTo(i * dx, Hc - h[i] + 0.4) : c.moveTo(0, Hc - h[i] + 0.4);
  c.strokeStyle = css(pal.rim, pal.rimA); c.lineWidth = 0.8; c.stroke();
}

/** Tepede toplanan bulut: yumuşak, üst üste binen birkaç pamuk; zamanla belirir/dağılır, yavaşça sürüklenir. */
export function peakCloud(c: CanvasRenderingContext2D, x: number, y: number, w: number, t: number, seed: number, day: number, hor: RGB) {
  const vis = Math.max(0, Math.sin(t / 47 + seed * 2.3)) ** 1.5;
  if (vis < 0.02) return;
  const col: RGB = day > 0.3 ? mix([255, 255, 255], hor, 0.12) : mix([150, 160, 190], hor, 0.4);
  const a = vis * (day > 0.3 ? 0.75 : 0.35);
  const drift = Math.sin(t / 31 + seed) * w * 0.25;
  const r = rng(seed * 97 + 3);
  for (let i = 0; i < 7; i++) {
    const px = x + drift + (r() - 0.5) * w, py = y - r() * w * 0.12, rr = w * (0.18 + r() * 0.2);
    c.save(); c.translate(px, py); c.scale(1, 0.55);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rr);
    g.addColorStop(0, css(col, a * 0.55)); g.addColorStop(0.6, css(col, a * 0.3)); g.addColorStop(1, css(col, 0));
    c.fillStyle = g; c.fillRect(-rr, -rr, rr * 2, rr * 2); c.restore();
  }
}
