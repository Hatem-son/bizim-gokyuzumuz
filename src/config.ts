import type { Who } from './types';

/**
 * İki kullanıcının Supabase Authentication e-posta adresleri.
 * Supabase'de oluşturduğun gerçek (veya uydurma) e-postalarla yalnızca burayı değiştir.
 */
export const USER_EMAILS: Record<Who, string> = {
  hamham: 'humam@gokyuzu.app',
  beto: 'beto@gokyuzu.app',
};
