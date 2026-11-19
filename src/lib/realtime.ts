// HOTFIX 19 — Gerçek zamanlı kanal (Supabase Realtime: 'sky:' + COUPLE_ID):
// 1) Çevrimiçi (partner mumu): Phoenix Presence (track/untrack) + 8 sn kalp atışı + 20 sn zaman aşımı + üstel yeniden bağlanma (1-2-4-8..30 sn).
// 2) Anlık durum ('act': writing | photo | voice | drawing | sending | heart | null): en çok 2.5 sn'de bir gönderim, 6.5 sn alıcı zaman aşımı.
// 3) Canlı çizim ('draw'): AES-GCM-256 (her mesajda yeni 12 bayt IV, { iv, ct }) ile uçtan uca şifreli, seq numaralı, en çok 1 bekleyen paket kuyruğu (~80 ms).
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Who as DbWho } from '../types';
import type { DrawLivePacket, Stroke } from '../ui/draw';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { hasActiveKey, sealJSON, openJSON } from './crypto';

export const COUPLE_ID = 'bg-hamham-beto-9ocak2027-7f4e9c2a';

export type LiveActivity = 'writing' | 'sending' | 'drawing' | 'photo' | 'voice' | 'idle' | 'heart';

export interface PairRealtimeHandlers {
  onPartnerOnline: (online: boolean) => void;
  onPartnerActivity: (activity: Exclude<LiveActivity, 'heart'>, explicit?: boolean) => void;
  onPartnerHeart: () => void;
}

type WireEnvelope = {
  from: DbWho;
  iv?: string;
  ct?: string;
  plain?: unknown;
};

async function encryptEnvelope(from: DbWho, data: unknown): Promise<WireEnvelope> {
  if (hasActiveKey()) {
    try {
      const sealed = await sealJSON(data);
      const dot = sealed.indexOf('.');
      if (dot > 0) {
        return { from, iv: sealed.slice(0, dot), ct: sealed.slice(dot + 1) };
      }
    } catch {
      // Şifreleme hatasında aşağıya düş
    }
  }
  return { from, plain: data };
}

async function decryptEnvelope<T>(env: unknown): Promise<{ from?: DbWho; data: T | null }> {
  if (!env || typeof env !== 'object') return { data: null };
  const w = env as WireEnvelope;
  if (typeof w.iv === 'string' && typeof w.ct === 'string') {
    if (!hasActiveKey()) return { from: w.from, data: null };
    try {
      const data = await openJSON<T>(`${w.iv}.${w.ct}`);
      return { from: w.from, data };
    } catch {
      return { from: w.from, data: null };
    }
  }
  if ('plain' in w) {
    return { from: w.from, data: (w.plain as T) ?? null };
  }
  return { data: env as T };
}

export class PairRealtime {
  private ch: RealtimeChannel | null = null;
  private localBc: BroadcastChannel | null = null;
  private me: DbWho = 'hamham';
  private partner: DbWho = 'beto';
  private active = false;
  private subscribed = false;
  private myAct: Exclude<LiveActivity, 'heart'> = 'idle';
  private lastActSent: Exclude<LiveActivity, 'heart'> = 'idle';
  private lastActSentAt = 0;
  private heartbeatId = 0;
  private presPingId = 0;
  private partnerSeenAt = 0;
  private presWatchdogId = 0;
  private partnerWatchdogId = 0;
  private reconnectTimer = 0;
  private reconnectAttempt = 0;
  private connectSeq = 0;
  private drawSending = false;
  private drawQueue: DrawLivePacket[] = [];
  private drawListeners = new Set<(pkt: DrawLivePacket) => void>();
  private _inDrawView = false;

  live = false;
  isOnline = false;
  onPresence?: (online: boolean) => void;
  onActivity?: (act: Exclude<LiveActivity, 'heart'> | null) => void;
  onDraw?: (pkt: DrawLivePacket) => void;
  onDrawRequest?: () => void;
  onCollabFin?: (strokes: Stroke[], sid?: string, collab?: boolean) => void;

  get inDrawView(): boolean {
    if (this._inDrawView && typeof document !== 'undefined' && !document.querySelector('.board,.watch')) {
      this._inDrawView = false;
    }
    return this._inDrawView;
  }

