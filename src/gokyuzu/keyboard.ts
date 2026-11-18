// iOS klavyesi ve form araç çubuğu (▲ ▼ ✓).
// Kök yüksekliği (--app-h) main.ts fitViewport'ta ayarlanır; burada yalnızca klavye yüksekliği (--kb) hesaplanır.

const OPEN_THRESHOLD = 120; // px; bundan fazla küçülme = klavye açık

export function initKeyboard(opts: {
  /** klavye açıkken gizlenecek elemanlar (alt şerit, çimen, gösterge vb.) */
  hideWhenOpen: () => HTMLElement[];
  onChange?: (kbOpen: boolean, vvHeight: number) => void;
}) {
  const vv = window.visualViewport;
  const root = document.documentElement;
  let raf = 0;
  let open = false;

  function measureFullH() {
    const appEl = document.getElementById('app') || root;
    const r = appEl.getBoundingClientRect();
    return Math.round(r.height || appEl.clientHeight || 0);
  }

  function apply() {
    raf = 0;
    const baseH = measureFullH();
    const h = vv ? vv.height : baseH;
    const top = vv ? vv.offsetTop : 0;
    const isOpen = baseH - h > OPEN_THRESHOLD;
    root.style.setProperty('--kb', isOpen ? `${Math.max(0, Math.round(baseH - h - top))}px` : '0px');
    if (isOpen !== open) {
      open = isOpen;
      root.classList.toggle('kb-open', open);
      for (const el of opts.hideWhenOpen()) el.style.visibility = open ? 'hidden' : '';
      opts.onChange?.(open, h);
      if (!open) {
        setTimeout(() => {
          window.scrollTo(0, 0);
        }, 350);
      }
    }
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };

  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 400));
  apply();

  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setTimeout(() => window.scrollTo(0, 0), 300);
  });
}
