import type { Who } from './types';

/**
 * İki kullanıcının Supabase Authentication e-posta adresleri.
 * Supabase'de oluşturduğun gerçek (veya uydurma) e-postalarla yalnızca burayı değiştir.
 */
export const USER_EMAILS: Record<Who, string> = {
  hamham: 'humam@gokyuzu.app',
  beto: 'beto@gokyuzu.app',
};

/** Her ~HAZEL_EVERY yıldızdan biri ela yıldız olarak doğar */
export const HAZEL_EVERY = 12;

export interface MoonTintSpec {
  surfaceStops: [string, string, string];
  craterColor: string;
  rimStroke: string;
  haloStops: [string, string, string, string, string];
  /** Yalnızca aktif kullanıcıda ay çapının ≈1.8 katı yarıçaplı statik radyal halka (opaklık ≤ .22) */
  hazelRingColor: string | null;
  hazelRingAlpha: number;
}

/** Kullanıcıya göre ay ışığı renk paleti (yalnızca Beto'da sıcak ela-krem tonlama) */
export const MOON_TINT: Record<Who, MoonTintSpec> = {
  hamham: {
    surfaceStops: ['#ffffff', '#f6f9ff', '#e6effd'],
    craterColor: 'rgba(172, 194, 228, 0.11)',
    rimStroke: 'rgba(255, 255, 255, 0.96)',
    haloStops: [
      'rgba(255, 255, 255, 0.72)',
      'rgba(232, 244, 255, 0.44)',
      'rgba(204, 228, 255, 0.18)',
      'rgba(180, 212, 255, 0.05)',
      'rgba(170, 205, 255, 0)',
    ],
    hazelRingColor: null,
    hazelRingAlpha: 0,
  },
  beto: {
    surfaceStops: ['#efe2c0', '#d9c48a', '#a9a05a'],
    craterColor: 'rgba(138, 122, 72, 0.14)',
    rimStroke: 'rgba(246, 234, 196, 0.94)',
    haloStops: [
      'rgba(239, 226, 192, 0.56)',
      'rgba(227, 194, 122, 0.28)',
      'rgba(169, 160, 90, 0.11)',
      'rgba(169, 160, 90, 0.03)',
      'rgba(169, 160, 90, 0)',
    ],
    hazelRingColor: 'rgba(227, 194, 122,', // #e3c27a
    hazelRingAlpha: 0.21,
  },
};

