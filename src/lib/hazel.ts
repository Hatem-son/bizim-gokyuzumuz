import { HAZEL_EVERY } from '../config';
import type { StarRecord, Who } from '../types';
import { PEOPLE } from './people';
import { STORAGE_KEYS, store } from './storage';

/** Yıldız kimliğinden FNV-1a ile deterministik ela yıldız hesabı */
export function isHazel(id: string, every = HAZEL_EVERY): boolean {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % every === 0;
}

const HAZEL_1_IN_30_CUTOFF_ISO = '2026-11-19T22:00:00.000Z';

/** İlk gönderilen yıldız hiçbir zaman ela olmaz; diğerleri id ile deterministik seçilir */
export function isStarHazel(star: StarRecord, allStars: StarRecord[]): boolean {
  let hasEarlier = false;
  for (const other of allStars) {
    if (other.from !== star.from) continue;
    if (
      other.createdAt < star.createdAt ||
      (other.createdAt === star.createdAt && other.id < star.id)
    ) {
      hasEarlier = true;
      break;
    }
  }
  if (!hasEarlier) return false;
  // v6.0.46 öncesi mevcut ela yıldızlar (1/10) kaybolmasın; yeni yıldızlar 1/30 olasılıkla doğar
  const every = star.createdAt < HAZEL_1_IN_30_CUTOFF_ISO ? 10 : HAZEL_EVERY;
  return isHazel(star.id, every);
}

const HAZEL_LINES: Record<Who, string[]> = {
  // Ham ham'dan Beto'ya giden ela yıldız
  hamham: [
    'Gözlerin gibi bir yıldız',
    'Bu yıldızın rengi, gözlerinin rengi',
    'Bir ela yıldız düştü, sana benziyor',
    'Ela yıldızlar nadir olur, tıpkı sen',
    'Bu yıldız senin gözlerinden ödünç alındı',
  ],
  // Beto'dan Ham ham'a giden ela yıldız (Beto'nun eki yardımcıyla üretilir)
  beto: [
    `Bu yıldız ela, ${PEOPLE.beto.gen} gözleri gibi`,
    'Ela bir yıldız bıraktı, bunu da sana',
    `${PEOPLE.beto.gen} gözlerinin rengi göğe karıştı`,
    'Nadir bir yıldız, ela renkte',
    `Bu yıldızın içinde ${PEOPLE.beto.gen} bakışı var`,
  ],
};

export function pickHazelLine(sender: Who): string {
  const key = `${STORAGE_KEYS.hazel}.${sender}`;
  const pool = HAZEL_LINES[sender];
  const last = store.get<string>(key, '');
  const candidates = pool.filter((line) => line !== last);
  const avail = candidates.length > 0 ? candidates : pool;
  const picked = avail[Math.floor(Math.random() * avail.length)] ?? pool[0];
  store.set(key, picked);
  return picked;
}

