import type { StarRecord } from '../types';

export const LINK_MS = 60 * 60 * 1000; // 1 saat içinde karşılıklı bırakılan yıldızlar "aynı an"

export const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function monthIdx(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

export function starMonthIdx(star: StarRecord): number {
  return monthIdx(new Date(star.createdAt));
}

export function effectiveStarTimeMs(star: StarRecord): number {
  return star.unlockAt ? Date.parse(star.unlockAt) : Date.parse(star.createdAt);
}

export function computeLinks(stars: StarRecord[], nowMs = Date.now()): [StarRecord, StarRecord][] {
  // Kilitli yıldızlar açılana dek aynı-an bağlantı hesabına girmez;
  // açıldıktan sonra ise unlock_at zamanı esas alınır.
  const eligible = stars.filter((s) => !s.unlockAt || Date.parse(s.unlockAt) <= nowMs);
  const sorted = [...eligible].sort((a, b) => effectiveStarTimeMs(a) - effectiveStarTimeMs(b));
  const used = new Set<string>();
  const links: [StarRecord, StarRecord][] = [];

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (used.has(a.id)) continue;
    const ta = effectiveStarTimeMs(a);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (effectiveStarTimeMs(b) - ta > LINK_MS) break;
      if (b.from !== a.from && !used.has(b.id)) {
        used.add(a.id);
        used.add(b.id);
        links.push([a, b]);
        break;
      }
    }
  }

  return links;
}
