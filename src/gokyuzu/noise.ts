// 3B simplex gürültü + fbm. Bulut ve samanyolu dokuları için (worker içinde çalışır).
// Stefan Gustavson'ın kamu malı algoritmasının sade TS sürümü.

const G3 = [
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
];

export function makeNoise3(seed = 1) {
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const F3 = 1 / 3, G = 1 / 6;

  return function noise(x: number, y: number, z: number) {
    const s0 = (x + y + z) * F3;
    const i = Math.floor(x + s0), j = Math.floor(y + s0), k = Math.floor(z + s0);
    const t = (i + j + k) * G;
    const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G;
    const x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G;
    const x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    const c = (tx: number, ty: number, tz: number, gi: number) => {
      let tt = 0.6 - tx * tx - ty * ty - tz * tz;
      if (tt < 0) return 0;
      const g = (gi % 12) * 3;
      tt *= tt;
      return tt * tt * (G3[g] * tx + G3[g + 1] * ty + G3[g + 2] * tz);
    };
    n += c(x0, y0, z0, p[ii + p[jj + p[kk]]]);
    n += c(x1, y1, z1, p[ii + i1 + p[jj + j1 + p[kk + k1]]]);
    n += c(x2, y2, z2, p[ii + i2 + p[jj + j2 + p[kk + k2]]]);
    n += c(x3, y3, z3, p[ii + 1 + p[jj + 1 + p[kk + 1]]]);
    return 32 * n; // ≈ -1..1
  };
}

/** Fraktal gürültü, 0..1 civarı. */
export function fbm(n: (x: number, y: number, z: number) => number, x: number, y: number, z: number, oct = 5, lac = 2.02, gain = 0.5) {
  let a = 0.5, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += a * n(x * f, y * f, z * f);
    norm += a;
    a *= gain;
    f *= lac;
  }
  return 0.5 + 0.5 * (s / norm);
}
