// Uygulama durumu: kişiler, yıldızlar (Supabase + E2EE), kalıcı ayarlar. Örnek (seed) veri yoktur.
import type { Who as DbWho, StarRecord } from '../types';
import { getServerNowMs } from '../lib/stars';
import { STORAGE_KEYS, store } from '../lib/storage';
import { getMode, setMode } from '../gokyuzu/weather';
import { hasBiometric } from '../lib/lock';

export type Who = 'ham' | 'beto';
export type Kind = 'text' | 'photo' | 'voice' | 'draw';

export type Star = {
  id: string;
  from: Who;
  kind: Kind;
  text?: string;
  caption?: string;
  photo?: string;
  voiceSec?: number;
  voicePeaks?: number[];
  voiceUrl?: string;
  draw?: [string, string, number, [number, number, number][]][] | unknown;
  createdAt: number;
  unlockAt?: number;
  opened: boolean;
  x: number;
  y: number;
  hazel?: boolean;
  arrivedAt?: number;
  visible?: boolean;
  raw?: StarRecord;
};

export const toDbWho = (w: Who): DbWho => (w === 'ham' ? 'hamham' : 'beto');
export const toUiWho = (w: string | null | undefined): Who => (w === 'beto' ? 'beto' : 'ham');

export const PEOPLE = {
  ham: { name: 'Ham ham', to: "Ham ham'a", from: "Ham ham'dan", of: "Ham ham'ın", color: '#9db6ff', sign: 'cancer', signName: 'Yengeç' },
  beto: { name: 'Beto', to: "Beto'ya", from: "Beto'dan", of: "Beto'nun", color: '#ff8db5', sign: 'capricorn', signName: 'Oğlak' },
} as const;

type PersistedSettings = {
  notify: boolean;
  faceId: boolean;
  weather: 'off' | 'geo' | 'city';
  city: string;
  live: boolean;
  lightning: boolean;
};

function loadInitialSettings(): PersistedSettings {
  const saved = store.get<Partial<PersistedSettings>>(STORAGE_KEYS.settings, {});
  const wxMode = getMode();
  let city = saved.city ?? '';
  try {
    city = localStorage.getItem('gk.city') || city;
  } catch {
    // Ignore storage read errors
  }
  return {
    notify: saved.notify ?? false,
    faceId: saved.faceId ?? hasBiometric(),
    weather: saved.weather ?? wxMode ?? 'off',
    city,
    live: saved.live ?? true,
    lightning: saved.lightning ?? true,
  };
}

const savedMe = store.get<string | null>(STORAGE_KEYS.me, null);

export const state = {
  me: toUiWho(savedMe),
  get partner(): Who { return this.me === 'ham' ? 'beto' : 'ham'; },
  stars: [] as Star[],
  settings: loadInitialSettings(),
  meetDate: new Date('2027-01-09T00:00:00+03:00'),
};

export function saveSettings() {
  setMode(state.settings.weather);
  store.set(STORAGE_KEYS.settings, state.settings);
}

export function setMe(w: Who) {
  state.me = w;
  store.set(STORAGE_KEYS.me, toDbWho(w));
}

export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) + ', ' +
  new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
export const fmtMonth = (t: number) => new Date(t).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

export function untilParts(target: number, now = getServerNowMs()) {
  let s = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return { d, h, m, s };
}
export const fmtUntil = (target: number) => {
  const p = untilParts(target);
  return p.d > 0 ? `${p.d} gün ${p.h} saat` : p.h > 0 ? `${p.h} saat ${p.m} dakika` : `${Math.max(1, p.m)} dakika`;
};
