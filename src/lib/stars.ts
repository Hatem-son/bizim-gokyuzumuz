import type { RealtimeChannel } from '@supabase/supabase-js';
import type { StarKind, StarRecord, Who } from '../types';
import { openBytes, openJSON, sealBytes, sealJSON } from './crypto';
import { triggerPushNotification } from './push';
import { STORAGE_KEYS, store } from './storage';
import { getSupabase, isSupabaseConfigured, toFriendlyTurkishError } from './supabase';

export interface StarPayloadData {
  text: string;
  caption?: string;
  held?: number;
  mime?: string;
  dur?: number;
  peaks?: number[];
  subkind?: StarKind;
  collab?: boolean;
  inlineMedia?: string;
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
const STARS_CACHE_PREFIX = 'gokyuzu.starsCache.v1.';
const localMediaMem: Record<string, string> = {};
const localSecretMem: Record<string, string> = {};

let serverClockOffsetMs = 0;
let lastFetchFailed = false;
let lastSeenStarIso = '';

export function noteSeenStarIso(iso: string | null | undefined): void {
  if (iso && iso > lastSeenStarIso) lastSeenStarIso = iso;
}

export class OfflineNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineNetworkError';
  }
}

export function isOfflineLikeError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof OfflineNetworkError) return true;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('bağlantı') ||
    lower.includes('internet')
  );
}

export function lastStarsFetchError(): boolean {
  return lastFetchFailed;
}

export function clearStarsMetadataCache(): void {
  store.del(`${STARS_CACHE_PREFIX}hamham`);
  store.del(`${STARS_CACHE_PREFIX}beto`);
}

export interface PreparedStarEnvelope {
  id: string;
  from: Who;
  kind: StarKind;
  x: number;
  y: number;
  size: number;
  once: boolean;
  hasMedia: boolean;
  unlockAt: string | null;
  sealedPayload: string;
  sealedMedia: string | null;
  queuedAt: number;
}

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

/** Çizim oturumu kimliğinden (sid) her iki cihazda birebir aynı deterministik UUID üretir (çift yıldız oluşmasını önler). */
export function sessionToStarUuid(sid?: string): string {
  if (sid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid.trim())) {
    return sid.trim().toLowerCase();
  }
  if (!sid || !sid.trim()) {
    return generateId();
  }
  const str = sid.trim();
  const h = [0x811c9dc5, 0xcbf29ce4, 0x1b873593, 0xcc9e2d51];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    for (let j = 0; j < 4; j++) {
      h[j] = Math.imul(h[j] ^ (c + j * 31), 0x01000193) >>> 0;
    }
  }
  const hex = h.map((n) => n.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      lastFetchFailed = true;
      return store.get<StarRecord[]>(`${STARS_CACHE_PREFIX}${me}`, []);
    }
    await syncServerClock();
    const sb = getSupabase()!;
    const whoMap = await getUserWhoMap();
    const { data, error } = await sb
      .from('stars')
      .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
      .order('created_at', { ascending: true });

    if (error || !data) {
      lastFetchFailed = true;
      return store.get<StarRecord[]>(`${STARS_CACHE_PREFIX}${me}`, []);
    }
    lastFetchFailed = false;
    const mapped = (data as DbStarRow[]).map((row) => {
      noteSeenStarIso(row.created_at);
      return mapDbRow(row, whoMap, me);
    });
    store.set(`${STARS_CACHE_PREFIX}${me}`, mapped);
    return mapped;
  } catch {
    lastFetchFailed = true;
    return store.get<StarRecord[]>(`${STARS_CACHE_PREFIX}${me}`, []);
  }
}

