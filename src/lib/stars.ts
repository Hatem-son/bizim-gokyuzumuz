import type { RealtimeChannel } from '@supabase/supabase-js';
import type { StarKind, StarRecord, Who } from '../types';
import { openBytes, openJSON, sealBytes, sealJSON } from './crypto';
import { triggerPushNotification } from './push';
import { STORAGE_KEYS, store } from './storage';
import { getSupabase, isSupabaseConfigured, toFriendlyTurkishError } from './supabase';

export interface StarPayloadData {
  text: string;
  held?: number;
  mime?: string;
  dur?: number;
  peaks?: number[];
}

interface DbStarRow {
  id: string;
  from_user: string;
  kind: StarKind;
  x: number;
  y: number;
  size: number;
  once: boolean;
  spent: boolean;
  has_media: boolean;
  created_at: string;
  opened_at: string | null;
  unlock_at: string | null;
  unlock_notified: boolean;
  unlock_push_sent: boolean;
}

const LOCAL_MEDIA_PREFIX = 'gokyuzu.media.v4.';
const LOCAL_SECRET_PREFIX = 'gokyuzu.secret.v5.';
const localMediaMem: Record<string, string> = {};
const localSecretMem: Record<string, string> = {};

let serverClockOffsetMs = 0;

export function getServerNowMs(): number {
  return Date.now() + serverClockOffsetMs;
}

export async function syncServerClock(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const t0 = Date.now();
    const { data, error } = await sb.rpc('server_now');
    const t1 = Date.now();
    if (!error && typeof data === 'string') {
      const serverMs = Date.parse(data);
      if (Number.isFinite(serverMs)) {
        const midpoint = (t0 + t1) / 2;
        serverClockOffsetMs = Math.round(serverMs - midpoint);
      }
    }
  } catch {
    // Ignore clock sync errors and fall back to existing offset
  }
}

export function isStarLocked(star: Pick<StarRecord, 'unlockAt'>, nowMs = getServerNowMs()): boolean {
  return Boolean(star.unlockAt && Date.parse(star.unlockAt) > nowMs);
}

const unlockDateFmt = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
});
const unlockTimeFmt = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatUnlockDateTime(iso: string): string {
  const d = new Date(iso);
  return `${unlockDateFmt.format(d)}, ${unlockTimeFmt.format(d)}`;
}

export function formatUnlockAccusative(iso: string, suffix: 'te' | 'e' = 'te'): string {
  const txt = formatUnlockDateTime(iso);
  // Saat son hanesine göre Türkçe ek: 00 -> 'e / 'te yerine basit okunuşlu ekler
  if (suffix === 'e') {
    const d = new Date(iso);
    const min = d.getMinutes();
    const hr = d.getHours();
    if (hr === 0 && min === 0) return `${txt}'e`;
    const last = min === 0 ? hr : min;
    const ones = last % 10;
    const eSuffix =
      last === 0 || [1, 3, 4, 5, 8].includes(ones) || [10, 30].includes(last)
        ? "'e"
        : [2, 7, 20].includes(ones) || last === 50
          ? "'ye"
          : "'a";
    return `${txt}${eSuffix}`;
  }
  const min = new Date(iso).getMinutes();
  const hr = new Date(iso).getHours();
  const last = min === 0 ? hr : min;
  const ones = last % 10;
  const teSuffix =
    last === 0
      ? "'te"
      : [1, 2, 7, 8, 20, 50].includes(ones) || [20, 50].includes(last)
        ? "'de"
        : [3, 4, 5].includes(ones)
          ? "'te"
          : [6, 9, 10, 30, 40].includes(last) || [6, 9].includes(ones)
            ? "'da"
            : "'te";
  return `${txt}${teSuffix}`;
}

