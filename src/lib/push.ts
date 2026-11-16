import type { StarKind, Who } from '../types';
import { getSupabase, isSupabaseConfigured } from './supabase';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function isVapidConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY);
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function subscribePushNotifications(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!isPushSupported()) {
    return {
      ok: false,
      error: 'Bildirimler iPhone’da sadece uygulama Ana Ekrana eklendikten sonra çalışır (iOS 16.4+).',
    };
  }
  if (!isVapidConfigured()) {
    return {
      ok: false,
      error: 'VAPID genel anahtarı (.env -> VITE_VAPID_PUBLIC_KEY) henüz tanımlanmamış.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Bildirim izni verilmedi.' };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const sb = getSupabase();
    if (sb) {
      const { data: userData } = await sb.auth.getUser();
      if (userData.user) {
        const { error } = await sb
          .from('profiles')
          .update({
            push_subscription: sub.toJSON(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userData.user.id);
        if (error) {
          return { ok: false, error: 'Bildirim kaydı sunucuya yazılamadı.' };
        }
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Bildirim aboneliği kurulamadı.',
    };
  }
}

export async function triggerPushNotification(params: {
  sender: Who;
  kind: StarKind;
  once: boolean;
  unlockAt?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.functions.invoke('send-push', {
      body: params,
    });
  } catch {
    // Push failure should never block star delivery
  }
}

