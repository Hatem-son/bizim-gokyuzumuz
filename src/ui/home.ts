// Ana ekran: gökyüzü + lilyumla süslü sayaç + çentik bildirimleri + kumsalda palmiyeler ve ikimizin mumu + alt menü.
import { h, $, toast, island } from './ui';
import { I, SIGN } from './icons';
import { jarSVG, raspberry } from './art';
import { lilyBloom } from './lily';
import { palmSVG } from './palm';
import { state, PEOPLE, untilParts, Star } from './state';
import { core } from './core';
import { KIND_TR } from '../gokyuzu/weather';
import { getServerNowMs } from '../lib/stars';
import { updateAppBadge } from '../lib/pwa';

let homeTickId = 0;

export function buildHome(): HTMLElement {
  clearInterval(homeTickId);
  const el = h(`<div class="screen home" style="z-index:8">
    <div class="scrim-top"></div><div class="scrim-bot"></div>
    <header class="home-top">
      <button type="button" class="counter press" aria-label="9 Ocak'a kalan süre">
        <div class="eyebrow">9 Ocak'a</div>
        <div class="cnum"><b class="num" data-days>0</b><i>gün</i><span class="lz-main">${lilyBloom(42, 18, 'sway')}</span><span class="lz-small">${lilyBloom(20, -34)}</span></div>
        <div class="csub" data-hm></div>
      </button>
      <div class="top-r">
        <button type="button" class="pill glass press" data-count aria-label="Yıldızlarımız">${I.starFill(13)}<span class="num" data-n></span></button>
        <button type="button" class="pill glass press hide" data-wx aria-label="Hava durumu"></button>
      </div>
    </header>
    <nav class="dock glass" aria-label="Ana menü">
      <button type="button" class="icon-btn" data-arch aria-label="Yıldızlarımız">${I.archive(22)}<span class="badge hide"></span></button>
      <button type="button" class="btn btn-primary send" data-send>${state.me === 'beto' ? `<span class="rb">${raspberry(12)}</span>` : I.star(18)}<span>Yıldız bırak</span></button>
      <button type="button" class="icon-btn" data-set aria-label="Ayarlar">${I.gear(22)}</button>
    </nav>
  </div>`);
  core.homeEl = el;

  $('[data-send]', el).addEventListener('click', () => core.openCompose());
  $('[data-arch]', el).addEventListener('click', () => core.openArchive());
  $('[data-count]', el).addEventListener('click', () => core.openArchive());
  $('[data-set]', el).addEventListener('click', () => core.openSettings());
  $('.counter', el).addEventListener('click', () => core.openCountdown());
  $('[data-wx]', el).addEventListener('click', () => {
    const w = core.engine.weather;
    const place = state.settings.weather === 'city' && state.settings.city ? state.settings.city : 'Konumum';
    toast(`${place} · ${KIND_TR[w.kind]}${isNaN(w.temp) ? '' : ` · ${Math.round(w.temp)}°`}`, wxIcon(w.kind));
  });

  const tick = (initial = false) => {
    if (document.hidden) return;
    if (!initial && !el.isConnected) {
      clearInterval(homeTickId);
      return;
    }
    const p = untilParts(state.meetDate.getTime());
    $('[data-days]', el).textContent = String(p.d);
    $('[data-hm]', el).textContent = `${p.h} saat · ${String(p.m).padStart(2, '0')} dakika`;
  };
  tick(true);
  homeTickId = window.setInterval(() => tick(false), 15_000);
  core.refreshHome = () => refresh(el);
  refresh(el);
  return el;
}

/** Kumsal ön planı: palmiyeler + mumlar. 360° panoramada her öğe kendi dünya x'inde durur;
 *  placeForeground her karede en yakın kopyaya yerleştirir (sonsuz kaydırma, palmiyeler tekrar tekrar karşına çıkar). */
