import { getSupabase } from './supabase';
import { hasActiveKey, openJSON, sealJSON } from './crypto';
import { store } from './storage';
import { state, toDbWho } from '../ui/state';
import type { Who } from '../types';

export type DiaryMood = 'sun' | 'coffee' | 'moon' | 'rain' | 'heart' | 'spark';
export type DiaryStickerId = 'plead' | 'kiss' | 'shy' | 'sparkle' | 'hug';

export const BOTTLE_PER_PERSON = 10;
export const BOTTLE_TOTAL = 20;

export interface DiaryEntryMeta {
  id: string;
  from: Who;
  entryDate: string;
  mood: DiaryMood;
  createdAt: string;
  mine: boolean;
}

export interface DiaryEntryContent {
  title: string;
  text: string;
  mood: DiaryMood;
  entryDate: string;
}

export type DiaryPeekReq = {
  t: 'dpeek_req';
  reqId: string;
  diaryId: string;
  entryDate: string;
  message: string;
  emojis: string[];
  sticker: DiaryStickerId;
  at: number;
};

export type DiaryPeekRes = {
  t: 'dpeek_res';
  reqId: string;
  diaryId: string;
  approved: boolean;
  replyText?: string;
  content?: DiaryEntryContent;
  at: number;
};

export type DiaryPeekPacket = DiaryPeekReq | DiaryPeekRes;

export type PeekStatus = 'none' | 'sent' | 'approved' | 'denied';

type PeekSentRecord = {
  req: DiaryPeekReq;
  status: 'sent' | 'approved' | 'denied';
};

type LocalDiaryRecord = DiaryEntryMeta & {
  payload: string;
};

const LOCAL_DIARY_KEY = 'gokyuzu.diary.jar.v1';
const PEEK_SENT_KEY = 'gokyuzu.diary.peekState.v2';
const PEEK_GRANTED_KEY = 'gokyuzu.diary.peekGranted.v2';
const PEEK_ANSWERED_KEY = 'gokyuzu.diary.peekAnswered.v2';

const decryptedCache = new Map<string, DiaryEntryContent>();
export const pendingPeekRequests: DiaryPeekReq[] = [];
export const grantedPeekEntries = new Map<string, DiaryEntryContent>();

function readSentMap(): Record<string, PeekSentRecord> {
  return store.get<Record<string, PeekSentRecord>>(PEEK_SENT_KEY, {});
}

function writeSentMap(map: Record<string, PeekSentRecord>): void {
  store.set(PEEK_SENT_KEY, map);
}

function readAnsweredIds(): string[] {
  return store.get<string[]>(PEEK_ANSWERED_KEY, []);
}

function markAnsweredId(diaryId: string): void {
  const cur = readAnsweredIds();
  if (!cur.includes(diaryId)) {
    store.set(PEEK_ANSWERED_KEY, [diaryId, ...cur].slice(0, 200));
  }
}

export function getPeekStatus(diaryId: string): PeekStatus {
  if (grantedPeekEntries.has(diaryId)) return 'approved';
  const rec = readSentMap()[diaryId];
  return rec ? rec.status : 'none';
}

export function canSendPeekRequest(diaryId: string): boolean {
  return getPeekStatus(diaryId) === 'none';
}

export function markPeekRequestSent(req: DiaryPeekReq): void {
  const map = readSentMap();
  map[req.diaryId] = { req, status: 'sent' };
  writeSentMap(map);
}

export async function loadPersistedGrantedPeeks(): Promise<void> {
  if (!hasActiveKey()) return;
  const raw = store.get<Record<string, string>>(PEEK_GRANTED_KEY, {});
  for (const [diaryId, sealed] of Object.entries(raw)) {
    if (grantedPeekEntries.has(diaryId)) continue;
    try {
      const content = await openJSON<DiaryEntryContent>(sealed);
      grantedPeekEntries.set(diaryId, content);
    } catch {
      // ignore corrupted entry
    }
  }
}

