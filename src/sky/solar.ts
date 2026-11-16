export interface SolarTimes {
  rise: number;
  set: number;
}

export interface MoonPhaseInfo {
  phase: number; // 0..1 (0 = new, 0.5 = full)
  name: string;
  illum: number; // 0..100
}

export interface SkySample {
  cols: [string, string, string, string]; // sky1, sky2, sky3, horizon
  daylight: number; // 0..1
}

export interface OrbPlacement {
  sunUp: boolean;
  sunLow: boolean;
  sunX: number; // 0..100 (% across orb viewport)
  sunY: number; // 0..100 (% vertically in sky area)
  moonUp: boolean;
  moonFrac: number; // 0..1 along the sky arc (clamped to endpoints when below horizon)
  moonOpacity: number; // 1.0 above horizon (at night), 0.30 waiting below horizon
  moonX: number;
  moonY: number;
}

const SKY_PALETTE: Record<'night' | 'dawn' | 'day' | 'dusk', [string, string, string, string]> = {
  night: ['#03050e', '#08122b', '#17284d', '#3e5480'],
  dawn: ['#0b1230', '#2c3a6c', '#9b7390', '#f0b48c'],
  day: ['#1d4c94', '#3a78c4', '#7cb0e4', '#cde4f8'],
  dusk: ['#080d26', '#262b5c', '#9a5670', '#ec9a6c'],
};

const DAYLIGHT_LEVEL: Record<'night' | 'dawn' | 'day' | 'dusk', number> = {
  night: 0,
  dawn: 0.5,
  day: 1,
  dusk: 0.45,
};

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t).toString(16).padStart(2, '0');
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t).toString(16).padStart(2, '0');
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t).toString(16).padStart(2, '0');
  return `#${r}${g}${bl}`;
}

/**
 * Enlem ~39° (Ankara/Türkiye civarı) için güneşin doğuş ve batış saatleri
 */
export function getSolarTimes(now = new Date()): SolarTimes {
  const startOfYear = new Date(now.getFullYear(), 0, 0).getTime();
  const doy = Math.floor((now.getTime() - startOfYear) / 86_400_000);
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 81)) * (Math.PI / 180);
  const lat = (39 * Math.PI) / 180;
  const cosH0 = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
  const half = (Math.acos(cosH0) * 12) / Math.PI;
  const noon = 12.2;
  return {
    rise: noon - half,
    set: noon + half,
  };
}

export function getMoonPhaseInfo(nowMs = Date.now()): MoonPhaseInfo {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  let p = (((nowMs - ref) / 86_400_000) % synodic) / synodic;
  if (p < 0) p += 1;

  const illum = Math.round(((1 - Math.cos(2 * Math.PI * p)) / 2) * 100);
  const ranges: [number, string][] = [
    [0.033, 'Yeni Ay'],
    [0.216, 'Büyüyen Hilal'],
    [0.284, 'İlk Dördün'],
    [0.466, 'Büyüyen Ay'],
    [0.534, 'Dolunay'],
    [0.716, 'Küçülen Ay'],
    [0.784, 'Son Dördün'],
    [0.967, 'Küçülen Hilal'],
    [1.01, 'Yeni Ay'],
  ];
  const found = ranges.find((r) => p < r[0]) ?? ranges[0];
  return { phase: p, name: found[1], illum };
}

export function skyAtHour(hour: number, now = new Date()): SkySample {
  const h = ((hour % 24) + 24) % 24;
  const { rise, set } = getSolarTimes(now);
  const keys: [number, 'night' | 'dawn' | 'day' | 'dusk'][] = [
    [0, 'night'],
    [rise - 1.3, 'night'],
    [rise - 0.15, 'dawn'],
    [rise + 1.4, 'day'],
    [set - 1.3, 'day'],
    [set + 0.15, 'dusk'],
    [set + 1.4, 'night'],
    [24, 'night'],
  ];

  let idx = 0;
  while (idx < keys.length - 2 && h >= keys[idx + 1][0]) {
    idx++;
  }
  const [h0, stateA] = keys[idx];
  const [h1, stateB] = keys[idx + 1];
  let t = Math.max(0, Math.min(1, (h - h0) / Math.max(0.01, h1 - h0)));
  t = t * t * (3 - 2 * t);

  const palA = SKY_PALETTE[stateA];
  const palB = SKY_PALETTE[stateB];
  return {
    cols: [
      mixHex(palA[0], palB[0], t),
      mixHex(palA[1], palB[1], t),
      mixHex(palA[2], palB[2], t),
      mixHex(palA[3], palB[3], t),
    ],
    daylight: DAYLIGHT_LEVEL[stateA] + (DAYLIGHT_LEVEL[stateB] - DAYLIGHT_LEVEL[stateA]) * t,
  };
}

export function getOrbPlacement(hour: number, moonPhase: number, now = new Date()): OrbPlacement {
  const h = ((hour % 24) + 24) % 24;
  const { rise, set } = getSolarTimes(now);
  const arc = (f: number) => ({
    x: 8 + f * 84,
    y: 86 - Math.sin(Math.PI * Math.max(0, Math.min(1, f))) * 72,
  });

  const fs = (h - rise) / (set - rise);
  const sunUp = fs > -0.02 && fs < 1.02;
  const sunLow = sunUp && (fs < 0.14 || fs > 0.86);
  const sunPos = arc(fs);

  // Gerçek astronomik Ay konumu: güneş kadar sade ve belirgin (rota çizgisi yok)
  const transit = (12 + moonPhase * 24) % 24;
  const moonRise = transit - 6;
  const fm = ((((h - moonRise) % 24) + 24) % 24) / 12;
  const moonUp = fm >= 0 && fm <= 1;
  const moonFrac = moonUp ? fm : fm < 1.5 ? 0.86 : 0.14;
  const moonOpacity = moonUp ? (sunUp ? 0.42 : 0.96) : sunUp ? 0.34 : 0.78;
  const moonPos = {
    x: 16 + moonFrac * 68,
    y: 26 - Math.sin(Math.PI * moonFrac) * 12,
  };

  return {
    sunUp,
    sunLow,
    sunX: sunPos.x,
    sunY: sunPos.y,
    moonUp,
    moonFrac,
    moonOpacity,
    moonX: moonPos.x,
    moonY: moonPos.y,
  };
}

export function formatHour(hour: number): string {
  const totalMin = Math.round(((hour % 24) + 24) % 24 * 60);
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function currentDecimalHour(now = new Date()): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

