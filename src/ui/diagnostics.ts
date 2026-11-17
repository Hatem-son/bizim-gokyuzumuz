export interface DiagnosticsDataSource {
  getVersion: () => string;
  getCanvas: () => HTMLCanvasElement | null;
  getEngineStats: () => {
    avgMs: number;
    maxMs: number;
    fps: number;
    mode: 'active' | 'idle' | 'quiet' | 'paused';
    samples: number;
  } | null;
}

export interface DiagnosticsController {
  open: () => void;
  close: () => void;
  toggle: () => boolean;
  isOpen: () => boolean;
  setHiddenPaused: (hidden: boolean) => void;
  destroy: () => void;
}

interface FrameSample {
  t: number;
  dt: number;
  mode: string;
}

const WINDOW_MS = 5000;

function readCssLength(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return raw || '0px';
}

function measurePromotedLayers(): number {
  let count = 0;
  const all = document.querySelectorAll('#scene, #scene > *, #ground > *, #ui > *, #app-root > *');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const wc = cs.willChange && cs.willChange !== 'auto';
    const tf = cs.transform && cs.transform !== 'none';
    if (wc || tf) count++;
  }
  const animEls = new Set<Element>();
  if (typeof document.getAnimations === 'function') {
    for (const anim of document.getAnimations()) {
      const target = (anim.effect as KeyframeEffect | null)?.target;
      if (target instanceof Element) animEls.add(target);
    }
  }
  return count + animEls.size;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Yedek kopyalama yoluna geç
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function createDiagnosticsController(
  host: HTMLElement,
  source: DiagnosticsDataSource
): DiagnosticsController {
  let active = false;
  let pausedByHidden = false;
  let rafId = 0;
  let uiTimer = 0;
  let lastT = 0;
  let samples: FrameSample[] = [];
  let longTasksSupported = false;
  let longTaskCount = 0;
  let longTaskObserver: PerformanceObserver | null = null;
  let promotedLayers = 0;
  let lastLayerSampleAt = 0;
  let lastSnapshotText = '';
  let copyResetTimer = 0;

  host.innerHTML = `<div class="diag-head">
      <strong class="diag-title">Teşhis</strong>
      <button class="diag-x" id="diag-close" type="button" aria-label="Teşhisi kapat">✕</button>
    </div>
    <pre class="diag-body" id="diag-body"></pre>
    <p class="diag-hint" id="diag-hint" hidden></p>
    <div class="diag-actions">
      <button class="diag-copy" id="diag-copy" type="button">Kopyala</button>
    </div>`;

  const bodyEl = host.querySelector('#diag-body') as HTMLPreElement;
  const hintEl = host.querySelector('#diag-hint') as HTMLParagraphElement;
  const copyBtn = host.querySelector('#diag-copy') as HTMLButtonElement;
  const closeBtn = host.querySelector('#diag-close') as HTMLButtonElement;

  const startLongTaskObserver = () => {
    if (longTaskObserver || typeof PerformanceObserver === 'undefined') return;
    try {
      const supported = PerformanceObserver.supportedEntryTypes ?? [];
      if (!supported.includes('longtask')) {
        longTasksSupported = false;
        return;
      }
      longTasksSupported = true;
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) longTaskCount++;
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      longTasksSupported = false;
    }
  };

  const stopLongTaskObserver = () => {
    longTaskObserver?.disconnect();
    longTaskObserver = null;
  };

  const rafStep = (now: number) => {
    rafId = 0;
    if (!active || pausedByHidden || document.hidden) return;
    if (lastT > 0) {
      const dt = now - lastT;
      if (dt > 0 && dt < 2000) {
        const mode = source.getEngineStats()?.mode ?? 'active';
        samples.push({ t: now, dt, mode });
      }
    }
    lastT = now;
    const cutoff = now - WINDOW_MS;
    while (samples.length > 0 && samples[0].t < cutoff) {
      samples.shift();
    }
    rafId = requestAnimationFrame(rafStep);
  };

  const renderSnapshot = () => {
    if (!active) return;
    const now = performance.now();
    const cutoff = now - WINDOW_MS;
    samples = samples.filter((s) => s.t >= cutoff);

    const n = samples.length;
    const sumDt = samples.reduce((acc, s) => acc + s.dt, 0);
    const avgFrameMs = n > 0 ? sumDt / n : 0;
    const over167 = samples.filter((s) => s.dt > 16.7).length;
    const overPct = n > 0 ? Math.round((over167 / n) * 100) : 0;

    // Son 5 kare ortalamasından anlık FPS
    const tail = samples.slice(-8);
    const tailAvg = tail.length > 0 ? tail.reduce((a, s) => a + s.dt, 0) / tail.length : 0;
    const instantFps = tailAvg > 0 ? Math.round(1000 / tailAvg) : (source.getEngineStats()?.fps ?? 0);
    const avg5sFps = avgFrameMs > 0 ? Math.round(1000 / avgFrameMs) : instantFps;

    const eng = source.getEngineStats();
    const canvas = source.getCanvas();
    const cw = canvas?.width ?? 0;
    const ch = canvas?.height ?? 0;
    const mpx = ((cw * ch) / 1_000_000).toFixed(2);
    const dpr = +(window.devicePixelRatio || 1).toFixed(2);
    const domCount = document.getElementsByTagName('*').length;
    const animCount = typeof document.getAnimations === 'function' ? document.getAnimations().length : 0;
    if (now - lastLayerSampleAt > 1200) {
      promotedLayers = measurePromotedLayers();
      lastLayerSampleAt = now;
    }
    const appH = readCssLength('--app-h') || `${window.innerHeight}px`;
    const safeTop = readCssLength('--sat');
    const safeRight = readCssLength('--sar');
    const safeBot = readCssLength('--sab');
    const safeLeft = readCssLength('--sal');

    // Düşük Güç Modu algılama: yeterli örnekte fps 27-32 bandında sabitlenirse uyar
    const lowPowerLocked = n >= 28 && avg5sFps >= 27 && avg5sFps <= 32 && over167 / Math.max(1, n) > 0.7;
    const fpsLine = lowPowerLocked
      ? `Anlık FPS   : fps 30'a sabit (5s ort ${avg5sFps} fps)`
      : `Anlık FPS   : ${instantFps} fps (5s ort ${avg5sFps} · ${eng?.mode ?? 'active'})`;

    hintEl.hidden = !lowPowerLocked;
    if (lowPowerLocked) {
      hintEl.textContent = 'İpucu: Düşük Güç Modu açık olabilir (iOS 30 fps sınırlar).';
    }

    const longTaskLine = longTasksSupported ? String(longTaskCount) : 'desteklenmiyor (Safari)';
    const lines = [
      `Sürüm       : ${source.getVersion()}`,
      fpsLine,
      `5s Ort Kare : ${avgFrameMs.toFixed(2)} ms (motor ${eng?.avgMs ?? 0} ms)`,
      `>16.7ms Kare: ${over167}/${n} (%${overPct})`,
      `Uzun Görev  : ${longTaskLine} (>50ms)`,
      `Canvas      : ${cw}×${ch} (${mpx}M px) · DPR ${dpr}`,
      `DOM / Katman: ${domCount} DOM · ~${promotedLayers} katman`,
      `Animasyon   : ${animCount} aktif`,
      `--app-h     : ${appH} (ekran ${window.innerWidth}×${window.innerHeight})`,
      `Güvenli Alan: üst ${safeTop} / sağ ${safeRight} / alt ${safeBot} / sol ${safeLeft}`,
    ];
    if (lowPowerLocked) {
      lines.push('Not         : Düşük Güç Modu açık olabilir (fps 30\'a sabit)');
    }

    lastSnapshotText = lines.join('\n');
    bodyEl.textContent = lastSnapshotText;
  };

  const stopLoops = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
    window.clearInterval(uiTimer);
    uiTimer = 0;
    lastT = 0;
  };

  const startLoops = () => {
    if (!active || pausedByHidden || document.hidden) return;
    if (!rafId) rafId = requestAnimationFrame(rafStep);
    if (!uiTimer) uiTimer = window.setInterval(renderSnapshot, 350);
  };

  const open = () => {
    if (active) return;
    active = true;
    samples = [];
    longTaskCount = 0;
    lastT = 0;
    host.hidden = false;
    startLongTaskObserver();
    renderSnapshot();
    startLoops();
  };

  const close = () => {
    if (!active) return;
    active = false;
    host.hidden = true;
    stopLoops();
    stopLongTaskObserver();
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    renderSnapshot();
    const ok = await copyTextToClipboard(lastSnapshotText);
    window.clearTimeout(copyResetTimer);
    copyBtn.textContent = ok ? 'Kopyalandı ✓' : 'Kopyalanamadı';
    copyResetTimer = window.setTimeout(() => {
      copyBtn.textContent = 'Kopyala';
    }, 1500);
  });

  return {
    open,
    close,
    toggle: () => {
      if (active) {
        close();
        return false;
      }
      open();
      return true;
    },
    isOpen: () => active,
    setHiddenPaused: (hidden: boolean) => {
      pausedByHidden = hidden;
      if (hidden) stopLoops();
      else if (active) startLoops();
    },
    destroy: () => {
      window.clearTimeout(copyResetTimer);
      close();
      host.innerHTML = '';
    },
  };
}

