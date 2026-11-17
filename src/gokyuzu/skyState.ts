// Tek kaynak: saat + konum + hava → gökyüzünün sayısal durumu.
// Renkler burada ELLE SEÇİLMEZ: gökyüzü dokusu atmosfer hesabından gelir (skyRender), CSS renkleri o dokudan örneklenir.
import { sunPosition, moonPosition, moonPhase, MoonPhase } from './astro';
import { transmittance } from './atmosphere';
import { Weather, CLEAR } from './weather';
import { SkyGeom, virtualAz, displayAlt } from './skyGeom';
import { clamp, smoothstep, lerp } from './util';

export type SkyState = {
  sunAlt: number;          // gerçek
  sunDisp: number;         // ekranda (yüksekte sıkıştırılmış)
  sunVaz: number;          // sanal azimut
  moonAlt: number; moonDisp: number; moonVaz: number;
  phase: MoonPhase;
  daylight: number;        // 0 gece … 1 gündüz
  /** Güneş ışığının rengi (doğrusal, en parlak kanal = parlaklık). Bulutları ve sahneyi aydınlatır. */
  sunLight: [number, number, number];
  /** Ay ışığı (gece bulutları için) */
  moonLight: number;
  /** Yıldız görünürlüğü parlaklık grubuna göre: alacakaranlıkta önce parlaklar belirir. */
  starVis: [number, number, number];
  milky: number;
  sunAlpha: number;
  moonAlpha: number;
  haze: number; overcast: number; cityGlow: number;
  candle: number;
  weather: Weather;
  greeting: 'Günaydın' | 'İyi günler' | 'İyi akşamlar' | 'İyi geceler';
};

export function skyState(now: Date, loc: { lat: number; lon: number }, g: SkyGeom, weather: Weather = CLEAR): SkyState {
  const sun = sunPosition(now, loc.lat, loc.lon);
  const moon = moonPosition(now, loc.lat, loc.lon);
  const phase = moonPhase(now);
  const w = weather;
  const daylight = smoothstep(-6, 6, sun.alt);

  // Güneş ışığı rengi: atmosferden geçen ışık, göz uyumuyla normalize (gün batımında da parlak turuncu)
  const haze = clamp(w.cloud * 0.35 + w.fog * 0.8 + w.precip * 0.4);
  const tr = transmittance(Math.max(sun.alt, -1), haze);
  const mx = Math.max(...tr);
  const bright = smoothstep(-4, 2, sun.alt) * (1 - 0.55 * w.precip);
  // %20 beyaza karıştır: renkler doğal kalsın, karikatür turuncusu olmasın
  const sunLight = tr.map((v) => lerp(v / mx, 1, 0.2) * bright) as [number, number, number];

  const moonUp = smoothstep(-1, 4, moon.alt);
  const cover = Math.pow(1 - w.cloud, 1.2) * (1 - 0.6 * w.fog);
  const starVis: [number, number, number] = [
    smoothstep(-2, -7, sun.alt),
    smoothstep(-6, -11, sun.alt),
    smoothstep(-10, -16, sun.alt) * (1 - 0.6 * moonUp * phase.fraction), // dolunay sönük yıldızları bastırır
  ];
  const h = now.getHours();

  return {
    sunAlt: sun.alt, sunDisp: displayAlt(sun.alt), sunVaz: virtualAz(g, sun.az),
    moonAlt: moon.alt, moonDisp: displayAlt(moon.alt), moonVaz: virtualAz(g, moon.az),
    phase,
    daylight,
    sunLight,
    moonLight: moonUp * phase.fraction * (1 - daylight),
    starVis: starVis.map((v) => v * (0.15 + 0.85 * cover)) as [number, number, number],
    milky: smoothstep(-15, -18, sun.alt) * cover * (1 - 0.8 * moonUp * phase.fraction),
    sunAlpha: smoothstep(-1.5, 0.5, sun.alt) * (1 - 0.92 * w.cloud) * (1 - w.precip) ** 2,
    // Gündüz ay gerçekte soluk ama görünür; ufkun altındaysa hiç yok
    moonAlpha: moonUp * smoothstep(0.03, 0.12, phase.fraction) * lerp(1, 0.32, daylight) * (1 - 0.85 * w.cloud),
    haze,
    overcast: clamp((w.cloud - 0.75) * 4) * (0.75 + 0.25 * clamp(w.precip * 2)),
    cityGlow: 0.45,
    candle: lerp(1, 0.55, daylight),
    weather: w,
    greeting: greetingFor(h),
  };
}

