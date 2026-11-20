import { getSupabase } from './supabase';
import { openJSON, sealJSON } from './crypto';
import { store } from './storage';
import { state, toDbWho } from '../ui/state';
import type { Who } from '../types';

export type DiaryMood = 'sun' | 'coffee' | 'moon' | 'rain' | 'heart' | 'spark';
export type BottleStyle = 'emerald' | 'crystal' | 'shell';
export type PaperStyle = 'straw' | 'sea' | 'night';
export type MoodTone = 'love' | 'good' | 'sad' | 'storm' | 'night';

export type MemoryMoodId =
  | 'love'
  | 'miss'
  | 'romantic'
  | 'butterflies'
  | 'grateful'
  | 'clingy'
  | 'happy'
  | 'joyful'
  | 'peace'
  | 'calm'
  | 'hopeful'
  | 'proud'
  | 'sad'
  | 'bad'
  | 'broken'
  | 'crying'
  | 'lonely'
  | 'hopeless'
  | 'regret'
  | 'angry'
  | 'annoyed'
  | 'resentful'
  | 'anxious'
  | 'overthinking'
  | 'jealous'
  | 'exhausted'
  | 'burnout'
  | 'sick'
  | 'bored'
  | 'emotional'
  | 'night'
  | 'nostalgic'
  | 'numb';

export interface MemoryMoodDef {
  id: MemoryMoodId;
  cat: MoodTone;
  icon: string;
  label: string;
  desc: string;
  dbMood: DiaryMood;
}

export const MOOD_CATEGORIES: { id: 'all' | MoodTone; icon: string; label: string; title: string }[] = [
  { id: 'all', icon: '✦', label: 'Tümü', title: 'Tüm Ruh Halleri' },
  { id: 'love', icon: '💖', label: 'Aşk & Özlem', title: '💖 Aşk & Özlem' },
  { id: 'good', icon: '✨', label: 'İyi & Aydınlık', title: '✨ İyi & Aydınlık' },
  { id: 'sad', icon: '🌧️', label: 'Kötü & Üzgün', title: '🌧️ Kötü, Üzgün & Kırgın' },
  { id: 'storm', icon: '⚡', label: 'Gergin & Kaygılı', title: '⚡ Gergin, Kızgın & Kaygılı' },
  { id: 'night', icon: '🌙', label: 'Yorgun & Gece', title: '🌙 Yorgun, Dalgın & Gece' },
];