export type FgItem = { el: HTMLElement; wx: number; w: number; shown: boolean };
export function buildForeground(P: number, H: number, shoreY: number, x0: number): HTMLElement {
  void P;
  const fg = h(`<div class="scene-fg" style="width:100%"></div>`);
  const items: FgItem[] = [];
  const add = (wx: number, top: number, w: number, inner: string, style = '', ox = 50) => {
    const el = h(`<div class="fgi" style="position:absolute;left:0;top:${top}px;width:${w}px;will-change:transform"><div style="${style || `transform-origin:${ox}% 100%`};will-change:transform">${inner}</div></div>`);
    fg.appendChild(el);
    items.push({ el, wx, w, shown: true });
    return el;
  };
  const sc = (k: number) => `opacity:.85;transform:scale(${k});transform-origin:bottom left`;
  // ana palmiye (fenerler bunun dalında) + sağ orta + uzak küçükler; çemberin etrafında seyrek ek palmiyeler
  const main = add(x0 - 215, H - 470, 300, palmSVG({ seed: 3, base: { x: 18, y: 470 }, top: { x: 120, y: 92 }, bend: -46, trunkW: 15, fronds: 12, frondLen: 132, w: 300, h: 470, extendBase: 96 }), '', 6);
  add(x0 + 100, H - 360, 220, palmSVG({ seed: 9, base: { x: 160, y: 360 }, top: { x: 92, y: 120 }, bend: 34, trunkW: 11, fronds: 10, frondLen: 98, w: 220, h: 360, extendBase: 96 }), '', 73);
  add(x0 - 520, shoreY + 34 - 300 * 0.55, 132, palmSVG({ seed: 21, base: { x: 60, y: 300 }, top: { x: 110, y: 70 }, bend: -20, trunkW: 12, fronds: 10, frondLen: 100, w: 240, h: 300 }), sc(0.55));
  add(x0 + 430, shoreY + 34 - 300 * 0.5, 120, palmSVG({ seed: 33, base: { x: 120, y: 300 }, top: { x: 80, y: 60 }, bend: 24, trunkW: 12, fronds: 10, frondLen: 100, w: 240, h: 300 }), sc(0.5));
  // Palmiyeler iç içe geçmesin ve denize kaymasın: aralar >= ~250 px, küçüklerin dibi kumda (shoreY + 24 + 30k), büyüklerin gövdesi ekran altına +96px kesintisiz uzanır.
  const extra: [number, number, number, number, number][] = [
    [-330, 73, -14, 0.4, 1], [560, 107, -30, 0.8, 0], [900, 113, 22, 0.42, 1],
    [1000, 41, 28, 0.7, 0], [1300, 47, -22, 0.5, 1], [1690, 53, 30, 0.82, 0], [1900, 59, -26, 0.45, 1],
    [2150, 61, -30, 0.66, 0], [2400, 67, 20, 0.4, 1], [2560, 89, -26, 0.6, 0],
  ];
  for (const [dx, seed, bend, k, kind] of extra) {
    const hgt = kind ? 300 : 380, wd = kind ? 240 : 230;
    add(
      x0 + dx,
      kind ? shoreY + 24 + 30 * k - 300 * k : H - 380 * k,
      wd * k,
      palmSVG({ seed, base: { x: wd / 2, y: hgt }, top: { x: wd / 2 + bend * 1.4, y: 80 }, bend, trunkW: kind ? 12 : 11, fronds: 10, frondLen: kind ? 100 : 98, w: wd, h: hgt, extendBase: kind ? 0 : 140 }),
      sc(k)
    );
  }
  (fg as HTMLElement & { _items: FgItem[] })._items = items;
  const me = state.me, pa = state.partner;
  const lantern = (who: typeof me, x: number, y: number, rope: number, cls: string) => {
    const l = h(`<div class="lantern ${cls}" style="left:${x}px;top:${y}px">
      <div class="swing">
        <svg class="rope" width="40" height="${rope + 14}" viewBox="-20 0 40 ${rope + 14}"><path d="M0 0 L0 ${rope}" stroke="var(--rope)" stroke-width="1"/>
          <path d="M-13 ${rope + 13} Q0 ${rope - 9} 13 ${rope + 13}" stroke="var(--rope)" stroke-width="1.2" fill="none"/><circle cx="0" cy="${rope}" r="1.6" fill="var(--rope)"/></svg>
        ${jarSVG(who).replace('class="jar ', `class="jar ${cls} `).replace('<div class="jar', `<div style="top:${rope + 8}px" class="jar`)}
      </div></div>`);
    return l;
  };
  const L1 = lantern(me, 193, 113, 64, 'mine');
  const L2 = lantern(pa, 145, 128, 92, 'partner');
  if (partnerIsOnline) {
    L2.classList.add('on');
    L2.querySelector('.jar')?.classList.add('on');
  }
  (main.firstElementChild as HTMLElement).style.position = 'relative';
  main.firstElementChild!.append(L2, L1);
  const mine = L1.querySelector('.jar') as HTMLElement, theirs = L2.querySelector('.jar') as HTMLElement;
  mine.addEventListener('click', (e) => {
    e.stopPropagation();
    sendHeart(false);
    core.onSendHeart();
  });
  theirs.addEventListener('click', (e) => {
    e.stopPropagation();
    toast(`${PEOPLE[pa].of} mumu · ${pa === 'beto' ? 'ahududu kokulu' : 'vanilya kokulu'}`, I.heart(14));
  });
  return fg;
}

/** Her karede: her öğeyi ekrana en yakın kopyasına yerleştir. */
export function placeForeground(fg: HTMLElement, g: { W: number; panoW: number }, scrollX: number) {
  const P = g.panoW;
  const items = (fg as HTMLElement & { _items?: FgItem[] })._items;
  if (!items) return;
  for (const it of items) {
    const cx = it.wx + it.w / 2 - scrollX;
    const x = cx - P * Math.round((cx - g.W / 2) / P) - it.w / 2;
    const on = x > -it.w - 60 && x < g.W + 60;
    if (on !== it.shown) { it.el.style.display = on ? '' : 'none'; it.shown = on; }
    if (on) it.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
  }
}

let partnerIsOnline = false;
export const partnerOnline = (on: boolean) => {
  partnerIsOnline = on;
  document.querySelector('.jar.partner')?.classList.toggle('on', on);
  document.querySelector('.lantern.partner')?.classList.toggle('on', on);
};

function refresh(el: HTMLElement) {
  if (!el.isConnected) return;
  $('[data-n]', el).textContent = String(state.stars.length);
  const now = getServerNowMs();
  const unreadCount = state.stars.filter((s) => s.from === state.partner && !s.opened && !(s.unlockAt && s.unlockAt > now)).length;
  $('.badge', el).classList.toggle('hide', unreadCount === 0);
  updateAppBadge(unreadCount);
  const wx = $('[data-wx]', el);
  const on = state.settings.weather !== 'off';
  wx.classList.toggle('hide', !on);
  if (on) {
    const w = core.engine.weather;
    wx.innerHTML = `${wxIcon(w.kind)}<span class="num">${isNaN(w.temp) ? '—' : Math.round(w.temp) + '°'}</span>`;
  }
}

export function wxIcon(kind: string) {
  const day = core.engine?.sky.current.daylight > 0.5;
  return ({ clear: day ? I.sun() : I.moon(), partly: I.cloud(), cloudy: I.cloud(), overcast: I.cloud(), fog: I.fog(),
    drizzle: I.rain(), rain: I.rain(), heavyRain: I.rain(), showers: I.rain(), snow: I.snow(), heavySnow: I.snow(), sleet: I.snow(), thunder: I.bolt() } as Record<string, string>)[kind] ?? I.cloud();
}

/* ---------- çentik bildirimleri: karşı tarafın canlı durumu ---------- */
export function showLive(
  activity: 'writing' | 'sending' | 'drawing' | 'invite' | 'photo' | 'voice' | 'left',
  o: { onWatch?: () => void; onJoin?: () => void; star?: Star } = {}
) {
  if (!state.settings.live && activity !== 'left' && activity !== 'invite') return;
  const p = PEOPLE[state.partner];
  const av = SIGN[p.sign];
  const map = {
    writing: { title: `${p.name} sana yazıyor`, sub: 'Bir yıldız hazırlanıyor', loader: 'dots' as const },
    sending: { title: `${p.name} gönderiyor`, sub: 'Yıldız yolda…', loader: 'ring' as const },
    drawing: { title: `${p.name} bir şey çiziyor`, sub: 'Canlı izleyebilirsin', loader: null },
    invite: { title: `${p.name} seni çizime çağırıyor`, sub: 'Aynı tuvalde birlikte çizebilirsiniz', loader: null },
    photo: { title: `${p.name} bir fotoğraf seçiyor`, sub: 'Bir yıldız hazırlanıyor', loader: 'dots' as const },
    voice: { title: `${p.name} sesini kaydediyor`, sub: 'Bir yıldız hazırlanıyor', loader: 'dots' as const },
    left: { title: 'Bir yıldızın var', sub: '', loader: null },
  }[activity];
  const drawActions =
    (activity === 'drawing' || activity === 'invite') && (o.onWatch || o.onJoin)
      ? [
          ...(o.onWatch ? [{ label: 'İzle', primary: false, onClick: o.onWatch }] : []),
          ...(o.onJoin
            ? [{ label: activity === 'invite' ? 'Katıl' : 'Birlikte çiz', primary: true, onClick: o.onJoin }]
            : []),
        ]
      : undefined;
  island({
    avatar: av,
    color: p.color,
    ...map,
    actions: drawActions,
    ms: activity === 'left' ? 5200 : activity === 'drawing' || activity === 'invite' ? 6000 : 6200,
  });
}

/* ---------- kalp: mumdan kalp yükselir; ikiniz 5 sn içinde dokunursanız büyük kalp ---------- */
let lastMine = 0, lastPartner = 0;
export function sendHeart(fromPartner = false) {
  if (!core.homeEl) return;
  const jar = document.querySelector(fromPartner ? '.jar.partner' : '.jar.mine') as HTMLElement | null;
  if (!jar) return;
  const r = jar.getBoundingClientRect(), a = core.homeEl.getBoundingClientRect();
  const x = r.left - a.left + r.width / 2, y = r.top - a.top + 18;
  const col = fromPartner ? PEOPLE[state.partner].color : '#fff';
  const el = h(`<div class="heart-fly" style="left:${x - 9}px;top:${y - 9}px;color:${col}">${I.heartFill(18)}</div>`);
  core.homeEl.appendChild(el);
  const drift = (Math.random() - 0.5) * 50;
  el.animate([
    { transform: 'translate(0,0) scale(.4)', opacity: 0 },
    { transform: `translate(${drift * 0.2}px,-40px) scale(1)`, opacity: 1, offset: 0.2 },
    { transform: `translate(${drift}px,-170px) scale(.9) rotate(${drift / 5}deg)`, opacity: 0.9, offset: 0.7 },
    { transform: `translate(${drift * 1.3}px,-250px) scale(.7)`, opacity: 0 },
  ], { duration: 2800, easing: 'cubic-bezier(.25,.6,.3,1)' }).finished.then(() => el.remove());
  const now = Date.now();
  if (fromPartner) lastPartner = now; else lastMine = now;
  if (lastMine && lastPartner && Math.abs(lastMine - lastPartner) < 5000) {
    lastMine = lastPartner = 0;
    setTimeout(bigHeart, 600);
  } else if (!fromPartner) {
    toast(`${PEOPLE[state.partner].name} kalbini görecek`, I.heartFill(14), 1800);
  }
}

export function bigHeart() {
  if (!core.homeEl) return;
  const el = h(`<div style="position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
    <div style="color:#fff;position:relative">${I.heartFill(120)}<div style="position:absolute;inset:0;color:var(--partner);opacity:.55;transform:translate(10px,6px) scale(.9)">${I.heartFill(120)}</div></div>
    <div class="h2" style="margin-top:14px;text-shadow:0 2px 20px rgba(0,0,0,.4)">Aynı anda düşündük</div></div>`);
  core.homeEl.appendChild(el);
  const heart = el.firstElementChild as HTMLElement;
  heart.animate([
    { transform: 'scale(.3)', opacity: 0 },
    { transform: 'scale(1.08)', opacity: 1, offset: 0.35 },
    { transform: 'scale(1)', opacity: 1, offset: 0.5 },
    { transform: 'scale(1.05)', opacity: 1, offset: 0.62 },
    { transform: 'scale(1)', opacity: 1, offset: 0.8 },
    { transform: 'scale(1.1) translateY(-30px)', opacity: 0 },
  ], { duration: 3400, easing: 'cubic-bezier(.3,.7,.3,1)' });
  (el.lastElementChild as HTMLElement).animate(
    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none', offset: 0.3 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
    { duration: 3400 }
  ).finished.then(() => el.remove());
}

