// Yıldız açma: zarf + mühür seremonisi, mektup türleri (yazı, polaroid fotoğraf, gerçek ses oynatıcı, çizim yeniden oynatma),
// kilitli yıldız geri sayımı ve kendi gönderdiğin yıldız görünümü.
import { h, $, $$, openSheet, popPage, toast, reduced } from './ui';
import { I } from './icons';
import { state, PEOPLE, Star, Who, fmtDate, untilParts, toDbWho } from './state';
import { core } from './core';
import { fmtSec } from './compose';
import { raspberry } from './art';
import {
  decryptStarPayload,
  downloadAndDecryptMedia,
  markStarOpened,
  getServerNowMs,
} from '../lib/stars';

/* ===================== mühür ve zarf ===================== */
let sealN = 0;
export function waxSeal(owner: Who, size = 58, mini = false) {
  const gid = `ws${owner}${++sealN}`;
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 26 + Math.sin(a * 7 + 1) * 1.1 + Math.sin(a * 13) * 0.7 + (i % 5 === 0 ? 1.2 : 0);
    pts.push(`${(29 + Math.cos(a) * r).toFixed(1)} ${(29 + Math.sin(a) * r).toFixed(1)}`);
  }
  const c = owner === 'beto' ? ['#f0457c', '#b81248', '#7e0a31'] : ['#5a71b8', '#2c3d7a', '#17204a'];
  const emb =
    owner === 'beto'
      ? raspberry(20, true)
      : `<svg width="22" height="22" viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4A7 7 0 0 1 15.5 3.5Z"/><path fill="currentColor" d="M18 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z"/></svg>`;
  const st = mini
    ? `position:relative;left:auto;top:auto;margin:0;width:${size}px;height:${size}px`
    : `width:${size}px;height:${size}px;margin-left:${-size / 2}px`;
  return `<div class="seal" style="${st}">
    <svg class="wax" viewBox="0 0 58 58" width="${size}" height="${size}"><defs><radialGradient id="${gid}" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient></defs>
      <path d="M${pts.join(' L')} Z" fill="url(#${gid})"/><circle cx="29" cy="29" r="18.5" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1.6"/><circle cx="29" cy="29" r="18.5" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".7" transform="translate(-.6 -.6)"/>
      <ellipse cx="21" cy="17" rx="7" ry="3.5" fill="rgba(255,255,255,.22)" transform="rotate(-30 21 17)"/></svg>
    <span class="emb" style="transform:scale(${size / 58})">${emb}</span></div>`;
}

function envelope(owner: Who) {
  return `<div class="env ${owner}" aria-hidden="true">
    <svg class="back" viewBox="0 0 300 220" preserveAspectRatio="none"><rect width="300" height="220" rx="14" fill="var(--env-2)"/></svg>
    <svg class="front" viewBox="0 0 300 220" preserveAspectRatio="none"><path d="M0 76 L150 150 L300 76 V206 Q300 220 286 220 H14 Q0 220 0 206 Z" fill="var(--env)"/><path d="M0 76 L150 150 L300 76" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="1.2"/></svg>
    <svg class="flap" viewBox="0 0 300 130" preserveAspectRatio="none"><path d="M0 0 H300 L156 124 Q150 129 144 124 Z" fill="var(--env-3)"/><path d="M0 0 L144 124 Q150 129 156 124 L300 0" fill="none" stroke="rgba(0,0,0,.07)"/></svg>
  </div>`;
}

async function ensureDecrypted(st: Star): Promise<'ok' | 'locked' | 'network'> {
  if (!st.raw) return 'ok';
  const alreadyLoaded =
    (st.kind === 'text' && st.text !== undefined) ||
    (st.kind === 'photo' && st.photo !== undefined) ||
    (st.kind === 'voice' && st.voiceUrl !== undefined) ||
    (st.kind === 'draw' && st.draw !== undefined);
  if (alreadyLoaded) return 'ok';

  try {
    const payload = await decryptStarPayload(st.raw, toDbWho(state.me));
    st.text = payload.text || (st.raw.kind === 'miss' ? 'Seni düşündüm.' : '');
    st.caption = payload.caption;
    if (payload.dur) st.voiceSec = payload.dur;
    if (payload.peaks) st.voicePeaks = payload.peaks;

    if (st.raw.hasMedia) {
      const bytes = await downloadAndDecryptMedia(st.raw, toDbWho(state.me));
      if (bytes) {
        if (st.kind === 'photo') {
          st.photo = URL.createObjectURL(new Blob([bytes], { type: payload.mime || 'image/jpeg' }));
        } else if (st.kind === 'voice') {
          st.voiceUrl = URL.createObjectURL(new Blob([bytes], { type: payload.mime || 'audio/mp4' }));
        } else if (st.kind === 'draw') {
          st.draw = await core.decodeDrawing(bytes);
        }
      }
    }
    return 'ok';
  } catch (err) {
    if (err instanceof Error && err.message === 'NETWORK') return 'network';
    return 'locked';
  }
}