  set inDrawView(v: boolean) {
    this._inDrawView = v;
  }

  constructor(private handlers: PairRealtimeHandlers) {
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('pagehide', () => {
      if (this.active && this.ch && this.subscribed) {
        void this.ch.untrack().catch(() => undefined);
      }
    });
    window.addEventListener('online', () => {
      if (this.active && !document.hidden) {
        this.reconnectAttempt = 0;
        void this.connect();
      }
    });
  }

  start(me: DbWho | 'ham') {
    const normMe: DbWho = me === 'beto' ? 'beto' : 'hamham';
    const changed = this.me !== normMe;
    this.me = normMe;
    this.partner = normMe === 'hamham' ? 'beto' : 'hamham';
    this.active = true;
    if (document.hidden) return;
    if (!changed && this.ch && this.subscribed) {
      // Kanal zaten açık: presence'ı yenile ve anlık sinyal gönder
      void this.ch.track({ at: Date.now(), who: this.me }).catch(() => undefined);
      this.syncPresenceState();
      void this.sendRaw('act', { t: 'act', a: this.myAct === 'idle' ? null : this.myAct, pres: true });
      return;
    }
    this.reconnectAttempt = 0;
    void this.connect();
  }

  stop() {
    this.active = false;
    this.myAct = 'idle';
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.teardown(true);
  }

  private setOnline(on: boolean) {
    if (this.isOnline !== on) {
      this.isOnline = on;
    }
    this.handlers.onPartnerOnline(on);
    this.onPresence?.(on);
  }