async function persistGrantedPeek(diaryId: string, content: DiaryEntryContent): Promise<void> {
  grantedPeekEntries.set(diaryId, content);
  if (!hasActiveKey()) return;
  try {
    const raw = store.get<Record<string, string>>(PEEK_GRANTED_KEY, {});
    raw[diaryId] = await sealJSON(content);
    store.set(PEEK_GRANTED_KEY, raw);
  } catch {
    // ignore storage quota errors
  }
}

export function resendPendingPeekRequests(send: (pkt: DiaryPeekPacket) => void): void {
  const map = readSentMap();
  for (const rec of Object.values(map)) {
    if (rec.status === 'sent') {
      send(rec.req);
    }
  }
}

export function recordIncomingDiaryPacket(pkt: DiaryPeekPacket): boolean {
  if (pkt.t === 'dpeek_req') {
    // Daha önce cevaplanmış bir mektup için tekrar istek gösterilmez (1 kez kuralı)
    if (readAnsweredIds().includes(pkt.diaryId)) return false;
    if (pendingPeekRequests.some((r) => r.diaryId === pkt.diaryId || r.reqId === pkt.reqId)) {
      return false;
    }
    pendingPeekRequests.unshift(pkt);
    return true;
  }
  if (pkt.t === 'dpeek_res') {
    const map = readSentMap();
    const prev = map[pkt.diaryId];
    if (prev) {
      prev.status = pkt.approved ? 'approved' : 'denied';
      writeSentMap(map);
    } else {
      map[pkt.diaryId] = {
        req: {
          t: 'dpeek_req',
          reqId: pkt.reqId,
          diaryId: pkt.diaryId,
          entryDate: pkt.content?.entryDate ?? '',
          message: '',
          emojis: [],
          sticker: 'plead',
          at: pkt.at,
        },
        status: pkt.approved ? 'approved' : 'denied',
      };
      writeSentMap(map);
    }
    if (pkt.approved && pkt.content) {
      void persistGrantedPeek(pkt.diaryId, pkt.content);
    }
    return true;
  }
  return false;
}

export async function respondToPeekRequest(
  req: DiaryPeekReq,
  approved: boolean,
  send: (pkt: DiaryPeekPacket) => void,
): Promise<boolean> {
  const removePending = () => {
    for (let i = pendingPeekRequests.length - 1; i >= 0; i--) {
      if (pendingPeekRequests[i].diaryId === req.diaryId || pendingPeekRequests[i].reqId === req.reqId) {
        pendingPeekRequests.splice(i, 1);
      }
    }
    markAnsweredId(req.diaryId);
  };

  if (!approved) {
    send({
      t: 'dpeek_res',
      reqId: req.reqId,
      diaryId: req.diaryId,
      approved: false,
      replyText: 'Bu mektup şimdilik şişede sır kaldı 🤫🤍',
      at: Date.now(),
    });
    removePending();
    return true;
  }

  const content = await openMyDiaryEntry(req.diaryId);
  if (!content) return false;
  send({
    t: 'dpeek_res',
    reqId: req.reqId,
    diaryId: req.diaryId,
    approved: true,
    content,
    at: Date.now(),
  });
  removePending();
  return true;
}

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; status?: number } | null;
  if (!e) return false;
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    e.status === 404 ||
    /diary_entries|diary_secrets|schema cache/i.test(e.message ?? '')
  );
}

function readLocalRecords(): LocalDiaryRecord[] {
  return store.get<LocalDiaryRecord[]>(LOCAL_DIARY_KEY, []);
}

function writeLocalRecords(rows: LocalDiaryRecord[]): void {
  store.set(LOCAL_DIARY_KEY, rows);
}

