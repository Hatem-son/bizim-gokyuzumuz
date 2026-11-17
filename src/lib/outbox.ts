import type { Who } from '../types';
import type { PreparedStarEnvelope } from './stars';
import { store } from './storage';

const DB_NAME = 'gokyuzu-outbox-v1';
const DB_VERSION = 1;
const STORE_NAME = 'pending';
const FALLBACK_KEY = 'gokyuzu.outbox.fallback.v1';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openOutboxDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function readFallback(): PreparedStarEnvelope[] {
  return store.get<PreparedStarEnvelope[]>(FALLBACK_KEY, []);
}

function writeFallback(items: PreparedStarEnvelope[]): void {
  if (items.length === 0) store.del(FALLBACK_KEY);
  else store.set(FALLBACK_KEY, items);
}

/** Şifreli yıldız zarfını çevrimdışı giden kutusuna (IndexedDB, yalnızca ciphertext) kaydeder. */
export async function enqueueEncryptedStar(env: PreparedStarEnvelope): Promise<void> {
  const db = await openOutboxDb();
  if (!db) {
    const list = readFallback().filter((item) => item.id !== env.id);
    list.push(env);
    writeFallback(list);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(env);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      const list = readFallback().filter((item) => item.id !== env.id);
      list.push(env);
      writeFallback(list);
      resolve();
    }
  });
}

export async function listQueuedStars(from?: Who): Promise<PreparedStarEnvelope[]> {
  const db = await openOutboxDb();
  let items: PreparedStarEnvelope[];
  if (!db) {
    items = readFallback();
  } else {
    items = await new Promise<PreparedStarEnvelope[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const idbList = (req.result as PreparedStarEnvelope[]) || [];
          const fb = readFallback();
          if (fb.length > 0) {
            const ids = new Set(idbList.map((i) => i.id));
            resolve([...idbList, ...fb.filter((i) => !ids.has(i.id))]);
          } else {
            resolve(idbList);
          }
        };
        req.onerror = () => resolve(readFallback());
      } catch {
        resolve(readFallback());
      }
    });
  }

  return items
    .filter((item) => !from || item.from === from)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeQueuedStar(id: string): Promise<void> {
  const fb = readFallback();
  if (fb.some((item) => item.id === id)) {
    writeFallback(fb.filter((item) => item.id !== id));
  }
  const db = await openOutboxDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function countQueuedStars(from?: Who): Promise<number> {
  const list = await listQueuedStars(from);
  return list.length;
}

export async function clearOutbox(from?: Who): Promise<void> {
  const items = await listQueuedStars(from);
  for (const item of items) {
    await removeQueuedStar(item.id);
  }
}