export function formatTimeRemaining(unlockIso: string, nowMs = getServerNowMs()): string {
  const diff = Math.max(0, Date.parse(unlockIso) - nowMs);
  const totalMin = Math.ceil(diff / 60_000);
  if (totalMin < 60) {
    return `${Math.max(1, totalMin)} dakika kaldı`;
  }
  const totalHours = Math.floor(diff / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days >= 1) {
    return hours > 0 ? `${days} gün ${hours} saat kaldı` : `${days} gün kaldı`;
  }
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return mins > 0 ? `${hours} saat ${mins} dakika kaldı` : `${hours} saat kaldı`;
}

function putLocalMedia(id: string, sealed: string): void {
  localMediaMem[id] = sealed;
  try {
    localStorage.setItem(LOCAL_MEDIA_PREFIX + id, sealed);
  } catch {
    // Ignore storage limit errors
  }
}

function getLocalMedia(id: string): string | null {
  if (localMediaMem[id]) return localMediaMem[id];
  try {
    return localStorage.getItem(LOCAL_MEDIA_PREFIX + id);
  } catch {
    return null;
  }
}

function dropLocalMedia(id: string): void {
  delete localMediaMem[id];
  try {
    localStorage.removeItem(LOCAL_MEDIA_PREFIX + id);
  } catch {
    // Ignore
  }
}

function putLocalSecret(id: string, sealed: string): void {
  localSecretMem[id] = sealed;
  try {
    localStorage.setItem(LOCAL_SECRET_PREFIX + id, sealed);
  } catch {
    // Ignore
  }
}

function getLocalSecret(id: string): string | null {
  if (localSecretMem[id]) return localSecretMem[id];
  try {
    return localStorage.getItem(LOCAL_SECRET_PREFIX + id);
  } catch {
    return null;
  }
}

function dropLocalSecret(id: string): void {
  delete localSecretMem[id];
  try {
    localStorage.removeItem(LOCAL_SECRET_PREFIX + id);
  } catch {
    // Ignore
  }
}

function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function bandY(f: number): number {
  return 0.5 + 0.26 * Math.sin(f * Math.PI * 2 * 1.15 + 0.6) + 0.07 * Math.sin(f * Math.PI * 2 * 3.1 + 2);
}

export function placeStarPosition(opts: {
  ox: number;
  skyW: number;
  skyH: number;
  pano: number;
  existing: StarRecord[];
}): { x: number; y: number } {
  const { ox, skyW, skyH, pano, existing } = opts;
  const worldW = skyW * pano;
  const ar = worldW / Math.max(1, skyH);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const vl = (ox / worldW) * 100;
  const vr = ((ox + skyW) / worldW) * 100;
  const pad = 7 / pano;

  let pick: { x: number; y: number } | null = null;
  for (let i = 0; i < 24; i++) {
    const x =
      Math.random() < 0.75
        ? vl + pad + Math.random() * Math.max(1, vr - vl - 2 * pad)
        : 1.5 + Math.random() * 97;
    const y =
      Math.random() < 0.62
        ? bandY(x / 100) * 100 + gauss() * 15
        : 5 + Math.random() * 82;
    if (y < 5 || y > 88 || x < 1 || x > 99) continue;
    pick = { x, y };
    const collides = existing.some((st) => {
      const dx = (st.x - x) * ar;
      const dy = st.y - y;
      return dx * dx + dy * dy < 9;
    });
    if (!collides) break;
  }

  return (
    pick || {
      x: Math.max(1, Math.min(99, (vl + vr) / 2 + (Math.random() - 0.5) * (vr - vl) * 0.6)),
      y: 20 + Math.random() * 60,
    }
  );
}

let userIdToWhoCache: Map<string, Who> | null = null;

async function getUserWhoMap(): Promise<Map<string, Who>> {
  if (userIdToWhoCache && userIdToWhoCache.size >= 2) {
    return userIdToWhoCache;
  }
  const map = new Map<string, Who>();
  const sb = getSupabase();
  if (!sb) return map;

  try {
    const { data, error } = await sb.from('profiles').select('id, who');
    if (!error && data) {
      for (const row of data as { id: string; who: Who }[]) {
        map.set(row.id, row.who);
      }
      if (map.size >= 2) userIdToWhoCache = map;
    }
  } catch {
    // Ağ hatasında önbelleği boş kilitleme, sonraki çağrıda tekrar dene
  }
  return map;
}