/* ===================== yıldız açma ===================== */
export async function openStar(st: Star, onOpened?: () => void) {
  const fromP = PEOPLE[st.from];
  const mine = st.from === state.me;
  const locked = Boolean(st.unlockAt && st.unlockAt > getServerNowMs());
  let cleanupTimer = () => {};
  let activeAudio: HTMLAudioElement | null = null;
  let content: HTMLElement;

  if (mine) {
    content = h(`<div class="locked">
      <div class="lk" style="color:${PEOPLE[state.me].color}">${I.starFill(26)}</div>
      <div class="h2">Bu yıldızı sen bıraktın</div>
      <p class="body" style="margin:8px 0 0">${fmtDate(st.createdAt)}<br>${locked ? `${fmtDate(st.unlockAt!)} tarihinde açılacak` : st.opened ? `${PEOPLE[state.partner].name} açtı` : `${PEOPLE[state.partner].name} henüz açmadı`}</p>
      <p class="small" style="margin:14px 0 0">İçeriğini yalnızca ${PEOPLE[state.partner].name} görebilir.</p>
      <div class="view-actions"><button type="button" class="btn btn-soft" data-x>Tamam</button></div></div>`);
  } else if (locked) {
    content = h(`<div class="locked">
      <div class="lk">${I.lock(26)}</div>
      <div class="h2">${fromP.from} zamanlı bir yıldız</div>
      <p class="body" style="margin:8px 0 0">${fmtDate(st.unlockAt!)} tarihinde açılacak</p>
      <div class="cd" data-cd></div>
      <p class="small">Açılınca haber vereceğiz.</p>
      <div class="view-actions"><button type="button" class="btn btn-soft" data-x>Tamam</button></div></div>`);
    const cd = $('[data-cd]', content);
    const tick = (initial = false) => {
      if (document.hidden || (!initial && !content.isConnected)) return;
      const p = untilParts(st.unlockAt!);
      cd.innerHTML = (
        [
          ['gün', p.d],
          ['saat', p.h],
          ['dk', p.m],
          ['sn', p.s],
        ] as const
      )
        .map(([l, v]) => `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`)
        .join('');
    };
    tick(true);
    const iv = window.setInterval(() => tick(false), 1000);
    cleanupTimer = () => clearInterval(iv);
  } else {
    const status = await ensureDecrypted(st);
    if (status === 'network') {
      toast('Bağlantı yok · yıldızı açmak için internet gerekli', I.cloud(14), 3200);
      return;
    }
    if (status === 'locked') {
      toast('Bu yıldız henüz kilitli', I.lock(14), 2600);
      return;
    }

    const peaks = st.voicePeaks?.length
      ? st.voicePeaks
      : Array.from({ length: 30 }, (_, i) => +(0.25 + 0.65 * Math.abs(Math.sin(i * 1.3))).toFixed(2));
    const body =
      st.kind === 'text'
        ? `<div class="text">${esc(st.text ?? '')}</div>`
        : st.kind === 'photo'
          ? `<figure class="polaroid">${st.photo ? `<img src="${st.photo}" alt="">` : `<div class="ph" style="background:linear-gradient(160deg,#f6c8a8,#c98fb0 45%,#4b4f86)"></div>`}<figcaption>${esc(st.caption ?? '')}</figcaption></figure>`
          : st.kind === 'voice'
            ? `<div class="player"><button type="button" class="pbtn" aria-label="Oynat">${I.play(18)}</button><div class="wave grow">${peaks.map((pk) => `<i style="transform:scaleY(${(0.2 + pk * 0.8).toFixed(2)})"></i>`).join('')}</div><span class="num" style="font:500 13px var(--sans);color:var(--paper-ink-2)" data-vtime>${fmtSec(st.voiceSec ?? 10)}</span></div>`
            : `<div class="draw-view"><canvas></canvas></div><div class="row-flex" style="justify-content:center;margin-top:10px"><button type="button" class="chip" data-replay style="color:var(--paper-ink);border-color:rgba(28,31,54,.2)">${I.play(14)}<span>Yeniden oynat</span></button></div>`;

    const sealed = !st.opened;
    content = h(`<div class="env-wrap">
      ${sealed ? envelope(st.from) : ''}
      <article class="letter from-${st.from}">
        ${sealed ? '' : `<div class="mini-seal" style="position:absolute;right:16px;top:14px;width:34px;height:34px">${waxSeal(st.from, 34, true)}</div>`}
        <div class="row-flex"><div class="from">${fromP.from}</div><span class="grow"></span>${st.hazel ? `<span class="meta" style="color:#a07a3c;margin-right:40px">ela yıldız</span>` : ''}</div>
        <div class="meta" style="margin-top:8px">${fmtDate(st.createdAt)}</div>
        ${body}
      </article>
      <div class="view-actions">
        <button type="button" class="btn btn-soft react" data-react>${I.heart(18)}<span>Kalp bırak</span></button>
        <button type="button" class="btn btn-soft" data-show>${I.star(17)}<span>Gökyüzünde</span></button>
      </div></div>`);

    if (st.kind === 'draw') {
      const cv = $<HTMLCanvasElement>('canvas', content);
      const strokes = Array.isArray(st.draw) ? st.draw : [];
      const play = () => {
        if (!strokes.length) return;
        const allPts = strokes.flatMap((s: any) => (Array.isArray(s.p) ? s.p.map((q: any) => q[2] as number) : []));
        const total = Math.max(100, ...allPts);
        const k = total > 15000 ? total / 15000 : 1; // en fazla 15 sn
        const t0 = performance.now();
        const step = () => {
          if (!content.isConnected || document.hidden) return;
          const t = (performance.now() - t0) * k;
          core.renderDrawingPreview(cv, strokes, t);
          if (t < total) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      requestAnimationFrame(() => (st.opened ? core.renderDrawingPreview(cv, strokes) : play()));
      $('[data-replay]', content).addEventListener('click', play);
    }

    if (st.kind === 'voice') {
      const btn = $('.pbtn', content);
      const bars = $$('.wave i', content);
      const vtime = $('[data-vtime]', content);
      let playing = false, raf = 0, t0 = 0;

      if (st.voiceUrl) {
        activeAudio = new Audio(st.voiceUrl);
        activeAudio.preload = 'auto';
      }

      const stopVoice = () => {
        playing = false;
        cancelAnimationFrame(raf);
        btn.innerHTML = I.play(18);
        if (activeAudio) {
          activeAudio.pause();
          activeAudio.currentTime = 0;
        }
        vtime.textContent = fmtSec(st.voiceSec ?? 10);
      };

      btn.addEventListener('click', async () => {
        if (playing) {
          stopVoice();
          return;
        }
        playing = true;
        btn.innerHTML = I.pause(18);
        t0 = performance.now();
        if (activeAudio) {
          activeAudio.onended = stopVoice;
          try {
            await activeAudio.play();
          } catch {
            // Tarayıcı oynatma engeli olursa görsel ilerlemeye düş
          }
        }
        const totalSec = st.voiceSec || activeAudio?.duration || 10;
        const step = () => {
          if (!playing || !content.isConnected) return;
          const curSec = activeAudio && !activeAudio.paused ? activeAudio.currentTime : (performance.now() - t0) / 1000;
          const durSec = activeAudio && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0 ? activeAudio.duration : totalSec;
          const f = Math.min(1, curSec / Math.max(0.5, durSec));
          bars.forEach((b, i) => b.classList.toggle('done', i / bars.length <= f));
          vtime.textContent = fmtSec(Math.max(0, durSec - curSec));
          if (f < 1) raf = requestAnimationFrame(step);
          else stopVoice();
        };
        raf = requestAnimationFrame(step);
      });
    }

    $('[data-react]', content).addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLElement;
      const on = b.classList.toggle('on');
      b.innerHTML = `${on ? I.heartFill(18) : I.heart(18)}<span>${on ? 'Kalp bıraktın' : 'Kalp bırak'}</span>`;
      if (on) {
        b.firstElementChild!.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
          duration: 420,
          easing: 'cubic-bezier(.3,1.4,.5,1)',
        });
        core.onSendHeart();
      }
    });
  }

  const sheet = openSheet(content, {
    cls: 'star-sheet',
    onClose: () => {
      cleanupTimer();
      if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
      }
    },
  });

  const letter = content.querySelector('.letter') as HTMLElement | null;
  const env = content.querySelector('.env') as HTMLElement | null;
  if (letter && env) void openEnvelope(content, env, letter, st.from);
  else if (letter && !reduced()) {
    letter.animate(
      [{ transform: 'translateY(24px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 560, delay: 120, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'backwards' }
    );
  }
  content.querySelector('[data-x]')?.addEventListener('click', () => void sheet.close());
  content.querySelector('[data-show]')?.addEventListener('click', async () => {
    await sheet.close();
    while (document.querySelector('.page')) await popPage(core.homeEl);
    core.scrollToStar(st, 700);
  });

  if (!mine && !locked && !st.opened) {
    st.opened = true;
    if (st.raw) {
      const openedAt = await markStarOpened(st.raw);
      st.raw.openedAt = openedAt;
    }
    core.refreshHome();
    onOpened?.();
  }
}

/** Zarf açılışı: mühür kırılır (320+420 ms) → kapak kalkar (560 ms) → mektup yükselir (700 ms) → zarf süzülür (520 ms).
 *  Yalnızca transform ve opacity kullanılır; zarfın ön cebi mektubun altını doğal olarak maskeler. */
async function openEnvelope(wrap: HTMLElement, env: HTMLElement, letter: HTMLElement, owner: Who) {
  const actions = wrap.querySelector('.view-actions') as HTMLElement | null;
  const E = 'cubic-bezier(.22,.8,.24,1)';
  wrap.insertAdjacentHTML('beforeend', waxSeal(owner));
  const seal = wrap.querySelector(':scope > .seal') as HTMLElement;
  const front = env.querySelector('.front') as HTMLElement, flap = env.querySelector('.flap') as HTMLElement;
  const envH = Math.max(220, letter.offsetHeight + 24);
  env.style.height = `${envH}px`;
  env.querySelectorAll<SVGElement>('svg.back, svg.front').forEach((s) => (s.style.height = `${envH}px`));
  seal.style.top = `${Math.round(envH * 0.44)}px`;
  wrap.style.minHeight = `${envH}px`;
  letter.style.opacity = '0';
  if (actions) actions.style.opacity = '0';
  const short = reduced();
  await new Promise((r) => setTimeout(r, short ? 50 : 520));
  await seal.animate([{ transform: 'scale(1)' }, { transform: 'scale(.9)' }, { transform: 'scale(1.06)' }], { duration: short ? 60 : 320, easing: 'ease-out', fill: 'forwards' }).finished;
  seal.animate([{ transform: 'scale(1.06) rotate(0)', opacity: 1 }, { transform: 'translateY(40px) scale(.7) rotate(-35deg)', opacity: 0 }], { duration: short ? 60 : 420, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }).finished.then(() => seal.remove());
  await flap.animate([{ transform: 'perspective(700px) rotateX(0)' }, { transform: 'perspective(700px) rotateX(178deg)' }], { duration: short ? 80 : 560, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
  flap.style.zIndex = '0';
  letter.style.opacity = '1';
  letter.style.zIndex = '2';
  front.style.zIndex = '3';
  await letter.animate([{ transform: 'translateY(18px) scale(.92)' }, { transform: 'translateY(-26px) scale(.98)' }], { duration: short ? 80 : 700, easing: E, fill: 'forwards' }).finished;
  env.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(240px)', opacity: 0 }], { duration: short ? 60 : 520, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }).finished.then(() => env.remove());
  await letter.animate([{ transform: 'translateY(-26px) scale(.98)' }, { transform: 'none' }], { duration: short ? 60 : 520, easing: 'cubic-bezier(.3,1.25,.5,1)', fill: 'forwards' }).finished;
  letter.getAnimations().forEach((a) => a.cancel());
  letter.insertAdjacentHTML('afterbegin', `<div class="mini-seal" style="position:absolute;right:16px;top:14px;width:34px;height:34px">${waxSeal(owner, 34, true)}</div>`);
  (letter.querySelector('.mini-seal') as HTMLElement).animate([{ opacity: 0, transform: 'scale(1.4)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,1.3,.5,1)' });
  if (actions) actions.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, fill: 'forwards' });
}

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

import { pushPage, segment, confirmSheet, stagger } from './ui';
import { fmtMonth, fmtUntil, saveSettings } from './state';
import { lilyBloom } from './lily';
import { APP_VERSION } from '../config';
import { openDiagnostics } from './diagnostics';
import { askGeo, searchCity, chooseCity, CLEAR } from '../gokyuzu/weather';
import { subscribePushNotifications } from '../lib/push';
import { enrollBiometric, hasBiometric } from '../lib/lock';

/* ===================== arşiv ===================== */
export function openArchive() {
  let filter = 0;
  const page = h(`<div class="page" role="dialog" aria-label="Yıldızlarımız">
    <div class="page-head"><button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button></div>
    <div class="page-body" data-scroll>
      <div class="title" style="font-size:38px;margin:2px 4px 14px;display:flex;align-items:center;gap:8px">Yıldızlarımız ${lilyBloom(28, 12)}</div>
      <div class="stats" data-stats></div>
      <div data-seg></div>
      <div data-list style="margin-top:10px"></div>
    </div></div>`);

  const renderStats = () => {
    const total = state.stars.length;
    const first = total ? Math.min(...state.stars.map((s) => s.createdAt)) : 0;
    const mine = state.stars.filter((s) => s.from === state.me).length;
    const firstStr = first ? new Date(first).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '—';
    $('[data-stats]', page).innerHTML = `<div><b class="num">${total}</b><span class="small">yıldız</span></div>
      <div><b class="num">${total - mine}</b><span class="small">${PEOPLE[state.partner].from}</span></div>
      <div><b class="num">${mine}</b><span class="small">senden</span></div>
      <div style="margin-left:auto;text-align:right"><span class="small">ilk yıldız</span><div style="font:italic 600 18px var(--serif);margin-top:4px">${firstStr}</div></div>`;
  };
  renderStats();

  $('[data-seg]', page).appendChild(
    segment(['Hepsi', 'Gelen', 'Giden', 'Kilitli'], 0, (i) => {
      filter = i;
      list();
    })
  );
  const listEl = $('[data-list]', page);

  const list = () => {
    const now = getServerNowMs();
    const items = state.stars
      .filter(
        (s) =>
          filter === 0 ||
          (filter === 1 && s.from !== state.me) ||
          (filter === 2 && s.from === state.me) ||
          (filter === 3 && Boolean(s.unlockAt && s.unlockAt > now))
      )
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!items.length) {
      listEl.innerHTML = `<div class="empty"><div style="color:var(--text-3);display:inline-block">${I.star(34)}</div><div class="h2" style="margin-top:12px">Burada henüz yıldız yok</div><p class="body">${filter === 3 ? 'Zamanlı bir yıldız bırakınca burada görünür.' : 'İlk yıldızı sen bırak.'}</p></div>`;
      return;
    }

    let month = '';
    listEl.innerHTML = '';
    for (const s of items) {
      const m = fmtMonth(s.createdAt);
      if (m !== month) {
        month = m;
        listEl.appendChild(h(`<div class="eyebrow group-title">${m}</div>`));
      }
      const locked = Boolean(s.unlockAt && s.unlockAt > now);
      const incoming = s.from !== state.me;
      const t1 = locked
        ? `${fmtUntil(s.unlockAt!)} sonra açılacak`
        : !incoming
          ? `${PEOPLE[state.partner].to} bıraktın`
          : !s.opened
            ? 'Açılmamış yıldız'
            : s.kind === 'text'
              ? s.text || 'Bir mektup'
              : s.kind === 'photo'
                ? s.caption || 'Bir fotoğraf'
                : s.kind === 'voice'
                  ? 'Bir ses kaydı'
                  : 'Bir çizim';
      const kIcon = locked ? I.lock(11) : { text: I.text(11), photo: I.camera(11), voice: I.mic(11), draw: I.pen(11) }[s.kind];
      const row = h(`<button type="button" class="arch-row press">
        <span class="ic" style="color:${PEOPLE[s.from].color}">${I.starFill(18)}<span class="k">${kIcon}</span></span>
        <span class="tx"><div class="t1">${esc(t1)}</div><div class="t2 small">${incoming ? PEOPLE[s.from].from : 'Senden'} · ${fmtDate(s.createdAt)}</div></span>
        ${incoming && !s.opened && !locked ? '<span class="new" aria-label="Yeni"></span>' : ''}</button>`);

      if (incoming && s.opened && !locked && s.kind === 'text' && s.text === undefined && s.raw) {
        void decryptStarPayload(s.raw, toDbWho(state.me))
          .then((pl) => {
            s.text = pl.text || 'Seni düşündüm.';
            const t1El = row.querySelector('.t1');
            if (t1El) t1El.textContent = s.text;
          })
          .catch(() => undefined);
      }

      row.addEventListener('click', () => {
        void openStar(s, () => {
          renderStats();
          list();
        });
      });
      listEl.appendChild(row);
    }
    stagger($$('.arch-row', listEl), { gap: 28, y: 8 });
  };
  list();
  $('[data-back]', page).addEventListener('click', () => void popPage(core.homeEl));
  pushPage(page, core.homeEl);
}

/* ===================== ayarlar ===================== */
export function openSettings() {
  const S = state.settings;
  const tg = (on: boolean) => `<span class="toggle ${on ? 'on' : ''}" role="switch" aria-checked="${on}"></span>`;
  const wxLabel = () => ({ off: 'Kapalı', geo: 'Konumum', city: S.city || 'Şehir' })[S.weather];
  const page = h(`<div class="page" role="dialog" aria-label="Ayarlar">
    <div class="page-head"><button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button></div>
    <div class="page-body" data-scroll>
      <div class="title" style="font-size:38px;margin:2px 4px 6px">Ayarlar</div>
      <div class="eyebrow group-title">Bildirimler ve giriş</div>
      <div class="group">
        <button type="button" class="set-row" data-notify><span class="si">${I.bell(17)}</span><span class="st">Yıldız düşünce haber ver</span>${tg(S.notify)}</button>
        <button type="button" class="set-row" data-faceid><span class="si">${I.face(17)}</span><span class="st">Face ID ile aç</span>${tg(S.faceId)}</button>
      </div>
      <div class="eyebrow group-title">Gökyüzü</div>
      <div class="group">
        <button type="button" class="set-row" data-wx><span class="si">${I.cloud(17)}</span><span class="st">Hava durumu</span><span class="sv"><span data-wxv>${wxLabel()}</span>${I.chevron(16)}</span></button>
        <button type="button" class="set-row" data-k="live"><span class="si">${I.star(17)}</span><span class="st">Canlı gösterge<div class="small" style="margin-top:3px">“${PEOPLE[state.partner].name} yıldız gönderiyor”</div></span>${tg(S.live)}</button>
        <button type="button" class="set-row" data-k="lightning"><span class="si">${I.bolt(17)}</span><span class="st">Şimşek efekti</span>${tg(S.lightning)}</button>
      </div>
      <div class="eyebrow group-title">Uygulama</div>
      <div class="group">
        <button type="button" class="set-row" data-guide><span class="si">${I.plusSq(17)}</span><span class="st">Ana ekrana ekle</span><span class="sv">${I.chevron(16)}</span></button>
        <button type="button" class="set-row" data-about><span class="si">${I.info(17)}</span><span class="st">Sürüm</span><span class="sv">v${APP_VERSION}</span></button>
      </div>
      <div class="group" style="margin-top:22px">
        <button type="button" class="set-row" data-out style="color:var(--danger)"><span class="si" style="color:var(--danger)">${I.logout(17)}</span><span class="st">Çıkış yap</span></button>
      </div>
      <p class="small center" style="margin-top:22px">Bütün yıldızlarınız cihazda şifrelenir. Sunucu içeriği göremez.</p>
    </div></div>`);

  const syncToggle = (btn: HTMLElement, val: boolean) => {
    const t = $('.toggle', btn);
    t.classList.toggle('on', val);
    t.setAttribute('aria-checked', String(val));
  };

  $('[data-notify]', page).addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLElement;
    if (!S.notify) {
      const res = await subscribePushNotifications();
      if (res.ok) {
        S.notify = true;
        saveSettings();
        syncToggle(btn, true);
        toast('Bildirimler açıldı', I.bell(14));
      } else {
        toast(res.error, I.info(14), 3400);
      }
    } else {
      S.notify = false;
      saveSettings();
      syncToggle(btn, false);
    }
  });

  $('[data-faceid]', page).addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLElement;
    if (!S.faceId) {
      if (hasBiometric()) {
        S.faceId = true;
        saveSettings();
        syncToggle(btn, true);
        toast('Face ID açıldı', I.face(14));
        return;
      }
      const res = await enrollBiometric(toDbWho(state.me));
      if (res.ok) {
        S.faceId = true;
        saveSettings();
        syncToggle(btn, true);
        toast('Face ID açıldı', I.face(14));
      } else {
        toast(res.error, I.info(14), 3400);
      }
    } else {
      S.faceId = false;
      saveSettings();
      syncToggle(btn, false);
      toast('Face ID kapatıldı', I.face(14));
    }
  });

  $$('[data-k]', page).forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.k as 'live' | 'lightning';
      S[k] = !S[k];
      saveSettings();
      if (k === 'lightning') core.weatherRenderer.lightningEnabled = S.lightning;
      syncToggle(b, S[k]);
    })
  );

  $('[data-wx]', page).addEventListener('click', () =>
    weatherSheet(() => {
      $('[data-wxv]', page).textContent = wxLabel();
      core.refreshHome();
    })
  );
  $('[data-guide]', page).addEventListener('click', () => openGuide());

  let taps = 0;
  let tapReset = 0;
  $('[data-about]', page).addEventListener('click', () => {
    clearTimeout(tapReset);
    tapReset = window.setTimeout(() => { taps = 0; }, 2500);
    if (++taps >= 5) {
      taps = 0;
      openDiagnostics();
    }
  });

  $('[data-out]', page).addEventListener('click', async () => {
    if (await confirmSheet('Çıkış yapılsın mı?', 'Tekrar girmek için şifren ve gizli kelimeniz gerekecek.', 'Çıkış yap', true)) {
      await core.logout();
    }
  });

  $('[data-back]', page).addEventListener('click', () => void popPage(core.homeEl));
  pushPage(page, core.homeEl);
}

