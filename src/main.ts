import './styles/main.css';
import { clearActiveKey, loadSavedKey } from './lib/crypto';
import { sharedSvgDefs } from './lib/illustrations';
import { computeLinks, monthIdx, starMonthIdx } from './lib/links';
import {
  clearPinAndBiometric,
  disableBiometric,
  enrollBiometric,
  hasBiometric,
  hasPin,
  isPlatformBiometricSupported,
} from './lib/lock';
import { otherWho, PEOPLE } from './lib/people';
import {
  getNotificationPermission,
  isPushSupported,
  isVapidConfigured,
  subscribePushNotifications,
} from './lib/push';
import { registerServiceWorker } from './lib/pwa';
import {
  createEncryptedStar,
  fetchAllStars,
  formatTimeRemaining,
  formatUnlockAccusative,
  getServerNowMs,
  isStarLocked,
  markStarUnlockNotified,
  placeStarPosition,
  saveLocalStarsSnapshot,
  subscribeStarsRealtime,
  syncServerClock,
  type StarPayloadData,
} from './lib/stars';
import { STORAGE_KEYS, store } from './lib/storage';
import { getSessionAndProfile, isSupabaseConfigured, signOutSupabase } from './lib/supabase';
import { formatDayLine, pickGreeting } from './sky/greetings';
import { PANO, SkyEngine } from './sky/skyRenderer';
import { currentDecimalHour, formatHour, getSolarTimes } from './sky/solar';
import type { StarKind, StarRecord, Who } from './types';
import { initComposeSheet, type ComposeController } from './ui/composeSheet';
import { CountdownController } from './ui/countdown';
import { $, setInert } from './ui/dom';
import { showFloatNote } from './ui/floatNote';
import { GardenController } from './ui/garden';
import { initLetterModal, type LetterController } from './ui/letterModal';
import { initLockScreen } from './ui/lockScreen';
import { initOnboard } from './ui/onboard';
import { showToast } from './ui/toast';
import {
  CandleWhiteHeartController,
  claimUnseenSyncPair,
  clearActiveSyncWhiteHeart,
  showSyncWhiteHeart,
} from './ui/whiteHeart';

let currentMe: Who | null = store.get<Who | null>(STORAGE_KEYS.me, null);
let bioSupported = false;
let appMounted = false;
let skyEngine: SkyEngine | null = null;
let countdownCtrl: CountdownController | null = null;
let composeCtrl: ComposeController | null = null;
let letterCtrl: LetterController | null = null;
let gardenCtrl: GardenController | null = null;
let candleHeartCtrl: CandleWhiteHeartController | null = null;
let captionTimer = 0;
let greetPending = false;
let planeInterval = 0;
let perfTimer = 0;
let enterTimers: number[] = [];
let syncHeartCheckPending = false;
let pendingSyncHoldCount: number | null = null;
let syncStatDelayTimer = 0;

let stars: StarRecord[] = [];
let viewMonthK = monthIdx(new Date());
let links: [StarRecord, StarRecord][] = [];
let pairedIds = new Set<string>();
let unsubRealtime: (() => void) | null = null;
let unlockCheckTimer = 0;
let pushNudgeTimer = 0;

function clearEnterTimers(): void {
  for (const id of enterTimers) window.clearTimeout(id);
  enterTimers = [];
}

function getSeenUnlockIds(who: Who): Set<string> {
  return new Set(store.get<string[]>(`gokyuzu.unlockedSeen.${who}`, []));
}

function markSeenUnlockId(who: Who, id: string): void {
  const seen = getSeenUnlockIds(who);
  if (seen.has(id)) return;
  seen.add(id);
  store.set(`gokyuzu.unlockedSeen.${who}`, Array.from(seen));
}

function scheduleNextUnlockCheck(): void {
  window.clearTimeout(unlockCheckTimer);
  if (!currentMe) return;
  const nowMs = getServerNowMs();
  let earliest = Infinity;
  for (const s of stars) {
    if (s.unlockAt) {
      const ms = Date.parse(s.unlockAt);
      if (ms > nowMs && ms < earliest) earliest = ms;
    }
  }
  if (!Number.isFinite(earliest)) return;
  const delay = Math.min(86_400_000, Math.max(250, earliest - nowMs + 250));
  unlockCheckTimer = window.setTimeout(() => {
    void checkAndCelebrateUnlocks(false);
  }, delay);
}

async function checkAndCelebrateUnlocks(isStartup: boolean): Promise<void> {
  if (!currentMe) {
    scheduleNextUnlockCheck();
    return;
  }
  const me = currentMe;
  const nowMs = getServerNowMs();
  const seen = getSeenUnlockIds(me);

  const newlyUnlocked = stars.filter(
    (s) => s.unlockAt && Date.parse(s.unlockAt) <= nowMs && !seen.has(s.id)
  );

  for (const st of newlyUnlocked) {
    markSeenUnlockId(me, st.id);
    if (st.from !== me && !st.unlockNotified) {
      void markStarUnlockNotified(st);
    }
  }

  if (newlyUnlocked.length > 0) {
    for (const st of newlyUnlocked) {
      if (!isStartup && starMonthIdx(st) === viewMonthK && skyEngine) {
        skyEngine.markStarUnlockWake(st.id);
        const pos = skyEngine.getStarScreenPos(st);
        skyEngine.spawnBurst(pos.x, pos.y, 'gold', true);
      }
      syncSkyStars(st.id, !isStartup);
    }
    if (!isStartup) {
      checkSyncHeartMoment();
    }

    const latest = newlyUnlocked[newlyUnlocked.length - 1];
    const showUnlockToast = () => {
      if (latest.from !== me) {
        showToast(
          `${PEOPLE[latest.from].gen} zamanlı yıldızı açıldı`,
          'Şimdi açabilirsin',
          'gold',
          PEOPLE[latest.from].sign
        );
      } else {
        showToast(
          'Yıldızının kilidi açıldı',
          `${PEOPLE[otherWho(me)].name} artık açabilir`,
          'gold',
          PEOPLE[me].sign
        );
      }
    };

    if (isStartup) {
      window.setTimeout(showUnlockToast, 2600);
    } else {
      showUnlockToast();
    }
  }

  scheduleNextUnlockCheck();
}

const shortDateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const fmtShort = (iso: string): string => {
  const d = new Date(iso);
  return `${shortDateFmt.format(d)}, ${timeFmt.format(d)}`;
};

function computeTotalSyncCount(list: StarRecord[] = stars): number {
  const nowMs = getServerNowMs();
  const allMonthKeys = new Set(list.map(starMonthIdx));
  let total = 0;
  allMonthKeys.forEach((mk) => {
    total += computeLinks(list.filter((s) => starMonthIdx(s) === mk), nowMs).length;
  });
  return total;
}

let checkSyncHeartLockFn: () => boolean = () => false;

function checkSyncHeartMoment(): boolean {
  if (!appMounted || !currentMe || document.hidden || !document.body.classList.contains('awake') || checkSyncHeartLockFn()) {
    syncHeartCheckPending = true;
    return false;
  }
  const totalSync = computeTotalSyncCount();
  const stSyncEl = document.getElementById('st-sync');
  const prevSync = stSyncEl ? Number(stSyncEl.textContent || '0') : Math.max(0, totalSync - 1);

  if (!claimUnseenSyncPair(currentMe, stars, getServerNowMs())) {
    syncHeartCheckPending = false;
    return false;
  }

  syncHeartCheckPending = false;
  pendingSyncHoldCount = Math.min(prevSync, Math.max(0, totalSync - 1));
  if (stSyncEl) stSyncEl.textContent = String(pendingSyncHoldCount);

  showSyncWhiteHeart();
  window.clearTimeout(syncStatDelayTimer);
  syncStatDelayTimer = window.setTimeout(() => {
    syncStatDelayTimer = 0;
    pendingSyncHoldCount = null;
    const latest = computeTotalSyncCount();
    const el = document.getElementById('st-sync');
    if (el) {
      el.textContent = String(latest);
      el.classList.remove('sync-bump');
      void el.offsetWidth;
      el.classList.add('sync-bump');
    }
  }, 600);
  return true;
}

function viewStars(): StarRecord[] {
  return stars.filter((s) => starMonthIdx(s) === viewMonthK);
}

function syncSkyStars(freshStarId?: string, announceMilestones = false): boolean {
  const currentMonthStars = viewStars();
  links = computeLinks(currentMonthStars, getServerNowMs());
  pairedIds = new Set<string>();
  for (const [a, b] of links) {
    pairedIds.add(a.id);
    pairedIds.add(b.id);
  }
  skyEngine?.setStarsData(currentMonthStars, links);

  const hint = $('#empty-hint');
  const hasAny = stars.length > 0;
  hint.classList.toggle('off', currentMonthStars.length > 0);
  hint.textContent = hasAny ? 'Bu ayın gökyüzü seni bekliyor' : 'Gökyüzümüz ilk yıldızı bekliyor';

  const milestoneRes = gardenCtrl?.syncMilestones(stars.length);
  if (milestoneRes?.unlocked && announceMilestones) {
    const count = milestoneRes.unlocked;
    window.setTimeout(() => showToast('Bir lilyum daha açtı', `${count} yıldız oldu`, 'gold', '✿'), 3600);
  }

  if (!freshStarId || !skyEngine) return false;
  const pair = links.find(([a, b]) => a.id === freshStarId || b.id === freshStarId);
  if (!pair) return false;

  for (const st of pair) {
    skyEngine.markStarGoldify(st.id);
    const pos = skyEngine.getStarScreenPos(st);
    skyEngine.spawnBurst(pos.x, pos.y, 'gold', true);
  }
  return true;
}

function applyTheme(who: Who | null): void {
  if (who) {
    document.body.dataset.me = who;
  } else {
    delete document.body.dataset.me;
  }
}

function showSkyCaption(title: string, sub: string, ms: number): void {
  const capTitle = $('#sky-cap-t');
  const capSub = $('#sky-cap-s');
  const cap = $('#sky-cap');

  if (title) capTitle.textContent = title;
  capSub.textContent = sub;
  cap.classList.add('on');
  window.clearTimeout(captionTimer);
  if (ms > 0) {
    captionTimer = window.setTimeout(() => cap.classList.remove('on'), ms);
  }
}

function showGreeting(isLocked: boolean): void {
  if (!currentMe) return;
  if (isLocked) {
    greetPending = true;
    return;
  }
  const hour = skyEngine ? skyEngine.getCurrentHour() : currentDecimalHour();
  showSkyCaption(pickGreeting(currentMe, hour), formatDayLine(), 3600);
}

function markSeen(): void {
  if (currentMe && !skyEngine?.isTimelapseActive()) {
    store.set(STORAGE_KEYS.seen, Date.now());
  }
}

