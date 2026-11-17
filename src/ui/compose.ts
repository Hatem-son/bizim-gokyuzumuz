// Yazma kartı: Yazı / Fotoğraf / Ses / Çizim + Zamanlı. Gönderince kart yıldıza dönüşüp göğe süzülür.
// Gönderim (AES-GCM şifreleme + Supabase yükleme) animasyonla EŞZAMANLI yürür; hata olursa taslak korunarak kart geri açılır.
import { h, $, $$, openSheet, segment, sleep, reduced, Sheet, island, toast } from './ui';
import { raspberry } from './art';
import { I, SIGN } from './icons';
import { state, PEOPLE, Star, Kind, fmtDate, toDbWho } from './state';
import { core } from './core';
import { CELESTIAL_PARALLAX, skyToScreen } from '../gokyuzu/skyGeom';
import { compressImage, CompressedPhoto, VoiceRecorder, RecordedVoice } from '../lib/media';
import {
  prepareEncryptedStar,
  uploadPreparedStar,
  OfflineNetworkError,
  isOfflineLikeError,
  getServerNowMs,
} from '../lib/stars';
import { enqueueEncryptedStar } from '../lib/outbox';
import { isStarHazel } from '../lib/hazel';
import { STORAGE_KEYS, store } from '../lib/storage';
import type { StarKind } from '../types';

const QUICK = ['Seni özledim', 'Günaydın', 'İyi geceler', 'Aklımdasın', 'Seni seviyorum', '9 Ocak yakında'];

export type ComposeDraft = {
  mode: Kind;
  text: string;
  caption: string;
  photo: CompressedPhoto | null;
  voice: RecordedVoice | null;
  drawing: unknown[] | null;
  timed: number | null;
};

