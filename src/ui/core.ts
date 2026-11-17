// Modüller arası ortak erişim (gökyüzü motoru, hava, worker, kaydırma, efektler, ekran eylemleri).
import type { Engine } from '../gokyuzu/engine';
import type { Effects } from '../gokyuzu/effects';
import type { SkyGeom } from '../gokyuzu/skyGeom';
import type { SkyRenderer } from '../gokyuzu/skyRender';
import type { WeatherRenderer } from '../gokyuzu/weatherRender';
import type { SkyWorker } from '../gokyuzu/workerClient';
import type { Plane } from '../gokyuzu/plane';
import type { Kind, Star } from './state';

export const core = {
  engine: null as unknown as Engine,
  fx: null as unknown as Effects,
  sky: null as unknown as SkyRenderer,
  weatherRenderer: null as unknown as WeatherRenderer,
  worker: null as unknown as SkyWorker,
  plane: null as unknown as Plane,
  geom: null as unknown as SkyGeom,
  W: 390,
  H: 844,
  skyW: 858,
  horizonY: 600,
  scrollX: 0,
  scrollTo: (_x: number, _ms?: number) => {},
  homeEl: null as unknown as HTMLElement,
  refreshHome: () => {},
  reloadWeather: () => {},
  logout: async () => {},
  openCompose: (_initial?: Kind) => {},
  openArchive: () => {},
  openSettings: () => {},
  openCountdown: () => {},
  openStar: (_st: Star) => {},
  onSendHeart: () => {},
  setMyLiveActivity: (_act: 'writing' | 'sending' | 'drawing' | 'photo' | 'voice' | 'idle') => {},
};
