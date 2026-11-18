// Giriş akışı: Kimsin → Şifre → Gizli kelime → (Face ID önerisi) → (Bildirim izni).
// Dönüşte: Face ID kilit ekranı (otomatik başlar; okuyamazsa/iptal edilirse doğrudan ayrı şifre sayfası runPasswordUnlock).
import { core } from './core';
import { h, $, $$, openSheet, sleep, reduced, stagger, toast } from './ui';
import { I, SIGN } from './icons';
import { state, PEOPLE, Who, setMe, saveSettings, toDbWho } from './state';
import { USER_EMAILS } from '../config';
import {
  isSupabaseConfigured,
  signInWithPassword,
  fetchVerifyBlob,
  saveVerifyBlob,
  getSessionFast,
  inferWhoFromEmail,
} from '../lib/supabase';
import { unlockWithSecret, loadSavedKey } from '../lib/crypto';
import { lockedFor, recordFail, recordOk, waitMessage } from '../lib/throttle';
import { enrollBiometric, verifyBiometricDetailed, hasBiometric } from '../lib/lock';
import { subscribePushNotifications, getNotificationPermission } from '../lib/push';

const E = 'cubic-bezier(.22,.8,.24,1)';

export function runAuth(app: HTMLElement, onDone: () => void) {
  const el = h(`<div class="auth">
    <div class="brand"><div class="display">Bizim Gökyüzümüz</div><div class="sub" data-sub>İkimizin gökyüzü</div></div>
    <div class="stage" data-stage></div></div>`);
  app.appendChild(el);
  const stage = $('[data-stage]', el);
  const sub = $('[data-sub]', el);
  [$('.display', el), sub].forEach((x, i) =>
    x.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], {
      duration: 900,
      delay: 200 + i * 180,
      easing: E,
      fill: 'backwards',
    })
  );

  const swap = async (node: HTMLElement, dir = 1) => {
    const old = stage.firstElementChild as HTMLElement | null;
    if (old) {
      await old.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-24 * dir}px)` }],
        { duration: 200, easing: 'ease-in', fill: 'forwards' }
      ).finished;
    }
    stage.innerHTML = '';
    stage.appendChild(node);
    node.animate(
      [{ opacity: 0, transform: `translateX(${24 * dir}px)` }, { opacity: 1, transform: 'none' }],
      { duration: reduced() ? 120 : 420, easing: E }
    );
  };
  const subTo = (t: string) => {
    sub.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 420 });
    setTimeout(() => (sub.textContent = t), 210);
  };
  const steps = (n: number) =>
    `<div class="steps">${[0, 1, 2].map((i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;

  const who = () => {
    subTo('İkimizin gökyüzü');
    const n = h(`<div>${steps(0)}<div class="eyebrow center" style="margin-bottom:14px">Kimsin?</div>
      <div class="who">${(['ham', 'beto'] as Who[])
        .map(
          (w) => `<button type="button" class="glass" data-w="${w}" style="color:${PEOPLE[w].color}">
        <div class="sg">${SIGN[PEOPLE[w].sign]}</div><div class="nm">${PEOPLE[w].name}</div><div class="sn small">${PEOPLE[w].signName}</div></button>`
        )
        .join('')}</div></div>`);
    $$('[data-w]', n).forEach((b) =>
      b.addEventListener('click', async () => {
        setMe(b.dataset.w as Who);
        applyPersona();
        if (isSupabaseConfigured) {
          const { session } = await getSessionFast();
          const sessWho = inferWhoFromEmail(session?.user?.email);
          if (session && sessWho === toDbWho(state.me)) {
            secret(who);
            return;
          }
        }
        password();
      })
    );
    void swap(n, -1);
    stagger($$('.who button', n), { y: 14, delay: 260, gap: 90, dur: 520 });
  };

  const password = () => {
    subTo(`Hoş geldin ${PEOPLE[state.me].name}`);
    const n = h(`<form novalidate>${steps(1)}
      <div class="eyebrow" style="margin:0 4px 10px">Hesap şifren</div>
      <div class="field"><input type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="Şifren">
        <button type="button" class="pw-eye" aria-label="Şifreyi göster">${I.eye(19)}</button></div>
      <p class="small hint" style="margin:10px 4px 18px" data-msg>Yalnızca ikinizin hesabı var. Dışarıdan kayıt kapalı.</p>
      <button class="btn btn-primary btn-block" type="submit">Devam</button>
      <button type="button" class="back-link" data-back style="margin:8px auto 0;display:flex">${I.back(16)} Geri dön</button></form>`);
    const inp = $<HTMLInputElement>('input', n);
    $('.pw-eye', n).addEventListener('click', () => {
      inp.type = inp.type === 'password' ? 'text' : 'password';
      inp.focus({ preventScroll: true });
    });
    $('[data-back]', n).addEventListener('click', who);
    n.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!inp.value) return err(n, 'Şifreni yazmalısın.');
      const wait = lockedFor('pw');
      if (wait > 0) return err(n, waitMessage(wait));
      const b = $<HTMLButtonElement>('[type=submit]', n);
      b.innerHTML = spinner();
      b.disabled = true;
      if (isSupabaseConfigured) {
        const dbWho = toDbWho(state.me);
        const res = await signInWithPassword(USER_EMAILS[dbWho], inp.value, dbWho);
        b.disabled = false;
        b.textContent = 'Devam';
        if (!res.ok) {
          if (res.error === 'Şifre doğru değil, tekrar dene') err(n, `${res.error}. ${waitMessage(recordFail('pw'))}`);
          else err(n, res.error);
          return;
        }
        recordOk('pw');
      } else {
        await sleep(350);
        b.disabled = false;
        b.textContent = 'Devam';
      }
      secret(password);
    });
    void swap(n);
    setTimeout(() => inp.focus({ preventScroll: true }), 450);
  };

  const secret = (backFn: () => void = password) => {
    subTo('Son bir adım');
    const n = h(`<form novalidate>${steps(2)}
      <div class="eyebrow" style="margin:0 4px 10px">Gizli kelimemiz</div>
      <div class="field"><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="İkimizin bildiği kelime">
        <button type="button" class="pw-eye" aria-label="Gizli kelimeyi göster">${I.eye(19)}</button></div>
      <p class="small hint" style="margin:10px 4px 18px" data-msg>İkiniz de aynı kelimeyi yazıyorsunuz. Yıldızlarınız bu kelimeyle telefonda şifrelenir; sunucu göremez.</p>
      <button class="btn btn-primary btn-block" type="submit">${I.star(17)} Gökyüzüne gir</button>
      <button type="button" class="back-link" data-back style="margin:8px auto 0;display:flex">${I.back(16)} Geri dön</button></form>`);
    const inp = $<HTMLInputElement>('input', n);
    $('.pw-eye', n).addEventListener('click', () => {
      inp.type = inp.type === 'password' ? 'text' : 'password';
      inp.focus({ preventScroll: true });
    });
    $('[data-back]', n).addEventListener('click', backFn);
    n.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (inp.value.trim().length < 3) return err(n, 'Gizli kelime en az 3 harf olmalı.');
      const wait = lockedFor('secret');
      if (wait > 0) return err(n, waitMessage(wait));
      const b = $<HTMLButtonElement>('[type=submit]', n);
      b.innerHTML = `${spinner()} Yıldızlar açılıyor`;
      b.disabled = true;
      try {
        const ok = await unlockWithSecret(inp.value, fetchVerifyBlob, saveVerifyBlob);
        if (!ok) {
          b.disabled = false;
          b.innerHTML = `${I.star(17)} Gökyüzüne gir`;
          err(n, `Bu kelime gökyüzümüzün gizli kelimesiyle eşleşmiyor. ${waitMessage(recordFail('secret'))}`);
          return;
        }
        recordOk('secret');
      } catch (unlockErr) {
        b.disabled = false;
        b.innerHTML = `${I.star(17)} Gökyüzüne gir`;
        err(n, unlockErr instanceof Error ? unlockErr.message : 'Doğrulama yapılamadı, tekrar dene.');
        return;
      }
      (document.activeElement as HTMLElement | null)?.blur();
      await leave();
      onDone();
      setTimeout(() => void maybeOfferSetupSheets(app), 3600);
    });
    void swap(n);
    setTimeout(() => inp.focus({ preventScroll: true }), 450);
  };

  const leave = async () => {
    await el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-14px)' }],
      { duration: 420, easing: 'ease-in', fill: 'forwards' }
    ).finished;
    el.remove();
  };
  who();
}