function maybeTimelapse(delayMs: number): boolean {
  const last = store.get<number | null>(STORAGE_KEYS.seen, null);
  if (!last || !currentMe || !skyEngine) return false;
  const gap = Date.now() - last;
  if (gap < 45 * 60 * 1000) return false;

  const prevDate = new Date(last);
  const fromH = prevDate.getHours() + prevDate.getMinutes() / 60;
  const delta = Math.min(24, gap / 3_600_000);
  const toH = (((fromH + delta) % 24) + 24) % 24;
  showSkyCaption(pickGreeting(currentMe, toH), `${formatHour(fromH)}  →  ${formatHour(toH)}`, 10000);
  skyEngine.startTimelapse(fromH, delta, delayMs, false);
  return true;
}

function canLaunchPlane(): boolean {
  if (!currentMe || !document.body.classList.contains('awake') || document.hidden) return false;
  if (skyEngine?.isTimelapseActive()) return false;
  if (document.querySelector('.sheet.open, .modal.open, #lock:not(.gone)')) return false;
  return true;
}

function tryPlane(attempt = 0): void {
  if (canLaunchPlane() && skyEngine?.launchPlane()) return;
  if (attempt < 8) {
    window.setTimeout(() => tryPlane(attempt + 1), 3000);
  }
}

function animateStarArrival(star: StarRecord, how: 'rise' | 'streak', origin?: { x: number; y: number }): void {
  if (!skyEngine) return;
  if (skyEngine.isTraveling()) skyEngine.abortTravel();
  const sm = starMonthIdx(star);
  if (sm !== viewMonthK) {
    viewMonthK = sm;
  }

  if (!stars.some((s) => s.id === star.id)) {
    stars.push(star);
    saveLocalStarsSnapshot(stars);
  }
  skyEngine.hideStarTemporarily(star.id, true);
  syncSkyStars(undefined, false);
  checkSyncHeartMoment();

  skyEngine.revealStarThen(star, () => {
    if (!skyEngine) return;
    const target = skyEngine.getStarScreenPos(star);
    const color = PEOPLE[star.from].color;

    const finish = () => {
      if (!skyEngine) return;
      skyEngine.hideStarTemporarily(star.id, false);
      skyEngine.markStarBorn(star.id);
      skyEngine.spawnBurst(target.x, target.y, color, true);
      skyEngine.triggerFlameFlare();
      if (syncSkyStars(star.id, true)) {
        window.setTimeout(
          () => showToast('Aynı saatte düşündünüz', 'İki yıldız da sarıya döndü', 'gold', '♡'),
          1400
        );
      }
    };

    if (how === 'rise') {
      const wickPos = gardenCtrl?.getWickScreenPos();
      const from =
        origin ??
        (wickPos
          ? { x: wickPos.x, y: wickPos.y - 16 }
          : { x: window.innerWidth / 2, y: window.innerHeight - 95 });
      skyEngine.launchComet(
        {
          from,
          to: target,
          ctrl: {
            x: from.x + (target.x - from.x) * 0.12,
            y: target.y + (from.y - target.y) * 0.2,
          },
          color,
          dur: 1250,
          tail: 80,
          ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        },
        finish
      );
    } else {
      const side = target.x > window.innerWidth / 2 ? 1 : -1;
      skyEngine.launchComet(
        {
          from: { x: target.x + side * (170 + Math.random() * 130), y: -30 },
          to: target,
          color,
          dur: 1050,
          tail: 130,
        },
        finish
      );
    }
  });
}

async function sendStarAction(params: {
  kind: StarKind;
  data: StarPayloadData;
  origin?: { x: number; y: number };
  mediaBytes?: Uint8Array<ArrayBuffer>;
  once?: boolean;
  unlockAt?: string | null;
}): Promise<void> {
  if (!currentMe || !skyEngine) return;
  const rect = skyEngine.getSkyRect();
  const pos = placeStarPosition({
    ox: skyEngine.getOx(),
    skyW: rect.width,
    skyH: rect.height,
    pano: PANO,
    existing: viewStars(),
  });

  try {
    const star = await createEncryptedStar({
      from: currentMe,
      kind: params.kind,
      data: params.data,
      pos,
      mediaBytes: params.mediaBytes,
      once: params.once,
      unlockAt: params.unlockAt,
    });
    animateStarArrival(star, params.kind === 'miss' ? 'streak' : 'rise', params.origin);
    scheduleNextUnlockCheck();

    const other = PEOPLE[otherWho(currentMe)];
    const msg = params.unlockAt
      ? ['Yıldızın kilitlendi', `${other.name}, ${formatUnlockAccusative(params.unlockAt, 'te')} açabilecek`]
      : params.kind === 'miss'
        ? (params.data.held ?? 0) >= 1.5
          ? ['Kocaman bir yıldız bıraktın', `${other.name}, onu ne kadar özlediğini görecek`]
          : ['Bir yıldız bıraktın', `${other.name}, onu düşündüğünü görecek`]
        : params.kind === 'photo'
          ? params.once
            ? ['Tek seferlik fotoğraf gitti', `${other.name} onu sadece bir kez görebilecek`]
            : ['Fotoğrafın gönderildi', `Artık ${other.gen} gökyüzünde`]
          : params.kind === 'voice'
            ? ['Sesin gönderildi', `${other.name} onu dinleyebilecek`]
            : ['Yıldızın gönderildi', `Artık ${other.gen} gökyüzünde`];

    window.setTimeout(
      () =>
        showToast(
          msg[0],
          msg[1],
          params.unlockAt ? 'gold' : PEOPLE[currentMe!].color,
          PEOPLE[currentMe!].sign
        ),
      1300
    );
  } catch (err) {
    showToast(
      'Gönderilemedi',
      err instanceof Error ? err.message : 'Tekrar dene',
      PEOPLE[currentMe].color,
      PEOPLE[currentMe].sign
    );
  }
}

