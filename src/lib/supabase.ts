import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRow, Who } from '../types';
import { STORAGE_KEYS, store } from './storage';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('PROJE-ID')
);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (lower.includes('email not confirmed')) return 'E-posta adresi henüz doğrulanmamış.';
  if (lower.includes('signups not allowed') || lower.includes('signup')) {
    return 'Bu gökyüzü sadece Ham ham ve Beto için açık. Yeni kayıt kapalı.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Bağlantı kurulamadı. İnternetini kontrol et.';
  }
  return message;
}

export async function getSessionAndProfile(): Promise<{
  session: Session | null;
  profile: ProfileRow | null;
}> {
  const sb = getSupabase();
  if (!sb) return { session: null, profile: null };

  const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
  if (sessionErr || !sessionData.session) {
    return { session: null, profile: null };
  }

  const { data: profileData, error: profileErr } = await sb
    .from('profiles')
    .select('id, who, push_subscription')
    .eq('id', sessionData.session.user.id)
    .maybeSingle();

  if (profileErr || !profileData) {
    return { session: sessionData.session, profile: null };
  }

  return {
    session: sessionData.session,
    profile: profileData as ProfileRow,
  };
}

export async function signInWithPassword(
  email: string,
  password: string,
  expectedWho: Who
): Promise<{ ok: true; profile: ProfileRow } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase bağlantısı ayarlanmamış.' };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: translateAuthError(error?.message || 'Giriş yapılamadı.') };
  }

  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('id, who, push_subscription')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profErr || !profile) {
    await sb.auth.signOut();
    return {
      ok: false,
      error: 'Bu hesap profiller listesinde yetkili görünmüyor.',
    };
  }

  const typed = profile as ProfileRow;
  if (typed.who !== expectedWho) {
    await sb.auth.signOut();
    return {
      ok: false,
      error:
        expectedWho === 'hamham'
          ? 'Bu hesap Beto hesabı. Geri dönüp Beto kartını seç veya kendi hesabınla gir.'
          : 'Bu hesap Ham ham hesabı. Geri dönüp Ham ham kartını seç veya kendi hesabınla gir.',
    };
  }

  return { ok: true, profile: typed };
}

export async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase bağlantısı ayarlanmamış.' };

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) {
    return { ok: false, error: translateAuthError(error.message) };
  }
  return { ok: true };
}

export async function signOutSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function fetchVerifyBlob(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) {
    return store.get<string | null>(STORAGE_KEYS.verifyLocal, null);
  }
  const { data, error } = await sb
    .from('settings')
    .select('verify_blob')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error('Doğrulama verisi okunamadı.');
  return (data?.verify_blob as string | undefined) || null;
}

export async function saveVerifyBlob(blob: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    store.set(STORAGE_KEYS.verifyLocal, blob);
    return;
  }
  const { error } = await sb
    .from('settings')
    .upsert({ id: 1, verify_blob: blob, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw new Error('Doğrulama verisi kaydedilemedi.');
}

