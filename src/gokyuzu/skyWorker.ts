// Web Worker: ağır doku hesapları ana iş parçacığından AYRI çalışır → kaydırma ve animasyon hiç takılmaz.
// Vite: new Worker(new URL('./skyWorker.ts', import.meta.url), { type: 'module' })
import { renderAtmosphere, AtmoParams } from './atmosphere';
import { renderClouds, CloudParams } from './cloudGen';
import { makeNoise3, fbm } from './noise';

type Job =
  | { id: number; type: 'atmo'; p: AtmoParams }
  | { id: number; type: 'clouds'; p: CloudParams }
  | { id: number; type: 'milky'; w: number; h: number; seed: number }
  | { id: number; type: 'moon'; size: number; fraction: number; waxing: boolean; tint: [number, number, number] | null };

const post = (id: number, w: number, h: number, data: Uint8ClampedArray) =>
  (self as any).postMessage({ id, w, h, data }, [data.buffer]);

self.onmessage = (e: MessageEvent<Job>) => {
  const j = e.data;
  if (j.type === 'atmo') {
    post(j.id, j.p.cols, j.p.rows, renderAtmosphere(j.p));
  } else if (j.type === 'clouds') {
    const r = renderClouds(j.p);
    post(j.id, r.width, r.height, r.data as Uint8ClampedArray);
  } else if (j.type === 'milky') {
    post(j.id, j.w, j.h, milkyWay(j.w, j.h, j.seed));
  } else if (j.type === 'moon') {
    post(j.id, j.size, j.size, moonDisk(j.size, j.fraction, j.waxing, j.tint));
  }
};

/** Samanyolu: çapraz uzanan soluk ışık kuşağı + koyu toz şeritleri. Çok soluk çizilir (opaklık ≤ 0.35). */
function milkyWay(w: number, h: number, seed: number) {
  const n = makeNoise3(seed);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // kuşak ekseni: sol alttan sağ üste hafif eğri
      const cy = 0.95 - u * 0.85 + 0.08 * Math.sin(u * 3.1);
      const dist = Math.abs(v - cy) / 0.16;
      const band = Math.exp(-dist * dist);
      if (band < 0.01) continue;
      const cloud = fbm(n, u * 6, v * 6, 0.5, 5);
      const dust = Math.max(0, fbm(n, u * 11 + 9, v * 11, 2.1, 4) - 0.48) * 3.2 * Math.exp(-(((v - cy) / 0.05) ** 2));
      const a = Math.max(0, band * (0.35 + 0.9 * (cloud - 0.35)) - dust * 0.5);
      const i = (y * w + x) * 4;
      out[i] = 222; out[i + 1] = 228; out[i + 2] = 255;
      out[i + 3] = Math.min(255, a * 255);
    }
  return out;
}

/**
 * Gerçekçi ay diski (kuzey yarımküreden görünüş, kuzey yukarıda).
 * Gerçek yakın yüz haritasına göre denizler, parlak kraterler (Tycho ışınlarıyla, Copernicus, Kepler),
 * ince krater dokusu. Lommel–Seeliger yansıması (ayda kenar kararması çok azdır), dar ve yumuşak terminatör,
 * terminatör yakınında rölyef. Yüksek çözünürlükte (192 px) üretilir, ~46 px çizilir → keskin.
 */
