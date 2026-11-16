import {
  BACKGROUND_LOCK_MS,
  clearPinAndBiometric,
  hasAnyLock,
  hasBiometric,
  hasPin,
  savePin,
  verifyBiometric,
  verifyPin,
} from '../lib/lock';
import { PEOPLE } from '../lib/people';
import type { Who } from '../types';
import { $, $$, setInert } from './dom';
import { showToast } from './toast';

export type LockMode = 'unlock' | 'set1' | 'set2';

export interface LockController {
  show: (mode: LockMode) => void;
  isLocked: () => boolean;
}

export function initLockScreen(opts: {
  getMe: () => Who | null;
  onUnlock: () => void;
  onForgotReset: () => void;
  onStatusChange: () => void;
}): LockController {
  const lockEl = $('#lock');
  const dotsEl = $('#lk-dots');
  const padEl = $('#pad');
  const faceBtn = $('#lk-faceid') as HTMLButtonElement;
  const cancelBtn = $('#lk-cancel') as HTMLButtonElement;
  const forgotBtn = $('#lk-forgot') as HTMLButtonElement;

  let mode: LockMode | null = null;
  let pinBuf = '';
  let pinFirst = '';
  let pinBusy = false;
  let hiddenAt = 0;

  function drawDots(): void {
    $$('#lk-dots i').forEach((d, idx) => d.classList.toggle('on', idx < pinBuf.length));
  }

  function pinError(): void {
    dotsEl.classList.remove('err');
    void dotsEl.offsetWidth;
    dotsEl.classList.add('err');
    window.setTimeout(() => {
      pinBuf = '';
      drawDots();
    }, 450);
  }

  function hide(): void {
    lockEl.classList.add('gone');
    setInert(lockEl, true);
    mode = null;
    pinBuf = '';
    drawDots();
    opts.onStatusChange();
    opts.onUnlock();
  }

  function show(nextMode: LockMode): void {
    const me = opts.getMe();
    if (!me) return;

    mode = nextMode;
    pinBuf = '';
    drawDots();

    const medal = $('#lk-medal');
    medal.className = `medal ${PEOPLE[me].color}`;
    medal.textContent = PEOPLE[me].sign;

    $('#lk-title').textContent = nextMode === 'unlock' ? `Hoş geldin ${PEOPLE[me].name}` : 'Kilidi kur';
    $('#lk-sub').textContent =
      nextMode === 'unlock'
        ? 'ŞİFRENİ GİR'
        : nextMode === 'set1'
          ? 'YENİ 4 HANELİ ŞİFRE'
          : 'ŞİFREYİ TEKRAR GİR';

    cancelBtn.style.visibility = nextMode === 'unlock' ? 'hidden' : 'visible';
    forgotBtn.hidden = nextMode !== 'unlock';
    faceBtn.hidden = !(nextMode === 'unlock' && hasBiometric());

    lockEl.classList.remove('gone');
    setInert(lockEl, false);
  }

  async function finishPin(): Promise<void> {
    const pin = pinBuf;
    const me = opts.getMe();
    pinBusy = true;

    try {
      if (mode === 'unlock') {
        if (await verifyPin(pin)) {
          hide();
        } else {
          pinError();
        }
      } else if (mode === 'set1') {
        pinFirst = pin;
        window.setTimeout(() => show('set2'), 220);
      } else if (mode === 'set2') {
        if (pin === pinFirst) {
          await savePin(pin);
          hide();
          if (me) {
            showToast(
              'Kilit kuruldu',
              'Açılışta ve 2 dk arka planda kalınca şifre soracak',
              PEOPLE[me].color,
              PEOPLE[me].sign
            );
          }
        } else {
          pinError();
          window.setTimeout(() => show('set1'), 550);
        }
      }
    } finally {
      pinBusy = false;
    }
  }

  function handleKey(k: string): void {
    if (!mode || pinBusy) return;
    if (k === 'del') {
      pinBuf = pinBuf.slice(0, -1);
      drawDots();
      return;
    }
    if (k === 'cancel') {
      hide();
      return;
    }
    if (pinBuf.length >= 4) return;
    pinBuf += k;
    drawDots();
    if (pinBuf.length === 4) {
      window.setTimeout(() => void finishPin(), 120);
    }
  }

  padEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (btn?.dataset.k) handleKey(btn.dataset.k);
  });

  window.addEventListener('keydown', (e) => {
    if (!mode) return;
    if (/^[0-9]$/.test(e.key)) handleKey(e.key);
    else if (e.key === 'Backspace') handleKey('del');
  });

  faceBtn.addEventListener('click', async () => {
    if (mode !== 'unlock' || pinBusy) return;
    pinBusy = true;
    const ok = await verifyBiometric();
    pinBusy = false;
    if (ok) {
      hide();
    } else {
      const me = opts.getMe();
      if (me) {
        showToast('Face ID doğrulanamadı', '4 haneli şifrenle açabilirsin', PEOPLE[me].color, PEOPLE[me].sign);
      }
    }
  });

  forgotBtn.addEventListener('click', () => {
    clearPinAndBiometric();
    lockEl.classList.add('gone');
    lockEl.setAttribute('aria-hidden', 'true');
    mode = null;
    opts.onForgotReset();
  });

  // Arka planda 2 dakikadan uzun kalınca tekrar kilitlenir
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const me = opts.getMe();
    if (me && hasAnyLock() && hasPin() && !mode && hiddenAt > 0 && Date.now() - hiddenAt > BACKGROUND_LOCK_MS) {
      show('unlock');
    }
  });

  return {
    show,
    isLocked: () => mode !== null,
  };
}