export function openCompose(initial: Kind = 'text', restored?: ComposeDraft) {
  const p = PEOPLE[state.partner];
  const draftKey = `${STORAGE_KEYS.draftPrefix}${toDbWho(state.me)}`;
  let mode: Kind = restored?.mode ?? initial;
  let savedText = restored?.text ?? store.get<string>(draftKey, '');
  let savedCaption = restored?.caption ?? '';
  let photo: CompressedPhoto | null = restored?.photo ?? null;
  let voice: RecordedVoice | null = restored?.voice ?? null;
  let drawing: unknown[] | null = restored?.drawing ?? null;
  let timed: number | null = restored?.timed ?? null;
  let activeRecorder: VoiceRecorder | null = null;
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
      <button type="button" class="btn btn-primary send" data-send disabled>${I.star(17)}<span>Gökyüzüne bırak</span></button>
    </div>
    <div class="lockline small">${I.lock(14)}<span>Bu yıldızı sadece ${p.name} açabilir. Gönderdikten sonra sen de okuyamazsın.</span></div>
  </div>`);

  const sheet: Sheet = openSheet(c, {
    cls: 'compose-sheet',
    onClose: () => {
      activeRecorder?.cleanup();
      activeRecorder = null;
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
    send.disabled = !ok;
  };

  function render() {
    body.innerHTML = '';
    body.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    if (mode === 'text') {
      const v = h(`<div>
        <div class="quick" data-nodrag>${QUICK.map((q) => `<button type="button" class="chip">${q}</button>`).join('')}</div>
        <textarea class="write" maxlength="600" placeholder="${p.name}, aklımdan…" enterkeyhint="done" autocapitalize="sentences"></textarea>
        <div class="small" style="text-align:right" data-cnt>0 / 600</div></div>`);
      const ta = $<HTMLTextAreaElement>('textarea', v);
      ta.value = savedText;
      $('[data-cnt]', v).textContent = `${ta.value.length} / 600`;
      $$('.quick .chip', v).forEach((b) =>
        b.addEventListener('click', () => {
          const phrase = b.textContent || '';
          ta.value = (ta.value ? ta.value.trimEnd() + ' ' : '') + phrase + (phrase.endsWith('.') ? '' : '.');
          ta.dispatchEvent(new Event('input'));
          b.animate([{ transform: 'scale(.92)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
        })
      );
      ta.addEventListener('input', () => {
        savedText = ta.value;
        store.set(draftKey, savedText);
        $('[data-cnt]', v).textContent = `${ta.value.length} / 600`;
        if (ta.value.trim()) core.setMyLiveActivity('writing');
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
            photo = await compressImage(f);
            render();
          } catch {
            toast('Fotoğraf okunamadı, başka bir kare seç', I.info(14));
          }
        });
        body.appendChild(v);
      } else {
        const v = h(`<div class="photo-prev">
          <figure class="polaroid"><img src="${photo.preview}" alt=""></figure>
          <div class="cap"><div class="field"><textarea rows="3" placeholder="Bir not ekle" maxlength="120" style="resize:none;padding:12px 14px;font:italic 500 18px/1.3 var(--serif)"></textarea></div>
          <button type="button" class="chip" style="margin-top:10px" data-change>${I.camera(15)}<span>Değiştir</span></button></div></div>`);
        const capTa = $<HTMLTextAreaElement>('textarea', v);
        capTa.value = savedCaption;
        capTa.addEventListener('input', () => { savedCaption = capTa.value; });
        $('[data-change]', v).addEventListener('click', () => { photo = null; render(); });
        body.appendChild(v);
      }
    } else if (mode === 'voice') {
      body.appendChild(
        voiceUI(
          (rec) => {
            voice = rec;
            valid();
          },
          voice,
          (r) => {
            activeRecorder = r;
          }
        )
      );
    } else {
      const v = h(`<button type="button" class="draw-tile press" style="width:100%"><canvas width="600" height="450"></canvas>
        <div class="lbl">${drawing?.length ? '' : `${I.pen(26)}<span class="body">Çizim tahtasını aç</span><span class="small">İstersen ${p.name} canlı izleyebilir</span>`}</div></button>`);
      if (drawing?.length) core.renderDrawingPreview($<HTMLCanvasElement>('canvas', v), drawing);
      v.addEventListener('click', async () => {
        const res = await core.openBoard(drawing);
        if (res) {
          drawing = res;
          render();
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
    send.disabled = true;
    handingOff = true;
    const snapshot: ComposeDraft = {
      mode,
      text: savedText,
      caption: savedCaption,
      photo,
      voice,
      drawing,
      timed,
    };
    await flyAway(sheet, snapshot, () => {
      store.del(draftKey);
    });
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

/** Kartı yıldıza dönüştürüp göğe gönder; şifreleme ve yükleme animasyonla EŞZAMANLI yürür. */
async function flyAway(sheet: Sheet, draft: ComposeDraft, onClearDraft: () => void) {
  const app = core.homeEl.parentElement!;
  const a = app.getBoundingClientRect();
  const r = sheet.el.getBoundingClientRect();
  const target = freeSpot();
  const starX = target.x + core.scrollX * CELESTIAL_PARALLAX;
  const starY = target.y;
  const panoSpan = Math.max(1, core.geom.panoW - 56);
  const xPct = Math.max(1, Math.min(99, ((starX - 28) / panoSpan) * 100));
  const yPct = Math.max(2, Math.min(96, ((starY - 70) / Math.max(1, core.horizonY - 130)) * 100));

  core.setMyLiveActivity('sending');

  // Şifreleme + yükleme görevini animasyonla eşzamanlı başlat
  const sendTask = (async () => {
    const dbFrom = toDbWho(state.me);
    const dbKind: StarKind =
      draft.mode === 'text' ? 'note' : draft.mode === 'photo' ? 'photo' : draft.mode === 'voice' ? 'voice' : 'draw';
    let mediaBytes: Uint8Array<ArrayBuffer> | undefined;
    if (draft.mode === 'photo' && draft.photo) mediaBytes = draft.photo.bytes;
    else if (draft.mode === 'voice' && draft.voice) mediaBytes = draft.voice.bytes;
    else if (draft.mode === 'draw' && draft.drawing) mediaBytes = await core.encodeDrawing(draft.drawing);

    const env = await prepareEncryptedStar({
      from: dbFrom,
      kind: dbKind,
      data: {
        text: draft.mode === 'text' ? draft.text.trim() : '',
        caption: draft.mode === 'photo' ? draft.caption.trim() || undefined : undefined,
        mime: draft.mode === 'photo' ? draft.photo?.mime : draft.mode === 'voice' ? draft.voice?.mime : 'application/gzip',
        dur: draft.mode === 'voice' ? draft.voice?.dur : undefined,
        peaks: draft.mode === 'voice' ? draft.voice?.peaks : undefined,
      },
      pos: { x: xPct, y: yPct },
      mediaBytes,
      once: false,
      unlockAt: draft.timed ? new Date(draft.timed).toISOString() : null,
    });

    try {
      const uploaded = await uploadPreparedStar(env);
      return { ok: true as const, queued: false, record: uploaded, id: uploaded.id };
    } catch (err) {
      if (err instanceof OfflineNetworkError || isOfflineLikeError(err)) {
        await enqueueEncryptedStar(env);
        core.onOutboxChange();
        return { ok: true as const, queued: true, record: null, id: env.id };
      }
      return { ok: false as const, error: err };
    }
  })();

  // 1) içerik solar, kart küçülerek ışık noktasına dönüşür (yalnızca transform ve opacity)
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

  const res = await sendTask;
  core.setMyLiveActivity('idle');

  if (!res.ok) {
    openCompose(draft.mode, draft);
    toast('Gönderilemedi, tekrar dene', I.info(14), 3400);
    return;
  }

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

/** Gerçek MediaRecorder ses kaydı arayüzü (dalga çubukları gerçek mikrofon seviyesinden transform: scaleY ile çizilir). */
function voiceUI(
  onDone: (rec: RecordedVoice) => void,
  existing: RecordedVoice | null,
  setActive: (r: VoiceRecorder | null) => void
) {
  const v = h(`<div class="rec">
    <div class="wave" aria-hidden="true">${Array.from({ length: 34 }, () => '<i></i>').join('')}</div>
    <div class="timer" data-t>${existing ? fmtSec(existing.dur) : '0:00'}</div>
    <button type="button" class="rec-btn" aria-label="Kaydı başlat">${I.mic(28)}</button>
    <div class="small" data-h>${existing ? 'Yeniden kaydetmek için dokun' : 'Kaydetmek için dokun · en fazla 60 sn'}</div></div>`);
  const bars = $$('.wave i', v);
  const btn = $<HTMLButtonElement>('.rec-btn', v);
  let on = false, raf = 0;
  let recorder: VoiceRecorder | null = null;

  if (existing) {
    bars.forEach((b, i) => {
      const pk = existing.peaks[i % existing.peaks.length] ?? 0.4;
      b.style.transform = `scaleY(${(0.2 + pk * 0.8).toFixed(2)})`;
    });
  }

  btn.addEventListener('click', async () => {
    if (!on) {
      try {
        recorder = new VoiceRecorder();
        await recorder.start();
        setActive(recorder);
        core.setMyLiveActivity('voice');
      } catch (err) {
        recorder?.cleanup();
        recorder = null;
        setActive(null);
        toast(err instanceof Error ? err.message : 'Mikrofon izni verilmedi', I.mic(14), 3200);
        return;
      }
      on = true;
      btn.classList.add('on');
      btn.innerHTML = I.pause(26);
      $('[data-h]', v).textContent = 'Durdurmak için dokun';
      const step = () => {
        if (!on || !recorder || document.hidden) return;
        const s = recorder.elapsedSec();
        $('[data-t]', v).textContent = fmtSec(s);
        const lv = recorder.readBars(bars.length);
        bars.forEach((b, i) => {
          b.style.transform = `scaleY(${lv[i].toFixed(2)})`;
        });
        if (s < 60) raf = requestAnimationFrame(step);
        else btn.click();
      };
      raf = requestAnimationFrame(step);
    } else {
      on = false;
      cancelAnimationFrame(raf);
      btn.classList.remove('on');
      btn.innerHTML = I.mic(28);
      if (recorder) {
        try {
          const rec = await recorder.stop();
          setActive(null);
          recorder = null;
          $('[data-t]', v).textContent = fmtSec(rec.dur);
          $('[data-h]', v).textContent = 'Kaydedildi · yeniden kaydetmek için dokun';
          onDone(rec);
        } catch {
          setActive(null);
          recorder = null;
          toast('Ses kaydı tamamlanamadı', I.info(14));
        }
      }
    }
  });
  return v;
}

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
