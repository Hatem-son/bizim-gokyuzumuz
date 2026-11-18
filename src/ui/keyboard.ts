// Klavye açılırken yazma alanı (sheet / giriş formu / sayfa) klavyeyle AYNI eğride yumuşakça yukarı kayar.
// iOS'un "tak" diye sayfayı kaydırmasını engellemek için: (1) odaklanmadan önce tahmini klavye yüksekliği kadar
// kaldır → alan zaten görünür olduğu için iOS kaydırmaz, (2) visualViewport ölçünce gerçek değere düzelt,
// (3) yine de kayarsa pencereyi 0'a sabitle.
const KB_CURVE = 'cubic-bezier(.2,.8,.2,1)';
const KB_MS = 420;
const LIFT = '.sheet, .auth form, .auth .stage, .cdpage, [data-kb-lift]';
let guess = 0, lifted: HTMLElement | null = null, raf = 0;

const isField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|file|color)$/.test((el as HTMLInputElement).type)));

function setKb(px: number) {
  document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(px)) + 'px');
}
function measure() {
  const vv = window.visualViewport; if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}
function lift(target: HTMLElement) {
  const box = target.closest(LIFT) as HTMLElement | null; if (!box) return;
  if (lifted && lifted !== box) lifted.classList.remove('kb-lift');
  lifted = box; box.classList.add('kb-lift');
}
function drop() {
  setKb(0);
  const b = lifted; lifted = null;
  if (b) setTimeout(() => { if (lifted !== b) b.classList.remove('kb-lift'); }, KB_MS + 40);
}

export function installKeyboard() {
  if (!guess) guess = Math.round(Math.min(screen.height, 932) * 0.4); // ilk tahmin (iPhone ~ 336–350 + öneri çubuğu)
  const css = document.createElement('style');
  css.textContent = `
  .kb-lift { translate: 0 calc(-1 * var(--kb, 0px)); transition: translate ${KB_MS}ms ${KB_CURVE}, max-height ${KB_MS}ms ${KB_CURVE}, padding ${KB_MS}ms ${KB_CURVE}; }
  .sheet.kb-lift { max-height: calc(100% - var(--safe-t) - 10px - var(--kb, 0px)); padding-bottom: 16px; border-radius: var(--r-xl); }
  .cdpage.kb-lift, .auth .kb-lift { translate: 0 calc(-0.5 * var(--kb, 0px)); }
  .page .page-body { transition: padding-bottom ${KB_MS}ms ${KB_CURVE}; }
  html.kb-open .page .page-body { padding-bottom: calc(var(--kb, 0px) + 24px); }
  .kb-lift :is(input, textarea) { scroll-margin-bottom: 24px; }`;
  document.head.appendChild(css);

  // Dokunulduğu ANDA (odaklanmadan önce) kaldır: iOS alanı görünür bulur, sayfayı zıplatmaz
  addEventListener('touchstart', (e) => {
    const t = e.target as Element;
    if (!isField(t) || document.activeElement === t) return;
    lift(t as HTMLElement); setKb(guess); document.documentElement.classList.add('kb-open');
  }, { passive: true, capture: true });

  addEventListener('focusin', (e) => {
    const t = e.target as Element; if (!isField(t)) return;
    lift(t as HTMLElement); document.documentElement.classList.add('kb-open');
    if (measure() < 40) setKb(guess);
  });
  addEventListener('focusout', () => {
    setTimeout(() => { if (!isField(document.activeElement)) { document.documentElement.classList.remove('kb-open'); drop(); } }, 60);
  });

  const vv = window.visualViewport;
  const sync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // iOS'un sayfayı kaydırmasını geri al (içerik yerinde kalsın, sadece bizim kaldırma görünsün)
      if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
      const k = measure();
      if (k > 80) { guess = k; if (document.documentElement.classList.contains('kb-open')) setKb(k); }
      else if (!isField(document.activeElement)) drop();
    });
  };
  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  addEventListener('scroll', () => { if (lifted && window.scrollY) window.scrollTo(0, 0); }, { passive: true });
}

