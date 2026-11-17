// Hacimli bulut dokusu üretimi (worker içinde). Saf fonksiyon: ImageData döner.
//
// Yöntem: gökyüzündeki her piksel için bakış ışını yatay bir bulut tabakasıyla kesiştirilir
// (yükseklik H). Kesişme noktasındaki 3B gürültü yoğunluğu verir → ufka doğru bulutlar doğal olarak
// küçülür, sıklaşır ve puslanır (gerçek perspektif). Işık: güneşe doğru 3 örnekle öz-gölge,
// güneşe yakın bakışta ince kenarlarda "gümüş astar", altta koyulaşan taban, gökyüzünden ortam ışığı.
import { makeNoise3, fbm } from './noise';

export type CloudParams = {
  w: number; h: number;          // doku boyutu (piksel)
  pxPerDeg: number;              // doku ölçeği (ekranın yarısı çözünürlükte: ekranPxPerDeg/2)
  horizonY: number;              // dokudaki ufuk satırı
  centerX: number;               // sanal azimut 0'ın dokudaki x'i
  height: number;                // tabaka yüksekliği (m): kümülüs 1500, yüksek bulut 7000
  scale: number;                 // gürültü ölçeği (1/m)
  stretch: number;               // rüzgâr yönünde uzama (1 = yuvarlak, 3 = sirrüs şeritleri)
  coverage: number;              // 0..1
  softness: number;              // kenar yumuşaklığı (0.05 sert … 0.3 pamuk)
  density: number;               // optik kalınlık çarpanı
  dark: number;                  // 0..1 yağmur bulutu koyuluğu
  seed: number;
  ox: number; oz: number;        // rüzgâr kayması (m)
  evolve: number;                // gürültünün 3. boyutu (zamanla yavaş değişim)
  sunAlt: number; sunAz: number; // sanal derece
  sunColor: [number, number, number];   // doğrusal 0..1 (güneş ya da ay ışığı)
  ambTop: [number, number, number];     // doğrusal ortam ışığı (gökyüzü üstü)
  ambHor: [number, number, number];     // doğrusal (ufuk) — uzak bulutlar bu renge puslanır
  cityGlow: number;              // gece alçak bulut tabanını aydınlatan şehir ışığı
};

const RAD = Math.PI / 180;
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const sstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function renderClouds(p: CloudParams): ImageData | { data: Uint8ClampedArray; width: number; height: number } {
  const n = makeNoise3(p.seed);
  const out = new Uint8ClampedArray(p.w * p.h * 4);
  const sa = p.sunAlt * RAD, sz = p.sunAz * RAD;
  const sun = [Math.sin(sz) * Math.cos(sa), Math.sin(sa), Math.cos(sz) * Math.cos(sa)];
  // güneşe doğru yatay adım (tabaka düzleminde), ufuktaki güneşte daha uzun gölgeler
  const shLen = 220 / Math.max(0.25, Math.tan(Math.max(4, p.sunAlt) * RAD) + 0.25);
  const sdx = Math.sin(sz) * shLen, sdz = Math.cos(sz) * shLen;
  const ev = p.evolve;
  const cov = 1 - p.coverage;

  const dens = (X: number, Z: number, oct: number) => {
    const x = (X + p.ox) * p.scale / p.stretch, z = (Z + p.oz) * p.scale;
    let v = fbm(n, x, z, ev, oct);
    // büyük ölçekli kümelenme: bulutlar gruplar hâlinde, aralarda açık gökyüzü
    v = v * 0.75 + 0.25 * fbm(n, x * 0.23 + 17, z * 0.23 - 9, ev * 0.5, 2);
    v = (v - 0.5) * 2.4 + 0.5; // fbm dar aralıkta toplanır → genişlet (kaplama oranı anlamlı olsun)
    return sstep(cov, cov + p.softness, v);
  };

  for (let y = 0; y < p.h; y++) {
    const alt = (p.horizonY - y) / p.pxPerDeg;
    if (alt < 0.6) continue;
    const sinA = Math.sin(alt * RAD), cosA = Math.cos(alt * RAD);
    const D = p.height / sinA;                          // tabakaya uzaklık
    const far = Math.min(1, D / (p.height * 28));       // 0 yakın … 1 ufuk
    const oct = far > 0.5 ? 3 : far > 0.2 ? 4 : 5;      // uzakta daha az ayrıntı (hem doğal hem hızlı)
    for (let x = 0; x < p.w; x++) {
      const vaz = ((x - p.centerX) / p.pxPerDeg) * RAD;
      const X = D * cosA * Math.sin(vaz);
      const Z = D * cosA * Math.cos(vaz);
      let d = dens(X, Z, oct);
      if (d <= 0.002) continue;
      d = Math.min(1, d * p.density);

      // öz-gölge: güneşe doğru 3 örnek
      let acc = 0;
      for (let k = 1; k <= 3; k++) acc += dens(X + sdx * k, Z + sdz * k, 3);
      let T = Math.exp(-acc * 0.55 * p.density * (1 + p.dark * 2.5));
      // alçak güneş (gün doğumu/batımı) bulutların ALTINI aydınlatır → pembe-turuncu tabanlar
      const under = sstep(9, 0, p.sunAlt) * (1 - p.dark);
      T = T + (1 - T) * under * 0.85;

      // bakış–güneş açısı: güneşe yakın bakışta ince kenarlar parlar (gümüş astar)
      const vx = cosA * Math.sin(vaz), vy = sinA, vz = cosA * Math.cos(vaz);
      const mu = vx * sun[0] + vy * sun[1] + vz * sun[2];
      const fwd = Math.pow(Math.max(0, mu), 10) * (1 - d) * 2.4;
      // kenarlar (düşük yoğunluk) daha çok ışık geçirir, çekirdek koyu → hacim hissi
      // + iç yapı: yüksek frekanslı gürültü "pamuk" kabarıklarını gölgeler
      const detail = far < 0.5 ? n((X + p.ox) * p.scale * 4.1, (Z + p.oz) * p.scale * 4.1, ev * 2 + 5) : 0;
      const edge = (0.75 + 0.5 * (1 - d)) * (0.86 + 0.24 * detail);
      const sunLit = T * edge * (0.7 + 0.5 * Math.max(0, mu)) * (1 + under * 0.45) + fwd;

      // taban koyulaşması: kalın bulutun altı gölgede
      const base = 1 - 0.35 * d * (1 + p.dark);
      const r = 0, g = 1, b = 2;
      const col = [0, 0, 0];
      for (const c of [r, g, b]) {
        const amb = p.ambTop[c] * (1 - far) + p.ambHor[c] * far;
        let v = p.sunColor[c] * sunLit * 1.25 * (1 - p.dark * 0.7) + amb * (0.85 + 0.6 * (1 - d)) * base * (1 - 0.45 * p.dark) * (0.9 + 0.2 * detail);
        // gece şehir ışığı (alçak bulut tabanında sıcak gri)
        v += p.cityGlow * [0.020, 0.016, 0.014][c] * (0.4 + far) * d;
        // uzaklıkla puslanma
        v = v * (1 - far * 0.8) + p.ambHor[c] * far * 0.8;
        col[c] = v;
      }
      // ufka yakın: örnekleme çizgilenmesini önlemek için hızla puslanıp kaybolur
      const alpha = Math.min(1, (1 - Math.exp(-d * 3.2)) * (1 - far * 0.7) * sstep(1.2, 7, alt));
      const i = (y * p.w + x) * 4;
      out[i] = toSrgb(Math.min(1, col[0])) * 255;
      out[i + 1] = toSrgb(Math.min(1, col[1])) * 255;
      out[i + 2] = toSrgb(Math.min(1, col[2])) * 255;
      out[i + 3] = alpha * 255;
    }
  }
  softenHorizon(out, p);
  return typeof ImageData !== 'undefined'
    ? new ImageData(out, p.w, p.h)
    : { data: out, width: p.w, height: p.h };
}

