// Arayüz temel parçaları: DOM yardımcısı, alt sayfa (sheet), sayfa yığını (push/pop + kenardan geri kaydırma),
// bildirim (toast), segment seçici, çentik bildirimi (Dynamic Island). Tüm hareketler transform/opacity (WAAPI).
import { I } from './icons';

export const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
export function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const E_OUT = 'cubic-bezier(.22,.8,.24,1)';
const E_SHEET = 'cubic-bezier(.2,.9,.25,1)';

let app: HTMLElement;
export function initUI(root: HTMLElement) { app = root; }
export const appEl = () => app;

/* ---------------- alt sayfa ---------------- */
export type Sheet = { el: HTMLElement; close: (fast?: boolean) => Promise<void>; onClose?: () => void };

export function openSheet(content: HTMLElement, o: { cls?: string; backCls?: string; dismissable?: boolean; onClose?: () => void; backdrop?: boolean } = {}): Sheet {
  const back = h(`<div class="backdrop ${o.backCls ?? ''}"></div>`);
  const sheet = h(`<div class="sheet glass-strong ${o.cls ?? ''}" role="dialog" aria-modal="true"><div class="grab"></div></div>`);
  sheet.appendChild(content);
  if (o.backdrop !== false) app.appendChild(back);
  app.appendChild(sheet);
  back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
  sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: reduced() ? 160 : 460, easing: E_SHEET });

  let closed = false;
  const close = async (fast = false) => {
    if (closed) return;
    closed = true;
    const d = fast ? 180 : 320;
    back.animate([{ opacity: getComputedStyle(back).opacity }, { opacity: 0 }], { duration: d, fill: 'forwards' });
    const cur = new DOMMatrix(getComputedStyle(sheet).transform).m42;
    await sheet.animate([{ transform: `translateY(${cur}px)` }, { transform: 'translateY(100%)' }], { duration: d, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }).finished;
    back.remove(); sheet.remove();
    o.onClose?.();
  };
  if (o.dismissable !== false) {
    back.addEventListener('click', () => void close());
    dragToDismiss(sheet, () => void close());
  }
  return { el: sheet, close };
}

/** Tutamak/başlıktan aşağı sürükle: hız (0.6 px/ms) veya mesafe (%30) yeterse kapanır, değilse yayla geri döner. */
function dragToDismiss(sheet: HTMLElement, close: () => void) {
  let y0 = 0, t0 = 0, dy = 0, active = false;
  sheet.addEventListener('pointerdown', (e) => {
    const tgt = e.target as HTMLElement;
    const scroller = tgt.closest('[data-scroll]') as HTMLElement | null;
    if (tgt.closest('input,textarea,button,select,label,canvas,.field,.cap,[data-nodrag]') || (scroller && scroller.scrollTop > 0) || sheet.scrollTop > 0) return;
    active = true; y0 = e.clientY; t0 = performance.now(); dy = 0;
    sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!active) return;
    dy = Math.max(0, e.clientY - y0);
    const rub = dy < 0 ? dy / 3 : dy;
    sheet.style.transform = `translateY(${rub}px)`;
  });
  const end = () => {
    if (!active) return;
    active = false;
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > sheet.offsetHeight * 0.3 || v > 0.6) close();
    else {
      sheet.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 380, easing: 'cubic-bezier(.3,1.25,.5,1)' });
      sheet.style.transform = '';
    }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

