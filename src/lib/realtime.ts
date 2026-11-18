// Özel (private: true, RLS yoksa otomatik public yedekli) Realtime kanalları:
// 1) 'pair:live': presence (karşı tarafın feneri) + anlık 'pres' ping/pong kalp atışı + içeriksiz canlı durum yayınları + kalp.
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
  private presPingId = 0;
  private presLeaseUntil = 0;
  private presWatchdogId = 0;
  private partnerWatchdogId = 0;
  private connectSeq = 0;
  private usePrivate = true;
  private drawListeners = new Set<(pkt: DrawLivePacket) => void>();

  constructor(private handlers: PairRealtimeHandlers) {
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('pagehide', () => {
      if (this.active) this.sendPres(false, false);
    });
  }

  start(me: DbWho) {
    this.me = me;
    this.partner = me === 'hamham' ? 'beto' : 'hamham';
    this.active = true;
    if (!document.hidden) void this.connect(this.usePrivate);
  }

  stop() {
    this.active = false;
    this.myAct = 'idle';
    this.teardown(true);
  }

  private onVis = () => {
    if (!this.active) return;
    if (document.hidden) {
      this.teardown(true);
    } else {
      void this.connect(this.usePrivate);
    }
  };

  private async connect(priv = true) {
    const seq = ++this.connectSeq;
    this.teardown(false);
    if (!isSupabaseConfigured) {
      if (typeof BroadcastChannel !== 'undefined') {
        this.localBc = new BroadcastChannel('gokyuzu-local-pair');
        this.localBc.onmessage = (ev) => {
          const msg = ev.data as { ch?: string; payload?: any };
          if (msg?.ch === 'live') this.handleLivePayload(msg.payload);
          else if (msg?.ch === 'draw' && msg.payload?.c) void this.handleEncryptedDraw(msg.payload.c);
          else if (msg?.ch === 'pres' && msg.payload?.who === this.partner) {
            const on = Boolean(msg.payload.on);
            this.handlers.onPartnerOnline(on);
            if (on && msg.payload.reply) {
              this.localBc?.postMessage({ ch: 'pres', payload: { who: this.me, on: true, reply: false } });
            }
          }
        };
        this.localBc.postMessage({ ch: 'pres', payload: { who: this.me, on: true, reply: true } });
      }
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    // Özel kanal (private: true) için kullanıcının JWT'si Realtime soketine mutlaka yüklenmiş olmalı
    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.access_token) {
        await sb.realtime.setAuth(data.session.access_token);
      }
    } catch {
      // Ignore session fetch error
    }
    if (seq !== this.connectSeq || !this.active || document.hidden) return;

    const live = sb.channel('pair:live', {
      config: {
        private: priv,
        broadcast: { self: false },
        presence: { key: this.me },
      },
    });

    const hasPhoenixPartner = () => {
      const st = live.presenceState();
      if (st[this.partner] && st[this.partner].length > 0) return true;
      for (const list of Object.values(st)) {
        if (Array.isArray(list) && list.some((m: any) => m?.who === this.partner)) return true;
      }
      return false;
    };

    const syncPresence = () => {
      const online = hasPhoenixPartner() || Date.now() < this.presLeaseUntil;
      this.handlers.onPartnerOnline(online);
    };

    live
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, () => {
        if (!hasPhoenixPartner()) {
          this.presLeaseUntil = 0;
          this.handlers.onPartnerOnline(false);
        }
      })
      .on('broadcast', { event: 'pres' }, ({ payload }) => {
        const p = payload as { who?: string; on?: boolean; reply?: boolean } | null;
        if (!p || p.who !== this.partner) return;
        if (p.on) {
          this.markPartnerLease();
          if (p.reply) this.sendPres(true, false);
        } else {
          this.presLeaseUntil = 0;
          this.handlers.onPartnerOnline(false);
        }
      })
      .on('broadcast', { event: 'live' }, ({ payload }) => {
        this.handleLivePayload(payload);
      })
      .subscribe(async (status) => {
        if (seq !== this.connectSeq) return;
        if (status === 'SUBSCRIBED') {
          await live.track({ who: this.me, ts: Date.now() }).catch(() => undefined);
          this.sendPres(true, true);
          clearInterval(this.presPingId);
          this.presPingId = window.setInterval(() => {
            if (!document.hidden && this.active) this.sendPres(true, false);
          }, 8000);
          if (this.myAct !== 'idle') this.broadcastLive(this.myAct);
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && priv) {
          // 05-realtime-private.sql henüz çalıştırılmadıysa veya özel kanal reddedildiyse public kanala otomatik düş
          this.usePrivate = false;
          void this.connect(false);
        }
      });

    const draw = sb.channel('pair:draw', {
      config: {
        private: priv,
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

  private markPartnerLease() {
    this.presLeaseUntil = Date.now() + 22_000;
    this.handlers.onPartnerOnline(true);
    clearTimeout(this.presWatchdogId);
    this.presWatchdogId = window.setTimeout(() => {
      if (!this.liveCh) return;
      const st = this.liveCh.presenceState();
      const inPres = Boolean(
        (st[this.partner] && st[this.partner].length > 0) ||
          Object.values(st).some((list) => Array.isArray(list) && list.some((m: any) => m?.who === this.partner))
      );
      if (!inPres && Date.now() >= this.presLeaseUntil) {
        this.handlers.onPartnerOnline(false);
      }
    }, 22_500);
  }

  private sendPres(on: boolean, reply: boolean) {
    const payload = { who: this.me, on, reply, ts: Date.now() };
    if (this.liveCh) {
      void this.liveCh.send({ type: 'broadcast', event: 'pres', payload }).catch(() => undefined);
    } else if (this.localBc) {
      try {
        this.localBc.postMessage({ ch: 'pres', payload });
      } catch {
        // Ignore
      }
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
    this.presLeaseUntil = 0;
    if (notifyLeave) {
      this.sendPres(false, false);
      this.handlers.onPartnerOnline(false);
    }

    if (this.localBc) {
      try {
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

    this.markPartnerLease();

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