/* ===================== test paneli (yönetici) ===================== */
// Önizlemedeki demo panelinin AYNISI, uygulamanın içinde. Her şey yalnızca bu telefonda oynatılır (sahte veri, ağ yok).
export function openTestPanel(under: HTMLElement) {
  const T = core.test;
  if (!T) return;
  const hh = T.hourNow();
  const page = h(`<div class="page" role="dialog" aria-label="Test paneli">
    <div class="page-head"><button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button></div>
    <div class="page-body" data-scroll>
      <div class="title" style="font-size:38px;margin:2px 4px 4px">Test paneli</div>
      <p class="small" style="margin:0 4px 14px">Sadece bu telefonda görünür. ${PEOPLE[state.partner].name}'ya hiçbir şey gitmez, yıldızlar kaydedilmez.</p>
      <div class="eyebrow group-title">Saat</div>
      <div class="group" style="padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span class="st">Gökyüzü saati</span><span class="sv" data-hl></span></div>
        <input type="range" min="0" max="23.99" step="0.05" value="${hh}" data-hour style="width:100%;touch-action:pan-x">
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${[['Gece', 23], ['Şafak', 6.3], ['Öğle', 13], ['Gün batımı', 18.2]].map(([l, v]) => `<button type="button" class="chip" data-hp="${v}">${l}</button>`).join('')}
          <button type="button" class="chip" data-hnow>Şimdi</button></div>
      </div>
      <div class="eyebrow group-title">Hava</div>
      <div class="group" style="padding:14px 12px;display:flex;flex-wrap:wrap;gap:8px">
        ${T.weatherKinds.map((w) => `<button type="button" class="chip" data-wk="${w.k}">${w.label}</button>`).join('')}
        <button type="button" class="chip" data-wk="">Gerçek hava</button>
      </div>
      ${T.groups.map((g, gi) => `<div class="eyebrow group-title">${g.title}</div><div class="group">${g.items.map((it, i) => `<button type="button" class="set-row" data-a="${gi}:${i}"><span class="st">${it.label}</span><span class="sv">${I.play(14)}</span></button>`).join('')}</div>`).join('')}
      <p class="small center" style="margin-top:22px">Bu panel test içindir; uygulama kapanınca her şey gerçek haline döner.</p>
    </div></div>`);
  const hl = $('[data-hl]', page);
  const fmt = (v: number) => `${String(Math.floor(v) % 24).padStart(2, '0')}:${String(Math.floor((v % 1) * 60)).padStart(2, '0')}`;
  const range = $<HTMLInputElement>('[data-hour]', page);
  const setH = (v: number | null) => {
    T.setHour(v);
    hl.textContent = v === null ? 'şimdi' : fmt(v);
    if (v !== null) range.value = String(v);
  };
  hl.textContent = core.engine.timeOverride
    ? fmt(core.engine.timeOverride.getHours() + core.engine.timeOverride.getMinutes() / 60)
    : 'şimdi';
  range.addEventListener('input', () => setH(+range.value));
  $$('[data-hp]', page).forEach((b) => b.addEventListener('click', () => setH(+b.dataset.hp!)));
  $('[data-hnow]', page).addEventListener('click', () => {
    setH(null);
    range.value = String(T.hourNow());
  });
  $$('[data-wk]', page).forEach((b) =>
    b.addEventListener('click', () => {
      $$('[data-wk]', page).forEach((x) => x.classList.toggle('on', x === b));
      T.setWeather(b.dataset.wk || null);
    })
  );
  $$('[data-a]', page).forEach((b) =>
    b.addEventListener('click', async () => {
      const [gi, ii] = b.dataset.a!.split(':').map(Number);
      const it = T.groups[gi].items[ii];
      if (it.leave) {
        await popPage(under);
        await popPage(core.homeEl);
      }
      it.run();
    })
  );
  $('[data-back]', page).addEventListener('click', () => void popPage(under));
  pushPage(page, under);
}

