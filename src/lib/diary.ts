import { getSupabase } from './supabase';
import { openJSON, sealJSON } from './crypto';
import { store } from './storage';
import { state, toDbWho } from '../ui/state';
import type { Who } from '../types';

export type DiaryMood = 'sun' | 'coffee' | 'moon' | 'rain' | 'heart' | 'spark';
export type DiaryStickerId = 'plead' | 'kiss' | 'shy' | 'sparkle' | 'hug';

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

export const pendingPeekRequests: DiaryPeekReq[] = [];
export const grantedPeekEntries = new Map<string, DiaryEntryContent>();

export function recordIncomingDiaryPacket(pkt: DiaryPeekPacket): void {
  if (pkt.t === 'dpeek_req') {
    if (!pendingPeekRequests.some((r) => r.reqId === pkt.reqId)) {
      pendingPeekRequests.unshift(pkt);
    }
  } else if (pkt.t === 'dpeek_res' && pkt.approved && pkt.content) {
    grantedPeekEntries.set(pkt.diaryId, pkt.content);
  }
}

type LocalDiaryRecord = DiaryEntryMeta & {
  payload: string;
};

const LOCAL_DIARY_KEY = 'gokyuzu.diary.jar.v1';
const decryptedCache = new Map<string, DiaryEntryContent>();

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