export async function prepareEncryptedStar(params: {
  id?: string;
  from: Who;
  kind: StarKind;
  data: StarPayloadData;
  pos: { x: number; y: number };
  mediaBytes?: Uint8Array<ArrayBuffer>;
  once?: boolean;
  unlockAt?: string | null;
}): Promise<PreparedStarEnvelope> {
  const id = params.id ? sessionToStarUuid(params.id) : generateId();
  const textLen = (params.data.text || '').length;
  const size =
    params.kind === 'miss'
      ? +Math.min(10.5, 6.5 + (Math.min(3, params.data.held || 0) / 3) * 4).toFixed(1)
      : params.kind === 'note'
        ? +Math.min(10.5, 7.5 + textLen / 120).toFixed(1)
        : 9;

  const sealedMedia = params.mediaBytes ? await sealBytes(params.mediaBytes) : null;
  const payloadWithInline: StarPayloadData = {
    ...params.data,
    subkind: params.kind,
    ...(sealedMedia && sealedMedia.length <= 1_400_000 ? { inlineMedia: sealedMedia } : {}),
  };
  const sealedPayload = await sealJSON(payloadWithInline);

  return {
    id,
    from: params.from,
    kind: params.kind,
    x: +params.pos.x.toFixed(3),
    y: +params.pos.y.toFixed(3),
    size,
    once: Boolean(params.once),
    hasMedia: Boolean(sealedMedia),
    unlockAt: params.unlockAt ?? null,
    sealedPayload,
    sealedMedia,
    queuedAt: Date.now(),
  };
}