export function weatherSheet(done: () => void) {
  const S = state.settings;
  const c = h(`<div>
    <div class="h2" style="margin:2px 2px 6px">Gökyüzümüz senin havana bürünsün mü?</div>
    <p class="body" style="margin:0 2px 18px">Yağmur yağınca burada da yağar. Konumun yalnızca bu telefonda kalır.</p>
    <div class="group">
      <button type="button" class="set-row" data-v="geo"><span class="si">${I.pin(17)}</span><span class="st">Konumumu kullan</span><span class="sv" data-c></span></button>
      <button type="button" class="set-row" data-v="city"><span class="si">${I.cloud(17)}</span><span class="st">Şehir seç</span><span class="sv" data-c></span></button>
      <button type="button" class="set-row" data-v="off"><span class="si">${I.close(17)}</span><span class="st">Kapalı</span><span class="sv" data-c></span></button>
    </div>
    <div class="field ${S.weather === 'city' ? '' : 'hide'}" data-city style="margin-top:14px">
      <input placeholder="Şehir adı (ör. İstanbul, Bağdat)" value="${esc(S.city)}" enterkeyhint="search" autocomplete="off">
    </div>
    <div class="group hide" data-results style="margin-top:10px"></div>
  </div>`);
  const mark = () =>
    $$('[data-v]', c).forEach((b) => ($('[data-c]', b).innerHTML = b.dataset.v === S.weather ? '<span style="color:#fff">✓</span>' : ''));
  mark();
  const s = openSheet(c);
  const resBox = $('[data-results]', c);
  const cityInput = $<HTMLInputElement>('input', c);

  $$('[data-v]', c).forEach((b) =>
    b.addEventListener('click', async () => {
      const v = b.dataset.v as typeof S.weather;
      if (v === 'city') {
        $('[data-city]', c).classList.remove('hide');
        cityInput.focus({ preventScroll: true });
        return;
      }
      if (v === 'geo') {
        try {
          await askGeo();
          S.weather = 'geo';
          saveSettings();
          mark();
          core.reloadWeather();
          done();
          toast('Konumuna göre hava durumu açıldı', I.pin(14));
          setTimeout(() => void s.close(), 250);
        } catch {
          toast('Konum izni alınamadı · şehir seçebilirsin', I.pin(14), 3000);
        }
        return;
      }
      S.weather = 'off';
      saveSettings();
      core.engine.setWeather(CLEAR, 2000);
      core.weatherRenderer.setWeather(CLEAR);
      mark();
      done();
      setTimeout(() => void s.close(), 250);
    })
  );

  let searchTimer = 0;
  const runCitySearch = async (q: string) => {
    if (q.trim().length < 2) {
      resBox.classList.add('hide');
      return;
    }
    try {
      const list = await searchCity(q.trim());
      if (!c.isConnected) return;
      if (!list.length) {
        resBox.innerHTML = `<div class="small" style="padding:12px 2px">Şehir bulunamadı</div>`;
        resBox.classList.remove('hide');
        return;
      }
      resBox.innerHTML = list
        .map(
          (item: { name: string; admin: string; lat: number; lon: number }, i: number) =>
            `<button type="button" class="set-row" data-idx="${i}"><span class="st">${esc(item.name)}${item.admin ? ` <span class="small">· ${esc(item.admin)}</span>` : ''}</span></button>`
        )
        .join('');
      resBox.classList.remove('hide');
      $$('[data-idx]', resBox).forEach((btn) =>
        btn.addEventListener('click', () => {
          const picked = list[+btn.dataset.idx!];
          chooseCity(picked);
          S.weather = 'city';
          S.city = picked.name;
          saveSettings();
          mark();
          core.reloadWeather();
          done();
          cityInput.blur();
          setTimeout(() => void s.close(), 200);
        })
      );
    } catch {
      toast('Şehir araması yapılamadı, interneti kontrol et', I.cloud(14));
    }
  };

  cityInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void runCitySearch(cityInput.value), 280);
  });
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && cityInput.value.trim()) {
      e.preventDefault();
      clearTimeout(searchTimer);
      void runCitySearch(cityInput.value);
    }
  });
}

