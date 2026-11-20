import type { Who } from './types';

export const APP_VERSION = '6.0.58';

/**
 * İki kullanıcının Supabase Authentication e-posta adresleri (korunan kullanıcı ayarı).
 */
export const USER_EMAILS: Record<Who, string> = {
  hamham: 'humam@gokyuzu.app',
  beto: 'beto@gokyuzu.app',
};

/** Her yıldızda 1/30 (~%3.3) saf olasılıkla ela yıldız doğar (aylık/dönemlik çıkma zorunluluğu yoktur) */
export const HAZEL_EVERY = 30;
