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
export function waxSeal(owner: Who, size = 58) {
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
  return `<div class="seal" style="width:${size}px;height:${size}px;margin-left:${-size / 2}px">
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
    const tick = () => {
      if (document.hidden || !content.isConnected) return;
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
    tick();
    const iv = window.setInterval(tick, 1000);
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
        ${sealed ? '' : `<div class="mini-seal" style="position:absolute;right:16px;top:14px;width:34px;height:34px">${waxSeal(st.from, 34).replace('class="seal"', 'class="seal" style="position:static;margin:0"')}</div>`}
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
    core.scrollTo(st.x - core.W / 2, 700);
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
  letter.insertAdjacentHTML('afterbegin', `<div class="mini-seal" style="position:absolute;right:16px;top:14px;width:34px;height:34px">${waxSeal(owner, 34).replace('class="seal"', 'class="seal" style="position:static;margin:0"')}</div>`);
  (letter.querySelector('.mini-seal') as HTMLElement).animate([{ opacity: 0, transform: 'scale(1.4)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,1.3,.5,1)' });
  if (actions) actions.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, fill: 'forwards' });
}

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
