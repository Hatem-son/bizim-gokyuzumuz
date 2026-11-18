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
  const fixedProbe = document.createElement('div');
  fixedProbe.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:0;pointer-events:none;visibility:hidden';
  document.body.append(probe, fixedProbe);

  let raf = 0;
  let open = false;
  let fullBase = measureFullH();
  let visBase = measureVisH();

  function measureVisH() {
    return Math.round(vv ? vv.height : window.innerHeight || 0);
  }

  function measureFullH() {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    const innerH = Math.round(window.innerHeight || 0);
    const clientH = Math.round(root.clientHeight || 0);
    const lvh = Math.round(probe.offsetHeight || 0);
    const fixedH = Math.round(fixedProbe.offsetHeight || 0);
    const rawScreenH = Math.round(
      window.innerWidth > innerH && window.screen ? Math.min(window.screen.width, window.screen.height) : window.screen?.height || 0
    );
    const screenH = rawScreenH >= innerH && rawScreenH - innerH < 220 ? rawScreenH : 0;
    const fullH = standalone ? Math.max(innerH, clientH, lvh, fixedH, screenH) : Math.max(innerH, clientH, lvh, fixedH);
    if (!open) {
      const uiB = standalone ? 0 : Math.max(0, fullH - innerH);
      root.style.setProperty('--ui-b', `${uiB}px`);
    }
    return fullH;
  }

  function apply() {
    raf = 0;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (!open && h > visBase) visBase = Math.round(h);
    const isOpen = visBase - h > OPEN_THRESHOLD;
    if (!isOpen) {
      fullBase = measureFullH();
      root.style.setProperty('--app-h', `${fullBase}px`);
    }
    // tek yazma fazı
    root.style.setProperty('--vv-h', `${Math.round(h)}px`);
    root.style.setProperty('--vv-top', `${Math.round(top)}px`);
    root.style.setProperty('--kb', isOpen ? `${Math.max(0, Math.round(fullBase - h - top))}px` : '0px');
    if (isOpen !== open) {
      open = isOpen;
      root.classList.toggle('kb-open', open);
      for (const el of opts.hideWhenOpen()) el.style.visibility = open ? 'hidden' : '';
      opts.onChange?.(open, h);
      if (!open) {
        // klavye kapanma animasyonu bittiğinde tekrar ölç (alt siyah blok kalmasın)
        setTimeout(() => {
          fullBase = measureFullH();
          visBase = measureVisH();
          root.style.setProperty('--app-h', `${fullBase}px`);
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
  window.addEventListener('orientationchange', () => setTimeout(() => { fullBase = measureFullH(); visBase = measureVisH(); schedule(); }, 400));
  root.style.setProperty('--app-h', `${fullBase}px`);
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
