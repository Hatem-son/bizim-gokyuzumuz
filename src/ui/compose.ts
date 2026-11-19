// Yazma kartı: Yazı / Fotoğraf / Ses / Çizim + Zamanlı. Gönderince kart yıldıza dönüşüp göğe süzülür.
// Gönderim (AES-GCM şifreleme + Supabase yükleme) animasyonla EŞZAMANLI yürür; hata olursa taslak korunarak kart geri açılır.
import { h, $, $$, openSheet, segment, sleep, reduced, Sheet, island, toast } from './ui';
import { raspberry } from './art';
import { lilyBloom } from './lily';
import { I, SIGN } from './icons';
import { state, PEOPLE, Star, Kind, fmtDate, toDbWho } from './state';
import { core } from './core';
import { mod, skyToScreen } from '../gokyuzu/skyGeom';
import { compressImage, CompressedPhoto, VoiceRecorder, RecordedVoice } from '../lib/media';
import {
  prepareEncryptedStar,
  uploadPreparedStar,
  OfflineNetworkError,
  isOfflineLikeError,
  getServerNowMs,
  sessionToStarUuid,
} from '../lib/stars';
import { enqueueEncryptedStar } from '../lib/outbox';
import { isStarHazel } from '../lib/hazel';
import { STORAGE_KEYS, store } from '../lib/storage';
import { loadSavedDrawingDraft, saveDrawingDraft } from './draw';
import type { StarKind } from '../types';

const QUICK = ['Seni özledim', 'Günaydın', 'İyi geceler', 'Aklımdasın', 'Seni seviyorum', '9 Ocak yakında'];

const SEND_LABELS: Record<Kind, string> = {
  text: 'Yazıyı bırak',
  photo: 'Fotoğrafı bırak',
  voice: 'Sesi bırak',
  draw: 'Çizimi bırak',
};

const KIND_NAMES: Record<Kind, string> = {
  text: 'Yazı',
  photo: 'Fotoğraf',
  voice: 'Ses',
  draw: 'Çizim',
};

// Günlük 1 yıldız hakkı başlangıç zamanı (bu andan önce atılmış eski test yıldızları bugünkü hakkı kilitlemez)
const DAILY_LIMIT_SINCE_MS = Date.parse('2026-11-19T20:32:00+03:00');
const DAILY_STAR_KEY_PREFIX = 'gokyuzu.dailyStarAt.v1.';

export function recordDailyStarSent(ts = getServerNowMs()): void {
  store.set(`${DAILY_STAR_KEY_PREFIX}${toDbWho(state.me)}`, ts);
}

export function getDailyStarStatus(): {
  used: boolean;
  sentAt: number;
  star: Star | null;
  dayStartMs: number;
  nextResetMs: number;
} {
  const now = getServerNowMs();
  const d = new Date(now);
  const dayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const nextResetMs = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
  const windowStart = Math.max(dayStartMs, DAILY_LIMIT_SINCE_MS);

  let latestStar: Star | null = null;
  for (const s of state.stars) {
    if (s.from === state.me && s.createdAt >= windowStart && s.createdAt < nextResetMs) {
      if (!latestStar || s.createdAt > latestStar.createdAt) {
        latestStar = s;
      }
    }
  }
  const savedAt = store.get<number>(`${DAILY_STAR_KEY_PREFIX}${toDbWho(state.me)}`, 0);
  const sentAt = Math.max(latestStar?.createdAt ?? 0, savedAt >= windowStart && savedAt < nextResetMs ? savedAt : 0);

  return {
    used: sentAt >= windowStart,
    sentAt,
    star: latestStar,
    dayStartMs,
    nextResetMs,
  };
}