  private onVis = () => {
    if (!this.active) return;
    if (document.hidden) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = 0;
      if (this.ch && this.subscribed) {
        void this.sendRaw('act', { t: 'act', a: null, pres: false });
        void this.ch.untrack().catch(() => undefined);
      }
    } else {
      if (this.ch && this.subscribed) {
        void this.ch.track({ at: Date.now(), who: this.me }).catch(() => undefined);
        void this.sendRaw('act', { t: 'act', a: this.myAct === 'idle' ? null : this.myAct, pres: true, reply: true });
        this.syncPresenceState();
      } else {
        this.reconnectAttempt = 0;
        void this.connect();
      }
    }
  };

  private scheduleReconnect() {
    if (!this.active || document.hidden || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(5, this.reconnectAttempt++));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      if (this.active && !document.hidden) void this.connect();
    }, delay);
  }

  private hasPartnerInPresence(): boolean {
    if (!this.ch) return false;
    const st = this.ch.presenceState();
    const keys = this.partner === 'beto' ? ['beto'] : ['hamham', 'ham'];
    for (const k of keys) {
      if (Array.isArray(st[k]) && st[k].length > 0) return true;
    }
    for (const list of Object.values(st)) {
      if (Array.isArray(list) && list.some((m: any) => keys.includes(m?.who))) return true;
    }
    return false;
  }

  private syncPresenceState() {
    const inPres = this.hasPartnerInPresence();
    if (inPres) {
      this.partnerSeenAt = Date.now();
      this.setOnline(true);
      this.armPresenceWatchdog();
    } else if (Date.now() - this.partnerSeenAt >= 20_000) {
      this.setOnline(false);
    }
  }

  private armPresenceWatchdog() {
    clearTimeout(this.presWatchdogId);
    this.presWatchdogId = window.setTimeout(() => {
      if (!this.active) return;
      if (this.hasPartnerInPresence() || Date.now() - this.partnerSeenAt < 20_000) {
        this.armPresenceWatchdog();
      } else {
        this.setOnline(false);
      }
    }, 20_500);
  }

  private async connect() {
    const seq = ++this.connectSeq;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.teardown(false);

    if (!isSupabaseConfigured) {
      if (typeof BroadcastChannel !== 'undefined') {
        this.localBc = new BroadcastChannel('sky:' + COUPLE_ID);
        this.localBc.onmessage = (ev) => {
          void this.handleIncoming(ev.data?.event, ev.data?.payload);
        };
        this.subscribed = true;
        void this.sendRaw('act', { t: 'act', a: null, pres: true, reply: true });
      }
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.access_token) {
        sb.realtime.setAuth(data.session.access_token);
      }
    } catch {
      // Ignore
    }
    if (seq !== this.connectSeq || !this.active) return;

    const ch = sb.channel('sky:' + COUPLE_ID, {
      config: {
        presence: { key: this.me },
        broadcast: { self: false, ack: false },
      },
    });

    ch.on('presence', { event: 'sync' }, () => this.syncPresenceState())
      .on('presence', { event: 'join' }, () => this.syncPresenceState())
      .on('presence', { event: 'leave' }, () => {
        if (!this.hasPartnerInPresence()) {
          this.partnerSeenAt = 0;
          this.setOnline(false);
        }
      })
      .on('broadcast', { event: 'act' }, ({ payload }) => {
        void this.handleIncoming('act', payload);
      })
      .on('broadcast', { event: 'draw' }, ({ payload }) => {
        void this.handleIncoming('draw', payload);
      })
      .subscribe(async (status) => {
        if (seq !== this.connectSeq) return;
        if (status === 'SUBSCRIBED') {
          this.subscribed = true;
          this.reconnectAttempt = 0;
          if (!document.hidden) {
            await ch.track({ at: Date.now(), who: this.me }).catch(() => undefined);
            void this.sendRaw('act', { t: 'act', a: this.myAct === 'idle' ? null : this.myAct, pres: true, reply: true });
          }
          clearInterval(this.presPingId);
          this.presPingId = window.setInterval(() => {
            if (!document.hidden && this.active && this.subscribed) {
              void ch.track({ at: Date.now(), who: this.me }).catch(() => undefined);
              void this.sendRaw('act', { t: 'act', pres: true });
            }
          }, 8000);
        } else if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          this.subscribed = false;
          this.scheduleReconnect();
        }
      });

    this.ch = ch;
  }

  private async sendRaw(event: 'act' | 'draw', data: unknown): Promise<void> {
    if (!this.active) return;
    const env = await encryptEnvelope(this.me, data);
    if (this.ch && this.subscribed) {
      await this.ch.send({ type: 'broadcast', event, payload: env }).catch(() => undefined);
    } else if (this.localBc) {
      try {
        this.localBc.postMessage({ event, payload: env });
      } catch {
        // Ignore
      }
    }
  }

  private async handleIncoming(event: string, rawPayload: unknown): Promise<void> {
    const { from, data } = await decryptEnvelope<any>(rawPayload);
    if (!data || typeof data !== 'object') return;
    const sender = from ?? data.from ?? data.who;
    if (sender && sender === this.me) return;

    if (event === 'act' || data.t === 'act') {
      if (data.pres === false) {
        this.partnerSeenAt = 0;
        this.setOnline(false);
        this.handlers.onPartnerActivity('idle', true);
        this.onActivity?.(null);
        return;
      }
      this.partnerSeenAt = Date.now();
      this.setOnline(true);
      this.armPresenceWatchdog();
      if (data.reply) {
        void this.sendRaw('act', { t: 'act', pres: true, reply: false });
      }
      if (!('a' in data) && !('activity' in data)) return;
      const act = (data.a ?? data.activity ?? null) as LiveActivity | null;
      if (act === 'heart') {
        this.handlers.onPartnerHeart();
        return;
      }
      clearTimeout(this.partnerWatchdogId);
      if (!act || act === 'idle') {
        this.handlers.onPartnerActivity('idle', true);
        this.onActivity?.(null);
        return;
      }
      this.handlers.onPartnerActivity(act, false);
      this.onActivity?.(act);
      // 6.5 sn sinyal gelmezse alıcı tarafta kendiliğinden kapanır (ancak shownAct yalnızca gönderen gerçekten null yollayınca sıfırlanır)
      this.partnerWatchdogId = window.setTimeout(() => {
        this.handlers.onPartnerActivity('idle', false);
        this.onActivity?.(null);
      }, 6500);
      return;
    }

    if (event === 'draw' || 't' in data) {
      this.partnerSeenAt = Date.now();
      this.setOnline(true);
      this.armPresenceWatchdog();
      const pkt = data as DrawLivePacket;
      if (pkt.t === 'hello' || pkt.t === 'dreq') {
        this.onDrawRequest?.();
      }
      this.onDraw?.(pkt);
      this.drawListeners.forEach((fn) => fn(pkt));
    }
  }

  private teardown(notifyLeave: boolean) {
    clearInterval(this.heartbeatId);
    this.heartbeatId = 0;
    clearInterval(this.presPingId);
    this.presPingId = 0;
    clearTimeout(this.presWatchdogId);
    this.presWatchdogId = 0;
    clearTimeout(this.partnerWatchdogId);
    this.partnerWatchdogId = 0;
    this.drawQueue.length = 0;
    this.drawSending = false;

    if (notifyLeave) {
      if (this.ch && this.subscribed) {
        void this.ch.untrack().catch(() => undefined);
      }
      this.partnerSeenAt = 0;
      this.setOnline(false);
    }
    this.subscribed = false;

    if (this.localBc) {
      try {
        this.localBc.close();
      } catch {
        // Ignore
      }
      this.localBc = null;
    }

    const sb = getSupabase();
    if (sb && this.ch) {
      void sb.removeChannel(this.ch);
    }
    this.ch = null;
  }

  /** HOTFIX 19 & 22: en çok 2.5 sn'de bir mesaj yollar; null/'idle' anında gider (arka planda sonsuz döngü kurmaz). */
  activity(act: Exclude<LiveActivity, 'heart'> | null) {
    const norm: Exclude<LiveActivity, 'heart'> = !act ? 'idle' : act;
    const now = performance.now();
    if (norm !== 'idle' && norm === this.lastActSent && now - this.lastActSentAt < 2500) {
      return;
    }
    this.myAct = norm;
    this.lastActSent = norm;
    this.lastActSentAt = now;
    clearInterval(this.heartbeatId);
    this.heartbeatId = 0;
    void this.sendRaw('act', { t: 'act', a: norm === 'idle' ? null : norm, pres: true });
  }

  setMyActivity(act: Exclude<LiveActivity, 'heart'>) {
    this.activity(act);
  }

  sendHeart() {
    void this.sendRaw('act', { t: 'act', a: 'heart', pres: true });
  }

  /** HOTFIX 19, 22 & 24: sıralı çizim kuyruğu (bekleyen dpts paketlerini kuyruk sonunda tek pakette birleştirir, ~10 msg/sn limitini aşmaz). */
  draw(pkt: DrawLivePacket) {
    if (document.hidden || !this.active) return;
    const tail = this.drawQueue[this.drawQueue.length - 1];
    if (
      this.drawSending &&
      tail &&
      (tail.t === 'dpts' || tail.t === 'pts') &&
      (pkt.t === 'dpts' || pkt.t === 'pts')
    ) {
      tail.pts = [...tail.pts, ...pkt.pts];
      return;
    }
    this.drawQueue.push(pkt);
    if (!this.drawSending) {
      void this.flushDrawQueue();
    }
  }

  drawForce(pkt: DrawLivePacket) {
    if (!this.active) return;
    if (pkt.t === 'dclear' || pkt.t === 'clear' || pkt.t === 'dfin' || pkt.t === 'done' || pkt.t === 'dleave' || pkt.t === 'bye') {
      this.drawQueue = this.drawQueue.filter((p) => p.t !== 'dpts' && p.t !== 'pts');
    }
    this.drawQueue.push(pkt);
    if (!this.drawSending) {
      void this.flushDrawQueue();
    }
  }

  requestDraw() {
    this.drawForce({ t: 'dreq', seq: Date.now() });
  }

  private async flushDrawQueue(): Promise<void> {
    if (this.drawSending) return;
    this.drawSending = true;
    try {
      while (this.drawQueue.length > 0) {
        const cur = this.drawQueue.shift()!;
        await this.sendRaw('draw', cur);
      }
    } finally {
      this.drawSending = false;
    }
  }

  async sendDrawPacket(pkt: DrawLivePacket): Promise<void> {
    if (pkt.t === 'dpts' || pkt.t === 'pts') {
      this.draw(pkt);
    } else {
      this.drawForce(pkt);
    }
  }

  onDrawPacket(cb: (pkt: DrawLivePacket) => void): () => void {
    this.drawListeners.add(cb);
    return () => {
      this.drawListeners.delete(cb);
    };
  }
}