function mapDbRow(row: DbStarRow, whoMap: Map<string, Who>, fallbackMe: Who): StarRecord {
  const mappedWho = whoMap.get(row.from_user);
  return {
    id: row.id,
    fromUser: row.from_user,
    from: mappedWho ?? fallbackMe,
    kind: row.kind,
    x: row.x,
    y: row.y,
    size: row.size,
    once: row.once,
    spent: row.spent,
    hasMedia: row.has_media,
    createdAt: row.created_at,
    openedAt: row.opened_at,
    unlockAt: row.unlock_at ?? null,
    unlockNotified: Boolean(row.unlock_notified),
    unlockPushSent: Boolean(row.unlock_push_sent),
  };
}

export async function fetchAllStars(me: Who): Promise<StarRecord[]> {
  if (!isSupabaseConfigured) {
    const raw = store.get<StarRecord[]>(STORAGE_KEYS.starsLocal, []);
    // Eski yerel kayıtlarda inline payload kalmışsa ayrı secret deposuna taşı
    let migrated = false;
    const clean = raw.map((s) => {
      const next: StarRecord = {
        ...s,
        unlockAt: s.unlockAt ?? null,
        unlockNotified: Boolean(s.unlockNotified),
        unlockPushSent: Boolean(s.unlockPushSent),
      };
      if (next.payload) {
        putLocalSecret(next.id, next.payload);
        delete next.payload;
        migrated = true;
      }
      return next;
    });
    if (migrated) store.set(STORAGE_KEYS.starsLocal, clean);
    return clean;
  }

  try {
    await syncServerClock();
    const sb = getSupabase()!;
    const whoMap = await getUserWhoMap();
    const { data, error } = await sb
      .from('stars')
      .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }
    return (data as DbStarRow[]).map((row) => mapDbRow(row, whoMap, me));
  } catch {
    return [];
  }
}