function openDailyCooldownSheet(status: ReturnType<typeof getDailyStarStatus>, initial: Kind) {
  const me = PEOPLE[state.me];
  const p = PEOPLE[state.partner];
  const sentTimeStr = new Date(status.sentAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const kindLabel = status.star ? KIND_NAMES[status.star.kind] : 'Bugünkü';
  const r = 74;
  const circ = +(2 * Math.PI * r).toFixed(2);

  const el = h(`<div class="daily-cd">
    <button type="button" class="icon-btn dc-close" data-close aria-label="Kapat">${I.close()}</button>
    <div class="eyebrow" style="margin-top:4px">GÜNLÜK YILDIZ HAKKI</div>
    <div class="daily-orb">
      <div class="orb-glow"></div>
      <svg class="orb-ring" viewBox="0 0 164 164">
        <circle cx="82" cy="82" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="2" stroke-dasharray="3 5"/>
        <circle cx="82" cy="82" r="${r}" fill="none" stroke="${me.color}" stroke-width="3" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ}" data-arc style="transition:stroke-dashoffset .6s ease-out"/>
      </svg>
      <div class="orb-core" style="color:${me.color}">
        ${I.starFill(34)}
      </div>
      <span class="orb-lily">${lilyBloom(34, 14, 'sway')}</span>
    </div>
    <div class="title" style="font-size:31px">Bugünkü yıldızını bıraktın</div>
    <p class="body" style="margin:8px 8px 0;font-size:14.5px">Gökyüzümüze her gün yalnızca bir yıldız bırakabilirsin. Bir sonraki yıldız hakkın için kalan süre:</p>
    <div class="daily-grid" aria-live="polite">
      <div class="daily-cell"><b data-h>00</b><span>saat</span></div>
      <div class="daily-cell"><b data-m>00</b><span>dakika</span></div>
      <div class="daily-cell"><b data-s>00</b><span>saniye</span></div>
    </div>
    <div class="daily-chip">
      <span style="color:${me.color};display:inline-grid">${I.starFill(13)}</span>
      <span>Bugün ${sentTimeStr} · ${kindLabel} yıldızı ${p.to} bırakıldı</span>
    </div>
    <div class="view-actions" style="margin-top:4px">
      ${status.star ? `<button type="button" class="btn btn-soft" data-see>${I.star(16)}<span>Gökyüzünde gör</span></button>` : ''}
      <button type="button" class="btn btn-primary" data-ok>Tamam</button>
    </div>
  </div>`);

  let timer = 0;
  const sheet = openSheet(el, {
    cls: 'daily-sheet',
    onClose: () => clearInterval(timer),
  });

  const hEl = $('[data-h]', el);
  const mEl = $('[data-m]', el);
  const sEl = $('[data-s]', el);
  const arcEl = $('[data-arc]', el);
  const totalWindow = Math.max(1000, status.nextResetMs - status.dayStartMs);

  const tick = () => {
    const now = getServerNowMs();
    const remMs = Math.max(0, status.nextResetMs - now);
    if (remMs <= 0) {
      clearInterval(timer);
      void sheet.close(true).then(() => openCompose(initial));
      return;
    }
    let totalSec = Math.ceil(remMs / 1000);
    const hrs = Math.floor(totalSec / 3600);
    totalSec -= hrs * 3600;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec - mins * 60;
    hEl.textContent = String(hrs).padStart(2, '0');
    mEl.textContent = String(mins).padStart(2, '0');
    sEl.textContent = String(secs).padStart(2, '0');
    const prog = Math.max(0.04, Math.min(1, 1 - remMs / totalWindow));
    arcEl.style.strokeDashoffset = (circ * (1 - prog)).toFixed(2);
  };
  tick();
  timer = window.setInterval(tick, 1000);

  $('[data-close]', el).addEventListener('click', () => void sheet.close());
  $('[data-ok]', el).addEventListener('click', () => void sheet.close());
  $('[data-see]', el)?.addEventListener('click', async () => {
    await sheet.close();
    if (status.star) {
      core.scrollToStar(status.star, 650);
      setTimeout(() => {
        if (status.star) {
          const pos = core.starScreenPos(status.star);
          core.fx.land(pos, { now: performance.now() - 700, tint: me.color });
        }
      }, 660);
    }
  });
}

export type ComposeDraft = {
  mode: Kind;
  text: string;
  caption: string;
  photo: CompressedPhoto | null;
  voice: RecordedVoice | null;
  drawing: unknown[] | null;
  drawSid?: string;
  drawCollab?: boolean;
  timed: number | null;
};

export function openCompose(initial: Kind = 'text', restored?: ComposeDraft) {
  if (!restored) {
    const daily = getDailyStarStatus();
    if (daily.used) {
      openDailyCooldownSheet(daily, initial);
      return;
    }
  }
  const p = PEOPLE[state.partner];
  const draftKey = `${STORAGE_KEYS.draftPrefix}${toDbWho(state.me)}`;
  const captionDraftKey = `${draftKey}.caption`;
  let mode: Kind = restored?.mode ?? initial;
  let savedText = restored?.text ?? store.get<string>(draftKey, '');
  let savedCaption = restored?.caption ?? store.get<string>(captionDraftKey, '');
  let photo: CompressedPhoto | null = restored?.photo ?? null;
  let voice: RecordedVoice | null = restored?.voice ?? null;
  let drawing: unknown[] | null = restored?.drawing ?? loadSavedDrawingDraft();
  let drawSid: string | undefined = restored?.drawSid;
  let drawCollab = Boolean(restored?.drawCollab);
  let timed: number | null = restored?.timed ?? null;
  let activeRecorder: VoiceRecorder | null = null;
  let stopPreviewAudio: (() => void) | null = null;
  let handingOff = false;

  const c = h(`<div class="compose">
    <div class="c-head">
      <div class="avatar" style="color:${p.color}">${SIGN[p.sign]}</div>
      <div><div class="title">${p.to}</div><div class="eyebrow" style="display:flex;align-items:center;gap:6px">bir yıldız bırak${state.me === 'beto' ? `<span style="display:inline-grid;margin-top:-3px">${raspberry(9)}</span>` : ''}</div></div>
      <button type="button" class="icon-btn" data-close aria-label="Kapat">${I.close()}</button>
    </div>
    <div data-seg></div>
    <div class="c-body" data-body></div>
    <div data-timed-row class="timed-row ${timed ? '' : 'hide'}"></div>
    <div class="c-foot">
      <button type="button" class="chip ${timed ? 'on' : ''}" data-timed>${I.clock(16)}<span>Zamanlı</span></button>
      <span class="grow"></span>
      <button type="button" class="btn btn-primary send" data-send disabled>${I.star(17)}<span>${SEND_LABELS[mode]}</span></button>
    </div>
    <div class="lockline small">${I.lock(14)}<span>Bu yıldızı sadece ${p.name} açabilir. Gönderdikten sonra sen de okuyamazsın.</span></div>
  </div>`);

  const sheet: Sheet = openSheet(c, {
    cls: 'compose-sheet',
    onClose: () => {
      activeRecorder?.cleanup();
      activeRecorder = null;
      stopPreviewAudio?.();
      stopPreviewAudio = null;
      if (!handingOff) core.setMyLiveActivity('idle');
    },
  });
  $('[data-close]', c).addEventListener('click', () => void sheet.close());
  const body = $('[data-body]', c);
  const send = $<HTMLButtonElement>('[data-send]', c);

  const kinds: Kind[] = ['text', 'photo', 'voice', 'draw'];
  $('[data-seg]', c).appendChild(
    segment(['Yazı', 'Fotoğraf', 'Ses', 'Çizim'], kinds.indexOf(mode), (i) => {
      activeRecorder?.cleanup();
      activeRecorder = null;
      stopPreviewAudio?.();
      stopPreviewAudio = null;
      mode = kinds[i];
      render();
    })
  );

  const valid = () => {
    const ok =
      mode === 'text'
        ? Boolean(savedText.trim())
        : mode === 'photo'
          ? Boolean(photo)
          : mode === 'voice'
            ? Boolean(voice && voice.dur > 0)
            : Boolean(drawing && drawing.length > 0);
    if (!handingOff) {
      send.innerHTML = `${I.star(17)}<span>${SEND_LABELS[mode]}</span>`;
      send.disabled = !ok;
    }
  };

  function render() {
    body.innerHTML = '';
    body.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    if (mode === 'text') {
      const v = h(`<div class="text-pane">
        <div class="quick" data-nodrag>${QUICK.map((q) => `<button type="button" class="chip">${q}</button>`).join('')}</div>
        <div class="write-wrap" data-nodrag>
          <textarea class="write" maxlength="1000" placeholder="${p.name}, aklımdan…" enterkeyhint="done" autocapitalize="sentences"></textarea>
          <div class="write-foot"><span class="small num" data-cnt>0 / 1000</span></div>
        </div></div>`);
      const ta = $<HTMLTextAreaElement>('textarea', v);
      const cntEl = $('[data-cnt]', v);
      ta.value = savedText;
      cntEl.textContent = `${ta.value.length} / 1000`;

      const syncWriteHeight = () => {
        ta.style.height = '0px';
        const kbOpen = document.documentElement.classList.contains('kb-open');
        const vvH = window.visualViewport?.height || window.innerHeight;
        // Klavye açıkken üstteki sabit alanlar (~170px) düşüldükten sonra kalan yüksekliği asla aşmaz
        const availH = kbOpen ? Math.max(96, vvH - 210) : Math.max(220, Math.round(window.innerHeight * 0.44));
        const minH = kbOpen ? Math.min(104, availH) : 124;
        const nextH = Math.min(availH, Math.max(minH, ta.scrollHeight));
        ta.style.height = `${nextH}px`;
      };
      requestAnimationFrame(syncWriteHeight);
      window.visualViewport?.addEventListener('resize', syncWriteHeight);

      $$('.quick .chip', v).forEach((b) =>
        b.addEventListener('click', () => {
          const phrase = b.textContent || '';
          const nextVal = (ta.value ? ta.value.trimEnd() + ' ' : '') + phrase + (phrase.endsWith('.') ? '' : '.');
          ta.value = nextVal.slice(0, 1000);
          ta.dispatchEvent(new Event('input'));
          b.animate([{ transform: 'scale(.92)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
        })
      );
      ta.addEventListener('focus', () => {
        if (ta.value.trim()) core.setMyLiveActivity('writing');
        setTimeout(syncWriteHeight, 60);
        setTimeout(syncWriteHeight, 260);
      });
      ta.addEventListener('blur', () => {
        setTimeout(syncWriteHeight, 100);
        setTimeout(syncWriteHeight, 350);
      });
      ta.addEventListener('input', () => {
        savedText = ta.value;
        store.set(draftKey, savedText);
        cntEl.textContent = `${ta.value.length} / 1000`;
        syncWriteHeight();
        core.setMyLiveActivity(ta.value.trim() ? 'writing' : 'idle');
        valid();
      });
      body.appendChild(v);
    } else if (mode === 'photo') {
      core.setMyLiveActivity('photo');
      if (!photo) {
        const v = h(`<label class="pick press">${I.camera(26)}<span class="body">Fotoğraf seç</span><span class="small">Fotoğraf cihazında şifrelenir</span><input type="file" accept="image/*"></label>`);
        $<HTMLInputElement>('input', v).addEventListener('change', async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try {
            core.setMyLiveActivity('photo');
            photo = await compressImage(f);
            render();
          } catch {
            toast('Fotoğraf okunamadı, başka bir kare seç', I.info(14));
          }
        });
        body.appendChild(v);
      } else {
        const v = h(`<div class="photo-prev" data-nodrag>
          <div class="photo-top">
            <figure class="polaroid"><img src="${photo.preview}" alt=""></figure>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
              <div class="small">Fotoğraf hazır · cihazında şifrelenecek</div>
              <button type="button" class="chip" data-change>${I.camera(15)}<span>Fotoğrafı değiştir</span></button>
            </div>
          </div>
          <div class="cap" data-nodrag>
            <div class="cap-head"><span class="eyebrow">Fotoğrafa bir not yaz</span><span class="small" data-cap-cnt>0 / 120</span></div>
            <textarea rows="4" placeholder="Bu kareye bir not bırak…" maxlength="120" enterkeyhint="done" autocapitalize="sentences"></textarea>
          </div></div>`);
        const capTa = $<HTMLTextAreaElement>('textarea', v);
        const capCnt = $('[data-cap-cnt]', v);
        capTa.value = savedCaption;
        capCnt.textContent = `${capTa.value.length} / 120`;
        capTa.addEventListener('focus', () => core.setMyLiveActivity('photo'));
        capTa.addEventListener('input', () => {
          savedCaption = capTa.value;
          store.set(captionDraftKey, savedCaption);
          capCnt.textContent = `${capTa.value.length} / 120`;
          core.setMyLiveActivity('photo');
        });
        capTa.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            capTa.blur();
          }
        });
        $('[data-change]', v).addEventListener('click', () => {
          photo = null;
          render();
        });
        body.appendChild(v);
      }
    } else if (mode === 'voice') {
      core.setMyLiveActivity('voice');
      body.appendChild(
        voiceUI(
          (rec) => {
            voice = rec;
            valid();
          },
          voice,
          (r) => {
            activeRecorder = r;
          },
          (stopFn) => {
            stopPreviewAudio = stopFn;
          }
        )
      );
    } else {
      const v = h(`<button type="button" class="draw-tile press" style="width:100%"><canvas width="600" height="450"></canvas>
        <div class="lbl">${drawing?.length ? '' : `${I.pen(26)}<span class="body">Çizim tahtasını aç</span><span class="small">İstersen ${p.name} canlı izleyebilir</span>`}</div></button>`);
      if (drawing?.length) core.renderDrawingPreview($<HTMLCanvasElement>('canvas', v), drawing);
      v.addEventListener('click', async () => {
        const res = await core.openBoard(drawing);
        if (!res) return;
        if (res.remoteFin) {
          // Beraber çizimde karşı taraf "Bitti"ye bastı: yazma kartını sessizce kapat, yıldız onCollabFin ile gökyüzüne düşüyor
          saveDrawingDraft(null);
          handingOff = true;
          void sheet.close(true);
          return;
        }
          if (res.strokes.length) {
          drawing = res.strokes;
          drawSid = res.sid;
          drawCollab = res.collab;
          saveDrawingDraft(res.strokes);
          render();
          valid();
          // Beraber çizimde "Bitti"ye basıldıysa dfin zaten karşıya gitti; doğrudan kaydet
          if (res.collab && !send.disabled) send.click();
        }
      });
      body.appendChild(v);
    }
    valid();
  }
  render();

  /* zamanlı */
  const tRow = $('[data-timed-row]', c);
  const setupTimedRow = () => {
    const tomorrow = new Date(getServerNowMs());
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const jan9 = new Date('2027-01-09T09:00:00+03:00').getTime();
    const opts: [string, number][] = [['Yarın 09:00', tomorrow.getTime()], ['9 Ocak sabahı', jan9]];
    if (!timed) timed = opts[0][1];
    tRow.innerHTML =
      opts.map(([t, ts]) => `<button type="button" class="chip ${timed === ts ? 'on' : ''}" data-ts="${ts}">${t}</button>`).join('') +
      `<input type="datetime-local" aria-label="Başka bir zaman">`;
    $$('.chip', tRow).forEach((x) =>
      x.addEventListener('click', () => {
        $$('.chip', tRow).forEach((y) => y.classList.toggle('on', y === x));
        timed = +x.dataset.ts!;
      })
    );
    $<HTMLInputElement>('input', tRow).addEventListener('change', (ev) => {
      const val = (ev.target as HTMLInputElement).value;
      if (!val) return;
      const picked = new Date(val).getTime();
      if (!Number.isFinite(picked) || picked <= getServerNowMs() + 30_000) {
        toast('Gelecekteki bir zamanı seçmelisin', I.clock(14));
        return;
      }
      $$('.chip', tRow).forEach((y) => y.classList.remove('on'));
      timed = picked;
    });
    staggerChildren(tRow);
  };
  if (timed) setupTimedRow();

  $('[data-timed]', c).addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLElement;
    const open = tRow.classList.toggle('hide') === false;
    b.classList.toggle('on', open);
    if (!open) {
      timed = null;
      return;
    }
    setupTimedRow();
  });

  send.addEventListener('click', async () => {
    if (send.disabled) return;
    activeRecorder?.cleanup();
    activeRecorder = null;
    stopPreviewAudio?.();
    stopPreviewAudio = null;
    send.disabled = true;
    const origHtml = send.innerHTML;
    send.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" style="animation:spin .8s linear infinite"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="40 20" stroke-linecap="round"/></svg><span>Gönderiliyor…</span>`;
    handingOff = true;
    // HOTFIX 23: Yük YALNIZCA seçili sekmeden (mode) kurulur; diğer sekmelerin taslakları yıldıza HİÇ girmez
    const snapshot: ComposeDraft = {
      mode,
      text: mode === 'text' ? savedText.trim() : '',
      caption: mode === 'photo' ? savedCaption.trim() : '',
      photo: mode === 'photo' ? photo : null,
      voice: mode === 'voice' ? voice : null,
      drawing: mode === 'draw' ? drawing : null,
      drawSid: mode === 'draw' ? drawSid : undefined,
      drawCollab: mode === 'draw' ? drawCollab : false,
      timed,
    };
    const ok = await flyAway(sheet, snapshot, () => {
      // Gönderilen yıldızdan sonra taslaklar silinir
      store.del(draftKey);
      store.del(captionDraftKey);
      saveDrawingDraft(null);
    });
    if (!ok) {
      handingOff = false;
      send.innerHTML = origHtml;
      valid();
    }
  });
}