/* ===================== geri sayım ===================== */
export function openCountdown() {
  const target = state.meetDate.getTime();
  const start = target - 120 * 86400_000;
  const el = h(`<div class="cdpage" role="dialog" aria-label="9 Ocak geri sayımı">
    <button type="button" class="icon-btn" data-x aria-label="Kapat">${I.close()}</button>
    <div class="eyebrow" style="margin-top:4px">Kavuşmamıza</div>
    <div class="cd-ring">
      <svg viewBox="0 0 236 236"><circle cx="118" cy="118" r="110" stroke="rgba(255,255,255,.08)" stroke-width="2" fill="none"/>
        <circle data-arc cx="118" cy="118" r="110" stroke="var(--gold)" stroke-width="2" fill="none" stroke-linecap="round" transform="rotate(-90 118 118)" stroke-dasharray="691" stroke-dashoffset="691"/></svg>
      <div class="in"><b class="num" data-d>0</b><div style="font:italic 500 22px var(--serif);color:var(--text-2)">gün</div></div>
    </div>
    <div class="cd" data-cd></div>
    <div class="title" style="margin-top:18px;font-size:34px">9 Ocak 2027</div>
    <div class="body" style="margin-top:4px">Cumartesi</div>
    <div class="cd-lily" style="margin-top:auto">${lilyBloom(92, 10, 'sway')}</div>
    <p class="center" style="font:italic 500 19px/1.35 var(--serif);color:var(--text-2);margin:6px 20px 0">Her yıldız bizi biraz daha yaklaştırıyor.</p>
  </div>`);
  const app = core.homeEl.parentElement!;
  app.appendChild(el);
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
  const ring = $('.cd-ring', el);
  ring.animate([{ transform: 'scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.22,.8,.24,1)' });
  const frac = Math.min(1, Math.max(0, (getServerNowMs() - start) / (target - start)));
  const arc = $('[data-arc]', el) as unknown as SVGCircleElement;
  const targetOffset = 691 * (1 - frac);
  arc.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.22,.8,.24,1) .2s';
  requestAnimationFrame(() => {
    arc.style.strokeDashoffset = String(targetOffset);
  });

  const tick = () => {
    if (document.hidden || !el.isConnected) return;
    const p = untilParts(target);
    $('[data-d]', el).textContent = String(p.d);
    $('[data-cd]', el).innerHTML = (
      [
        ['saat', p.h],
        ['dakika', p.m],
        ['saniye', p.s],
      ] as const
    )
      .map(([l, v]) => `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`)
      .join('');
  };
  tick();
  const iv = window.setInterval(tick, 1000);
  $('[data-x]', el).addEventListener('click', async () => {
    clearInterval(iv);
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished;
    el.remove();
  });
}