export async function createEncryptedStar(params: {
  from: Who;
  kind: StarKind;
  data: StarPayloadData;
  pos: { x: number; y: number };
  mediaBytes?: Uint8Array<ArrayBuffer>;
  once?: boolean;
  unlockAt?: string | null;
}): Promise<StarRecord> {
  const id = generateId();
  const textLen = (params.data.text || '').length;
  const size =
    params.kind === 'miss'
      ? +Math.min(10.5, 6.5 + (Math.min(3, params.data.held || 0) / 3) * 4).toFixed(1)
      : params.kind === 'note'
        ? +Math.min(10.5, 7.5 + textLen / 120).toFixed(1)
        : 9;

  const sealedPayload = await sealJSON(params.data);
  let sealedMedia: string | null = null;
  if (params.mediaBytes) {
    sealedMedia = await sealBytes(params.mediaBytes);
  }

  const unlockAt = params.unlockAt ?? null;
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) {
    const localStar: StarRecord = {
      id,
      fromUser: params.from,
      from: params.from,
      kind: params.kind,
      x: +params.pos.x.toFixed(2),
      y: +params.pos.y.toFixed(2),
      size,
      once: Boolean(params.once),
      spent: false,
      hasMedia: Boolean(sealedMedia),
      createdAt: new Date().toISOString(),
      openedAt: null,
      unlockAt,
      unlockNotified: false,
      unlockPushSent: false,
    };
    putLocalSecret(id, sealedPayload);
    if (sealedMedia) putLocalMedia(id, sealedMedia);
    const list = store.get<StarRecord[]>(STORAGE_KEYS.starsLocal, []);
    list.push(localStar);
    store.set(STORAGE_KEYS.starsLocal, list);
    return localStar;
  }

  try {
    const { data: userRes } = await sb.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error('Oturum açık değil.');

    if (sealedMedia) {
      const blob = new Blob([sealedMedia], { type: 'text/plain;charset=utf-8' });
      const { error: uploadErr } = await sb.storage.from('media').upload(id, blob, {
        contentType: 'text/plain',
        upsert: false,
      });
      if (uploadErr) {
        throw new Error('Şifreli medya yüklenemedi.');
      }
    }

    const { data: inserted, error: insertErr } = await sb
      .from('stars')
      .insert({
        id,
        from_user: uid,
        kind: params.kind,
        x: +params.pos.x.toFixed(2),
        y: +params.pos.y.toFixed(2),
        size,
        once: Boolean(params.once),
        spent: false,
        has_media: Boolean(sealedMedia),
        unlock_at: unlockAt,
        unlock_notified: false,
        unlock_push_sent: false,
      })
      .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
      .single();

    if (insertErr || !inserted) {
      if (sealedMedia) {
        await sb.storage.from('media').remove([id]).catch(() => undefined);
      }
      throw new Error('Yıldız kaydedilemedi.');
    }

    const { error: secretErr } = await sb.from('star_secrets').insert({
      star_id: id,
      payload: sealedPayload,
      media_path: sealedMedia ? id : null,
      once: Boolean(params.once),
    });

    if (secretErr) {
      try {
        await sb.from('stars').delete().eq('id', id);
      } catch {
        // Ignore cleanup errors
      }
      if (sealedMedia) {
        await sb.storage.from('media').remove([id]).catch(() => undefined);
      }
      throw new Error('Şifreli yıldız içeriği kaydedilemedi.');
    }

    const whoMap = await getUserWhoMap();
    const star = mapDbRow(inserted as DbStarRow, whoMap, params.from);

    // Karşı tarafa hemen push bildirimi gönder (arka planda; içerik gitmez)
    void triggerPushNotification({
      sender: params.from,
      kind: params.kind,
      once: Boolean(params.once),
      unlockAt,
    });

    return star;
  } catch (err) {
    throw new Error(toFriendlyTurkishError(err, 'Yıldız şu an gönderilemedi, tekrar dene.'));
  }
}

async function fetchStarSecret(
  star: StarRecord,
  caller?: Who
): Promise<{ payload: string; mediaPath: string | null } | null> {
  if (!isSupabaseConfigured) {
    if (caller && star.from !== caller && isStarLocked(star)) {
      return null;
    }
    const payload = getLocalSecret(star.id) ?? star.payload ?? null;
    if (!payload) return null;
    return { payload, mediaPath: star.hasMedia ? star.id : null };
  }

  const sb = getSupabase()!;
  try {
    const { data, error } = await sb
      .from('star_secrets')
      .select('payload, media_path')
      .eq('star_id', star.id)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as { payload: string; media_path: string | null };
    return { payload: row.payload, mediaPath: row.media_path };
  } catch {
    return null;
  }
}

export async function decryptStarPayload(star: StarRecord, caller?: Who): Promise<StarPayloadData> {
  const secret = await fetchStarSecret(star, caller);
  if (!secret) {
    throw new Error('LOCKED');
  }
  return openJSON<StarPayloadData>(secret.payload);
}

export async function downloadAndDecryptMedia(
  star: StarRecord,
  caller?: Who
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!star.hasMedia || star.spent) return null;

  if (!isSupabaseConfigured) {
    if (caller && star.from !== caller && isStarLocked(star)) {
      return null;
    }
    const local = getLocalMedia(star.id);
    if (!local) return null;
    return openBytes(local);
  }

  try {
    const secret = await fetchStarSecret(star, caller);
    const path = secret?.mediaPath;
    if (!path) return null;

    const sb = getSupabase()!;
    // Kısa ömürlü imzalı URL (60 sn) ile indir; Storage RLS de unlock_at'ı kontrol eder
    const { data: signed, error: signErr } = await sb.storage
      .from('media')
      .createSignedUrl(path, 60);

    if (signErr || !signed?.signedUrl) return null;

    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;
    const sealedText = await res.text();
    return openBytes(sealedText);
  } catch {
    return null;
  }
}

