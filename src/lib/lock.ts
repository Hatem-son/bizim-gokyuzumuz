import { fromBase64, toBase64 } from './crypto';
import { STORAGE_KEYS, store } from './storage';
import type { BiometricRecord, PinRecord, Who } from '../types';
import { PEOPLE } from './people';

const TE = new TextEncoder();
const TD = new TextDecoder();
const PIN_ITERATIONS = 150_000;
export const BACKGROUND_LOCK_MS = 2 * 60 * 1000; // 2 dakikadan uzun arka planda kalınca kilitlenir

export function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  return toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return fromBase64(b64);
}

/**
 * WebAuthn ES256 (ECDSA) imzaları ASN.1 DER formatında gelir;
 * Web Crypto verify() ise sabit 64 baytlık IEEE P1363 (r || s) formatı bekler.
 */
export function derToP1363(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> | null {
  if (der.length < 8 || der[0] !== 0x30) return null;
  let offset = 2;
  if (der[1] & 0x80) {
    const lenBytes = der[1] & 0x7f;
    if (lenBytes === 0 || offset - 2 + lenBytes >= der.length) return null;
    offset += lenBytes;
  }
  if (der[offset] !== 0x02) return null;
  const rLen = der[offset + 1];
  const rStart = offset + 2;
  const sTagIdx = rStart + rLen;
  if (sTagIdx + 2 > der.length || der[sTagIdx] !== 0x02) return null;
  const sLen = der[sTagIdx + 1];
  const sStart = sTagIdx + 2;
  if (sStart + sLen > der.length) return null;

  const rRaw = der.subarray(rStart, rStart + rLen);
  const sRaw = der.subarray(sStart, sStart + sLen);

  const trimPad = (bytes: Uint8Array): Uint8Array | null => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.subarray(start);
    if (trimmed.length > size) return null;
    const out = new Uint8Array(size);
    out.set(trimmed, size - trimmed.length);
    return out;
  };

  const r = trimPad(rRaw);
  const s = trimPad(sRaw);
  if (!r || !s) return null;

  const result = new Uint8Array(new ArrayBuffer(size * 2));
  result.set(r, 0);
  result.set(s, size);
  return result;
}

function toArrayBufferBytes(input: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  const copy = new Uint8Array(new ArrayBuffer(input.byteLength));
  copy.set(input);
  return copy;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyWebAuthnAssertion(params: {
  saved: BiometricRecord;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
  clientDataJSON: ArrayBuffer | Uint8Array;
  authenticatorData: ArrayBuffer | Uint8Array;
  signature: ArrayBuffer | Uint8Array;
}): Promise<{ ok: true; nextSignCount: number } | { ok: false }> {
  const { saved, expectedChallenge, expectedOrigin, expectedRpId } = params;
  if (!saved.publicKeySpki || !saved.rpId || !saved.origin) return { ok: false };
  if (saved.rpId !== expectedRpId || saved.origin !== expectedOrigin) return { ok: false };

  // 1. clientDataJSON kontrolü (type, challenge, origin)
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(TD.decode(params.clientDataJSON)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
  } catch {
    return { ok: false };
  }
  if (clientData.type !== 'webauthn.get') return { ok: false };
  if (clientData.challenge !== expectedChallenge) return { ok: false };
  if (clientData.origin !== expectedOrigin) return { ok: false };

  // 2. authenticatorData kontrolü (rpIdHash, UP/UV bayrakları, signCount)
  const authData =
    params.authenticatorData instanceof Uint8Array
      ? params.authenticatorData
      : new Uint8Array(params.authenticatorData);
  if (authData.length < 37) return { ok: false };

  const expectedRpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', TE.encode(expectedRpId)));
  if (!bytesEqual(authData.subarray(0, 32), expectedRpHash)) return { ok: false };

  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) return { ok: false };

  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  const newSignCount = view.getUint32(33, false);
  // Sayaç kullanan doğrulayıcılarda sayaç mutlaka artmalı (klonlama/tekrar saldırısı engeli)
  if ((saved.signCount > 0 || newSignCount > 0) && newSignCount <= saved.signCount) {
    return { ok: false };
  }

  // 3. authenticatorData || SHA-256(clientDataJSON) üzerinde kriptografik imza doğrulaması
  const clientDataBytes = toArrayBufferBytes(params.clientDataJSON);
  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
  const signedData = new Uint8Array(new ArrayBuffer(authData.length + clientHash.length));
  signedData.set(authData, 0);
  signedData.set(clientHash, authData.length);

  const rawSig = toArrayBufferBytes(params.signature);
  const spkiBytes = fromBase64Url(saved.publicKeySpki);

  try {
    if (saved.alg === -7) {
      const key = await crypto.subtle.importKey(
        'spki',
        spkiBytes,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const p1363Sig = derToP1363(rawSig, 32);
      if (!p1363Sig) return { ok: false };
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        p1363Sig,
        signedData
      );
      return valid ? { ok: true, nextSignCount: newSignCount } : { ok: false };
    }

    if (saved.alg === -257) {
      const key = await crypto.subtle.importKey(
        'spki',
        spkiBytes,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const valid = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        key,
        rawSig,
        signedData
      );
      return valid ? { ok: true, nextSignCount: newSignCount } : { ok: false };
    }
  } catch {
    return { ok: false };
  }

  return { ok: false };
}