/* ===================== ana ekrana ekleme ===================== */
export function openGuide() {
  const page = h(`<div class="page" role="dialog" aria-label="Ana ekrana ekle">
    <div class="page-head"><button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button></div>
    <div class="page-body" data-scroll>
      <div class="title" style="font-size:34px;margin:2px 4px 8px">Ana ekrana ekle</div>
      <p class="body" style="margin:0 4px 14px">Gökyüzümüz bir uygulama gibi tam ekran açılır, bildirimler gelir.</p>
      <div class="group" style="padding:0 16px">
        <div class="guide-step"><span class="n">1</span><div><div style="font-weight:600">Safari'de aç</div><div class="small" style="margin-top:3px">Bu sayfayı Safari ile açtığından emin ol.</div></div></div>
        <div class="guide-step"><span class="n">2</span><div><div style="font-weight:600;display:flex;gap:6px;align-items:center">Paylaş ${I.share(17)}</div><div class="small" style="margin-top:3px">Alttaki paylaş düğmesine dokun.</div></div></div>
        <div class="guide-step"><span class="n">3</span><div><div style="font-weight:600;display:flex;gap:6px;align-items:center">Ana Ekrana Ekle ${I.plusSq(17)}</div><div class="small" style="margin-top:3px">Listeyi aşağı kaydırıp seç, sonra “Ekle”.</div></div></div>
        <div class="guide-step" style="border:0"><span class="n">4</span><div><div style="font-weight:600">Simgeden aç</div><div class="small" style="margin-top:3px">Bundan sonra gökyüzümüzü hep ana ekrandan aç.</div></div></div>
      </div></div></div>`);
  $('[data-back]', page).addEventListener('click', () => void popPage(core.homeEl));
  pushPage(page);
}