export const greetingFor = (h: number): SkyState['greeting'] =>
  h >= 5 && h < 11 ? 'Günaydın' : h >= 11 && h < 17 ? 'İyi günler' : h >= 17 && h < 21 ? 'İyi akşamlar' : 'İyi geceler';

/** Sayısal alanları ara değerle (konumlar, görünürlükler). Dokular ayrıca skyRender'da çapraz soluşur. */
export function mixState(a: SkyState, b: SkyState, t: number): SkyState {
  const n = (x: number, y: number) => lerp(x, y, t);
  return {
    ...b,
    sunDisp: n(a.sunDisp, b.sunDisp), sunVaz: n(a.sunVaz, b.sunVaz),
    moonDisp: n(a.moonDisp, b.moonDisp), moonVaz: n(a.moonVaz, b.moonVaz),
    daylight: n(a.daylight, b.daylight),
    sunLight: a.sunLight.map((v, i) => n(v, b.sunLight[i])) as [number, number, number],
    moonLight: n(a.moonLight, b.moonLight),
    starVis: a.starVis.map((v, i) => n(v, b.starVis[i])) as [number, number, number],
    milky: n(a.milky, b.milky),
    sunAlpha: n(a.sunAlpha, b.sunAlpha), moonAlpha: n(a.moonAlpha, b.moonAlpha),
    candle: n(a.candle, b.candle),
  };
}

export class SkyAnimator {
  private from: SkyState;
  private to: SkyState;
  private start = 0;
  private dur = 1;
  current: SkyState;
  constructor(initial: SkyState) { this.from = this.to = this.current = initial; }
  setTarget(next: SkyState, ms = 2500, now = performance.now()) {
    this.from = this.current; this.to = next; this.start = now; this.dur = Math.max(1, ms);
  }
  tick(now: number): boolean {
    if (this.current === this.to) return false;
    const t = clamp((now - this.start) / this.dur);
    const e = t * t * (3 - 2 * t);
    this.current = t >= 1 ? this.to : mixState(this.from, this.to, e);
    return true;
  }
}

/** Sahne CSS değişkenleri. Gökyüzü renkleri skyRender.sampleColors()'tan gelir. */
export function applyCssVars(
  s: SkyState,
  sky: { top: string; mid: string; hor: string } | null,
  root = document.documentElement,
) {
  const st = root.style;
  if (sky) {
    st.setProperty('--sky-top', sky.top);
    st.setProperty('--sky-mid', sky.mid);
    st.setProperty('--sky-hor', sky.hor);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky.top);
  }
  // Zemin: yeşilin ışıkla aydınlanmış hâli (gece neredeyse siyah-yeşil, gün batımında sıcak)
  // akşam zemin hızla siluete döner (gökyüzünden çok daha koyu)
  const L = s.sunLight, k = (0.03 + 0.97 * smoothstep(-2, 14, s.sunAlt) ** 1.4) * (1 - 0.35 * s.weather.cloud);
  const ground = [0.16 * (0.35 + 0.65 * L[0]), 0.26 * (0.35 + 0.65 * L[1]), 0.14 * (0.35 + 0.65 * L[2])]
    .map((v) => Math.round(255 * Math.pow(v * k + 0.004 + 0.006 * s.moonLight, 1 / 2.2)));
  const gcss = `rgb(${ground.join(',')})`;
  st.setProperty('--grass', gcss);
  st.setProperty('--sky-bottom', gcss);
  st.setProperty('--daylight', s.daylight.toFixed(3));
  st.setProperty('--candle', s.candle.toFixed(3));
  st.setProperty('--pill-bg', s.daylight > 0.5 ? 'rgba(12,18,40,.62)' : 'rgba(14,18,38,.78)');
}