/** Face ID denemesi. Gerçek uygulamada WebAuthn (platform authenticator) çağrısıdır.
 *  'ok' = tanındı · 'fail' = okunamadı/iptal · 'gesture' = iOS dokunuş istedi (otomatik başlatılamadı). */
export type FaceResult = 'ok' | 'fail' | 'gesture';
export const faceAuth = {
  async verify(): Promise<FaceResult> {
    if (hasBiometric()) {
      return verifyBiometricDetailed();
    }
    await sleep(700);
    return 'fail';
  },
};

/** Dönüş: kilit ekranı. Face ID AÇILIR AÇILMAZ kendiliğinden başlar (iOS gibi).
 *  Okuyamazsa/iptal edilirse doğrudan ŞİFRE sayfası açılır (giriş akışı değil). */
export function runLock(app: HTMLElement, onDone: () => void) {
  const el = h(`<div class="auth lock" style="justify-content:center">
    <div class="center" style="margin-top:-60px"><div class="display" style="font-size:42px">Bizim Gökyüzümüz</div>
    <div style="font:italic 500 19px var(--serif);color:var(--text-2);margin-top:10px">Tekrar hoş geldin ${PEOPLE[state.me].name}</div></div>
    <div style="position:absolute;left:24px;right:24px;bottom:calc(var(--safe-b) + 28px)" class="center">
      <button type="button" class="faceid glass press" data-f aria-label="Face ID ile aç">${I.face(36)}</button>
      <div class="small" data-st>Face ID</div>
      <button type="button" class="back-link" style="margin:14px auto 0;display:flex" data-pw>Şifreyle gir</button></div></div>`);
  app.appendChild(el);
  const f = $('[data-f]', el), st = $('[data-st]', el);
  let busy = false, done = false;
  const toPassword = () => {
    if (done) return;
    done = true;
    el.remove();
    runPasswordUnlock(app, onDone);
  };
  const attempt = async () => {
    if (busy || done) return;
    busy = true;
    st.textContent = 'Yüzün okunuyor…';
    f.style.color = '';
    const pulse = f.animate(
      [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.94)', opacity: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 900, iterations: Infinity, easing: 'ease-in-out' }
    );
    const r = await faceAuth.verify();
    pulse.cancel();
    busy = false;
    if (done) return;
    if (r === 'ok') {
      done = true;
      f.style.color = 'var(--ok)';
      st.textContent = 'Açıldı';
      f.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
      await sleep(380);
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' }).finished;
      el.remove();
      onDone();
    } else if (r === 'gesture') {
      // iOS otomatik başlatmaya izin vermedi: ekranın herhangi bir yerine tek dokunuş yeter
      st.textContent = 'Açmak için dokun';
      el.addEventListener(
        'pointerup',
        (e) => {
          if (!(e.target as HTMLElement).closest('[data-pw]')) void attempt();
        },
        { once: true }
      );
    } else {
      f.style.color = 'var(--danger)';
      st.textContent = 'Yüz tanınamadı';
      f.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
        { duration: 320 }
      );
      await sleep(650);
      toPassword();
    }
  };
  f.addEventListener('click', () => void attempt());
  $('[data-pw]', el).addEventListener('click', toPassword);
  setTimeout(() => void attempt(), 450); // kendiliğinden başlar
}

