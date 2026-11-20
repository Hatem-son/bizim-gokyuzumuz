// Giriş denemelerinde artan bekleme (1, 2, 4, 8 sn) ve 5 hatada 5 dk kilit. Yalnızca cihaz tarafı ek önlem;
// asıl sınır Supabase Auth rate limit'idir (istemci temizlenerek aşılabilir).
const KEY = 'gokyuzu.thr.v1';
const LOCK_MS = 5 * 60_000;
const MAX_FAILS = 5;

type Rec = { n: number; until: number };

function load(): Record<string, Rec> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Rec>) : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, Rec>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Ignore storage errors
  }
}

/** Kalan bekleme (ms); 0 = serbest. */
export function lockedFor(name: string): number {
  const r = load()[name];
  return r ? Math.max(0, r.until - Date.now()) : 0;
}

/** Hatalı denemeyi kaydeder; uygulanan bekleme süresini (ms) döner. */
export function recordFail(name: string): number {
  const all = load();
  const r = all[name] ?? { n: 0, until: 0 };
  r.n += 1;
  let wait: number;
  if (r.n >= MAX_FAILS) {
    wait = LOCK_MS;
    r.n = 0;
  } else {
    wait = 1000 * 2 ** (r.n - 1);
  }
  r.until = Date.now() + wait;
  all[name] = r;
  save(all);
  return wait;
}

export function recordOk(name: string): void {
  const all = load();
  if (all[name]) {
    delete all[name];
    save(all);
  }
}

export function waitMessage(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 90) return `Çok fazla hatalı deneme. ${Math.ceil(s / 60)} dakika sonra tekrar dene.`;
  return `Biraz bekle: ${s} sn sonra tekrar dene.`;
}