export async function hashPin(pin: string, saltB64?: string): Promise<PinRecord> {
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const baseKey = await crypto.subtle.importKey('raw', TE.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PIN_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  );
  return {
    salt: toBase64(salt),
    hash: toBase64(bits),
  };
}

export function hasPin(): boolean {
  return store.get<PinRecord | null>(STORAGE_KEYS.pin, null) !== null;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const saved = store.get<PinRecord | null>(STORAGE_KEYS.pin, null);
  if (!saved) return false;
  const candidate = await hashPin(pin, saved.salt);
  return candidate.hash === saved.hash;
}

export async function savePin(pin: string): Promise<void> {
  store.set(STORAGE_KEYS.pin, await hashPin(pin));
}

export function clearPinAndBiometric(): void {
  store.del(STORAGE_KEYS.pin);
  store.del(STORAGE_KEYS.biometric);
}

export function hasBiometric(): boolean {
  const saved = store.get<BiometricRecord | null>(STORAGE_KEYS.biometric, null);
  return Boolean(saved && saved.publicKeySpki && saved.credentialId);
}

export function hasAnyLock(): boolean {
  return hasPin() || hasBiometric();
}

export async function isPlatformBiometricSupported(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollBiometric(who: Who): Promise<{ ok: true } | { ok: false; error: string }> {
  const supported = await isPlatformBiometricSupported();
  if (!supported) {
    return {
      ok: false,
      error: 'Bu cihazda veya bağlantıda Face ID / Touch ID kullanılamıyor (HTTPS gerekir).',
    };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
    const userId = TE.encode(`bizim-gokyuzumuz:${who}`);
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Bizim Gökyüzümüz',
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: who,
          displayName: PEOPLE[who].name,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!cred || !cred.rawId) {
      return { ok: false, error: 'Face ID kurulumu tamamlanamadı.' };
    }

    const attRes = cred.response as AuthenticatorAttestationResponse;
    const spkiBuf = typeof attRes.getPublicKey === 'function' ? attRes.getPublicKey() : null;
    const alg = typeof attRes.getPublicKeyAlgorithm === 'function' ? attRes.getPublicKeyAlgorithm() : -7;
    if (!spkiBuf || (alg !== -7 && alg !== -257)) {
      return { ok: false, error: 'Cihaz açık anahtarı alınamadı; 4 haneli PIN kullanabilirsin.' };
    }

    let initialSignCount = 0;
    if (typeof attRes.getAuthenticatorData === 'function') {
      const ad = new Uint8Array(attRes.getAuthenticatorData());
      if (ad.length >= 37) {
        initialSignCount = new DataView(ad.buffer, ad.byteOffset, ad.byteLength).getUint32(33, false);
      }
    }

    store.set<BiometricRecord>(STORAGE_KEYS.biometric, {
      credentialId: toBase64Url(cred.rawId),
      publicKeySpki: toBase64Url(spkiBuf),
      alg,
      rpId: window.location.hostname,
      origin: window.location.origin,
      signCount: initialSignCount,
      enabledAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) {
      return { ok: false, error: 'Face ID kurulumu iptal edildi.' };
    }
    return { ok: false, error: 'Face ID açılamadı. Şimdilik 4 haneli PIN ile devam edebilirsin.' };
  }
}

export function disableBiometric(): void {
  store.del(STORAGE_KEYS.biometric);
}

export async function verifyBiometric(): Promise<boolean> {
  const saved = store.get<BiometricRecord | null>(STORAGE_KEYS.biometric, null);
  if (!saved || !saved.publicKeySpki || !saved.credentialId) return false;
  if (!window.PublicKeyCredential || !navigator.credentials) return false;

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
    const expectedChallenge = toBase64Url(challenge);
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: saved.rpId,
        allowCredentials: [
          {
            id: fromBase64Url(saved.credentialId),
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion || !assertion.rawId || !assertion.response) return false;
    if (toBase64Url(assertion.rawId) !== saved.credentialId) return false;

    const res = assertion.response as AuthenticatorAssertionResponse;
    const check = await verifyWebAuthnAssertion({
      saved,
      expectedChallenge,
      expectedOrigin: window.location.origin,
      expectedRpId: window.location.hostname,
      clientDataJSON: res.clientDataJSON,
      authenticatorData: res.authenticatorData,
      signature: res.signature,
    });

    if (!check.ok) return false;

    if (check.nextSignCount > saved.signCount) {
      store.set<BiometricRecord>(STORAGE_KEYS.biometric, {
        ...saved,
        signCount: check.nextSignCount,
      });
    }
    return true;
  } catch {
    return false;
  }
}