/**
 * Ufka yakın satırlarda gürültü çok sıkışır → yatay çizgilenme (aliasing). Bu satırları yükseklikle
 * azalan yarıçapla dikey + yatay ortalayarak yumuşat (yalnızca alt ~12°; maliyet düşük).
 */
function softenHorizon(buf: Uint8ClampedArray, p: CloudParams) {
  const W = p.w, rowTop = Math.max(0, Math.floor(p.horizonY - 12 * p.pxPerDeg));
  const src = buf.slice(rowTop * W * 4, p.h * W * 4);
  const at = (x: number, y: number, c: number) => src[((y - rowTop) * W + x) * 4 + c];
  for (let y = rowTop; y < p.h; y++) {
    const alt = (p.horizonY - y) / p.pxPerDeg;
    const r = Math.round(3 * (1 - Math.max(0, alt) / 12)); // ufukta 3 px, 12°'de 0
    if (r <= 0) continue;
    const rx = r * 2;
    for (let x = 0; x < W; x++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(p.h - 1, Math.max(rowTop, y + dy));
        for (let dx = -rx; dx <= rx; dx += 2) {
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const a = at(xx, yy, 3);
          s0 += at(xx, yy, 0) * a; s1 += at(xx, yy, 1) * a; s2 += at(xx, yy, 2) * a; s3 += a; n++;
        }
      }
      const i = (y * W + x) * 4;
      if (s3 > 0) { buf[i] = s0 / s3; buf[i + 1] = s1 / s3; buf[i + 2] = s2 / s3; }
      buf[i + 3] = s3 / n;
    }
  }
}

/** Hava türüne göre iki tabakanın parametreleri. */
export function layersFor(kind: string, cloud: number, precip: number) {
  const low = { height: 1500, scale: 1 / 1500, stretch: 1.3, coverage: 0, softness: 0.22, density: 1.1, dark: 0 };
  const high = { height: 7500, scale: 1 / 9000, stretch: 3.2, coverage: 0, softness: 0.3, density: 0.45, dark: 0 };
  switch (kind) {
    case 'clear': break; // açık: bulut yok
    case 'partly': low.coverage = 0.38 + cloud * 0.12; high.coverage = 0.2; high.density = 0.32; break;
    case 'cloudy': low.coverage = 0.62 + cloud * 0.1; high.coverage = 0.45; break;
    case 'fog': low.coverage = 0.5; low.softness = 0.45; low.height = 400; low.density = 0.7; break;
    case 'overcast': case 'drizzle': case 'rain': case 'heavyRain': case 'showers':
    case 'snow': case 'heavySnow': case 'sleet': case 'thunder':
      // stratus/nimbostratus: neredeyse tam kaplama ama yoğunluk dalgalı (düz gri DEĞİL)
      low.coverage = kind === 'showers' ? 0.75 : 0.86;
      low.scale = 1 / 2400; low.stretch = 1.8; low.softness = 0.9;
      low.density = 1.6; low.dark = Math.min(1, 0.25 + precip * 0.8) * (kind === 'overcast' ? 0.5 : 1);
      high.coverage = 0; break;
  }
  return { low, high };
}
