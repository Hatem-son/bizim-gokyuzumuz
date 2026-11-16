import { USER_EMAILS } from '../config';
import { unlockWithSecret } from '../lib/crypto';
import { PEOPLE, renderConstellationCardSvg } from '../lib/people';
import { STORAGE_KEYS, store } from '../lib/storage';
import {
  fetchVerifyBlob,
  getSessionAndProfile,
  isSupabaseConfigured,
  saveVerifyBlob,
  signInWithPassword,
} from '../lib/supabase';
import type { Who } from '../types';
import { $, $$, setInert } from './dom';

function renderObSceneSvg(): string {
  let blades = '';
  for (let i = 0; i < 24; i++) {
    const x = i * 17 + 4 + (i % 3) * 2;
    const h = 22 + ((i * 29) % 34);
    const d = i % 2 ? 1 : -1;
    blades += `<path d="M${x} 160 Q ${x + d * 4} ${160 - h * 0.6} ${x + d * 8} ${160 - h}" stroke="var(--leaf-1)" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>`;
  }
  return `<svg class="ob-garden" viewBox="0 0 390 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    ${blades}
    <g transform="translate(173 94) scale(.28)" opacity=".55">
      <rect x="44" y="80" width="72" height="96" rx="10" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.28)" stroke-width="3"/>
      <rect x="48" y="106" width="64" height="66" rx="6" fill="rgba(255,220,200,.24)"/>
      <path d="M80 106 Q79 96 81 86" stroke="#2a1d1a" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M80 62 C88 74 87 86 80 90 C73 86 72 74 80 62Z" fill="#ffd99a" opacity=".75"/>
    </g>
  </svg>`;
}

export interface OnboardController {
  show: (preselectedWho?: Who | null) => void;
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

  const authPass = $('#auth-pass') as HTMLInputElement;
  const authSubmit = $('#auth-submit') as HTMLButtonElement;
  const authBack = $('#auth-back') as HTMLButtonElement;
  const authErr = $('#auth-err');

  const keyInput = $('#key') as HTMLInputElement;
  const enterBtn = $('#enter') as HTMLButtonElement;
  const keyErr = $('#ob-err');
  const wipeBtn = $('#ob-wipe') as HTMLButtonElement;
  const backBtn = $('#back') as HTMLButtonElement;

  let chosen: Who | null = null;

  // Render constellation SVGs inside Ham ham / Beto cards & subtle background scene
  $('#art-hamham').innerHTML = renderConstellationCardSvg('hamham');
  $('#art-beto').innerHTML = renderConstellationCardSvg('beto');
  const obScene = document.getElementById('ob-scene');
  if (obScene) obScene.innerHTML = renderObSceneSvg();

  function clearErr(el: HTMLElement): void {
    el.hidden = true;
    el.textContent = '';
  }

  function showStep(target: 'who' | 'auth' | 'key'): void {
    stepWho.hidden = target !== 'who';
    stepAuth.hidden = target !== 'auth';
    stepKey.hidden = target !== 'key';
    onboardEl.classList.toggle('step-form', target !== 'who');

    const el = target === 'who' ? stepWho : target === 'auth' ? stepAuth : stepKey;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
  }

  // Kurulumda şifre / kelime yazılırken ekranın parmakla kaymasını ve lastik sıçramasını engelle
  onboardEl.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  function resetToWho(): void {
    chosen = null;
    opts.onPreviewTheme(null);
    whoBox.classList.remove('chosen');
    $$('.who-card').forEach((c) => c.classList.remove('sel'));
    clearErr(authErr);
    authPass.value = '';
    authSubmit.disabled = true;
    clearErr(keyErr);
    wipeBtn.hidden = true;
    keyInput.value = '';
    enterBtn.disabled = true;
    showStep('who');
  }

  function show(preselectedWho: Who | null = null): void {
    document.body.classList.remove('awake');
    resetToWho();
    setInert(onboardEl, false);
    onboardEl.classList.remove('gone');
    if (preselectedWho) {
      chosen = preselectedWho;
      opts.onPreviewTheme(preselectedWho);
      whoBox.classList.add('chosen');
      $$(`.who-card[data-who="${preselectedWho}"]`).forEach((c) => c.classList.add('sel'));
      void afterWhoSelected(preselectedWho);
    }
  }

  function hide(): void {
    setInert(onboardEl, true);
    onboardEl.classList.add('gone');
  }

  async function afterWhoSelected(who: Who): Promise<void> {
    clearErr(authErr);
    clearErr(keyErr);
    if (!isSupabaseConfigured) {
      $('#ob-hello').textContent = `Hoş geldin ${PEOPLE[who].name}`;
      showStep('key');
      keyInput.focus({ preventScroll: true });
      return;
    }

    // Telefonda geçerli kalıcı oturum varsa şifre adımını atla
    const { session, profile } = await getSessionAndProfile();
    if (session && profile && profile.who === who) {
      $('#ob-hello').textContent = `Hoş geldin ${PEOPLE[who].name}`;
      showStep('key');
      keyInput.focus({ preventScroll: true });
      return;
    }

    $('#auth-hello').textContent = `Hoş geldin ${PEOPLE[who].name}`;
    clearErr(authErr);
    authPass.value = '';
    authSubmit.disabled = true;
    showStep('auth');
    authPass.focus({ preventScroll: true });
  }

  $$('.who-card').forEach((card) => {
    card.addEventListener('click', () => {
      const who = card.dataset.who as Who | undefined;
      if (!who) return;
      chosen = who;
      clearErr(authErr);
      clearErr(keyErr);
      whoBox.classList.add('chosen');
      $$('.who-card').forEach((c) => c.classList.toggle('sel', c === card));
      opts.onPreviewTheme(who);
      window.setTimeout(() => {
        if (chosen === who) void afterWhoSelected(who);
      }, 380);
    });
  });

  const syncAuthBtn = (): void => {
    authSubmit.disabled = !authPass.value;
  };
  authPass.addEventListener('input', () => {
    clearErr(authErr);
    syncAuthBtn();
  });
  authPass.addEventListener('focus', () => clearErr(authErr));

  authBack.addEventListener('click', resetToWho);
  backBtn.addEventListener('click', resetToWho);

  stepAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chosen) return;
    const email = USER_EMAILS[chosen];
    const pass = authPass.value;
    if (!pass) return;

    authSubmit.disabled = true;
    authSubmit.textContent = 'Giriş yapılıyor…';
    authErr.hidden = true;

    const res = await signInWithPassword(email, pass, chosen);
    authSubmit.textContent = 'Giriş yap';
    syncAuthBtn();

    if (!res.ok) {
      authErr.textContent = res.error;
      authErr.hidden = false;
      authPass.focus({ preventScroll: true });
      return;
    }

    authPass.blur();
    $('#ob-hello').textContent = `Hoş geldin ${PEOPLE[chosen].name}`;
    showStep('key');
    keyInput.focus({ preventScroll: true });
  });

  keyInput.addEventListener('input', () => {
    clearErr(keyErr);
    enterBtn.disabled = !keyInput.value.trim();
  });
  keyInput.addEventListener('focus', () => clearErr(keyErr));

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
