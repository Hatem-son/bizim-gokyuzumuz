import { STORAGE_KEYS, store } from './storage';

const TE = new TextEncoder();
const TD = new TextDecoder();
const PBKDF2_SALT = 'bizim-gokyuzumuz/hamham+beto/v1';
const PBKDF2_ITERATIONS = 310_000;
const VERIFY_PLAINTEXT = 'gokyuzu-ok';

const IDB_NAME = 'bizim-gokyuzumuz-keystore';
const IDB_STORE = 'keys';
const IDB_KEY_ID = 'active-aes-key';

let activeKey: CryptoKey | null = null;

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB kullanılamıyor'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB açılamadı'));
  });
}

async function idbGetKey(): Promise<CryptoKey | null> {
  const db = await openKeyDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY_ID);
      req.onsuccess = () => {
        const res = req.result;
        resolve(res instanceof CryptoKey && res.extractable === false ? res : null);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPutKey(key: CryptoKey): Promise<void> {
  const db = await openKeyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(key, IDB_KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDeleteKey(): Promise<void> {
  try {
    const db = await openKeyDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // Ignore IDB deletion errors
  }
}

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    str += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(str);
}

export function fromBase64(str: string): Uint8Array<ArrayBuffer> {
  const raw = atob(str);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function normalizeSecret(secret: string): string {
  return secret.trim().toLocaleLowerCase('tr-TR').normalize('NFC');
}

export async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    TE.encode(normalizeSecret(secret)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  // extractable: false -> sayfadaki betikler anahtarın ham baytlarını dışa aktaramaz
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: TE.encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function assertKey(): CryptoKey {
  if (!activeKey) {
    throw new Error('Şifreleme anahtarı hazır değil.');
  }
  return activeKey;
}

export async function sealBytes(bytes: Uint8Array<ArrayBuffer>, key = assertKey()): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return `${toBase64(iv)}.${toBase64(encrypted)}`;
}

export async function openBytes(sealed: string, key = assertKey()): Promise<Uint8Array<ArrayBuffer>> {
  const dot = sealed.indexOf('.');
  if (dot <= 0) throw new Error('Geçersiz şifreli veri.');
  const iv = fromBase64(sealed.slice(0, dot));
  const ct = fromBase64(sealed.slice(dot + 1));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(decrypted);
}

export async function sealJSON<T>(value: T): Promise<string> {
  const encoded = TE.encode(JSON.stringify(value));
  const buf = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  buf.set(encoded);
  return sealBytes(buf);
}

export async function openJSON<T>(sealed: string): Promise<T> {
  const raw = await openBytes(sealed);
  return JSON.parse(TD.decode(raw)) as T;
}

export async function persistActiveKey(key: CryptoKey): Promise<void> {
  activeKey = key;
  store.del(STORAGE_KEYS.key);
  await idbPutKey(key);
}

export async function loadSavedKey(): Promise<boolean> {
  try {
    const idbKey = await idbGetKey();
    if (idbKey) {
      store.del(STORAGE_KEYS.key);
      activeKey = idbKey;
      return true;
    }

    // Eski sürümde localStorage'da düz saklanmış anahtar varsa non-extractable CryptoKey olarak taşı ve temizle
    const legacyRaw = store.get<string | null>(STORAGE_KEYS.key, null);
    store.del(STORAGE_KEYS.key);
    if (legacyRaw) {
      const migrated = await crypto.subtle.importKey(
        'raw',
        fromBase64(legacyRaw),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      await idbPutKey(migrated);
      activeKey = migrated;
      return true;
    }

    activeKey = null;
    return false;
  } catch {
    store.del(STORAGE_KEYS.key);
    activeKey = null;
    return false;
  }
}

export async function clearActiveKey(): Promise<void> {
  activeKey = null;
  store.del(STORAGE_KEYS.key);
  await idbDeleteKey();
}

export function hasActiveKey(): boolean {
  return activeKey !== null;
}

/**
 * Ortak gizli kelimeden AES-GCM 256 anahtarı türetir.
 * Sunucuda (veya yerel önizlemede) kontrol metni varsa onu açarak doğrular;
 * ilk kurulumsa kontrol metnini şifreleyip kaydeder.
 */
export async function unlockWithSecret(
  secret: string,
  fetchVerifyBlob: () => Promise<string | null>,
  saveVerifyBlob: (blob: string) => Promise<void>
): Promise<boolean> {
  const candidate = await deriveAesKey(secret);
  const existingBlob = await fetchVerifyBlob();

  if (existingBlob) {
    try {
      const plain = TD.decode(await openBytes(existingBlob, candidate));
      if (plain !== VERIFY_PLAINTEXT) return false;
    } catch {
      return false;
    }
  } else {
    const encoded = TE.encode(VERIFY_PLAINTEXT);
    const buf = new Uint8Array(new ArrayBuffer(encoded.byteLength));
    buf.set(encoded);
    const newBlob = await sealBytes(buf, candidate);
    await saveVerifyBlob(newBlob);
  }

  await persistActiveKey(candidate);
  return true;
}
