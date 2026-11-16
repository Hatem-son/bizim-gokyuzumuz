/**
 * Geçici Aşama 2 Teşhis Ekranı (Bölüm 8'de kaldırılacak).
 * Sahne düzenine dokunmadan tüm kapsayıcı ölçülerini ve 2px renkli outline'ları gösterir.
 */
const OUTLINE_TARGETS: { sel: string; color: string; offset: string }[] = [
  { sel: 'html', color: '#ff3b30', offset: '-2px' },
  { sel: 'body', color: '#ff9500', offset: '-4px' },
  { sel: '#app-root', color: '#ffcc00', offset: '-6px' },
  { sel: '#scene', color: '#34c759', offset: '-8px' },
  { sel: '#sky-canvas', color: '#00e5ff', offset: '-10px' },
  { sel: '#ground', color: '#2979ff', offset: '-2px' },
  { sel: '.garden', color: '#bf5af2', offset: '-4px' },
];

function fmtRect(el: Element | null): string {
  if (!el) return 'yok';
  const r = el.getBoundingClientRect();
  return `top ${Math.round(r.top)} bottom ${Math.round(r.bottom)} height ${Math.round(r.height)} pt`;
}

function elLabel(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

export class DiagOverlay {
  private wrap: HTMLDivElement | null = null;
  private pre: HTMLPreElement | null = null;
  private probe: HTMLDivElement | null = null;
  private copyBtn: HTMLButtonElement | null = null;
  private lastText = '';
  private oriTimer = 0;

  private readonly onUpdate = (): void => {
    this.render();
  };

  private readonly onOri = (): void => {
    this.render();
    window.clearTimeout(this.oriTimer);
    this.oriTimer = window.setTimeout(this.onUpdate, 120);
  };

  public open(): void {
    if (this.wrap) {
      this.render();
      return;
    }

    for (const item of OUTLINE_TARGETS) {
      const el = document.querySelector<HTMLElement | SVGElement>(item.sel);
      if (el) {
        el.style.outline = `2px solid ${item.color}`;
        el.style.outlineOffset = item.offset;
      }
    }

    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
    document.body.appendChild(probe);
    this.probe = probe;

    const wrap = document.createElement('div');
    wrap.id = 'diag-overlay';
    wrap.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;width:min(92vw,370px);max-height:78vh;overflow:auto;padding:12px 14px;border-radius:16px;background:rgba(4,8,18,.84);border:1px solid rgba(255,255,255,.32);color:#f3f8ff;';

    const legend = document.createElement('div');
    legend.style.cssText = 'font:700 10px/1.35 system-ui,sans-serif;margin-bottom:8px;opacity:.9;';
    legend.textContent =
      'Kırmızı:html · Turuncu:body · Sarı:app · Yeşil:scene · Camgöbeği:canvas · Mavi:ground · Mor:grassSVG';

    const pre = document.createElement('pre');
    pre.id = 'diag-pre';
    pre.style.cssText =
      'margin:0;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:10px;';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.id = 'diag-copy';
    copyBtn.textContent = 'Kopyala';
    copyBtn.style.cssText =
      'flex:1;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(91,157,255,.32);color:#fff;font:800 12px system-ui,sans-serif;cursor:pointer;';
    copyBtn.onclick = () => void this.copyText();

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'diag-close';
    closeBtn.textContent = 'Kapat';
    closeBtn.style.cssText =
      'padding:9px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;font:800 12px system-ui,sans-serif;cursor:pointer;';
    closeBtn.onclick = () => this.close();

    row.append(copyBtn, closeBtn);
    wrap.append(legend, pre, row);
    document.body.appendChild(wrap);

    this.wrap = wrap;
    this.pre = pre;
    this.copyBtn = copyBtn;

    window.addEventListener('resize', this.onUpdate);
    window.addEventListener('orientationchange', this.onOri);
    window.visualViewport?.addEventListener('resize', this.onUpdate);
    this.render();
  }

  private collectText(): string {
    const navExt = navigator as Navigator & { standalone?: boolean };
    const mmStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const probeCs = this.probe ? getComputedStyle(this.probe) : null;
    const vv = window.visualViewport;

    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const appEl = document.getElementById('app-root');
    const sceneEl = document.getElementById('scene');
    const canvasEl = document.getElementById('sky-canvas') as HTMLCanvasElement | null;
    const groundEl = document.getElementById('ground');
    const grassSvgEl = document.querySelector('.garden');

    // Sahneyi kırpan ilk üst eleman ve fixed'in referans kutusu (#scene'den yukarı yürü)
    let clipperInfo = 'yok (tüm üstler overflow:visible)';
    let fixedRefInfo = 'html / viewport (tüm üstler none/auto)';

    if (sceneEl) {
      let cur: Element | null = sceneEl.parentElement;
      let foundClip = false;
      let foundFixed = false;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (!foundClip && (cs.overflow !== 'visible' || cs.overflowY !== 'visible' || cs.overflowX !== 'visible')) {
          const r = cur.getBoundingClientRect();
          clipperInfo = `${elLabel(cur)} (overflow:${cs.overflowX}/${cs.overflowY}) rect.bottom:${Math.round(r.bottom)} pt`;
          foundClip = true;
        }
        if (
          !foundFixed &&
          (cs.transform !== 'none' ||
            cs.filter !== 'none' ||
            (cs.willChange && cs.willChange !== 'auto') ||
            (cs.perspective && cs.perspective !== 'none') ||
            (cs.contain && cs.contain !== 'none'))
        ) {
          const r = cur.getBoundingClientRect();
          fixedRefInfo = `${elLabel(cur)} (t:${cs.transform} f:${cs.filter} wc:${cs.willChange} p:${cs.perspective} c:${cs.contain}) bottom:${Math.round(r.bottom)} pt`;
          foundFixed = true;
        }
        cur = cur.parentElement;
      }
    }

    const kbVar = getComputedStyle(htmlEl).getPropertyValue('--kb').trim() || 'yok';

    return [
      `standalone: ${String(navExt.standalone ?? false)} / matchMedia: ${String(mmStandalone)}`,
      `screen.height: ${Math.round(window.screen.height)} pt`,
      `window.innerHeight: ${Math.round(window.innerHeight)} pt`,
      `documentElement.clientHeight: ${Math.round(htmlEl.clientHeight)} pt`,
      `visualViewport.height: ${vv ? Math.round(vv.height) : 'yok'} pt   offsetTop: ${vv ? Math.round(vv.offsetTop) : 'yok'} pt`,
      `safe-area top: ${probeCs ? Math.round(parseFloat(probeCs.paddingTop) || 0) : 0} pt`,
      `safe-area bottom: ${probeCs ? Math.round(parseFloat(probeCs.paddingBottom) || 0) : 0} pt`,
      `--kb: ${kbVar}`,
      `html    rect: ${fmtRect(htmlEl)}`,
      `body    rect: ${fmtRect(bodyEl)}`,
      `app     rect: ${fmtRect(appEl)}`,
      `scene   rect: ${fmtRect(sceneEl)}`,
      `canvas  rect: ${fmtRect(canvasEl)}   px:${canvasEl ? canvasEl.height : 0}   DPR:${window.devicePixelRatio || 1}`,
      `ground  rect: ${fmtRect(groundEl)}`,
      `grassSVG rect: ${fmtRect(grassSvgEl)}`,
      `Sahneyi kirpan ilk ust eleman: ${clipperInfo}`,
      `fixed'in referans kutusu: ${fixedRefInfo}`,
    ].join('\n');
  }

  public render = (): void => {
    if (!this.pre) return;
    this.lastText = this.collectText();
    this.pre.textContent = this.lastText;
  };

  private async copyText(): Promise<void> {
    const text = this.lastText || this.collectText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-999px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        // Ignore
      }
      ta.remove();
    }
    if (this.copyBtn) {
      this.copyBtn.textContent = 'Kopyalandı ✓';
      window.setTimeout(() => {
        if (this.copyBtn) this.copyBtn.textContent = 'Kopyala';
      }, 1500);
    }
  }

  public close(): void {
    window.clearTimeout(this.oriTimer);
    window.removeEventListener('resize', this.onUpdate);
    window.removeEventListener('orientationchange', this.onOri);
    window.visualViewport?.removeEventListener('resize', this.onUpdate);

    for (const item of OUTLINE_TARGETS) {
      const el = document.querySelector<HTMLElement | SVGElement>(item.sel);
      if (el) {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
    }

    this.probe?.remove();
    this.probe = null;
    this.wrap?.remove();
    this.wrap = null;
    this.pre = null;
    this.copyBtn = null;
  }
}