export async function fetchDiaryJar(): Promise<{ entries: DiaryEntryMeta[]; needsSql: boolean }> {
  await loadPersistedGrantedPeeks();
  const meDb = toDbWho(state.me);
  const sb = getSupabase();
  if (!sb) {
    const local = readLocalRecords().map(({ payload: _p, ...meta }) => ({
      ...meta,
      mine: meta.from === meDb,
    }));
    return { entries: local, needsSql: false };
  }

  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id ?? '';

  const { data, error } = await sb
    .from('diary_entries')
    .select('id, from_user, from_who, entry_date, mood, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTableError(error)) {
      const local = readLocalRecords().map(({ payload: _p, ...meta }) => ({
        ...meta,
        mine: meta.from === meDb,
      }));
      return { entries: local, needsSql: true };
    }
    throw error;
  }

  const entries: DiaryEntryMeta[] = (data ?? []).map((row) => ({
    id: String(row.id),
    from: (row.from_who === 'beto' ? 'beto' : 'hamham') as Who,
    entryDate: String(row.entry_date),
    mood: (row.mood ?? 'heart') as DiaryMood,
    createdAt: String(row.created_at),
    mine: row.from_user === uid || row.from_who === meDb,
  }));

  return { entries, needsSql: false };
}

export async function openMyDiaryEntry(id: string): Promise<DiaryEntryContent | null> {
  const cached = decryptedCache.get(id);
  if (cached) return cached;

  const local = readLocalRecords().find((r) => r.id === id);
  if (local) {
    const content = await openJSON<DiaryEntryContent>(local.payload);
    decryptedCache.set(id, content);
    return content;
  }

  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('diary_secrets')
    .select('payload')
    .eq('diary_id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.payload) return null;

  const content = await openJSON<DiaryEntryContent>(String(data.payload));
  decryptedCache.set(id, content);
  return content;
}

export async function saveDiaryEntry(
  input: DiaryEntryContent,
): Promise<{ entry: DiaryEntryMeta; needsSql: boolean }> {
  const meDb = toDbWho(state.me);
  const payload = await sealJSON(input);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const sb = getSupabase();
  if (!sb) {
    const rec: LocalDiaryRecord = {
      id,
      from: meDb,
      entryDate: input.entryDate,
      mood: input.mood,
      createdAt,
      mine: true,
      payload,
    };
    writeLocalRecords([rec, ...readLocalRecords()]);
    decryptedCache.set(id, input);
    const { payload: _p, ...entry } = rec;
    return { entry, needsSql: false };
  }

  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('Oturum bulunamadı');
  }
  const uid = userData.user.id;

  const { error: eErr } = await sb.from('diary_entries').insert({
    id,
    from_user: uid,
    from_who: meDb,
    entry_date: input.entryDate,
    mood: input.mood,
    created_at: createdAt,
  });

  if (eErr) {
    if (isMissingTableError(eErr)) {
      const rec: LocalDiaryRecord = {
        id,
        from: meDb,
        entryDate: input.entryDate,
        mood: input.mood,
        createdAt,
        mine: true,
        payload,
      };
      writeLocalRecords([rec, ...readLocalRecords()]);
      decryptedCache.set(id, input);
      const { payload: _p, ...entry } = rec;
      return { entry, needsSql: true };
    }
    throw eErr;
  }

  const { error: sErr } = await sb.from('diary_secrets').insert({
    diary_id: id,
    from_user: uid,
    payload,
    created_at: createdAt,
  });

  if (sErr) {
    try {
      await sb.from('diary_entries').delete().eq('id', id);
    } catch {
      // ignore rollback failure
    }
    throw sErr;
  }

  decryptedCache.set(id, input);
  return {
    entry: {
      id,
      from: meDb,
      entryDate: input.entryDate,
      mood: input.mood,
      createdAt,
      mine: true,
    },
    needsSql: false,
  };
}

export async function deleteMyDiaryEntry(id: string): Promise<void> {
  decryptedCache.delete(id);
  const local = readLocalRecords();
  if (local.some((r) => r.id === id)) {
    writeLocalRecords(local.filter((r) => r.id !== id));
  }
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('diary_entries').delete().eq('id', id);
  if (error && !isMissingTableError(error)) throw error;
}