/** Kilitten şifreyle giriş: SADECE şifre sayfası. Kişi zaten bilinir; "Kimsin?" ve gizli kelime YOK. */
export function runPasswordUnlock(app: HTMLElement, onDone: () => void) {
  const el = h(`<div class="auth pwlock">
    <div class="brand"><div class="display">Bizim Gökyüzümüz</div><div class="sub">Tekrar hoş geldin ${PEOPLE[state.me].name}</div></div>
    <div class="stage"><form novalidate>
      <div class="eyebrow" style="margin:0 4px 10px">Şifren</div>
      <div class="field"><input type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="Şifren">
        <button type="button" class="pw-eye" aria-label="Şifreyi göster">${I.eye(19)}</button></div>
      <p class="small hint" style="margin:10px 4px 18px" data-msg>Gökyüzünü açmak için şifreni yaz.</p>
      <button class="btn btn-primary btn-block" type="submit">${I.star(17)} Gökyüzüne gir</button>
      ${state.settings.faceId ? `<button type="button" class="back-link" data-face style="margin:8px auto 0;display:flex">${I.face(16)} Face ID ile dene</button>` : ''}
    </form></div></div>`);
  app.appendChild(el);
  const form = $('form', el), inp = $<HTMLInputElement>('input', el);
  el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: E });
  $('.pw-eye', el).addEventListener('click', () => {
    inp.type = inp.type === 'password' ? 'text' : 'password';
    inp.focus({ preventScroll: true });
  });
  el.querySelector('[data-face]')?.addEventListener('click', () => {
    el.remove();
    runLock(app, onDone);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!inp.value) return err(form, 'Şifreni yazmalısın.');
    const wait = lockedFor('pw');
    if (wait > 0) return err(form, waitMessage(wait));
    (document.activeElement as HTMLElement | null)?.blur();
    const b = $<HTMLButtonElement>('[type=submit]', form);
    b.innerHTML = `${spinner()} Açılıyor`;
    b.disabled = true;
    if (isSupabaseConfigured) {
      const dbWho = toDbWho(state.me);
      const res = await signInWithPassword(USER_EMAILS[dbWho], inp.value, dbWho);
      if (!res.ok) {
        b.disabled = false;
        b.innerHTML = `${I.star(17)} Gökyüzüne gir`;
        if (res.error === 'Şifre doğru değil, tekrar dene') err(form, `Şifre yanlış. ${waitMessage(recordFail('pw'))}`);
        else err(form, res.error);
        return;
      }
      recordOk('pw');
      await loadSavedKey();
    } else {
      await sleep(500);
    }
    await el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).finished;
    el.remove();
    onDone();
  });
  setTimeout(() => inp.focus({ preventScroll: true }), 400);
}

