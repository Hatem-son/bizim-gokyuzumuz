const mem: Record<string, unknown> = {};

export const STORAGE_KEYS = {
  me: 'gokyuzu.me.v4',
  key: 'gokyuzu.key.v4',
  verifyLocal: 'gokyuzu.verify.v4',
  pin: 'gokyuzu.pin.v4',
  biometric: 'gokyuzu.bio.v4',
  seen: 'gokyuzu.seen.v4',
  pan: 'gokyuzu.pan.v4',
  hint: 'gokyuzu.hint.v4',
  greet: 'gokyuzu.greet.v4',
  plane: 'gokyuzu.plane.v4',
  hazel: 'gokyuzu.hazel.v4',
  draftPrefix: 'gokyuzu.draft.v4.',
  starsLocal: 'gokyuzu.stars.v4',
  pushPrompt: 'gokyuzu.pushPrompt.v4',
} as const;

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // Fallback to in-memory store if storage is restricted
    }
    return key in mem ? (mem[key] as T) : fallback;
  },

  set<T>(key: string, value: T): void {
    mem[key] = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota or private-mode errors
    }
  },

  del(key: string): void {
    delete mem[key];
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
};