export async function uploadPreparedStar(env: PreparedStarEnvelope): Promise<StarRecord> {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) {
    const localStar: StarRecord = {
      id: env.id,
      fromUser: env.from,
      from: env.from,
      kind: env.kind,
      x: env.x,
      y: env.y,
      size: env.size,
      once: env.once,
      spent: false,
      hasMedia: env.hasMedia,
      createdAt: new Date().toISOString(),
      openedAt: null,
      unlockAt: env.unlockAt,
      unlockNotified: false,
      unlockPushSent: false,
    };
    putLocalSecret(env.id, env.sealedPayload);
    if (env.sealedMedia) putLocalMedia(env.id, env.sealedMedia);
    const list = store.get<StarRecord[]>(STORAGE_KEYS.starsLocal, []);
    const existingLocal = list.find((s) => s.id === env.id);
    if (existingLocal) return existingLocal;
    list.push(localStar);
    store.set(STORAGE_KEYS.starsLocal, list);
    return localStar;
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new OfflineNetworkError('İnternet bağlantısı yok.');
    }

    const { data: userRes, error: authErr } = await sb.auth.getUser();
    if (authErr && isOfflineLikeError(authErr)) {
      throw new OfflineNetworkError('İnternet bağlantısı kurulamadı.');
    }
    const uid = userRes.user?.id;
    if (!uid) throw new Error('Oturum açık değil.');

    const buildStarInsert = (k: StarKind) => ({
      id: env.id,
      from_user: uid,
      kind: k,
      x: env.x,
      y: env.y,
      size: env.size,
      once: env.once,
      spent: false,
      has_media: env.hasMedia,
      unlock_at: env.unlockAt,
      unlock_notified: false,
      unlock_push_sent: false,
    });

    const isDuplicateErr = (err: { code?: string; message?: string } | null) =>
      Boolean(err && (err.code === '23505' || /duplicate key|unique constraint/i.test(err.message || '')));

    let { data: inserted, error: insertErr } = await sb
      .from('stars')
      .insert(buildStarInsert(env.kind))
      .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
      .single();

    // İki taraf beraber çizimde aynı anda "Bitti"ye bastıysa (aynı oturum UUID'si): ilk yazan kazanır, çift yıldız oluşmaz
    if (isDuplicateErr(insertErr)) {
      const { data: existingRow } = await sb
        .from('stars')
        .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
        .eq('id', env.id)
        .maybeSingle();
      if (existingRow) {
        const whoMap = await getUserWhoMap();
        return mapDbRow(existingRow as DbStarRow, whoMap, env.from);
      }
    }

    // 06-draw-kind.sql henüz çalıştırılmadıysa stars_kind_check 'draw'/'text' değerini reddedebilir → 'note' ile kaydet (şifreli payload içinde subkind:'draw' korunur)
    if ((insertErr || !inserted) && !isDuplicateErr(insertErr) && (env.kind === 'draw' || env.kind === 'text') && !isOfflineLikeError(insertErr)) {
      const retry = await sb
        .from('stars')
        .insert(buildStarInsert('note'))
        .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
        .single();
      inserted = retry.data;
      insertErr = retry.error;
      if (isDuplicateErr(insertErr)) {
        const { data: existingRow } = await sb
          .from('stars')
          .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
          .eq('id', env.id)
          .maybeSingle();
        if (existingRow) {
          const whoMap = await getUserWhoMap();
          return mapDbRow(existingRow as DbStarRow, whoMap, env.from);
        }
      }
    }

    if (insertErr || !inserted) {
      if (isOfflineLikeError(insertErr)) {
        throw new OfflineNetworkError('Bağlantı nedeniyle yıldız gönderilemedi.');
      }
      throw new Error('Yıldız kaydedilemedi.');
    }

    // Yıldız satırı artık public.stars'da var → Storage RLS (s.id::text = storage.objects.name veya userid/<id>.bin) sorunsuz geçer
    let storagePath: string | null = null;
    if (env.sealedMedia) {
      const blob = new Blob([env.sealedMedia], { type: 'application/octet-stream' });
      const primaryPath = env.id;
      const { error: uploadErr } = await sb.storage.from('media').upload(primaryPath, blob, {
        contentType: 'application/octet-stream',
        upsert: false,
      });
      if (!uploadErr || /already exists|duplicate/i.test(uploadErr.message || '')) {
        storagePath = primaryPath;
      } else {
        const altPath = `${uid}/${env.id}.bin`;
        const { error: altErr } = await sb.storage.from('media').upload(altPath, blob, {
          contentType: 'application/octet-stream',
          upsert: false,
        });
        if (!altErr || /already exists|duplicate/i.test(altErr.message || '')) {
          storagePath = altPath;
        } else if (isOfflineLikeError(uploadErr) || isOfflineLikeError(altErr)) {
          try {
            await sb.from('stars').delete().eq('id', env.id);
          } catch {
            // Ignore cleanup errors
          }
          throw new OfflineNetworkError('Şifreli medya çevrimdışı nedeniyle gönderilemedi.');
        } else if (env.sealedMedia.length > 1_400_000) {
          try {
            await sb.from('stars').delete().eq('id', env.id);
          } catch {
            // Ignore cleanup errors
          }
          throw new Error('Şifreli medya yüklenemedi.');
        }
      }
    }

    const { error: secretErr } = await sb.from('star_secrets').insert({
      star_id: env.id,
      payload: env.sealedPayload,
      media_path: storagePath,
      once: env.once,
    });

    if (secretErr) {
      try {
        await sb.from('stars').delete().eq('id', env.id);
      } catch {
        // Ignore cleanup errors
      }
      if (storagePath) {
        await sb.storage.from('media').remove([storagePath]).catch(() => undefined);
      }
      if (isOfflineLikeError(secretErr)) {
        throw new OfflineNetworkError('Bağlantı nedeniyle yıldız içeriği gönderilemedi.');
      }
      throw new Error('Şifreli yıldız içeriği kaydedilemedi.');
    }

    const whoMap = await getUserWhoMap();
    const star = mapDbRow(inserted as DbStarRow, whoMap, env.from);
    if (env.kind === 'draw') star.kind = 'draw';

    void triggerPushNotification({
      sender: env.from,
      kind: env.kind,
      once: env.once,
      unlockAt: env.unlockAt,
    });

    return star;
  } catch (err) {
    if (err instanceof OfflineNetworkError || isOfflineLikeError(err)) {
      throw new OfflineNetworkError(
        toFriendlyTurkishError(err, 'Bağlantı kurulamadı. İnternet gelince gönderilecek.')
      );
    }
    throw new Error(toFriendlyTurkishError(err, 'Yıldız şu an gönderilemedi, tekrar dene.'));
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
  const env = await prepareEncryptedStar(params);
  return uploadPreparedStar(env);
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

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('NETWORK');
  }

  const sb = getSupabase()!;
  try {
    const { data, error } = await sb
      .from('star_secrets')
      .select('payload, media_path')
      .eq('star_id', star.id)
      .maybeSingle();

    if (error) {
      if (isOfflineLikeError(error)) throw new Error('NETWORK');
      return null;
    }
    if (!data) return null;
    const row = data as { payload: string; media_path: string | null };
    return { payload: row.payload, mediaPath: row.media_path };
  } catch (err) {
    if (err instanceof Error && err.message === 'NETWORK') throw err;
    if (isOfflineLikeError(err)) throw new Error('NETWORK');
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
    if (!secret) return null;

    // 1) Şifreli payload içinde inlineMedia varsa doğrudan oradan çöz (Storage ağ turuna gerek kalmaz)
    try {
      const pl = await openJSON<StarPayloadData>(secret.payload);
      if (pl?.inlineMedia) {
        return await openBytes(pl.inlineMedia);
      }
    } catch {
      // Yedek olarak Storage yoluna devam et
    }

    const path = secret.mediaPath;
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
  const partner: Who = me === 'hamham' ? 'beto' : 'hamham';

  if (!isSupabaseConfigured) {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.starsLocal || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as StarRecord[];
        const latest = next[next.length - 1];
        if (latest && latest.from !== me) {
          noteSeenStarIso(latest.createdAt);
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
  let cancelled = false;
  let reconnectTimer = 0;
  let hasSubscribedOnce = false;
  let whoMap = new Map<string, Who>();
  let myUserId = '';

  void sb.auth.getSession().then(({ data }) => {
    if (data.session?.user?.id) myUserId = data.session.user.id;
  });
  void getUserWhoMap().then((m) => {
    whoMap = m;
  });

  const resolveRow = (row: DbStarRow): StarRecord => {
    noteSeenStarIso(row.created_at);
    if (whoMap.has(row.from_user)) return mapDbRow(row, whoMap, me);
    const inferred: Who = myUserId ? (row.from_user === myUserId ? me : partner) : me;
    return {
      ...mapDbRow(row, whoMap, inferred),
      from: inferred,
    };
  };

  const catchUpMissed = async () => {
    if (cancelled || document.hidden || !lastSeenStarIso) return;
    try {
      const { data, error } = await sb
        .from('stars')
        .select('id, from_user, kind, x, y, size, once, spent, has_media, created_at, opened_at, unlock_at, unlock_notified, unlock_push_sent')
        .gt('created_at', lastSeenStarIso)
        .order('created_at', { ascending: true });
      if (!error && data) {
        for (const row of data as DbStarRow[]) {
          handlers.onInsert(resolveRow(row));
        }
      }
    } catch {
      // Ağ kesintisinde sessizce geç
    }
  };

  const cleanupChannel = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    if (channel) {
      const ch = channel;
      channel = null;
      void sb.removeChannel(ch);
    }
  };

  const connect = () => {
    if (cancelled || document.hidden) return;
    cleanupChannel();
    const ch = sb
      .channel('bizim-gokyuzumuz-stars')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stars' },
        (payload) => {
          const row = payload.new as DbStarRow;
          handlers.onInsert(resolveRow(row));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stars' },
        (payload) => {
          const row = payload.new as DbStarRow;
          handlers.onUpdate(resolveRow(row));
        }
      )
      .subscribe((status) => {
        if (cancelled || ch !== channel) return;
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedOnce) void catchUpMissed();
          hasSubscribedOnce = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!document.hidden && !cancelled) {
            clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => connect(), 1500);
          }
        }
      });
    channel = ch;
  };

  const onVis = () => {
    if (cancelled) return;
    if (document.hidden) {
      cleanupChannel();
    } else {
      connect();
      void catchUpMissed();
    }
  };

  document.addEventListener('visibilitychange', onVis);
  if (!document.hidden) connect();

  return () => {
    cancelled = true;
    document.removeEventListener('visibilitychange', onVis);
    cleanupChannel();
  };
}