type Mare = [number, number, number, number, number, number]; // x, y, rx, ry, açı(rad), koyuluk
const MARIA: Mare[] = [
  [-0.56, -0.02, 0.30, 0.50, 0.15, 0.85], // Oceanus Procellarum
  [-0.27, -0.36, 0.27, 0.22, 0.2, 1.0],   // Imbrium
  [0.16, -0.34, 0.15, 0.14, 0, 0.95],     // Serenitatis
  [0.31, -0.07, 0.19, 0.15, -0.3, 0.95],  // Tranquillitatis
  [0.69, -0.27, 0.10, 0.08, 0, 1.0],      // Crisium
  [0.56, 0.12, 0.11, 0.18, 0.2, 0.85],    // Fecunditatis
  [0.36, 0.29, 0.08, 0.08, 0, 0.8],       // Nectaris
  [-0.18, 0.35, 0.17, 0.12, 0.2, 0.8],    // Nubium
  [-0.47, 0.39, 0.08, 0.08, 0, 0.85],     // Humorum
  [-0.06, -0.66, 0.44, 0.06, 0.05, 0.7],  // Frigoris
  [0.02, -0.14, 0.08, 0.06, 0, 0.7],      // Vaporum / Sinus Medii
  [-0.36, 0.08, 0.10, 0.12, 0, 0.6],      // Cognitum
];
const CRATERS: [number, number, number, number][] = [
  [-0.12, 0.69, 0.035, 0.55], [-0.31, -0.13, 0.03, 0.35], [-0.5, -0.07, 0.02, 0.3], [-0.6, -0.42, 0.02, 0.35], [0.2, 0.55, 0.025, 0.2],
];
function moonDisk(size: number, fraction: number, waxing: boolean, tint: [number, number, number] | null) {
  const n = makeNoise3(77);
  const out = new Uint8ClampedArray(size * size * 4);
  const R = size / 2 - 1.5;
  const phaseAng = Math.acos(1 - 2 * fraction);
  const lx = Math.sin(phaseAng) * (waxing ? 1 : -1), lz = -Math.cos(phaseAng);
  const base = tint ?? [0.97, 0.955, 0.92];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - size / 2) / R, dy = (y + 0.5 - size / 2) / R;
      const r2 = dx * dx + dy * dy;
      if (r2 > 1.02) continue;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const u = Math.asin(Math.max(-1, Math.min(1, dx))) / (Math.PI / 2), v = Math.asin(Math.max(-1, Math.min(1, dy))) / (Math.PI / 2);
      // denizler: gerçek konumlarda Gauss alanlarının toplamı + gürültü → birbirine bağlanan organik şekiller
      let field = 0;
      for (const [mx, my, rx, ry, a, k] of MARIA) {
        const c = Math.cos(a), s2 = Math.sin(a);
        const ex = ((u - mx) * c + (v - my) * s2) / (rx * 1.15), ey = (-(u - mx) * s2 + (v - my) * c) / (ry * 1.15);
        field += k * Math.exp(-(ex * ex + ey * ey) * 1.1);
      }
      field += (fbm(n, u * 3.2 + 4, v * 3.2, 1.1, 4) - 0.5) * 0.55;
      const mt = Math.min(1, Math.max(0, (field - 0.32) / 0.42));
      const mare = mt * mt * (3 - 2 * mt) * (0.8 + 0.35 * fbm(n, u * 8, v * 8, 2.4, 3));
      const fine = fbm(n, u * 22, v * 22, 3.3, 4);
      const speck = Math.max(0, fbm(n, u * 60, v * 60, 7.1, 2) - 0.62) * 2.2;
      let alb = 0.9 - 0.3 * mare + (fine - 0.5) * 0.09 * (1 - mare * 0.5) + speck * 0.12 * (1 - mare);
      for (const [cx, cy, cr, b] of CRATERS) {
        const d = Math.hypot(u - cx, v - cy);
        alb += b * Math.exp(-((d / cr) ** 2));
        if (b > 0.5) {
          const ang = Math.atan2(v - cy, u - cx);
          const ray = Math.pow(Math.max(0, Math.sin(ang * 7 + 1.3)), 18) * Math.exp(-d / 0.45) * (d > cr ? 1 : 0);
          alb += 0.12 * ray * (1 - mare * 0.6);
        }
      }
      const mu = dx * lx + nz * lz;
      const mu0 = Math.max(0, mu);
      const ls = (mu0 / (mu0 + nz + 1e-3)) * 2;
      const term = Math.max(0, Math.min(1, (mu + 0.015) / 0.05));
      const relief = 1 + (fine - 0.5) * 1.6 * Math.max(0, 1 - mu0 / 0.25);
      let L = alb * Math.min(1.15, ls * 0.9 + 0.1) * term * relief;
      L = Math.max(L, 0.035 * alb * (1 - term));
      const edge = Math.max(0, Math.min(1, (1 - Math.sqrt(r2)) * R + 0.5));
      const i = (y * size + x) * 4;
      const g = Math.min(1, L) ** (1 / 1.15);
      // denizler hafif soğuk gri, yaylalar sıcak
      const tintR = 1 - 0.05 * mare, tintB = 1 + 0.03 * mare;
      out[i] = 255 * Math.min(1, g * base[0] * tintR);
      out[i + 1] = 255 * Math.min(1, g * base[1]);
      out[i + 2] = 255 * Math.min(1, g * base[2] * tintB);
      out[i + 3] = 255 * edge * Math.min(1, 0.05 + term * 0.95);
    }
  return out;
}
