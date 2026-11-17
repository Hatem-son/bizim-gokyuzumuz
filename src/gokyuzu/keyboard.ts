// iOS klavyesi ve form araç çubuğu (▲ ▼ ✓).
// Gerçek: araç çubuğu web uygulamasından kaldırılamaz; görünür alanın (visualViewport) DIŞINDA kalır.
// Hedef: (1) çubuğun arkası düz siyah değil gökyüzü alt rengi, (2) kart çubuğun hemen üstünde,
// zıplamadan, (3) klavye açıkken alt şeritler/çimen gizli, (4) klavye kapanınca siyah blok kalmaz.

const OPEN_THRESHOLD = 120; // px; bundan fazla küçülme = klavye açık

export function initKeyboard(opts: {
  /** klavye açıkken gizlenecek elemanlar (alt şerit, çimen, gösterge vb.) */
  hideWhenOpen: () => HTMLElement[];
  onChange?: (kbOpen: boolean, vvHeight: number) => void;
}) {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);

  let raf = 0;
  let open = false;
  let base = measureAppH();

  function measureAppH() {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    const lvh = probe.offsetHeight || 0;
    // iOS standalone & Safari: innerHeight safe-area / adres çubuğu kadar kısa gelebiliyor → 100lvh ve screen.height ile tamamla
    return standalone
      ? Math.max(window.innerHeight, root.clientHeight, lvh, screen.height)
      : Math.max(window.innerHeight, root.clientHeight, lvh);
  }

  function apply() {
    raf = 0;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    const isOpen = base - h > OPEN_THRESHOLD;
    // tek yazma fazı
    root.style.setProperty('--vv-h', `${Math.round(h)}px`);
    root.style.setProperty('--vv-top', `${Math.round(top)}px`);
    root.style.setProperty('--kb', isOpen ? `${Math.round(base - h - top)}px` : '0px');
    if (isOpen !== open) {
      open = isOpen;
      root.classList.toggle('kb-open', open);
      for (const el of opts.hideWhenOpen()) el.style.visibility = open ? 'hidden' : '';
      opts.onChange?.(open, h);
      if (!open) {
        // klavye kapanma animasyonu bittiğinde tekrar ölç (alt siyah blok kalmasın)
        setTimeout(() => {
          base = measureAppH();
          root.style.setProperty('--app-h', `${base}px`);
          window.scrollTo(0, 0);
        }, 350);
      }
    }
    // iOS odakta sayfayı kaydırabiliyor: geri al
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };

  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', () => setTimeout(() => { base = measureAppH(); schedule(); }, 400));
  root.style.setProperty('--app-h', `${base}px`);
  apply();

  // odaklanınca sayfa kaymasın
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setTimeout(() => window.scrollTo(0, 0), 300);
  });
}

/*
CSS (global):

html, body {
  height: var(--app-h, 100%);
  overflow: hidden;
  overscroll-behavior: none;
  background: var(--sky-bottom, #0b1422);   // düz siyah DEĞİL → araç çubuğunun arkası gökyüzü rengi
}
#scene, #ui { position: fixed; left: 0; top: 0; width: 100%; height: var(--app-h); }  // body'nin doğrudan çocukları

// Yazma kartı: alt kenarı görünür alanın (visualViewport) altına oturur.
.compose-sheet {
  position: fixed; left: 0; right: 0;
  top: var(--vv-top, 0px);
  height: var(--vv-h, 100%);
  display: flex; flex-direction: column; justify-content: flex-end;
  pointer-events: none;
}
.compose-sheet > .card {
  pointer-events: auto;
  max-height: calc(var(--vv-h) - env(safe-area-inset-top) - 12px);
  overflow-y: auto;
  border-radius: 24px 24px 0 0;
  transition: transform .25s cubic-bezier(.2,.8,.2,1);
}
html.kb-open .compose-sheet > .card { border-radius: 24px; margin: 0 6px 6px; }  // çubuğa yapışık değil, nefes alır
html.kb-open .compose-sheet .hint-lock { display: none; }  // klavye açıkken alt not gizlenir, kart kısalır
*/
