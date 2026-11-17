// Fiziksel tabanlı gökyüzü rengi: tek saçılımlı Rayleigh + Mie (Nishita yöntemi).
// Elle seçilmiş renk durakları YOK: gün mavisi, altın saat, gün batımı, Venüs kuşağı (pembe kuşak),
// dünyanın gölgesi ve mavi saat kendiliğinden oluşur. Gece için hafif hava parıltısı + ay ışığı + şehir ışığı.
// Worker içinde çalışır (≈ 64×48 doku, 20–60 ms). Sonuç büyütülerek çizilir; dither ile bantlanma önlenir.

const R = 6360e3, RA = 6420e3, HR = 7994, HM = 1200;
const BR = [5.8e-6, 13.5e-6, 33.1e-6];
const BM0 = 21e-6;
// Ozon (Chappuis bandı): alacakaranlıkta gökyüzünü MAVİ yapan budur; olmazsa gri-sarı kalır.
const BO = [0.65e-6, 1.881e-6, 0.085e-6];
/** Ozon yoğunluğu: ~25 km'de tepe yapan çadır profili. */
const ozone = (h: number) => Math.max(0, 1 - Math.abs(h - 25e3) / 15e3);
const RAD = Math.PI / 180;

export type AtmoParams = {
  cols: number; rows: number;
  /** derece. Eşit ölçek şartı: azSpan / panoramaGenişliği == altTop / ufukY (px başına aynı derece). */
  azSpan: number;
  altTop: number;
  sunAlt: number; sunAz: number;
  moonAlt: number; moonAz: number; moonFrac: number;
  haze: number;            // 0..1 (bulut/sis/yağış → Mie artar, gökyüzü beyazlaşır)
  overcast: number;        // 0..1 (kapalı → griye yaklaşır)
  cityGlow: number;        // 0..1 gece ufuk ışığı
};

const dirFrom = (alt: number, az: number): [number, number, number] => {
  const a = alt * RAD, z = az * RAD;
  return [Math.sin(z) * Math.cos(a), Math.sin(a), Math.cos(z) * Math.cos(a)];
};

function raySphere(o: number[], d: number[], r: number): number {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b + Math.sqrt(disc);
}
function hitsEarth(o: number[], d: number[]): boolean {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R * R;
  if (b > 0) return false;
  return b * b - c > 0;
}

/** Tek yön için saçılım (doğrusal RGB, normalize edilmemiş). */
export function scatter(view: number[], light: number[], bm: number, N = 14, M = 6): [number, number, number] {
  const o = [0, R + 300, 0];
  const tMax = raySphere(o, view, RA);
  const ds = tMax / N;
  const mu = view[0] * light[0] + view[1] * light[1] + view[2] * light[2];
  const g = 0.83;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM = (3 / (8 * Math.PI)) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  let odR = 0, odM = 0, odO = 0;
  const sR = [0, 0, 0], sM = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * ds;
    const p = [o[0] + view[0] * t, o[1] + view[1] * t, o[2] + view[2] * t];
    const h = Math.hypot(p[0], p[1], p[2]) - R;
    const hr = Math.exp(-h / HR) * ds, hm = Math.exp(-h / HM) * ds;
    odR += hr; odM += hm; odO += ozone(h) * ds;
    if (hitsEarth(p, light)) continue;
    const tl = raySphere(p, light, RA);
    const dl = tl / M;
    let lR = 0, lM = 0, lO = 0;
    for (let j = 0; j < M; j++) {
      const q = (j + 0.5) * dl;
      const hh = Math.hypot(p[0] + light[0] * q, p[1] + light[1] * q, p[2] + light[2] * q) - R;
      lR += Math.exp(-hh / HR) * dl;
      lM += Math.exp(-hh / HM) * dl;
      lO += ozone(hh) * dl;
    }
    for (let c = 0; c < 3; c++) {
      const tau = BR[c] * (odR + lR) + bm * 1.1 * (odM + lM) + BO[c] * (odO + lO);
      const at = Math.exp(-tau);
      sR[c] += at * hr;
      sM[c] += at * hm;
    }
  }
  return [0, 1, 2].map((c) => sR[c] * BR[c] * pR + sM[c] * bm * pM * 0.6) as [number, number, number];
}