/* ---------------- sayfa yığını ---------------- */
const stack: HTMLElement[] = [];
export function pushPage(page: HTMLElement, under?: HTMLElement) {
  app.appendChild(page);
  const prev = stack[stack.length - 1] ?? under;
  stack.push(page);
  page.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: reduced() ? 150 : 480, easing: E_OUT });
  prev?.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-22%)', opacity: 0.6 }], { duration: 480, easing: E_OUT, fill: 'forwards' });
  edgeSwipeBack(page, prev);
  return page;
}
export async function popPage(under?: HTMLElement) {
  const page = stack.pop();
  if (!page) return;
  const prev = stack[stack.length - 1] ?? under;
  prev?.animate([{ transform: 'translateX(-22%)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: E_OUT, fill: 'forwards' });
  const cur = new DOMMatrix(getComputedStyle(page).transform).m41;
  await page.animate([{ transform: `translateX(${cur}px)` }, { transform: 'translateX(100%)' }], { duration: 380, easing: E_OUT, fill: 'forwards' }).finished;
  page.remove();
  prev?.getAnimations().forEach((a) => a.cancel());
}
export function clearPageStack() {
  stack.splice(0, stack.length).forEach((p) => p.remove());
}
/** iOS gibi: sol kenardan (24 px) sağa sürükleyince sayfa geri gider. */
function edgeSwipeBack(page: HTMLElement, prev?: HTMLElement) {
  let x0 = 0, dx = 0, on = false, t0 = 0;
  page.addEventListener('pointerdown', (e) => {
    const r = page.getBoundingClientRect();
    if (e.clientX - r.left > 24) return;
    on = true; x0 = e.clientX; dx = 0; t0 = performance.now();
    page.setPointerCapture(e.pointerId);
  });
  page.addEventListener('pointermove', (e) => {
    if (!on) return;
    dx = Math.max(0, e.clientX - x0);
    page.style.transform = `translateX(${dx}px)`;
  });
  page.addEventListener('pointerup', () => {
    if (!on) return;
    on = false;
    const v = dx / Math.max(1, performance.now() - t0);
    if (dx > page.offsetWidth * 0.35 || v > 0.5) void popPage(prev);
    else { page.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 300, easing: E_OUT }); page.style.transform = ''; }
  });
}

/* ---------------- toast ---------------- */
export function toast(text: string, icon = I.starFill(14), ms = 2600) {
  app.querySelector('.toast:not(.offline)')?.remove();
  const el = h(`<div class="toast glass-strong" role="status">${icon}<span></span></div>`);
  el.querySelector('span')!.textContent = text;
  app.appendChild(el);
  el.animate([{ opacity: 0, transform: 'translate(-50%,12px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%,0) scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'forwards' });
  setTimeout(async () => {
    if (!el.isConnected) return;
    await el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,8px)' }], { duration: 260, fill: 'forwards' }).finished;
    el.remove();
  }, ms);
}

/* ---------------- segment (yalnızca transform) ---------------- */
export function segment(items: string[], active: number, onChange: (i: number) => void) {
  const el = h(`<div class="seg" role="tablist"><span class="thumb"></span>${items.map((t, i) => `<button type="button" role="tab" aria-selected="${i === active}" class="${i === active ? 'on' : ''}">${t}</button>`).join('')}</div>`);
  const thumb = el.querySelector('.thumb') as HTMLElement;
  const btns = [...el.querySelectorAll('button')] as HTMLElement[];
  const place = (i: number) => {
    const b = btns[i];
    if (!b) return;
    thumb.style.width = `${b.offsetWidth}px`;
    thumb.style.transform = `translateX(${b.offsetLeft - 3}px)`;
  };
  btns.forEach((b, i) => b.addEventListener('click', () => {
    btns.forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-selected', String(x === b));
    });
    place(i); onChange(i);
  }));
  requestAnimationFrame(() => place(active));
  return el;
}

/* ---------------- onay penceresi ---------------- */
export function confirmSheet(title: string, body: string, yes: string, danger = false): Promise<boolean> {
  return new Promise((res) => {
    const c = h(`<div class="center" style="padding:6px 6px 0">
      <div class="h2" style="margin-bottom:8px">${title}</div><p class="body" style="margin:0 0 22px">${body}</p>
      <button type="button" class="btn btn-block ${danger ? '' : 'btn-primary'}" data-y style="${danger ? 'background:rgba(255,143,143,.16);color:#ffb3b3' : ''}">${yes}</button>
      <button type="button" class="btn btn-block btn-ghost" data-n style="margin-top:4px">Vazgeç</button></div>`);
    const s = openSheet(c, { cls: 'confirm-sheet', backCls: 'confirm-back', onClose: () => res(false) });
    c.querySelector('[data-y]')!.addEventListener('click', () => { res(true); void s.close(); });
    c.querySelector('[data-n]')!.addEventListener('click', () => void s.close());
  });
}

export function stagger(els: Element[], o: { y?: number; delay?: number; gap?: number; dur?: number } = {}): void {
  if (els.some((e) => !e.isConnected)) { requestAnimationFrame(() => stagger(els, o)); return; }
  els.forEach((el, i) =>
    (el as HTMLElement).animate([{ opacity: 0, transform: `translateY(${o.y ?? 10}px)` }, { opacity: 1, transform: 'none' }],
      { duration: o.dur ?? 520, delay: (o.delay ?? 0) + i * (o.gap ?? 45), easing: E_OUT, fill: 'backwards' }));
}

/* ---------------- canlı bildirim kartı ----------------
   Durum çubuğunun altında, yukarıdan yaylanarak iner; içerik değişince yumuşakça yer değiştirir; yukarı süzülerek kapanır.
   Kartı yukarı itince de kapanır. (Gerçek Dynamic Island'a web'den çizilemez; onu taklit eden kapsül saatin üstüne biniyordu.) */
export type IslandOpts = {
  avatar: string;
  title: string;
  sub?: string;
  loader?: 'dots' | 'ring' | null;
  action?: { label: string; onClick: () => void };
  color?: string;
  ms?: number;
};
let islandEl: HTMLElement | null = null;
let islandT = 0;

export function island(o: IslandOpts) {
  clearTimeout(islandT);
  if (islandEl && !islandEl.isConnected) islandEl = null;
  const col = o.color ?? 'var(--partner)';
  const content = `
    <span class="is-av" style="color:${col}">${o.avatar}</span>
    <span class="is-tx"><b>${o.title}</b>${o.sub ? `<i>${o.sub}</i>` : ''}</span>
    ${o.loader === 'dots' ? `<span class="is-dots" style="color:${col}"><i></i><i></i><i></i></span>` : ''}
    ${o.loader === 'ring' ? `<span class="is-ring" style="color:${col}"></span>` : ''}
    ${o.action ? `<button type="button" class="is-act">${o.action.label}</button>` : ''}`;
  const fresh = !islandEl;
  if (!islandEl) {
    islandEl = h(`<div class="island-pop" role="status" aria-live="polite"><div class="is-in"></div></div>`);
    app.appendChild(islandEl);
    const el = islandEl;
    el.animate(
      [
        { transform: 'translate3d(0,-110%,0) scale(.94)', opacity: 0 },
        { transform: 'translate3d(0,4px,0) scale(1.01)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: reduced() ? 160 : 560, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
    // yukarı kaydırınca kapanır (hem gerçek dokunuş hem pointer sürüklemesi)
    let y0 = 0;
    let pActive = false;
    el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (y0 - e.touches[0].clientY > 18) void closeIsland(); }, { passive: true });
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      pActive = true;
      y0 = e.clientY;
    });
    el.addEventListener('pointermove', (e) => {
      if (pActive && y0 - e.clientY > 18) {
        pActive = false;
        void closeIsland();
      }
    });
    el.addEventListener('pointerup', () => { pActive = false; });
    el.addEventListener('pointercancel', () => { pActive = false; });
  }
  const inner = islandEl.querySelector('.is-in') as HTMLElement;
  inner.innerHTML = content;
  if (!fresh) {
    inner.animate([{ opacity: 0, transform: 'translate3d(0,6px,0)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }
  const btn = inner.querySelector('.is-act');
  if (btn && o.action) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      o.action!.onClick();
      void closeIsland();
    });
  }
  if ((o.ms ?? 4200) > 0) {
    islandT = window.setTimeout(() => void closeIsland(), o.ms ?? 4200);
  }
}

export async function closeIsland() {
  const el = islandEl;
  if (!el) return;
  islandEl = null;
  clearTimeout(islandT);
  if (!el.isConnected) return;
  await el.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translate3d(0,-120%,0) scale(.96)', opacity: 0 }],
    { duration: reduced() ? 120 : 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
  ).finished;
  el.remove();
}

