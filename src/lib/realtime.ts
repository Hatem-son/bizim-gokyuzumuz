// Özel (private: true) Realtime kanalları:
// 1) 'pair:live': presence (karşı tarafın feneri) + içeriksiz canlı durum yayınları (4 sn kalp atışı, 6 sn zaman aşımı) + kalp.
// 2) 'pair:draw': crypto.ts (AES-GCM-256) ile uçtan uca şifrelenmiş canlı çizim paketleri (~70 ms toplu nokta, seq sıralı).
// Sekme gizliyken (document.hidden) tüm zamanlayıcılar ve kanallar durur; görünür olunca yeniden bağlanır.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Who as DbWho } from '../types';
import type { DrawLivePacket } from '../ui/draw';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { hasActiveKey, sealJSON, openJSON } from './crypto';

export type LiveActivity = 'writing' | 'sending' | 'drawing' | 'photo' | 'voice' | 'idle' | 'heart';

export interface PairRealtimeHandlers {
  onPartnerOnline: (online: boolean) => void;
  onPartnerActivity: (activity: Exclude<LiveActivity, 'heart'>) => void;
  onPartnerHeart: () => void;
}

export class PairRealtime {
  private liveCh: RealtimeChannel | null = null;
  private drawCh: RealtimeChannel | null = null;
  private localBc: BroadcastChannel | null = null;
  private me: DbWho = 'hamham';
  private partner: DbWho = 'beto';
  private active = false;
  private myAct: Exclude<LiveActivity, 'heart'> = 'idle';
  private heartbeatId = 0;
  private partnerWatchdogId = 0;
  private drawListeners = new Set<(pkt: DrawLivePacket) => void>();

  constructor(private handlers: PairRealtimeHandlers) {
    document.addEventListener('visibilitychange', this.onVis);
  }

  start(me: DbWho) {
    this.me = me;
    this.partner = me === 'hamham' ? 'beto' : 'hamham';
    this.active = true;
    if (!document.hidden) this.connect();
  }

  stop() {
    this.active = false;
    this.myAct = 'idle';
    this.teardown();
  }

  private onVis = () => {
    if (!this.active) return;
    if (document.hidden) {
      this.teardown();
    } else {
      this.connect();
    }
  };

  private connect() {
    this.teardown();
    if (!isSupabaseConfigured) {
      if (typeof BroadcastChannel !== 'undefined') {
        this.localBc = new BroadcastChannel('gokyuzu-local-pair');
        this.localBc.onmessage = (ev) => {
          const msg = ev.data as { ch?: string; payload?: any };
          if (msg?.ch === 'live') this.handleLivePayload(msg.payload);
          else if (msg?.ch === 'draw' && msg.payload?.c) void this.handleEncryptedDraw(msg.payload.c);
          else if (msg?.ch === 'pres' && msg.payload?.who === this.partner) {
            this.handlers.onPartnerOnline(Boolean(msg.payload.on));
          }
        };
        this.localBc.postMessage({ ch: 'pres', payload: { who: this.me, on: true } });
      }
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    const live = sb.channel('pair:live', {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: this.me },
      },
    });

    const syncPresence = () => {
      const st = live.presenceState();
      const online = Boolean(st[this.partner] && st[this.partner].length > 0);
      this.handlers.onPartnerOnline(online);
    };

    live
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .on('broadcast', { event: 'live' }, ({ payload }) => {
        this.handleLivePayload(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await live.track({ who: this.me, ts: Date.now() }).catch(() => undefined);
          if (this.myAct !== 'idle') this.broadcastLive(this.myAct);
        }
      });

    const draw = sb.channel('pair:draw', {
      config: {
        private: true,
        broadcast: { self: false },
      },
    });

    draw
      .on('broadcast', { event: 'pkt' }, ({ payload }) => {
        if (payload && typeof payload.c === 'string') {
          void this.handleEncryptedDraw(payload.c);
        }
      })
      .subscribe();

    this.liveCh = live;
    this.drawCh = draw;
  }

  private teardown() {
    clearInterval(this.heartbeatId);
    this.heartbeatId = 0;
    clearTimeout(this.partnerWatchdogId);
    this.partnerWatchdogId = 0;
    this.handlers.onPartnerOnline(false);

    if (this.localBc) {
      try {
        this.localBc.postMessage({ ch: 'pres', payload: { who: this.me, on: false } });
        this.localBc.close();
      } catch {
        // Ignore
      }
      this.localBc = null;
    }

    const sb = getSupabase();
    if (sb) {
      if (this.liveCh) void sb.removeChannel(this.liveCh);
      if (this.drawCh) void sb.removeChannel(this.drawCh);
    }
    this.liveCh = null;
    this.drawCh = null;
  }

  private handleLivePayload(payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as { who?: string; activity?: LiveActivity };
    if (p.who !== this.partner || !p.activity) return;

    if (p.activity === 'heart') {
      this.handlers.onPartnerHeart();
      return;
    }

    clearTimeout(this.partnerWatchdogId);
    if (p.activity === 'idle') {
      this.handlers.onPartnerActivity('idle');
      return;
    }

    this.handlers.onPartnerActivity(p.activity);
    // 6 sn içinde yeni kalp atışı gelmezse canlı göstergeyi otomatik gizle
    this.partnerWatchdogId = window.setTimeout(() => {
      this.handlers.onPartnerActivity('idle');
    }, 6000);
  }

  private broadcastLive(activity: LiveActivity) {
    if (document.hidden || !this.active) return;
    const payload = { who: this.me, activity, ts: Date.now() };
    if (this.liveCh) {
      void this.liveCh.send({ type: 'broadcast', event: 'live', payload }).catch(() => undefined);
    } else if (this.localBc) {
      this.localBc.postMessage({ ch: 'live', payload });
    }
  }

  setMyActivity(act: Exclude<LiveActivity, 'heart'>) {
    if (this.myAct === act && (act === 'idle' || this.heartbeatId !== 0)) return;
    this.myAct = act;
    clearInterval(this.heartbeatId);
    this.heartbeatId = 0;
    this.broadcastLive(act);
    if (act !== 'idle') {
      // 4 sn kalp atışı
      this.heartbeatId = window.setInterval(() => {
        if (document.hidden || this.myAct === 'idle') {
          clearInterval(this.heartbeatId);
          this.heartbeatId = 0;
          return;
        }
        this.broadcastLive(this.myAct);
      }, 4000);
    }
  }

  sendHeart() {
    this.broadcastLive('heart');
  }

  async sendDrawPacket(pkt: DrawLivePacket): Promise<void> {
    if (document.hidden || !this.active || !hasActiveKey()) return;
    try {
      const c = await sealJSON(pkt);
      if (this.drawCh) {
        await this.drawCh.send({ type: 'broadcast', event: 'pkt', payload: { c } });
      } else if (this.localBc) {
        this.localBc.postMessage({ ch: 'draw', payload: { c } });
      }
    } catch {
      // Ağ / şifreleme hatasında sessizce geç
    }
  }

  private async handleEncryptedDraw(ciphertext: string): Promise<void> {
    if (!hasActiveKey()) return;
    try {
      const pkt = await openJSON<DrawLivePacket>(ciphertext);
      if (pkt && typeof pkt === 'object' && 't' in pkt) {
        this.drawListeners.forEach((fn) => fn(pkt));
      }
    } catch {
      // Farklı anahtar / bozuk paket yok sayılır
    }
  }

  onDrawPacket(cb: (pkt: DrawLivePacket) => void): () => void {
    this.drawListeners.add(cb);
    return () => {
      this.drawListeners.delete(cb);
    };
  }
}