function receiveIncomingStar(star: StarRecord): void {
  if (stars.some((s) => s.id === star.id)) return;
  animateStarArrival(star, 'streak');
  scheduleNextUnlockCheck();

  if (isStarLocked(star) && star.unlockAt) {
    window.setTimeout(
      () =>
        showToast(
          `${PEOPLE[star.from].name} sana kilitli bir yıldız bıraktı`,
          `${formatUnlockAccusative(star.unlockAt!, 'te')} açılacak`,
          'gold',
          PEOPLE[star.from].sign
        ),
      800
    );
    return;
  }

  const sub =
    star.kind === 'photo'
      ? star.once
        ? 'Tek seferlik bir fotoğraf gönderdi'
        : 'Sana bir fotoğraf gönderdi'
      : star.kind === 'voice'
        ? 'Sana sesli bir yıldız bıraktı'
        : 'Gökyüzüne yeni bir yıldız düştü';

  window.setTimeout(
    () => showToast(`${PEOPLE[star.from].name} seni düşündü`, sub, PEOPLE[star.from].color, PEOPLE[star.from].sign),
    800
  );
}

/* ---------- VisualViewport keyboard stabilization ---------- */
let resetKeyboardRef: (() => void) | null = null;

function setupKeyboardViewport(): void {
  const settle = () => {
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  };

  const sync = () => {
    settle();
    composeCtrl?.syncViewport();
  };

  resetKeyboardRef = () => {
    settle();
    composeCtrl?.syncViewport();
  };

  window.addEventListener('scroll', settle, { passive: true });

  const vv = window.visualViewport;
  if (vv) {
    let raf = 0;
    const onVv = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          sync();
        });
      }
    };
    vv.addEventListener('resize', onVv);
    vv.addEventListener('scroll', onVv);
  }

  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', () => {
    window.setTimeout(sync, 60);
  });
  window.addEventListener('blur', resetKeyboardRef);
}

/* ---------- Settings & Status UI ---------- */
function refreshUiStatus(): void {
  if (!currentMe) return;
  const person = PEOPLE[currentMe];
  const other = PEOPLE[otherWho(currentMe)];
  applyTheme(currentMe);
  skyEngine?.setWho(currentMe);
  composeCtrl?.syncIdentity(currentMe);

  const pinOn = hasPin();
  const bioOn = hasBiometric();

  const sMedal = $('#s-medal');
  sMedal.className = `medal ${person.color}`;
  sMedal.textContent = person.sign;
  $('#s-who').textContent = `${person.name.toLocaleUpperCase('tr-TR')} OLARAK GİRDİN`;

  const hamCount = stars.filter((s) => s.from === 'hamham').length;
  const betoCount = stars.filter((s) => s.from === 'beto').length;
  const totalSync = computeTotalSyncCount();
  const firstAt = stars.length > 0 ? Math.min(...stars.map((s) => Date.parse(s.createdAt))) : null;
  const daysSince = firstAt ? Math.max(1, Math.ceil((Date.now() - firstAt) / 86_400_000)) : 0;

  $('#st-total').textContent = String(stars.length);
  $('#st-sync').textContent = String(pendingSyncHoldCount ?? totalSync);
  $('#st-days').textContent = String(daysSince);
  $('#st-who-split').textContent = `Ham ham: ${hamCount} ${PEOPLE.hamham.sign} · Beto: ${betoCount} ${PEOPLE.beto.sign}`;

  const perm = getNotificationPermission();
  if (!isPushSupported()) {
    $('#s-push-t').textContent = 'Bildirimler (Ana Ekrana Ekle)';
    $('#s-push-s').textContent = 'iPhone’da bildirim için paylaş → Ana Ekrana Ekle gerekir';
  } else if (!isVapidConfigured()) {
    $('#s-push-t').textContent = 'Bildirimler hazırlanıyor';
    $('#s-push-s').textContent = 'VAPID anahtarı tanımlandığında açılır';
  } else if (perm === 'granted') {
    $('#s-push-t').textContent = 'Bildirimler açık';
    $('#s-push-s').textContent = `${other.name} yıldız bıraktığında bildirim gelir`;
  } else {
    $('#s-push-t').textContent = 'Bildirimleri aç';
    $('#s-push-s').textContent = `${other.name} seni düşündüğünde bildirim al`;
  }

  $('#s-lock-t').textContent = pinOn ? 'Uygulama kilidini kapat' : 'Uygulama kilidi kur';
  $('#s-lock-s').textContent = pinOn
    ? 'Şu an açılışta ve 2 dk arka planda kalınca PIN soruluyor'
    : 'Açılışta 4 haneli şifre sorsun';

  const faceItem = $('#s-faceid') as HTMLButtonElement;
  faceItem.hidden = !(pinOn && bioSupported);
  if (pinOn && bioSupported) {
    $('#s-faceid-t').textContent = bioOn ? 'Face ID ile açılışı kapat' : 'Face ID ile açılışı aç';
    $('#s-faceid-s').textContent = bioOn
      ? 'Şu an Face ID / Touch ID aktif'
      : 'PIN yanında Face ID / Touch ID kullan';
  }
}

