import type { Who } from './types';

export const APP_VERSION = '6.0.35';

/**
 * İki kullanıcının Supabase Authentication e-posta adresleri (korunan kullanıcı ayarı).
 */
export const USER_EMAILS: Record<Who, string> = {
  hamham: 'humam@gokyuzu.app',
  beto: 'beto@gokyuzu.app',
};

/** Her ~HAZEL_EVERY yıldızdan biri ela yıldız olarak doğar */
export const HAZEL_EVERY = 12;
