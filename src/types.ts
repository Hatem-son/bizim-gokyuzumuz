export type Who = 'hamham' | 'beto';

export type StarKind = 'note' | 'miss' | 'text' | 'photo' | 'voice' | 'draw';

export interface PersonMeta {
  who: Who;
  name: string;
  dat: string;
  abl: string;
  gen: string;
  color: 'blue' | 'pink';
  sign: string;
  zodiacLabel: string;
}

export interface StarRecord {
  id: string;
  fromUser: string;
  from: Who;
  kind: StarKind;
  x: number;
  y: number;
  size: number;
  once: boolean;
  spent: boolean;
  hasMedia: boolean;
  payload?: string;
  createdAt: string;
  openedAt: string | null;
  unlockAt: string | null;
  unlockNotified: boolean;
  unlockPushSent: boolean;
}

export interface PinRecord {
  salt: string;
  hash: string;
}

export interface BiometricRecord {
  credentialId: string;
  publicKeySpki: string;
  alg: number;
  rpId: string;
  origin: string;
  signCount: number;
  enabledAt: string;
}

export interface ProfileRow {
  id: string;
  who: Who;
  push_subscription: Record<string, unknown> | null;
}