async function handleStarTap(star: StarRecord, pt: { x: number; y: number }): Promise<void> {
  if (!currentMe) return;

  if (isStarLocked(star) && star.unlockAt) {
    skyEngine?.markStarShake(star.id);
    const otherName = PEOPLE[otherWho(currentMe)].name;
    const title =
      star.from === currentMe
        ? `Kilitli yıldız · ${otherName} için`
        : `${PEOPLE[star.from].abl} kilitli bir yıldız`;
    const sub = `${formatUnlockAccusative(star.unlockAt, 'te')} açılacak · ${formatTimeRemaining(star.unlockAt)}`;
    showFloatNote(pt, `${title}<small>${sub}</small>`);
    return;
  }

  if (star.from === currentMe) {
    skyEngine?.markStarShake(star.id);
    const lbl =
      star.kind === 'photo'
        ? star.once
          ? 'Tek seferlik fotoğraf'
          : 'Fotoğraf'
        : star.kind === 'voice'
          ? 'Sesli mesaj'
          : star.kind === 'miss'
            ? 'Düşündüm'
            : 'Mektup';
    const seen =
      (star.spent ? 'görüldü ve kayboldu' : star.openedAt ? 'açıldı' : 'henüz açılmadı') +
      (pairedIds.has(star.id) ? ' · aynı saatte' : '');
    showFloatNote(
      pt,
      `Bu yıldız artık ${PEOPLE[otherWho(currentMe)].gen}<small>${lbl} · ${fmtShort(star.createdAt)} · ${seen}</small>`
    );
    return;
  }

  await letterCtrl?.open({
    star,
    starPos: pt,
    me: currentMe,
    allStars: stars,
    isPaired: pairedIds.has(star.id),
  });
}