export async function markStarOpened(star: StarRecord): Promise<string> {
  const openedAt = star.openedAt ?? new Date(getServerNowMs()).toISOString();
  if (!isSupabaseConfigured) {
    const list = store.get<StarRecord[]>(STORAGE_KEYS.starsLocal, []);
    const idx = list.findIndex((s) => s.id === star.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], openedAt };
      store.set(STORAGE_KEYS.starsLocal, list);
    }
    return openedAt;
  }

  try {
    const sb = getSupabase()!;
    await sb.from('stars').update({ opened_at: openedAt }).eq('id', star.id);
  } catch {
    // Ağ kesintisinde açma deneyimini kilitleme
  }
  return openedAt;
}

export async function markStarUnlockNotified(star: StarRecord): Promise<void> {
  if (star.unlockNotified) return;
  star.unlockNotified = true;
  if (!isSupabaseConfigured) {
    const list = store.get<StarRecord[]>(STORAGE_KEYS.starsLocal, []);
    const idx = list.findIndex((s) => s.id === star.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], unlockNotified: true };
      store.set(STORAGE_KEYS.starsLocal, list);
    }
    return;
  }

  try {
    const sb = getSupabase()!;
    await sb.from('stars').update({ unlock_notified: true }).eq('id', star.id);
  } catch {
    // Sessizce yok say
  }
}

export async function destroySpentOneTimeMedia(star: StarRecord): Promise<void> {
  dropLocalMedia(star.id);

  if (!isSupabaseConfigured) {
    const list = store.get<StarRecord[]>(STORAGE_KEYS.starsLocal, []);
    const idx = list.findIndex((s) => s.id === star.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], spent: true };
      store.set(STORAGE_KEYS.starsLocal, list);
    }
    return;
  }

  try {
    const sb = getSupabase()!;
    await sb.storage.from('media').remove([star.id]);
    await sb.from('stars').update({ spent: true }).eq('id', star.id);
  } catch {
    // Ağ hatasında yakalanmamış ret üretme
  }
}

export function saveLocalStarsSnapshot(stars: StarRecord[]): void {
  if (!isSupabaseConfigured) {
    const sanitized = stars.map((s) => {
      if (!s.payload) return s;
      const copy = { ...s };
      delete copy.payload;
      return copy;
    });
    store.set(STORAGE_KEYS.starsLocal, sanitized);
  }
}

export function clearAllLocalStars(stars: StarRecord[]): void {
  stars.forEach((s) => {
    dropLocalMedia(s.id);
    dropLocalSecret(s.id);
  });
  store.set(STORAGE_KEYS.starsLocal, []);
}

export function subscribeStarsRealtime(
  me: Who,
  handlers: {
    onInsert: (star: StarRecord) => void;
    onUpdate: (star: StarRecord) => void;
  }
): () => void {
  if (!isSupabaseConfigured) {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.starsLocal || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as StarRecord[];
        const latest = next[next.length - 1];
        if (latest && latest.from !== me) {
          handlers.onInsert(latest);
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  const sb = getSupabase()!;
  let channel: RealtimeChannel | null = null;

  void getUserWhoMap().then((whoMap) => {
    channel = sb
      .channel('bizim-gokyuzumuz-stars')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stars' },
        (payload) => {
          const row = payload.new as DbStarRow;
          const star = mapDbRow(row, whoMap, me);
          handlers.onInsert(star);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stars' },
        (payload) => {
          const row = payload.new as DbStarRow;
          const star = mapDbRow(row, whoMap, me);
          handlers.onUpdate(star);
        }
      )
      .subscribe();
  });

  return () => {
    if (channel) {
      void sb.removeChannel(channel);
    }
  };
}
