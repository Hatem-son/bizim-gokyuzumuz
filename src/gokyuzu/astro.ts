// Güneş ve ay konumu, ay fazı. Bağımlılık yok.
// Formüller: standart astronomik yaklaşımlar (Meeus / SunCalc ile aynı yöntem), dakika hassasiyeti yeterli.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // eğiklik

const toDays = (d: Date) => d.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;
const altitudeOf = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const azimuthOf = (H: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (M: number) => {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + RAD * 102.9372 + Math.PI;
};
const sunCoords = (d: number) => {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
};
const moonCoords = (d: number) => {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
};

export type SkyPos = {
  /** derece, ufuk = 0, tepe = 90 */
  alt: number;
  /** derece, 0 = güney, +batı (SunCalc kuralı). Ekranda: -90 doğu (sol), +90 batı (sağ) */
  az: number;
};

export function sunPosition(date: Date, lat: number, lon: number): SkyPos {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { alt: altitudeOf(H, phi, c.dec) / RAD, az: azimuthOf(H, phi, c.dec) / RAD };
}

export function moonPosition(date: Date, lat: number, lon: number): SkyPos {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitudeOf(H, phi, c.dec);
  h = h + RAD * 0.017 / Math.tan(h + RAD * 10.26 / (h / RAD + 5.1)); // kırılma düzeltmesi
  return { alt: h / RAD, az: azimuthOf(H, phi, c.dec) / RAD };
}

export type MoonPhase = {
  /** 0 = yeni ay, 0.25 = ilk dördün, 0.5 = dolunay, 0.75 = son dördün */
  phase: number;
  /** aydınlık oranı 0..1 */
  fraction: number;
  /** büyüyen mi (sağ taraf aydınlık, kuzey yarımküre) */
  waxing: boolean;
};

export function moonPhase(date: Date): MoonPhase {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra),
  );
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  const fraction = (1 + Math.cos(inc)) / 2;
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  return { phase, fraction, waxing: phase < 0.5 };
}

/**
 * Konum: izin istemeden yaklaşık değer.
 * Boylam saat diliminden, enlem varsayılan 38°K. Kullanıcı şehir/konum seçtiyse o kullanılır.
 */
export function defaultLocation(): { lat: number; lon: number } {
  try {
    const saved = localStorage.getItem('gk.loc');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { lat: 38, lon: (-new Date().getTimezoneOffset() / 60) * 15 };
}