async function bootstrap(): Promise<void> {
  $('#defs').innerHTML = sharedSvgDefs();
  void registerServiceWorker();
  setupKeyboardViewport();
  bioSupported = await isPlatformBiometricSupported();

  const appRoot = $('#app-root');
  const shellTpl = $('#app-shell-tpl') as HTMLTemplateElement;

  let onboard: ReturnType<typeof initOnboard>;
  let openSettingsFn: (() => void) | null = null;
  let closeSettingsFn: (() => void) | null = null;
  let schedulePushNudgeFn: (() => void) | null = null;

  const unmountAppShell = () => {
    clearEnterTimers();
    window.clearTimeout(pushNudgeTimer);
    window.clearTimeout(unlockCheckTimer);
    window.clearTimeout(syncStatDelayTimer);
    window.clearInterval(perfTimer);
    window.clearInterval(planeInterval);
    perfTimer = 0;
    planeInterval = 0;
    syncStatDelayTimer = 0;
    pendingSyncHoldCount = null;
    syncHeartCheckPending = false;
    unsubRealtime?.();
    unsubRealtime = null;
    candleHeartCtrl?.destroy();
    candleHeartCtrl = null;
    clearActiveSyncWhiteHeart();
    skyEngine?.destroy();
    skyEngine = null;
    gardenCtrl?.destroy();
    gardenCtrl = null;
    countdownCtrl?.destroy();
    countdownCtrl = null;
    composeCtrl = null;
    letterCtrl = null;
    openSettingsFn = null;
    closeSettingsFn = null;
    schedulePushNudgeFn = null;
    document.body.classList.remove('awake', 'quiet', 'sheet-open', 'sched-open');
    appRoot.innerHTML = '';
    appMounted = false;
  };

  const lock = initLockScreen({
    getMe: () => currentMe,
    onUnlock: () => {
      document.body.classList.add('awake');
      refreshUiStatus();
      if (greetPending) {
        greetPending = false;
        window.setTimeout(() => showGreeting(false), 450);
      }
      if (syncHeartCheckPending) {
        window.setTimeout(() => checkSyncHeartMoment(), 550);
      }
    },
    onForgotReset: async () => {
      unmountAppShell();
      await clearActiveKey();
      store.del(STORAGE_KEYS.me);
      currentMe = null;
      await signOutSupabase();
      onboard.show();
    },
    onStatusChange: refreshUiStatus,
  });

  const mountAppShell = () => {
    if (appMounted) return;
    appMounted = true;
    appRoot.appendChild(shellTpl.content.cloneNode(true));

    countdownCtrl = new CountdownController();

    $('#countdown').addEventListener('click', (e) => {
      if (!currentMe) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      showFloatNote(
        { x: r.left + r.width / 2, y: r.top, height: r.height },
        `9 Ocak'ta yeniden konuşacağız<small>${
          currentMe === 'beto' ? 'Senin doğum günün' : "Beto'nun doğum günü"
        } · açan her çiçek yolun bir parçası</small>`
      );
    });

    gardenCtrl = new GardenController({
      onCandleTap: (candleEl) => {
        skyEngine?.triggerFlameFlare();
        const left = gardenCtrl?.getDaysRemaining() ?? 0;
        const r = candleEl.getBoundingClientRect();
        showFloatNote(
          { x: r.left + r.width / 2, y: r.top, height: r.height },
          left > 0
            ? `Bu mum 9 Ocak'a kadar yanacak<small>Her gün biraz eriyor · ${left} gün kaldı</small>`
            : 'Bu mum ikimiz için yandı'
        );
      },
      onRaspberryTap: (raspEl) => {
        const r = raspEl.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        skyEngine?.spawnBurst(cx, cy, 'pink', false);
        showFloatNote(
          { x: cx, y: cy, height: r.height },
          currentMe === 'beto'
            ? "Senin için toplandı<small>Ham ham'dan, ahududu kokulu</small>"
            : "Beto'nun en sevdiği<small>9 Ocak'a bir sepet saklıyorum</small>"
        );
      },
    });

    const skyEl = $('#sky');
    const compassEl = $('#compass');
    const compassThumb = $('#cp-thumb');

    skyEngine = new SkyEngine({
      canvas: $('#sky-canvas') as HTMLCanvasElement,
      moonCanvas: $('#sky-moon') as HTMLCanvasElement,
      skyElement: skyEl,
      compassElement: compassEl,
      compassThumb,
      travelLabelElement: $('#tlabel'),
      getWickPos: () => gardenCtrl?.getWickScreenPos() ?? null,
      getBloomPositions: () => gardenCtrl?.getBloomScreenCenters() ?? [],
      getAllStars: () => stars,
      getViewMonth: () => viewMonthK,
      getNowMs: getServerNowMs,
      onSelectMonth: (monthK, item) => {
        if (monthK !== viewMonthK) {
          viewMonthK = monthK;
          skyEngine?.centerPanorama();
          syncSkyStars();
        }
        showSkyCaption(item.title, item.n ? `${item.n} YILDIZ` : 'HENÜZ YILDIZ YOK', 2800);
      },
      onWithoutChange: (active) => {
        if (active) {
          showSkyCaption('Sensiz gökyüzü', 'BIRAKINCA DÖNERİZ', 0);
        } else {
          showSkyCaption('Seninle gökyüzü', `${stars.length} YILDIZ`, 2600);
        }
      },
      onHeartStart: () => {
        window.setTimeout(
          () => showToast('Bütün yıldızlarımız', 'Hepsi birlikte bir kalp', 'gold', '♡'),
          1500
        );
      },
      onCaption: (title, sub, ms) => {
        const capT = $('#sky-cap-t').textContent || '';
        showSkyCaption(title || capT, sub, ms);
      },
      onTimelapseEnd: () => {
        markSeen();
        refreshUiStatus();
      },
      onStarTap: (star, pt) => {
        void handleStarTap(star, pt);
      },
      onOrbTap: (orb, pt) => {
        if (orb === 'moon') {
          const info = skyEngine!.getMoonInfo();
          showFloatNote(pt, `Şu an aynı Ay'a bakıyoruz<small>${info.name} · %${info.illum} aydınlık · iki kez dokun</small>`);
        } else {
          const { rise, set } = getSolarTimes();
          showFloatNote(
            pt,
            `Aynı Güneş ikimizi de ısıtıyor<small>Doğuş ${formatHour(rise)} · batış ${formatHour(set)} · iki kez dokun</small>`
          );
        }
      },
    });

    candleHeartCtrl = new CandleWhiteHeartController({
      getWickPos: () => gardenCtrl?.getWickScreenPos() ?? null,
    });

    composeCtrl = initComposeSheet({
      getMe: () => currentMe,
      onSend: (params) => {
        void sendStarAction(params);
      },
    });

    letterCtrl = initLetterModal({
      onBurst: (x, y, color, big) => skyEngine?.spawnBurst(x, y, color, big),
      onStarUpdated: (updated) => {
        const idx = stars.findIndex((s) => s.id === updated.id);
        if (idx >= 0) stars[idx] = updated;
        saveLocalStarsSnapshot(stars);
        syncSkyStars();
      },
      getStarScreenPos: (star) =>
        skyEngine?.getStarScreenPos(star) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });

    // DÜŞÜNDÜM button (tap + 3s hold charge)
    const missBtn = $('#btn-miss') as HTMLButtonElement;
    let charge: { t0: number } | null = null;
    const chargeLoop = () => {
      if (!charge) return;
      const held = (performance.now() - charge.t0) / 1000;
      const p = Math.min(1, held / 3);
      missBtn.style.setProperty('--p', p.toFixed(3));
      requestAnimationFrame(chargeLoop);
    };
    const chargeEnd = (cancel: boolean) => {
      if (!charge) return;
      const held = Math.min(3, (performance.now() - charge.t0) / 1000);
      charge = null;
      missBtn.classList.remove('charging');
      missBtn.style.setProperty('--p', '0');
      if (cancel) return;

      missBtn.classList.remove('pop');
      void missBtn.offsetWidth;
      missBtn.classList.add('pop');

      if (held < 0.3 && !store.get<number | null>(STORAGE_KEYS.hint, null)) {
        store.set(STORAGE_KEYS.hint, 1);
        const r = missBtn.getBoundingClientRect();
        window.setTimeout(
          () =>
            showFloatNote(
              { x: r.left + r.width / 2, y: r.top, height: r.height },
              'Basılı da tutabilirsin<small>Ne kadar uzun tutarsan yıldız o kadar büyür</small>'
            ),
          300
        );
      }

      const ic = missBtn.querySelector('.act-ic')!.getBoundingClientRect();
      void sendStarAction({
        kind: 'miss',
        data: { text: '', held: +held.toFixed(1) },
        origin: { x: ic.left + ic.width / 2, y: ic.top + ic.height / 2 },
      });
    };
    missBtn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
    missBtn.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || charge) return;
      e.preventDefault();
      try {
        missBtn.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      charge = { t0: performance.now() };
      missBtn.classList.add('charging');
      chargeLoop();
    });
    missBtn.addEventListener('pointerup', () => chargeEnd(false));
    missBtn.addEventListener('pointercancel', () => {
      if (charge && (performance.now() - charge.t0) / 1000 >= 0.35) {
        chargeEnd(false);
      } else {
        chargeEnd(true);
      }
    });
    missBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    missBtn.addEventListener('selectstart', (e) => e.preventDefault());

    $('#btn-write').addEventListener('click', () => {
      if (!currentMe) return;
      composeCtrl?.open(currentMe);
    });

    const settingsSheet = $('#settings');
    openSettingsFn = () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      resetKeyboardRef?.();
      refreshUiStatus();
      document.body.classList.add('sheet-open');
      settingsSheet.classList.add('open');
      setInert(settingsSheet, false);
    };
    closeSettingsFn = () => {
      settingsSheet.classList.remove('open');
      document.body.classList.remove('sheet-open');
      resetKeyboardRef?.();
      setInert(settingsSheet, true);
    };

    $('#menu').addEventListener('click', () => openSettingsFn?.());
    settingsSheet.addEventListener('click', (e) => {
      if (e.target === settingsSheet) closeSettingsFn?.();
    });

    $('#s-push').addEventListener('click', async () => {
      if (!currentMe) return;
      const res = await subscribePushNotifications();
      refreshUiStatus();
      if (res.ok) {
        showToast('Bildirimler açıldı', 'Yeni yıldızlarda haber alacaksın', PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      } else {
        showToast('Bildirim açılamadı', res.error, PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      }
    });

    $('#s-lock').addEventListener('click', () => {
      if (!currentMe) return;
      if (hasPin()) {
        clearPinAndBiometric();
        refreshUiStatus();
        showToast('Kilit kapatıldı', 'Uygulama artık şifre sormayacak', PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      } else {
        closeSettingsFn?.();
        window.setTimeout(() => lock.show('set1'), 280);
      }
    });

    $('#s-faceid').addEventListener('click', async () => {
      if (!currentMe) return;
      if (hasBiometric()) {
        disableBiometric();
        refreshUiStatus();
        showToast('Face ID kapatıldı', '4 haneli PIN devam ediyor', PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
        return;
      }
      const res = await enrollBiometric(currentMe);
      refreshUiStatus();
      if (res.ok) {
        showToast('Face ID açıldı', 'Kilit ekranında Face ID kullanabilirsin', PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      } else {
        showToast('Face ID açılamadı', res.error, PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      }
    });

    const pushNudgeEl = $('#push-nudge');
    const pushYesBtn = $('#push-yes') as HTMLButtonElement;
    const pushLaterBtn = $('#push-later') as HTMLButtonElement;

    $('#s-out').addEventListener('click', async () => {
      closeSettingsFn?.();
      pushNudgeEl.hidden = true;
      unmountAppShell();
      await clearActiveKey();
      store.del(STORAGE_KEYS.me);
      currentMe = null;
      await signOutSupabase();
      onboard.show();
    });

    // Gizli performans paneli: Ayarlar'da sürüm numarasına 5 kez dokununca açılır/kapanır
    const perfHud = $('#perf-hud');
    const verBtn = $('#s-ver');
    let verTaps: number[] = [];

    const renderPerfHud = () => {
      if (perfHud.hidden || !skyEngine) return;
      const st = skyEngine.getPerfStats();
      const modeLabel =
        st.mode === 'active' ? '60fps' : st.mode === 'idle' ? '25fps' : st.mode === 'quiet' ? '10fps' : 'durdu';
      perfHud.textContent = `Son ${st.samples} kare · Ort ${st.avgMs} ms · En kötü ${st.maxMs} ms · ${st.fps} fps (${modeLabel})`;
    };

    const togglePerfHud = (show: boolean) => {
      perfHud.hidden = !show;
      window.clearInterval(perfTimer);
      if (show) {
        renderPerfHud();
        perfTimer = window.setInterval(renderPerfHud, 400);
      }
    };

    verBtn.addEventListener('click', () => {
      const now = Date.now();
      verTaps = verTaps.filter((t) => now - t < 2500);
      verTaps.push(now);
      if (verTaps.length >= 5) {
        verTaps = [];
        const nextShow = perfHud.hidden;
        togglePerfHud(nextShow);
        showToast(
          nextShow ? 'Performans kutusu açıldı' : 'Performans kutusu kapatıldı',
          'Son 120 kare ortalaması / en kötü süresi',
          'gold',
          '✦'
        );
      }
    });
    perfHud.addEventListener('click', () => togglePerfHud(false));

    type PushPromptState = { dismissedAt?: number; askedCount?: number; done?: boolean };
    const WEEK_MS = 7 * 86_400_000;

    schedulePushNudgeFn = () => {
      window.clearTimeout(pushNudgeTimer);
      if (!appMounted || !currentMe || !document.body.classList.contains('awake')) return;
      if (!isPushSupported() || getNotificationPermission() !== 'default') return;

      const st = store.get<PushPromptState>(STORAGE_KEYS.pushPrompt, {});
      if (st.done) return;
      if (st.dismissedAt) {
        if ((st.askedCount ?? 1) >= 2) return;
        if (Date.now() - st.dismissedAt < WEEK_MS) return;
      }

      if (document.querySelector('.sheet.open, .modal.open, #lock:not(.gone)')) {
        pushNudgeTimer = window.setTimeout(() => schedulePushNudgeFn?.(), 5000);
        return;
      }
      pushNudgeEl.hidden = false;
    };

    pushYesBtn.addEventListener('click', async () => {
      pushNudgeEl.hidden = true;
      store.set<PushPromptState>(STORAGE_KEYS.pushPrompt, { done: true });
      if (!currentMe) return;
      const res = await subscribePushNotifications();
      refreshUiStatus();
      if (res.ok) {
        showToast('Bildirimler açıldı', 'Yeni yıldızlarda haber alacaksın', PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      } else {
        showToast('Bildirim açılamadı', res.error, PEOPLE[currentMe].color, PEOPLE[currentMe].sign);
      }
    });

    pushLaterBtn.addEventListener('click', () => {
      pushNudgeEl.hidden = true;
      const prev = store.get<PushPromptState>(STORAGE_KEYS.pushPrompt, {});
      const nextCount = (prev.askedCount ?? 0) + 1;
      store.set<PushPromptState>(STORAGE_KEYS.pushPrompt, {
        dismissedAt: Date.now(),
        askedCount: nextCount,
        done: nextCount >= 2,
      });
    });

    planeInterval = window.setInterval(() => {
      if (canLaunchPlane() && Math.random() < 0.5) {
        skyEngine?.launchPlane();
      }
    }, 300_000);
  };

  async function enterApp(who: Who): Promise<void> {
    clearEnterTimers();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    resetKeyboardRef?.();
    currentMe = who;
    store.set(STORAGE_KEYS.me, who);
    mountAppShell();
    onboard.hide();
    refreshUiStatus();
    skyEngine?.resize();
    window.setTimeout(() => skyEngine?.refreshCachedPositions(), 100);

    stars = await fetchAllStars(who);
    syncSkyStars();
    void checkAndCelebrateUnlocks(true);

    unsubRealtime?.();
    unsubRealtime = subscribeStarsRealtime(who, {
      onInsert: (incoming) => {
        if (incoming.from !== currentMe) {
          receiveIncomingStar(incoming);
        }
      },
      onUpdate: (updated) => {
        const idx = stars.findIndex((s) => s.id === updated.id);
        if (idx >= 0) {
          stars[idx] = updated;
          syncSkyStars();
          void checkAndCelebrateUnlocks(false);
        }
      },
    });

    const newest = stars.length > 0 ? stars[stars.length - 1] : null;
    if (newest && skyEngine) {
      const worldW = skyEngine.getSkyW() * PANO;
      const targetOx = Math.max(0, Math.min(skyEngine.getMaxOx(), (newest.x / 100) * worldW - skyEngine.getSkyW() / 2));
      skyEngine.setOx(targetOx);
    } else {
      skyEngine?.centerPanorama();
    }

    skyEngine?.triggerEnterReveal();
    requestAnimationFrame(() => document.body.classList.add('awake'));
    checkSyncHeartLockFn = () => lock.isLocked();
    if (lock.isLocked()) {
      syncHeartCheckPending = true;
    } else {
      enterTimers.push(window.setTimeout(() => checkSyncHeartMoment(), 850));
    }

    const compassEl = $('#compass');
    if (!maybeTimelapse(1400)) {
      enterTimers.push(window.setTimeout(() => showGreeting(lock.isLocked()), 1350));
    }

    enterTimers.push(window.setTimeout(() => tryPlane(), 6500));
    enterTimers.push(window.setTimeout(() => schedulePushNudgeFn?.(), 12_000));

    if (!store.get<number | null>(STORAGE_KEYS.pan, null)) {
      enterTimers.push(
        window.setTimeout(() => {
          if (!appMounted || !document.body.classList.contains('awake') || store.get(STORAGE_KEYS.pan, null) || !skyEngine) {
            return;
          }
          store.set(STORAGE_KEYS.pan, 1);
          const cr = compassEl.getBoundingClientRect();
          showFloatNote(
            { x: cr.left + cr.width / 2, y: cr.top, height: cr.height },
            'Gökyüzünü kaydırabilirsin<small>Bir yıl boyunca yıldızlarımıza yer var</small>'
          );
          const startOx = skyEngine.getOx();
          skyEngine.panTo(startOx + skyEngine.getSkyW() * 0.4, 1000, () => {
            window.setTimeout(() => skyEngine?.panTo(startOx, 1000), 300);
          });
        }, 3200)
      );
    }
  }

  onboard = initOnboard({
    onPreviewTheme: applyTheme,
    onComplete: (who) => void enterApp(who),
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appMounted) {
      letterCtrl?.close();
      composeCtrl?.close();
      closeSettingsFn?.();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetKeyboardRef?.();
      if (appMounted) markSeen();
      return;
    }
    resetKeyboardRef?.();
    if (!appMounted) return;
    if (document.body.classList.contains('awake') && !lock.isLocked()) {
      void syncServerClock().then(() => checkAndCelebrateUnlocks(false));
      const lastSeen = store.get<number>(STORAGE_KEYS.seen, 0);
      if (!maybeTimelapse(700) && Date.now() - lastSeen > 20 * 60 * 1000) {
        window.setTimeout(() => showGreeting(lock.isLocked()), 600);
      }
      if (Date.now() - lastSeen > 20 * 60 * 1000) {
        window.setTimeout(() => tryPlane(), 6500);
      }
    }
  });
  window.addEventListener('pagehide', () => {
    if (appMounted) markSeen();
  });
  window.setInterval(() => {
    if (appMounted) markSeen();
  }, 60_000);

  // Startup restoration
  const keyLoaded = await loadSavedKey();
  if (isSupabaseConfigured) {
    const { session, profile } = await getSessionAndProfile();
    if (session && profile && keyLoaded) {
      currentMe = profile.who;
      if (hasPin()) lock.show('unlock');
      await enterApp(profile.who);
      return;
    }
  } else if (currentMe && keyLoaded) {
    if (hasPin()) lock.show('unlock');
    await enterApp(currentMe);
    return;
  }

  store.del(STORAGE_KEYS.me);
  currentMe = null;
  onboard.show();
}

void bootstrap();
