import { isStarHazel, pickHazelLine } from '../lib/hazel';
import { HEART_PATH, lilyBloomSvg, raspberrySvg } from '../lib/illustrations';
import { barsHtml, formatDuration } from '../lib/media';
import { PEOPLE } from '../lib/people';
import {
  decryptStarPayload,
  destroySpentOneTimeMedia,
  downloadAndDecryptMedia,
  markStarOpened,
  type StarPayloadData,
} from '../lib/stars';
import type { StarRecord, Who } from '../types';
import { $, setInert } from './dom';
import { showToast } from './toast';

const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M7 5h4v14H7zm6 0h4v14h-4z';

const dtf = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
});
const tf = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const sf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dtf.format(d)} · ${tf.format(d)}`;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export interface LetterController {
  open: (params: {
    star: StarRecord;
    starPos: { x: number; y: number };
    me: Who;
    allStars: StarRecord[];
    isPaired: boolean;
  }) => Promise<void>;
  close: () => void;
  isOpen: () => boolean;
}

export function initLetterModal(opts: {
  onBurst: (x: number, y: number, color: 'blue' | 'pink' | 'gold', big?: boolean) => void;
  onStarUpdated: (star: StarRecord) => void;
  getStarScreenPos: (star: StarRecord) => { x: number; y: number };
}): LetterController {
  const modal = $('#letter-modal');
  const card = $('#letter');
  const env = $('#env');
  const closeBtn = $('#l-close') as HTMLButtonElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Render raspberry seals and lily sprig SVG
  $('#seal').innerHTML = raspberrySvg(0, 0, 1, '', false);
  $('#env-seal').innerHTML = raspberrySvg(0, 0, 1, '', false);
  $('#sprig').innerHTML = lilyBloomSvg(0, 0, 0.95, 'sp', 'sp-st');

  let busy = false;
  let audio: HTMLAudioElement | null = null;
  let current: { star: StarRecord; url: string | null; me: Who } | null = null;

  function wirePlayer(url: string, dur: number): void {
    if (audio) audio.pause();
    audio = new Audio(url);
    audio.preload = 'auto';

    const a = audio;
    const barsEl = document.getElementById('p-bars');
    const ic = document.getElementById('play-ic');
    const tm = document.getElementById('p-time');
    const playBtn = document.getElementById('play');
    if (!barsEl || !ic || !tm || !playBtn) return;

    const bars = Array.from(barsEl.children) as HTMLElement[];
    playBtn.onclick = () => {
      if (a.paused) a.play().catch(() => undefined);
      else a.pause();
    };
    a.onplay = () => ic.setAttribute('d', PAUSE_PATH);
    a.onpause = () => ic.setAttribute('d', PLAY_PATH);
    a.ontimeupdate = () => {
      const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : dur || 1;
      const k = a.currentTime / d;
      bars.forEach((b, idx) => b.classList.toggle('on', idx / bars.length < k));
      tm.textContent = formatDuration(a.currentTime);
    };
    a.onended = () => {
      ic.setAttribute('d', PLAY_PATH);
      bars.forEach((b) => b.classList.remove('on'));
      tm.textContent = formatDuration(dur);
    };
  }

  function fillLetter(
    s: StarRecord,
    data: StarPayloadData,
    url: string | null,
    allStars: StarRecord[],
    isPaired: boolean,
    isLocked: boolean
  ): void {
    const orderNum = allStars.filter((x) => x.from === s.from && x.createdAt <= s.createdAt).length;
    $('#l-medal').textContent = PEOPLE[s.from].sign;
    $('#l-no').textContent = `YILDIZ NO. ${orderNum}${isPaired ? ' · AYNI SAATTE' : ''}`;
    $('#l-from').textContent = PEOPLE[s.from].abl;

    const miss = s.kind === 'miss';
    const heartEl = $('#l-heart');
    heartEl.classList.remove('on');
    void heartEl.offsetWidth;
    heartEl.classList.toggle('on', miss);

    const mediaEl = $('#l-media');
    mediaEl.innerHTML = '';

    if (miss) {
      const n = Math.min(5, 1 + Math.floor((data.held || 0) / 0.6));
      const hearts = Array.from(
        { length: 5 },
        (_, i) =>
          `<svg viewBox="0 0 24 24" class="${i < n ? 'on' : ''}" style="--d:${(1.5 + i * 0.14).toFixed(2)}s"><path d="${HEART_PATH}"/></svg>`
      ).join('');
      mediaEl.innerHTML = `<div class="longing" role="img" aria-label="Özlem ölçüsü 5 üzerinden ${n}">${hearts}</div><p class="longing-l">ÖZLEM ÖLÇÜSÜ</p>`;
    } else if (s.kind === 'photo') {
      if (s.spent || !url) {
        mediaEl.innerHTML =
          s.once || s.spent
            ? `<div class="spent-card"><b>Bu an bir kez görüldü</b><span>Tek seferlik bir fotoğraftı, şimdi sadece yıldızı kaldı</span></div>`
            : `<div class="spent-card"><b>Fotoğraf bulunamadı</b><span>Bu cihazda veya sunucuda kayıtlı değil</span></div>`;
      } else {
        mediaEl.innerHTML =
          `<figure class="polaroid"><span class="tape"></span><img alt="${esc(PEOPLE[s.from].abl)} gelen fotoğraf" src="${url}"><figcaption>${sf.format(new Date(s.createdAt))}</figcaption></figure>` +
          (s.once ? '<p class="once-badge"><i></i>TEK SEFERLİK · KAPATINCA KAYBOLACAK</p>' : '');
      }
    } else if (s.kind === 'voice') {
      mediaEl.innerHTML = url
        ? `<div class="player"><button class="play" id="play" type="button" aria-label="Sesi oynat"><svg viewBox="0 0 24 24"><path id="play-ic" d="${PLAY_PATH}"/></svg></button><span class="bars" id="p-bars">${barsHtml(data.peaks)}</span><span class="p-time" id="p-time">${formatDuration(data.dur || 0)}</span></div>`
        : `<div class="spent-card"><b>Ses bulunamadı</b><span>Ses kaydı yüklenemedi</span></div>`;
    }

    const text = miss ? 'Seni düşündüm' : data.text || '';
    const lt = $('#l-text');
    lt.style.display = text ? '' : 'none';
    lt.classList.toggle('miss', miss);

    let wordIdx = 0;
    lt.innerHTML = text
      .split(/(\s+)/)
      .map((part) => {
        if (!part) return '';
        if (/^\s+$/.test(part)) return esc(part);
        const delay = Math.min(wordIdx++ * 0.045, 1.5) + (miss ? 1.1 : s.kind === 'note' ? 0.2 : 0.75);
        return `<span class="w" style="--d:${delay.toFixed(2)}s">${esc(part)}</span>`;
      })
      .join('');
    lt.scrollTop = 0;

    const hazelEl = document.getElementById('l-hazel');
    if (hazelEl) {
      if (!isLocked && isStarHazel(s, allStars)) {
        hazelEl.textContent = pickHazelLine(s.from);
        hazelEl.hidden = false;
      } else {
        hazelEl.textContent = '';
        hazelEl.hidden = true;
      }
    }

    $('#l-date').textContent = fmtDateTime(s.createdAt);
    if (s.kind === 'voice' && url) {
      wirePlayer(url, data.dur || 0);
    }
  }

  function resetEnvelope(): void {
    const flap = env.querySelector('.env-flap') as HTMLElement;
    const paper = env.querySelector('.env-paper') as HTMLElement;
    const seal = env.querySelector('.env-seal') as HTMLElement;
    [env, flap, paper, seal].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    flap.style.zIndex = '3';
  }

  async function open(params: {
    star: StarRecord;
    starPos: { x: number; y: number };
    me: Who;
    allStars: StarRecord[];
    isPaired: boolean;
  }): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const { star, starPos, me, allStars, isPaired } = params;

      let data: StarPayloadData = { text: '' };
      let url: string | null = null;
      let isLocked = Boolean(star.unlockAt && Date.parse(star.unlockAt) > Date.now());
      try {
        data = await decryptStarPayload(star, me);
        if (star.hasMedia && !star.spent) {
          const mediaBytes = await downloadAndDecryptMedia(star, me);
          if (mediaBytes) {
            url = URL.createObjectURL(new Blob([mediaBytes], { type: data.mime || '' }));
          }
        }
      } catch (err) {
        const locked = err instanceof Error && err.message === 'LOCKED';
        if (locked) isLocked = true;
        data = {
          text: locked
            ? 'Bu yıldız henüz kilitli. Zamanı gelince açılacak.'
            : 'Bu yıldız açılamadı. Gizli kelime farklı olabilir.',
        };
      }

      if (current?.url) URL.revokeObjectURL(current.url);
      current = { star, url, me };
      const firstTime = !star.openedAt;

      fillLetter(star, data, url, allStars, isPaired, isLocked);
      card.getAnimations().forEach((a) => a.cancel());
      modal.classList.add('open');
      setInert(modal, false);

      const color = PEOPLE[star.from].color;
      if (!star.openedAt) {
        star.openedAt = await markStarOpened(star);
        opts.onStarUpdated(star);
      }

      if (firstTime && !reducedMotion) {
        resetEnvelope();
        const flap = env.querySelector('.env-flap') as HTMLElement;
        const paper = env.querySelector('.env-paper') as HTMLElement;
        const seal = env.querySelector('.env-seal') as HTMLElement;
        const er = env.getBoundingClientRect();

        opts.onBurst(starPos.x, starPos.y, color, false);
        await env
          .animate(
            [
              {
                transform: `translate(${starPos.x - (er.left + er.width / 2)}px,${
                  starPos.y - (er.top + er.height / 2)
                }px) scale(.05) rotate(-14deg)`,
                opacity: 0,
              },
              { opacity: 1, offset: 0.3 },
              { transform: 'none', opacity: 1 },
            ],
            { duration: 700, easing: 'cubic-bezier(.22,1.25,.36,1)', fill: 'forwards' }
          )
          .finished.catch(() => undefined);

        await wait(240);
        const sr = seal.getBoundingClientRect();
        opts.onBurst(sr.left + sr.width / 2, sr.top + sr.height / 2, color, false);
        await seal
          .animate(
            [
              { transform: 'scale(1)', opacity: 1 },
              { transform: 'scale(1.22) rotate(-6deg)', opacity: 1, offset: 0.35 },
              { transform: 'scale(0) rotate(40deg)', opacity: 0 },
            ],
            { duration: 440, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' }
          )
          .finished.catch(() => undefined);

        const flapAnim = flap.animate(
          [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }],
          { duration: 640, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }
        );
        window.setTimeout(() => {
          flap.style.zIndex = '0';
        }, 310);
        await flapAnim.finished.catch(() => undefined);

        await paper
          .animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-64%)' }], {
            duration: 540,
            easing: 'cubic-bezier(.22,1,.36,1)',
            fill: 'forwards',
          })
          .finished.catch(() => undefined);

        const pr = paper.getBoundingClientRect();
        const lr = card.getBoundingClientRect();
        card.style.transformOrigin = '0 0';
        card.animate(
          [
            {
              transform: `translate(${pr.left - lr.left}px,${pr.top - lr.top}px) scale(${pr.width / lr.width},${
                pr.height / lr.height
              })`,
              opacity: 0,
            },
            { opacity: 1, offset: 0.2 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 660, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
        );
        env.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(70px) scale(.9)', opacity: 0 },
          ],
          { duration: 500, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
        );
        fillLetter(star, data, url, allStars, isPaired, isLocked);
      } else {
        const lr = card.getBoundingClientRect();
        card.style.transformOrigin = '50% 50%';
        card.animate(
          [
            {
              transform: `translate(${starPos.x - (lr.left + lr.width / 2)}px,${
                starPos.y - (lr.top + lr.height / 2)
              }px) scale(.05) rotate(-8deg)`,
              opacity: 0,
            },
            { transform: 'none', opacity: 1 },
          ],
          { duration: reducedMotion ? 1 : 620, easing: 'cubic-bezier(.22,1.15,.36,1)', fill: 'forwards' }
        );
        if (!reducedMotion) opts.onBurst(starPos.x, starPos.y, color, false);
      }

      closeBtn.focus({ preventScroll: true });
    } finally {
      busy = false;
    }
  }

  function close(): void {
    if (!modal.classList.contains('open') || busy) return;
    if (audio) {
      audio.pause();
      audio = null;
    }

    const cur = current;
    current = null;

    const cr = card.getBoundingClientRect();
    let to = 'scale(.9)';
    if (cur) {
      const pos = opts.getStarScreenPos(cur.star);
      to = `translate(${pos.x - (cr.left + cr.width / 2)}px,${
        pos.y - (cr.top + cr.height / 2)
      }px) scale(.05) rotate(8deg)`;
    }

    card.style.transformOrigin = '50% 50%';
    card.getAnimations().forEach((a) => a.cancel());
    card
      .animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: to, opacity: 0 },
        ],
        { duration: reducedMotion ? 1 : 440, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
      )
      .onfinish = () => {
      resetEnvelope();
      $('#l-media').innerHTML = '';
      if (cur?.url) URL.revokeObjectURL(cur.url);
      if (cur) {
        const pos = opts.getStarScreenPos(cur.star);
        opts.onBurst(pos.x, pos.y, PEOPLE[cur.star.from].color, false);
      }
    };

    // Tek seferlik fotoğraf kapatıldığı anda hem cihazdan hem Storage'dan silinir
    if (
      cur &&
      cur.star.kind === 'photo' &&
      cur.star.once &&
      !cur.star.spent &&
      cur.star.from !== cur.me &&
      cur.url
    ) {
      cur.star.spent = true;
      opts.onStarUpdated(cur.star);
      void destroySpentOneTimeMedia(cur.star);
      window.setTimeout(
        () =>
          showToast(
            'Fotoğraf kayboldu',
            'Tek seferlikti, yıldızı gökyüzünde kaldı',
            PEOPLE[cur.star.from].color,
            PEOPLE[cur.star.from].sign
          ),
        550
      );
    }

    modal.classList.remove('open');
    setInert(modal, true);
  }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  return {
    open,
    close,
    isOpen: () => modal.classList.contains('open'),
  };
}

