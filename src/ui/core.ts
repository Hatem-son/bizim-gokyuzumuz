// Modüller arası ortak erişim (gökyüzü motoru, hava, worker, kaydırma, efektler, ekran eylemleri).
import type { Engine } from '../gokyuzu/engine';
import type { Effects } from '../gokyuzu/effects';
import type { SkyGeom } from '../gokyuzu/skyGeom';
import type { SkyRenderer } from '../gokyuzu/skyRender';
import type { WeatherRenderer } from '../gokyuzu/weatherRender';
import type { SkyWorker } from '../gokyuzu/workerClient';
import type { Plane } from '../gokyuzu/plane';
import type { Kind, Star } from './state';
import type { BoardResult, DrawLivePacket, Stroke } from './draw';
import type { DiaryPeekPacket } from '../lib/diary';

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
  scrollToStar: (_st: Star, _ms?: number) => {},
  starScreenPos: (_st: Star): { x: number; y: number } => ({ x: 0, y: 0 }),
  homeEl: null as unknown as HTMLElement,
  refreshHome: () => {},
  reloadWeather: () => {},
  logout: async () => {},
  openCompose: (_initial?: Kind) => {},
  openArchive: () => {},
  openJar: () => {},
  openSettings: () => {},
  openCountdown: () => {},
  openStar: (_st: Star) => {},
  openBoard: async (_existing?: unknown[] | null, _opts?: { collab?: boolean; sid?: string }): Promise<BoardResult | null> => null,
  renderDrawingPreview: (_cv: HTMLCanvasElement, _strokes: unknown[], _upTo?: number) => {},
  encodeDrawing: async (_strokes: unknown[]): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(new ArrayBuffer(0)),
  decodeDrawing: async (_bytes: Uint8Array<ArrayBuffer>): Promise<unknown[]> => [],
  sendDrawPacket: (_pkt: DrawLivePacket) => {},
  onDrawPacket: (_cb: (pkt: DrawLivePacket) => void): (() => void) => () => {},
  sendDiaryPacket: (_pkt: DiaryPeekPacket) => {},
  onDiaryPacket: (_cb: (pkt: DiaryPeekPacket) => void): (() => void) => () => {},
  requestDraw: () => {},
  setInDrawView: (_v: boolean) => {},
  onCollabFin: (_strokes: Stroke[], _sid?: string, _collab?: boolean) => {},
  landMyDrawing: async (_strokes: Stroke[], _sid?: string, _collab?: boolean): Promise<void> => {},
  markDrawSessionLanded: (_sidOrStarId: string) => {},
  onSendHeart: () => {},
  onOutboxChange: () => {},
  setMyLiveActivity: (_act: 'writing' | 'sending' | 'drawing' | 'photo' | 'voice' | 'idle') => {},
  onPersona: () => {},
  triggerOcean: () => {},
  lastInsertLatencyMs: null as number | null,
};