function staggerChildren(row: HTMLElement) {
  [...row.children].forEach((el, i) =>
    (el as HTMLElement).animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
      duration: 300,
      delay: i * 50,
      fill: 'backwards',
    })
  );
}

/** Şifreleme ve yüklemeyi tamamla; BAŞARILIysa kartı yıldıza dönüştürüp göğe gönder (hata olursa kaydı SİLME, kart açık kalsın). */
async function flyAway(sheet: Sheet, draft: ComposeDraft, onClearDraft: () => void): Promise<boolean> {
  const app = core.homeEl.parentElement!;
  const a = app.getBoundingClientRect();
  const r = sheet.el.getBoundingClientRect();
  const target = freeSpot();
  const P = Math.max(1, core.geom.panoW);
  const starX = mod(target.x + core.scrollX, P);
  const starY = target.y;
  const xPct = Math.max(0.05, Math.min(99.95, (starX / P) * 100));
  const yPct = Math.max(2, Math.min(96, ((starY - 70) / Math.max(1, core.horizonY - 130)) * 100));

  core.setMyLiveActivity('sending');

  // 0) Önce şifrele ve sunucuya yükle (yükleme gerçekten tamamlanmadan "gönderildi" animasyonu/bildirimi çıkmaz)
  let res:
    | { ok: true; queued: boolean; record: NonNullable<Star['raw']> | null; id: string }
    | { ok: false; error: unknown };
  try {
    const dbFrom = toDbWho(state.me);
    const dbKind: StarKind =
      draft.mode === 'text' ? 'note' : draft.mode === 'photo' ? 'photo' : draft.mode === 'voice' ? 'voice' : 'draw';
    let mediaBytes: Uint8Array<ArrayBuffer> | undefined;
    if (draft.mode === 'photo' && draft.photo) mediaBytes = draft.photo.bytes;
    else if (draft.mode === 'voice' && draft.voice) mediaBytes = draft.voice.bytes;
    else if (draft.mode === 'draw' && draft.drawing) mediaBytes = await core.encodeDrawing(draft.drawing);

    const deterministicId =
      draft.mode === 'draw' && draft.drawSid ? sessionToStarUuid(draft.drawSid) : undefined;
    if (deterministicId) {
      core.markDrawSessionLanded(deterministicId);
    }

    // HOTFIX 23: Yalnızca seçili sekmeye (draft.mode) ait alanlar şifreli yüke girer
    const payloadData =
      draft.mode === 'text'
        ? { text: draft.text.trim(), subkind: 'text' as const }
        : draft.mode === 'photo'
          ? {
              text: '',
              ...(draft.caption.trim() ? { caption: draft.caption.trim() } : {}),
              mime: draft.photo?.mime || 'image/jpeg',
              subkind: 'photo' as const,
            }
          : draft.mode === 'voice'
            ? {
                text: '',
                mime: draft.voice?.mime || 'audio/mp4',
                dur: draft.voice?.dur || 1,
                peaks: draft.voice?.peaks,
                subkind: 'voice' as const,
              }
            : {
                text: '',
                mime: 'application/gzip',
                subkind: 'draw' as const,
                ...(draft.drawCollab ? { collab: true } : {}),
              };

    const env = await prepareEncryptedStar({
      id: deterministicId,
      from: dbFrom,
      kind: dbKind,
      data: payloadData,
      pos: { x: xPct, y: yPct },
      mediaBytes,
      once: false,
      unlockAt: draft.timed ? new Date(draft.timed).toISOString() : null,
    });

    try {
      const uploaded = await uploadPreparedStar(env);
      res = { ok: true, queued: false, record: uploaded, id: uploaded.id };
    } catch (err) {
      if (err instanceof OfflineNetworkError || isOfflineLikeError(err)) {
        await enqueueEncryptedStar(env);
        core.onOutboxChange();
        res = { ok: true, queued: true, record: null, id: env.id };
      } else {
        res = { ok: false, error: err };
      }
    }
  } catch (err) {
    res = { ok: false, error: err };
  }

  core.setMyLiveActivity('idle');

  if (!res.ok) {
    const errMsg =
      draft.mode === 'voice'
        ? 'Ses gönderilemedi · tekrar dene'
        : draft.mode === 'draw'
          ? 'Çizim gönderilemedi · tekrar dene'
          : 'Gönderilemedi · tekrar dene';
    toast(errMsg, I.info(14), 3600);
    return false;
  }

  // 1) Yükleme tamamlandı: içerik solar, kart küçülerek ışık noktasına dönüşür
  const inner = [...sheet.el.children] as HTMLElement[];
  inner.forEach((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }));
  (document.activeElement as HTMLElement | null)?.blur();
  const cx = r.left - a.left + r.width / 2, cy = r.top - a.top + Math.min(r.height / 2, 200);
  const morph = h(`<div class="morph glass-strong" style="left:${r.left - a.left}px;top:${r.top - a.top}px;width:${r.width}px;height:${r.height}px;border-radius:34px"></div>`);
  app.appendChild(morph);
  sheet.el.style.visibility = 'hidden';
  void sheet.close(true);
  const dur = reduced() ? 150 : 420;
  morph.animate(
    [
      { transform: 'none', opacity: 1 },
      {
        transform: `translate(${cx - (r.left - a.left) - r.width / 2}px, ${cy - (r.top - a.top) - r.height / 2}px) scale(${26 / r.width}, ${26 / r.height})`,
        opacity: 0.9,
      },
    ],
    { duration: dur, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' }
  );
  await sleep(dur - 80);

  // 2) ışık noktası yay çizerek hedefe süzülür (12 ara kare, transform)
  const fly = h(`<div class="flystar" style="left:${cx}px;top:${cy}px"></div>`);
  app.appendChild(fly);
  morph.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => morph.remove());
  const dx = target.x - cx, dy = target.y - cy;
  const ctrl = { x: dx * 0.5, y: Math.min(dy, 0) - 90 };
  const kf: Keyframe[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    const x = 2 * u * t * ctrl.x + t * t * dx, y = 2 * u * t * ctrl.y + t * t * dy;
    kf.push({ transform: `translate(${x}px,${y}px) scale(${1 - 0.35 * t})` });
  }
  core.engine.busy(2400);
  const me = PEOPLE[state.me];
  island({ avatar: I.starFill(18), color: me.color, title: 'Yıldızın yolda', sub: `${PEOPLE[state.partner].of} gökyüzüne`, loader: 'ring', ms: 2600 });
  await fly.animate(kf, { duration: reduced() ? 200 : 820, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' }).finished;
  fly.remove();

  onClearDraft();
  const existingRecords = state.stars.map((s) => s.raw).filter(Boolean) as NonNullable<Star['raw']>[];
  const hazel =
    !draft.timed &&
    state.me === 'beto' &&
    res.record !== null &&
    isStarHazel(res.record, [...existingRecords, res.record]);

  const star: Star = {
    id: res.id,
    from: state.me,
    kind: draft.mode,
    ...(draft.mode === 'text' ? { text: draft.text.trim() } : {}),
    ...(draft.mode === 'photo' ? { photo: draft.photo?.preview, caption: draft.caption.trim() || undefined } : {}),
    ...(draft.mode === 'voice'
      ? { voiceUrl: draft.voice?.previewUrl, voiceSec: draft.voice?.dur, voicePeaks: draft.voice?.peaks }
      : {}),
    ...(draft.mode === 'draw'
      ? { draw: draft.drawing ?? undefined, ...(draft.drawCollab ? { collab: true } : {}) }
      : {}),
    createdAt: res.record ? Date.parse(res.record.createdAt) : Date.now(),
    unlockAt: draft.timed ?? undefined,
    opened: false,
    x: starX,
    y: starY,
    hazel,
    visible: false,
    raw: res.record ?? undefined,
  };

  if (!state.stars.some((s) => s.id === star.id)) {
    state.stars.push(star);
  }
  recordDailyStarSent(star.createdAt);
  core.fx.land(target, {
    now: performance.now(),
    tint: PEOPLE[state.me].color,
    onSettle: () => {
      star.visible = true;
      star.arrivedAt = performance.now();
    },
  });
  core.refreshHome();

  setTimeout(() => {
    if (res.queued) {
      island({
        avatar: I.cloud(18),
        color: me.color,
        title: 'Giden kutusunda',
        sub: 'Bağlantı gelince otomatik gidecek',
        ms: 3400,
      });
    } else {
      island({
        avatar: star.unlockAt ? I.lock(18) : I.starFill(18),
        color: me.color,
        title: star.unlockAt ? 'Zamanlı yıldız bırakıldı' : `${PEOPLE[state.partner].of} gökyüzünde`,
        sub: star.unlockAt ? `${fmtDate(star.unlockAt)} açılacak` : `${PEOPLE[state.partner].name} haber alacak`,
        ms: 3200,
      });
    }
  }, 500);
  return true;
}

export function freeSpot() {
  const W = core.W;
  const curSky = core.engine?.sky.current;
  const moonP = curSky && curSky.moonAlpha > 0.01 ? skyToScreen(core.geom, curSky.moonDisp, curSky.moonVaz, core.scrollX) : null;
  const sunP = curSky && curSky.sunAlpha > 0.01 ? skyToScreen(core.geom, curSky.sunDisp, curSky.sunVaz, core.scrollX) : null;
  for (let k = 0; k < 60; k++) {
    const x = 40 + Math.random() * (W - 80);
    const y = 180 + Math.random() * Math.max(80, core.horizonY - 310);
    if (moonP && Math.hypot(moonP.x - x, moonP.y - y) < 48) continue;
    if (sunP && Math.hypot(sunP.x - x, sunP.y - y) < 36) continue;
    const ok = state.stars.every((s) => {
      const sp = core.starScreenPos(s);
      return Math.hypot(sp.x - x, sp.y - y) > 42;
    });
    if (ok) return { x, y };
  }
  const fbX = moonP && Math.abs(moonP.x - W / 2) < 52 ? (moonP.x < W / 2 ? W * 0.72 : W * 0.28) : W / 2;
  return { x: fbX, y: Math.min(280, core.horizonY - 120) };
}

/** HOTFIX 20 — 3 durumlu gerçek ses kaydı: bekleme → kaydediyor (canlı 30 çubuk, 60 sn) → kaydedildi (▶ önizleme dinle + mikrofonla yeniden kaydet). */
function voiceUI(
  onDone: (rec: RecordedVoice | null) => void,
  existing: RecordedVoice | null,
  setActive: (r: VoiceRecorder | null) => void,
  registerStopPreview: (fn: (() => void) | null) => void
) {
  const v = h(`<div class="rec">
    <div class="wave" aria-hidden="true">${Array.from({ length: 30 }, () => '<i></i>').join('')}</div>
    <div class="timer" data-t>${existing ? fmtSec(existing.dur) : '0:00'}</div>
    <div style="display:flex;align-items:center;gap:14px">
      <button type="button" class="rec-btn" data-main aria-label="${existing ? 'Kaydı dinle' : 'Kaydı başlat'}">${existing ? I.play(26) : I.mic(28)}</button>
      <button type="button" class="chip ${existing ? '' : 'hide'}" data-rerec aria-label="Yeniden kaydet">${I.mic(16)}<span>Yeniden kaydet</span></button>
    </div>
    <div class="small" data-h>${existing ? 'Dinlemek için ▶ · yeniden kaydetmek için mikrofon' : 'Kaydetmek için dokun · en fazla 60 sn'}</div></div>`);

  const bars = $$('.wave i', v);
  const mainBtn = $<HTMLButtonElement>('[data-main]', v);
  const rerecBtn = $<HTMLButtonElement>('[data-rerec]', v);
  const timeEl = $('[data-t]', v);
  const hintEl = $('[data-h]', v);

  let curRec: RecordedVoice | null = existing;
  let recording = false;
  let playing = false;
  let raf = 0;
  let recorder: VoiceRecorder | null = null;
  let previewAudio: HTMLAudioElement | null = null;

  const paintPeaks = (peaks: number[], progress = 0) => {
    bars.forEach((b, i) => {
      const pk = peaks[i % peaks.length] ?? 0.35;
      b.style.transform = `scaleY(${(0.2 + pk * 0.8).toFixed(2)})`;
      b.style.opacity = progress > 0 && i / bars.length <= progress ? '1' : '';
    });
  };

  if (curRec) {
    paintPeaks(curRec.peaks);
  }

  const stopPreview = () => {
    playing = false;
    cancelAnimationFrame(raf);
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    }
    if (curRec && !recording) {
      mainBtn.innerHTML = I.play(26);
      mainBtn.setAttribute('aria-label', 'Kaydı dinle');
      timeEl.textContent = fmtSec(curRec.dur);
      paintPeaks(curRec.peaks, 0);
    }
  };
  registerStopPreview(stopPreview);

  const startRecordingFromGesture = async () => {
    stopPreview();
    try {
      recorder = new VoiceRecorder();
      await recorder.start();
      setActive(recorder);
      core.setMyLiveActivity('voice');
    } catch (err) {
      recorder?.cleanup();
      recorder = null;
      setActive(null);
      toast(err instanceof Error ? err.message : 'Mikrofon izni verilmedi', I.mic(14), 3800);
      return;
    }
    recording = true;
    rerecBtn.classList.add('hide');
    mainBtn.classList.add('on');
    mainBtn.innerHTML = I.pause(26);
    mainBtn.setAttribute('aria-label', 'Kaydı durdur');
    hintEl.textContent = 'Durdurmak için dokun';

    const step = () => {
      if (!recording || !recorder || document.hidden) return;
      const s = recorder.elapsedSec();
      timeEl.textContent = fmtSec(s);
      const lv = recorder.readBars(bars.length);
      bars.forEach((b, i) => {
        b.style.transform = `scaleY(${lv[i].toFixed(2)})`;
        b.style.opacity = '';
      });
      core.setMyLiveActivity('voice');
      if (s < 60) raf = requestAnimationFrame(step);
      else void finishRecording();
    };
    raf = requestAnimationFrame(step);
  };

  const finishRecording = async () => {
    if (!recording) return;
    recording = false;
    cancelAnimationFrame(raf);
    mainBtn.classList.remove('on');
    if (!recorder) return;
    try {
      const rec = await recorder.stop();
      setActive(null);
      recorder = null;
      curRec = rec;
      previewAudio = null;
      mainBtn.innerHTML = I.play(26);
      mainBtn.setAttribute('aria-label', 'Kaydı dinle');
      rerecBtn.classList.remove('hide');
      timeEl.textContent = fmtSec(rec.dur);
      hintEl.textContent = 'Dinlemek için ▶ · yeniden kaydetmek için mikrofon';
      paintPeaks(rec.peaks, 0);
      onDone(rec);
    } catch (err) {
      setActive(null);
      recorder = null;
      mainBtn.innerHTML = curRec ? I.play(26) : I.mic(28);
      if (curRec) rerecBtn.classList.remove('hide');
      hintEl.textContent = curRec
        ? 'Dinlemek için ▶ · yeniden kaydetmek için mikrofon'
        : 'Kaydetmek için dokun · en fazla 60 sn';
      toast(err instanceof Error ? err.message : 'Ses alınamadı, tekrar dene', I.info(14), 3400);
    }
  };

  const togglePreviewFromGesture = async () => {
    if (!curRec) return;
    if (playing) {
      stopPreview();
      return;
    }
    if (!previewAudio) {
      const url = curRec.previewUrl || URL.createObjectURL(new Blob([curRec.bytes], { type: curRec.mime || 'audio/mp4' }));
      previewAudio = new Audio(url);
      previewAudio.preload = 'auto';
    }
    previewAudio.onended = () => stopPreview();
    try {
      playing = true;
      mainBtn.innerHTML = I.pause(26);
      await previewAudio.play();
    } catch {
      stopPreview();
      toast('Önizleme oynatılamadı · tekrar dokun', I.info(14), 2800);
      return;
    }
    const total = curRec.dur || 1;
    const stepPlay = () => {
      if (!playing || !previewAudio || !v.isConnected) return;
      const cur = previewAudio.currentTime || 0;
      const dur = Number.isFinite(previewAudio.duration) && previewAudio.duration > 0 ? previewAudio.duration : total;
      const f = Math.min(1, cur / Math.max(0.3, dur));
      if (curRec) paintPeaks(curRec.peaks, f);
      timeEl.textContent = fmtSec(cur);
      if (!previewAudio.paused && f < 1) raf = requestAnimationFrame(stepPlay);
    };
    raf = requestAnimationFrame(stepPlay);
  };

  mainBtn.addEventListener('click', () => {
    if (recording) {
      void finishRecording();
    } else if (curRec) {
      void togglePreviewFromGesture();
    } else {
      void startRecordingFromGesture();
    }
  });

  rerecBtn.addEventListener('click', () => {
    if (recording) return;
    void startRecordingFromGesture();
  });

  return v;
}

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
