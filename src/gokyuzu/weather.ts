// Hava durumu: Open-Meteo (anahtarsız, CORS açık). Konum yalnızca cihazda kalır.
// CSP: connect-src https://api.open-meteo.com https://geocoding-api.open-meteo.com
import { clamp, invLerp } from './util';

export type WeatherKind =
  | 'clear' | 'partly' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'heavyRain'
  | 'showers' | 'snow' | 'heavySnow' | 'sleet' | 'thunder';

export type Weather = {
  kind: WeatherKind;
  cloud: number;   // 0..1
  precip: number;  // 0..1
  wind: number;    // 0..1
  windSign: -1 | 1; // ekranda yağmur/bulut yönü: +1 sağa
  fog: number;     // 0..1
  temp: number;    // °C
  ts: number;      // veri zamanı (ms)
};

export const CLEAR: Weather = {
  kind: 'clear', cloud: 0, precip: 0, wind: 0.15, windSign: 1, fog: 0, temp: NaN, ts: 0,
};

export const KIND_TR: Record<WeatherKind, string> = {
  clear: 'açık', partly: 'parçalı bulutlu', cloudy: 'bulutlu', overcast: 'kapalı', fog: 'sisli',
  drizzle: 'çisenti', rain: 'yağmurlu', heavyRain: 'şiddetli yağmur', showers: 'sağanak',
  snow: 'karlı', heavySnow: 'yoğun kar', sleet: 'karla karışık yağmur', thunder: 'gök gürültülü fırtına',
};

/** WMO kodu + bulut oranı → tür */
export function kindFromCode(code: number, cloud: number): WeatherKind {
  if (code === 0) return cloud > 0.25 ? 'partly' : 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return cloud >= 0.85 ? 'overcast' : 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if (code === 61 || code === 63) return 'rain';
  if (code === 65) return 'heavyRain';
  if (code >= 80 && code <= 82) return 'showers';
  if (code === 75 || code === 86) return 'heavySnow';
  if (code === 71 || code === 73 || code === 77 || code === 85) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

/** Tür başına yağış tabanı: veri 0 gelse de türün görsel karakteri korunur. */
const PRECIP_FLOOR: Partial<Record<WeatherKind, number>> = {
  drizzle: 0.2, rain: 0.5, heavyRain: 0.85, showers: 0.55, snow: 0.5, heavySnow: 0.85,
  sleet: 0.5, thunder: 0.9,
};
const CLOUD_FLOOR: Partial<Record<WeatherKind, number>> = {
  partly: 0.3, cloudy: 0.6, overcast: 0.92, drizzle: 0.8, rain: 0.85, heavyRain: 0.95,
  showers: 0.7, snow: 0.85, heavySnow: 0.95, sleet: 0.9, thunder: 0.95, fog: 0.5,
};

type OMCurrent = {
  weather_code: number; cloud_cover: number; precipitation: number; rain: number;
  showers: number; snowfall: number; wind_speed_10m: number; wind_direction_10m: number;
  visibility: number; temperature_2m: number;
};

export function normalize(c: OMCurrent): Weather {
  const cloudRaw = clamp((c.cloud_cover ?? 0) / 100);
  const kind = kindFromCode(c.weather_code, cloudRaw);
  const mm = Math.max(c.precipitation ?? 0, (c.rain ?? 0) + (c.showers ?? 0) + (c.snowfall ?? 0));
  const precipData = mm <= 0 ? 0 : clamp(0.1 + Math.log2(1 + mm) / 3.2);
  const fogVis = 1 - invLerp(1000, 10000, c.visibility ?? 20000);
  return {
    kind,
    cloud: Math.max(cloudRaw, CLOUD_FLOOR[kind] ?? 0),
    precip: Math.max(precipData, PRECIP_FLOOR[kind] ?? 0) * (PRECIP_FLOOR[kind] ? 1 : 0),
    wind: clamp((c.wind_speed_10m ?? 0) / 45),
    // Meteorolojide yön = rüzgârın GELDİĞİ yön. Güneye bakan ekranda doğu solda, batı sağda.
    // Batıdan esen (270°, sin<0) doğuya gider → ekranda sola (-1). Doğudan esen sağa (+1).
    windSign: Math.sin(((c.wind_direction_10m ?? 270) * Math.PI) / 180) < 0 ? -1 : 1,
    fog: kind === 'fog' ? Math.max(0.7, fogVis) : fogVis * 0.6,
    temp: c.temperature_2m,
    ts: Date.now(),
  };
}

const KEY = 'gk.weather';
const MODE_KEY = 'gk.weatherMode'; // 'off' | 'geo' | 'city'
export const getMode = () => (localStorage.getItem(MODE_KEY) as 'off' | 'geo' | 'city') || 'off';
export const setMode = (m: 'off' | 'geo' | 'city') => localStorage.setItem(MODE_KEY, m);

export function cached(maxAgeMs = 3 * 3600_000): Weather | null {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) || 'null') as Weather | null;
    if (w && Date.now() - w.ts < maxAgeMs) return w;
  } catch {}
  return null;
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Weather> {
  const p = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: [
      'weather_code', 'cloud_cover', 'precipitation', 'rain', 'showers', 'snowfall',
      'wind_speed_10m', 'wind_direction_10m', 'visibility', 'temperature_2m',
    ].join(','),
    timezone: 'auto',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal });
  if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json();
  const w = normalize(j.current);
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch {}
  return w;
}

/** Konumu bir kez, düşük doğrulukla al; 2 ondalığa yuvarla, yalnızca cihazda sakla. */
export function askGeo(): Promise<{ lat: number; lon: number }> {
  return new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) };
        localStorage.setItem('gk.loc', JSON.stringify(loc));
        setMode('geo');
        res(loc);
      },
      rej,
      { enableHighAccuracy: false, maximumAge: 6 * 3600_000, timeout: 10000 },
    ),
  );
}

export async function searchCity(q: string) {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=tr`,
  );
  const j = await r.json();
  return (j.results || []).map((x: any) => ({
    name: x.name as string,
    admin: (x.admin1 || x.country || '') as string,
    lat: +(+x.latitude).toFixed(2),
    lon: +(+x.longitude).toFixed(2),
  }));
}

export function chooseCity(c: { name: string; lat: number; lon: number }) {
  localStorage.setItem('gk.loc', JSON.stringify({ lat: c.lat, lon: c.lon }));
  localStorage.setItem('gk.city', c.name);
  setMode('city');
}

/**
 * Yenileme döngüsü: açılışta, 15 dk'da bir, arka plandan dönünce (10 dk+ geçtiyse).
 * Sekme gizliyken istek atılmaz. Hata kullanıcıya gösterilmez.
 */
export function startWeather(getLoc: () => { lat: number; lon: number }, onWeather: (w: Weather) => void) {
  let timer: number | undefined;
  let last = 0;
  const run = async () => {
    if (getMode() === 'off' || document.hidden) return;
    try {
      const loc = getLoc();
      const w = await fetchWeather(loc.lat, loc.lon);
      last = Date.now();
      onWeather(w);
    } catch {
      onWeather(cached() ?? CLEAR);
    }
  };
  const schedule = () => {
    clearInterval(timer);
    timer = window.setInterval(run, 15 * 60_000);
  };
  const onVis = () => {
    if (!document.hidden && Date.now() - last > 10 * 60_000) run();
  };
  document.addEventListener('visibilitychange', onVis);
  onWeather(getMode() === 'off' ? CLEAR : cached() ?? CLEAR);
  run();
  schedule();
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
  };
}
