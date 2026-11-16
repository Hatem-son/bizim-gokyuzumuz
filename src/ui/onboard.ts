import { unlockWithSecret } from '../lib/crypto';
import { PEOPLE, renderConstellationCardSvg } from '../lib/people';
import { STORAGE_KEYS, store } from '../lib/storage';
import {
  fetchVerifyBlob,
  getSessionAndProfile,
  isSupabaseConfigured,
  saveVerifyBlob,
  sendMagicLink,
  signInWithPassword,
} from '../lib/supabase';
import type { Who } from '../types';
import { $, $$ } from './dom';

export interface OnboardController {
  show: () => void;
  hide: () => void;
}

export function initOnboard(opts: {
  onPreviewTheme: (who: Who | null) => void;
  onComplete: (who: Who) => void;
}): OnboardController {
  const onboardEl = $('#onboard');
  const whoBox = $('#who');
  const stepWho = $('#step-who');
  const stepAuth = $('#step-auth') as HTMLFormElement;
  const stepKey = $('#step-key') as HTMLFormElement;

  const authEmail = $('#auth-email') as HTMLInputElement;
  const authPass = $('#auth-pass') as HTMLInputElement;
  const authSubmit = $('#auth-submit') as HTMLButtonElement;
  const authMagic = $('#auth-magic') as HTMLButtonElement;
  const authBack = $('#auth-back') as HTMLButtonElement;
  const authErr = $('#auth-err');
  const authInfo = $('#auth-info');

  const keyInput = $('#key') as HTMLInputElement;
  const enterBtn = $('#enter') as HTMLButtonElement;
  const keyErr = $('#ob-err');
  const wipeBtn = $('#ob-wipe') as HTMLButtonElement;
  const backBtn = $('#back') as HTMLButtonElement;

  let chosen: Who | null = null;

  // Render constellation SVGs inside Ham ham / Beto cards
  $('#art-hamham').innerHTML = renderConstellationCardSvg('hamham');
  $('#art-beto').innerHTML = renderConstellationCardSvg('beto');

  function showStep(target: 'who' | 'auth' | 'key'): void {
    stepWho.hidden = target !== 'who';
    stepAuth.hidden = target !== 'auth';
    stepKey.hidden = target !== 'key';

    const el = target === 'who' ? stepWho : target === 'auth' ? stepAuth : stepKey;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
  }

  function resetToWho(): void {
    chosen = null;
    opts.onPreviewTheme(null);
    whoBox.classList.remove('chosen');
    $$('.who-card').forEach((c) => c.classList.remove('sel'));
    authErr.hidden = true;
    authInfo.hidden = true;
    keyErr.hidden = true;
    wipeBtn.hidden = true;
    keyInput.value = '';
    enterBtn.disabled = true;
    showStep('who');
  }

  function show(): void {
    document.body.classList.remove('awake');
    resetToWho();
    onboardEl.classList.remove('gone');
  }

  function hide(): void {
    onboardEl.classList.add('gone');
  }

  async function afterWhoSelected(who: Who): Promise<void> {
    if (!isSupabaseConfigured) {
      $('#ob-hello').textContent = `Hoş geldin ${PEOPLE[who].name}`;
      showStep('key');
      keyInput.focus({ preventScroll: true });
      return;
    }

    // Check if already signed into Supabase as this user
    const { session, profile } = await getSessionAndProfile();
    if (session && profile && profile.who === who) {
      $('#ob-hello').textContent = `Hoş geldin ${PEOPLE[who].name}`;
      showStep('key');
      keyInput.focus({ preventScroll: true });
      return;
    }

    $('#auth-hello').textContent = `Hoş geldin ${PEOPLE[who].name}`;
    authErr.hidden = true;
    authInfo.hidden = true;
    authPass.value = '';
    authSubmit.disabled = !authEmail.value.trim() || !authPass.value;
    showStep('auth');
    authEmail.focus({ preventScroll: true });
  }

  $$('.who-card').forEach((card) => {
    card.addEventListener('click', () => {
      const who = card.dataset.who as Who | undefined;
      if (!who) return;
      chosen = who;
      whoBox.classList.add('chosen');
      $$('.who-card').forEach((c) => c.classList.toggle('sel', c === card));
      opts.onPreviewTheme(who);
      window.setTimeout(() => {
        if (chosen === who) void afterWhoSelected(who);
      }, 650);
    });
  });

  const syncAuthBtn = (): void => {
    authSubmit.disabled = !authEmail.value.trim() || !authPass.value;
  };
  authEmail.addEventListener('input', syncAuthBtn);
  authPass.addEventListener('input', syncAuthBtn);

  authBack.addEventListener('click', resetToWho);
  backBtn.addEventListener('click', resetToWho);

  stepAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chosen) return;
    const email = authEmail.value.trim();
    const pass = authPass.value;
    if (!email || !pass) return;

    authSubmit.disabled = true;
    authSubmit.textContent = 'Giriş yapılıyor…';
    authErr.hidden = true;
    authInfo.hidden = true;

    const res = await signInWithPassword(email, pass, chosen);
    authSubmit.textContent = 'Giriş yap';
    syncAuthBtn();

    if (!res.ok) {
      authErr.textContent = res.error;
      authErr.hidden = false;
      return;
    }

    authPass.blur();
    $('#ob-hello').textContent = `Hoş geldin ${PEOPLE[chosen].name}`;
    showStep('key');
    keyInput.focus({ preventScroll: true });
  });

  authMagic.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    if (!email) {
      authErr.textContent = 'Önce e-posta adresini yaz.';
      authErr.hidden = false;
      authEmail.focus();
      return;
    }
    authMagic.disabled = true;
    authErr.hidden = true;
    authInfo.hidden = true;

    const res = await sendMagicLink(email);
    authMagic.disabled = false;
    if (!res.ok) {
      authErr.textContent = res.error;
      authErr.hidden = false;
      return;
    }
    authInfo.textContent = 'Giriş bağlantısı e-postana gönderildi. Bağlantıya dokunup geri dön.';
    authInfo.hidden = false;
  });

  keyInput.addEventListener('input', () => {
    enterBtn.disabled = !keyInput.value.trim();
  });

  stepKey.addEventListener('submit', async (e) => {
    e.preventDefault();
    const secret = keyInput.value.trim();
    if (!secret || !chosen) return;

    enterBtn.disabled = true;
    enterBtn.textContent = 'Anahtar hazırlanıyor…';
    keyErr.hidden = true;
    wipeBtn.hidden = true;

    let ok = false;
    try {
      ok = await unlockWithSecret(secret, fetchVerifyBlob, saveVerifyBlob);
    } catch (err) {
      keyErr.textContent = err instanceof Error ? err.message : 'Anahtar doğrulanamadı.';
      keyErr.hidden = false;
      enterBtn.textContent = 'Gökyüzüne gir';
      enterBtn.disabled = false;
      return;
    }

    enterBtn.textContent = 'Gökyüzüne gir';
    enterBtn.disabled = false;

    if (!ok) {
      keyErr.textContent = 'Bu kelime, bu gökyüzünün gizli kelimesiyle eşleşmiyor.';
      keyErr.hidden = false;
      wipeBtn.hidden = isSupabaseConfigured;
      return;
    }

    keyInput.blur();
    store.set(STORAGE_KEYS.me, chosen);
    opts.onComplete(chosen);
  });

  wipeBtn.addEventListener('click', () => {
    store.del(STORAGE_KEYS.verifyLocal);
    store.del(STORAGE_KEYS.pin);
    store.del(STORAGE_KEYS.biometric);
    keyErr.hidden = true;
    wipeBtn.hidden = true;
  });

  return { show, hide };
}