export const MEMORY_MOODS: MemoryMoodDef[] = [
  // Aşk & Özlem
  { id: 'love', cat: 'love', icon: '🥰', label: 'Aşık', desc: 'Kalbim seninle dolup taşıyor', dbMood: 'heart' },
  { id: 'miss', cat: 'love', icon: '🥹', label: 'Özlem dolu', desc: 'Yanımda olmanı çok istiyorum', dbMood: 'moon' },
  { id: 'romantic', cat: 'love', icon: '🌹', label: 'Romantik', desc: 'İçimde tatlı ve sıcak bir his var', dbMood: 'heart' },
  { id: 'butterflies', cat: 'love', icon: '🦋', label: 'Heyecanlı', desc: 'Kalbim pır pır, içim kıpır kıpır', dbMood: 'spark' },
  { id: 'grateful', cat: 'love', icon: '🤍', label: 'Şükür dolu', desc: 'İyi ki hayatımdasın dediğim bir an', dbMood: 'heart' },
  { id: 'clingy', cat: 'love', icon: '🫂', label: 'Sarılmaya muhtaç', desc: 'Sadece kollarında dinlenmek istiyorum', dbMood: 'heart' },

  // İyi & Aydınlık
  { id: 'happy', cat: 'good', icon: '✨', label: 'Mutlu', desc: 'Keyfim yerinde, yüzüm gülüyor', dbMood: 'sun' },
  { id: 'joyful', cat: 'good', icon: '🌸', label: 'Neşeli & Enerjik', desc: 'Hayat dolu ve çok canlı hissediyorum', dbMood: 'sun' },
  { id: 'peace', cat: 'good', icon: '🕊️', label: 'Huzurlu', desc: 'İçim dingin, her şey yerli yerinde', dbMood: 'heart' },
  { id: 'calm', cat: 'good', icon: '☕', label: 'Sakin & Dingin', desc: 'Telaşsız, kendi halimde ve rahatım', dbMood: 'coffee' },
  { id: 'hopeful', cat: 'good', icon: '🌈', label: 'Umutlu', desc: 'Yarınlara dair içimde güzel bir ışık var', dbMood: 'spark' },
  { id: 'proud', cat: 'good', icon: '🌟', label: 'Güçlü & Motive', desc: 'Kendimle gurur duyuyorum, kararlıyım', dbMood: 'sun' },

  // Kötü, Üzgün & Kırgın
  { id: 'bad', cat: 'sad', icon: '🖤', label: 'Kötü hissediyorum', desc: 'Üstümde tarif edilmez bir ağırlık var', dbMood: 'rain' },
  { id: 'sad', cat: 'sad', icon: '😔', label: 'Üzgün & Moral bozuk', desc: 'İçimde sebepli sebepsiz bir hüzün var', dbMood: 'rain' },
  { id: 'broken', cat: 'sad', icon: '💔', label: 'Kırgın & İncinmiş', desc: 'Kalbim biraz burkuldu, çok hassasım', dbMood: 'rain' },
  { id: 'crying', cat: 'sad', icon: '😢', label: 'Ağlamaklı / Ağladım', desc: 'Gözyaşlarımı tutmakta zorlandığım bir an', dbMood: 'rain' },
  { id: 'lonely', cat: 'sad', icon: '🥀', label: 'Yalnız & Kimsesiz', desc: 'Kalabalık içinde bile yapayalnız gibiyim', dbMood: 'moon' },
  { id: 'hopeless', cat: 'sad', icon: '🌑', label: 'Karamsar & Çaresiz', desc: 'Hiçbir şey yoluna girmeyecekmiş gibi', dbMood: 'rain' },
  { id: 'regret', cat: 'sad', icon: '😞', label: 'Pişman & Buruk', desc: 'Keşke farklı olsaydı dediğim bir sızı', dbMood: 'rain' },

  // Gergin, Kızgın & Kaygılı
  { id: 'angry', cat: 'storm', icon: '😠', label: 'Sinirli & Öfkeli', desc: 'Çok doluyum, sabrım taşmak üzere', dbMood: 'rain' },
  { id: 'annoyed', cat: 'storm', icon: '😒', label: 'Huysuz & Tahammülsüz', desc: 'En ufak şey bile batıyor, gerginim', dbMood: 'rain' },
  { id: 'resentful', cat: 'storm', icon: '😤', label: 'Dargın & Sitemkar', desc: 'İçime attığım şeyler boğazımda düğüm', dbMood: 'rain' },
  { id: 'anxious', cat: 'storm', icon: '😰', label: 'Kaygılı & Stresli', desc: 'İçim daralıyor, kötü bir şey olacakmış gibi', dbMood: 'rain' },
  { id: 'overthinking', cat: 'storm', icon: '🌀', label: 'Kafası çok dolu', desc: 'Düşünceler susmuyor, zihnim çok yoruldu', dbMood: 'moon' },
  { id: 'jealous', cat: 'storm', icon: '😾', label: 'Kıskanç & Huzursuz', desc: 'İçimi kemiren o tanıdık huzursuzluk', dbMood: 'moon' },

  // Yorgun, Dalgın & Gece
  { id: 'exhausted', cat: 'night', icon: '😩', label: 'Çok yorgun & Tükenmiş', desc: 'Hem ruhum hem bedenim dinlenmek istiyor', dbMood: 'coffee' },
  { id: 'burnout', cat: 'night', icon: '🪫', label: 'Bıkkın & İsteksiz', desc: 'Elimi hiçbir şeye sürmek istemiyorum', dbMood: 'rain' },
  { id: 'sick', cat: 'night', icon: '🤒', label: 'Hasta & Halsiz', desc: 'Vücudum kırgın, şefkate ihtiyacım var', dbMood: 'rain' },
  { id: 'bored', cat: 'night', icon: '🥱', label: 'Sıkılmış & Boş', desc: 'Zaman akmıyor, her şey çok tekdüze', dbMood: 'coffee' },
  { id: 'emotional', cat: 'night', icon: '🥺', label: 'Duygusal & Alıngan', desc: 'Dokunsalar ağlayacak kadar narinim', dbMood: 'rain' },
  { id: 'night', cat: 'night', icon: '🌙', label: 'Gece sessizliği', desc: 'Gece çöktü, iç sesimle baş başayım', dbMood: 'moon' },
  { id: 'nostalgic', cat: 'night', icon: '🎞️', label: 'Geçmişe dalmış', desc: 'Eski anılar gözümün önünden geçiyor', dbMood: 'moon' },
  { id: 'numb', cat: 'night', icon: '🌫️', label: 'Hissiz & Donuk', desc: 'Ne mutlu ne üzgün, sadece boşluktayım', dbMood: 'moon' },
];

export const MOOD_BY_ID = new Map<string, MemoryMoodDef>(MEMORY_MOODS.map((m) => [m.id, m]));

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
  moods?: MemoryMoodId[];
  bottleStyle?: BottleStyle;
  paperStyle?: PaperStyle;
  photoB64?: string;
  photoMime?: string;
  voiceB64?: string;
  voiceMime?: string;
  voiceDur?: number;
  voicePeaks?: number[];
  entryDate: string;
}

const STYLE_PREF_KEY = 'gokyuzu.diary.stylePref.v1';

export function getSavedAtelierStyle(): { bottle: BottleStyle; paper: PaperStyle } {
  return store.get<{ bottle: BottleStyle; paper: PaperStyle }>(STYLE_PREF_KEY, {
    bottle: 'emerald',
    paper: 'sea',
  });
}

export function saveAtelierStyle(bottle: BottleStyle, paper: PaperStyle): void {
  store.set(STYLE_PREF_KEY, { bottle, paper });
}

export type DiaryPeekPacket = { t: 'diary_noop' };

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