async function maybeOfferSetupSheets(app: HTMLElement) {
  if (app.querySelector('.page, .sheet, .board, .watch, .cdpage')) return;
  if (!hasBiometric() && !state.settings.faceId) {
    offerFaceId(app);
  } else if (getNotificationPermission() === 'default' && !state.settings.notify) {
    offerNotify();
  }
}

export function offerFaceId(_app?: HTMLElement) {
  const c = h(`<div class="center" style="padding:4px 4px 0">
    <div class="faceid glass" style="margin-top:4px">${I.face(34)}</div>
    <div class="h2">Bir dahaki sefere Face ID ile açılsın mı?</div>
    <p class="body" style="margin:8px 0 20px">Şifre ve gizli kelime bu telefonda güvenle saklanır, sadece yüzünle açılır.</p>
    <button type="button" class="btn btn-primary btn-block" data-y>Face ID'yi aç</button>
    <button type="button" class="btn btn-ghost btn-block" data-n>Şimdi değil</button></div>`);
  const s = openSheet(c, {
    onClose: () => {
      if (getNotificationPermission() === 'default' && !state.settings.notify) {
        setTimeout(() => {
          if (!document.querySelector('.page, .sheet, .board, .watch, .cdpage')) offerNotify();
        }, 500);
      }
    },
  });
  $('[data-y]', c).addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('[data-y]', c);
    btn.disabled = true;
    const res = await enrollBiometric(toDbWho(state.me));
    btn.disabled = false;
    if (res.ok) {
      state.settings.faceId = true;
      saveSettings();
      toast('Face ID açıldı', I.face(14));
    } else {
      state.settings.faceId = false;
      saveSettings();
      toast(res.error, I.info(14), 3200);
    }
    void s.close();
  });
  $('[data-n]', c).addEventListener('click', () => {
    state.settings.faceId = false;
    saveSettings();
    void s.close();
  });
}

export function offerNotify() {
  const p = PEOPLE[state.partner];
  const c = h(`<div class="center" style="padding:4px 4px 0">
    <div class="faceid glass" style="margin-top:4px;color:var(--gold)">${I.bell(32)}</div>
    <div class="h2">${p.name} bir yıldız bırakınca haberin olsun</div>
    <p class="body" style="margin:8px 0 20px">Bildirimde içerik görünmez, sadece “${p.name} sana bir yıldız bıraktı” yazar.</p>
    <button type="button" class="btn btn-primary btn-block" data-y>Bildirimlere izin ver</button>
    <button type="button" class="btn btn-ghost btn-block" data-n>Daha sonra</button></div>`);
  const s = openSheet(c);
  $('[data-y]', c).addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('[data-y]', c);
    btn.disabled = true;
    const res = await subscribePushNotifications();
    btn.disabled = false;
    if (res.ok) {
      state.settings.notify = true;
      saveSettings();
      toast('Bildirimler açıldı', I.bell(14));
    } else {
      toast(res.error, I.info(14), 3400);
    }
    void s.close();
  });
  $('[data-n]', c).addEventListener('click', () => void s.close());
}

function err(form: HTMLElement, msg: string) {
  const f = $('.field', form);
  f.classList.add('error');
  const m = form.querySelector('[data-msg], .hint') as HTMLElement;
  m.textContent = msg;
  m.style.color = 'var(--danger)';
  f.classList.remove('shake');
  void f.offsetWidth;
  f.classList.add('shake');
  $('input', form).addEventListener(
    'input',
    () => {
      f.classList.remove('error');
      m.style.color = '';
    },
    { once: true }
  );
}

const spinner = () =>
  `<svg width="18" height="18" viewBox="0 0 24 24" style="animation:spin .8s linear infinite"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="40 20" stroke-linecap="round"/></svg>`;

export function applyPersona() {
  const r = document.documentElement.style;
  r.setProperty('--me', PEOPLE[state.me].color);
  r.setProperty('--partner', PEOPLE[state.partner].color);
  core.onPersona();
}