/** Güneş/ay ışığının yere ulaşan rengi (bulutları aydınlatmak için). */
export function transmittance(alt: number, haze: number): [number, number, number] {
  const d = dirFrom(Math.max(alt, -1), 0);
  const o = [0, R + 300, 0];
  const t = raySphere(o, d, RA);
  const M = 16, dl = t / M;
  let r = 0, m = 0, oz = 0;
  for (let j = 0; j < M; j++) {
    const q = (j + 0.5) * dl;
    const hh = Math.hypot(o[0] + d[0] * q, o[1] + d[1] * q, o[2] + d[2] * q) - R;
    r += Math.exp(-hh / HR) * dl;
    m += Math.exp(-hh / HM) * dl;
    oz += ozone(hh) * dl;
  }
  const bm = BM0 * (1 + haze * 4);
  return [0, 1, 2].map((c) => Math.exp(-(BR[c] * r + bm * 1.1 * m + BO[c] * oz))) as [number, number, number];
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function toneMap(c: number[], exposure: number): number[] {
  const e = c.map((v) => v * exposure);
  const L = 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2];
  if (L <= 1e-9) return [0, 0, 0];
  const Lt = 1 - Math.exp(-L * 1.1);
  let o = e.map((v) => (v * Lt) / L);
  const mx = Math.max(o[0], o[1], o[2]);
  if (mx > 1) {
    const w = Math.min(1, (mx - 1) / 1.5);
    o = o.map((v) => Math.min(1, v / mx) * (1 - w) + Lt * w + 0.0 * v);
  }
  return o;
}

const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function renderAtmosphere(p: AtmoParams): Uint8ClampedArray {
  const out = new Uint8ClampedArray(p.cols * p.rows * 4);
  const sun = dirFrom(p.sunAlt, p.sunAz);
  const bm = BM0 * (1 + p.haze * 4);
  const day = smooth(-13, -3, p.sunAlt);
  const exposure = 38 * (1 + 1.4 * (1 - smooth(-2, 25, p.sunAlt)) + 18 * (1 - smooth(-9, -1, p.sunAlt)));
  const moonUp = smooth(-2, 6, p.moonAlt) * p.moonFrac;

  for (let y = 0; y < p.rows; y++) {
    const v = y / (p.rows - 1);
    const alt = Math.max(0.4, p.altTop * (1 - v));
    for (let x = 0; x < p.cols; x++) {
      const az = ((x + 0.5) / p.cols - 0.5) * p.azSpan; // piksel merkezi: 360°'de dikişsiz döşenir
      const view = dirFrom(alt, az);
      let c: number[] = [0, 0, 0];
      if (day > 0.001) {
        c = scatter(view, sun, bm);
        if (p.sunAlt < 3) {
          const lift = dirFrom(Math.max(p.sunAlt + 4, 1.5), p.sunAz);
          const ms = scatter(view, lift, bm * 0.04, 8, 4);
          const k = 0.05 * (1 - smooth(-1, 3, p.sunAlt)) * smooth(-12, -4, p.sunAlt);
          for (let i = 0; i < 3; i++) c[i] += ms[i] * k * [0.55, 0.8, 1.25][i];
        }
        c = toneMap(c, exposure);
        const hzd = Math.pow(1 - alt / p.altTop, 6) * smooth(6, 20, p.sunAlt);
        if (hzd > 0) {
          const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
          for (let k = 0; k < 3; k++) c[k] = c[k] + (L * [0.97, 1.0, 1.06][k] - c[k]) * 0.55 * hzd;
        }
      }
      const night = 1 - day;
      if (night > 0.001) {
        const hz = Math.pow(1 - alt / 90, 4);
        const moonView = dirFrom(p.moonAlt, p.moonAz);
        const mDot = Math.max(0, view[0] * moonView[0] + view[1] * moonView[1] + view[2] * moonView[2]);
        const mGlow = moonUp * (0.35 + 0.65 * Math.pow(mDot, 24));
        const nb = [
          0.0045 + 0.010 * hz + 0.010 * mGlow + 0.012 * p.cityGlow * hz,
          0.0065 + 0.013 * hz + 0.014 * mGlow + 0.010 * p.cityGlow * hz,
          0.0210 + 0.024 * hz + 0.030 * mGlow + 0.008 * p.cityGlow * hz,
        ];
        for (let k = 0; k < 3; k++) c[k] = c[k] * day + nb[k] * 1.6 * night;
      }
      if (p.overcast > 0) {
        const dayK = smooth(-6, 10, p.sunAlt);
        const hz = Math.pow(1 - alt / p.altTop, 3);
        const gray = [0.30, 0.32, 0.36].map((v) => (v * (0.85 + 0.25 * hz) * dayK + 0.012) * (1 - 0.35 * p.haze));
        for (let k = 0; k < 3; k++) c[k] = c[k] + (gray[k] - c[k]) * p.overcast;
      }
      const i = (y * p.cols + x) * 4;
      out[i] = toSrgb(Math.min(1, c[0])) * 255;
      out[i + 1] = toSrgb(Math.min(1, c[1])) * 255;
      out[i + 2] = toSrgb(Math.min(1, c[2])) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}
