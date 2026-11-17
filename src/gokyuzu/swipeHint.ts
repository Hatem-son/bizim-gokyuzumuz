// "DOĞU / BATI" çubuğunun yerine: takımyıldız konum göstergesi + kenar parıltısı + ilk açılış ipucu.
// Yalnızca transform/opacity. Kaydırma bilgisi dışarıdan: setProgress(0..1), onScrollStart/End.

const CSS = `
.gk-cons{position:absolute;left:50%;bottom:calc(var(--grass-top,190px) + 10px);width:84px;height:22px;
  margin-left:-42px;opacity:0;transition:opacity .6s ease;pointer-events:none;z-index:6}
.gk-cons.on{opacity:1;transition-duration:.2s}
.gk-cons svg{position:absolute;inset:0;overflow:visible}
.gk-cons .act{position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;will-change:transform}
.gk-edge{position:absolute;top:50%;width:28px;height:140px;margin-top:-70px;opacity:0;pointer-events:none;
  transition:opacity .8s ease;z-index:6}
.gk-edge.l{left:0;background:radial-gradient(ellipse 100% 50% at 0 50%,rgba(255,255,255,.14),rgba(255,255,255,0) 70%)}
.gk-edge.r{right:0;background:radial-gradient(ellipse 100% 50% at 100% 50%,rgba(255,255,255,.14),rgba(255,255,255,0) 70%)}
.gk-edge.on{opacity:1}
.gk-edge i{position:absolute;top:50%;width:3px;height:3px;border-radius:50%;background:#fff;opacity:0;
  animation:gkDot 1.6s infinite}
.gk-edge.l i{left:var(--x)} .gk-edge.r i{right:var(--x)}
.gk-edge i:nth-child(1){--x:14px;animation-delay:0s}
.gk-edge i:nth-child(2){--x:9px;animation-delay:.18s}
.gk-edge i:nth-child(3){--x:4px;animation-delay:.36s}
@keyframes gkDot{0%,100%{opacity:0;transform:scale(.6)}40%{opacity:.75;transform:scale(1)}}
.gk-hint-txt{position:absolute;left:0;right:0;bottom:calc(var(--grass-top,190px) + 38px);text-align:center;
  font-family:var(--script-font,cursive);font-size:18px;color:rgba(255,255,255,.85);opacity:0;
  transform:translateY(6px);transition:opacity .5s ease,transform .5s ease;pointer-events:none;z-index:6}
.gk-hint-txt.on{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.gk-edge i{animation:none;opacity:.5}}
`;

// 5 nokta, hafif kavisli yay (y = sapma)
const DOTS = [0, 1, 2, 3, 4].map((i) => ({ x: 6 + i * 18, y: 11 - Math.sin((i / 4) * Math.PI) * 6 }));

export class SwipeHint {
  private cons: HTMLDivElement;
  private act: HTMLDivElement;
  private edgeL: HTMLDivElement;
  private edgeR: HTMLDivElement;
  private txt: HTMLDivElement;
  private hideT = 0;
  private idleT = 0;
  private edgeShows = 0;
  private scrolledOnce = false;
  private progress = 0.5;

  constructor(host: HTMLElement, personColor: string) {
    if (!document.getElementById('gk-swipe-css')) {
      const st = document.createElement('style');
      st.id = 'gk-swipe-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.cons = div('gk-cons');
    this.cons.setAttribute('aria-hidden', 'true');
    const lines = DOTS.map((d, i) => (i ? `L${d.x} ${d.y}` : `M${d.x} ${d.y}`)).join(' ');
    this.cons.innerHTML =
      `<svg width="84" height="22"><path d="${lines}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width=".75"/>` +
      DOTS.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="1.5" fill="rgba(255,255,255,.35)"/>`).join('') +
      `</svg>`;
    this.act = div('act');
    this.act.innerHTML = `<svg width="12" height="12" viewBox="-6 -6 12 12"><path d="M0-6 1.2-1.2 6 0 1.2 1.2 0 6-1.2 1.2-6 0-1.2-1.2Z" fill="${personColor}"/></svg>`;
    this.cons.appendChild(this.act);
    this.edgeL = div('gk-edge l');
    this.edgeR = div('gk-edge r');
    for (const e of [this.edgeL, this.edgeR]) e.innerHTML = '<i></i><i></i><i></i>';
    this.txt = div('gk-hint-txt');
    this.txt.textContent = 'gökyüzümüz geniş, kaydır';
    host.append(this.cons, this.edgeL, this.edgeR, this.txt);
    this.place();
    this.armIdle();
  }

  /** p: 0 = en sol (doğu), 1 = en sağ (batı). Kaydırma sırasında her karede çağrılabilir. */
  setProgress(p: number) {
    this.progress = Math.max(0, Math.min(1, p));
    this.place();
  }

  private place() {
    // aktif yıldız noktalar arasında SÜREKLİ kayar
    const f = this.progress * (DOTS.length - 1);
    const i = Math.min(DOTS.length - 2, Math.floor(f));
    const t = f - i;
    const x = DOTS[i].x + (DOTS[i + 1].x - DOTS[i].x) * t;
    const y = DOTS[i].y + (DOTS[i + 1].y - DOTS[i].y) * t;
    this.act.style.transform = `translate3d(${x}px,${y}px,0) rotate(${this.progress * 90}deg)`;
  }

  onScrollStart() {
    this.scrolledOnce = true;
    clearTimeout(this.hideT);
    this.cons.classList.add('on');
    this.edgeL.classList.remove('on');
    this.edgeR.classList.remove('on');
    this.txt.classList.remove('on');
    clearTimeout(this.idleT);
  }

  onScrollEnd() {
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(() => this.cons.classList.remove('on'), 1800);
    this.armIdle();
  }

  /** Boştayken (3 sn) kenar parıltısı; oturum başına en fazla 3 kez, kaydırıldıktan sonra hiç. */
  private armIdle() {
    clearTimeout(this.idleT);
    if (this.scrolledOnce || this.edgeShows >= 3) return;
    this.idleT = window.setTimeout(() => {
      this.edgeShows++;
      if (this.progress > 0.02) this.edgeL.classList.add('on');
      if (this.progress < 0.98) this.edgeR.classList.add('on');
      window.setTimeout(() => {
        this.edgeL.classList.remove('on');
        this.edgeR.classList.remove('on');
        this.armIdle();
      }, 4000);
    }, 3000);
  }

  /** İpucu yazısını kısa süre göster (ilk açılış ipucu için). */
  showText(ms = 2500) {
    this.txt.classList.add('on');
    window.setTimeout(() => this.txt.classList.remove('on'), ms);
  }

  /**
   * İlk iki açılışta: gökyüzü sağa 36 pt kayıp yaylı geri döner.
   * @param nudge gökyüzü kaydırma katmanına geçici translateX uygulayan fonksiyon
   */
  async firstRunNudge(skyLayer: HTMLElement) {
    const n = +(localStorage.getItem('gk.nudge') || 0);
    if (n >= 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    localStorage.setItem('gk.nudge', String(n + 1));
    await sleep(1500);
    if (this.scrolledOnce) return;
    this.cons.classList.add('on');
    this.txt.classList.add('on');
    const anim = skyLayer.animate(
      [
        { transform: 'translate3d(0,0,0)' },
        { transform: 'translate3d(-36px,0,0)', offset: 0.45 },
        { transform: 'translate3d(0,0,0)' },
      ],
      { duration: 900, easing: 'cubic-bezier(.3,.7,.3,1.2)', composite: 'add' as CompositeOperation },
    );
    const start = this.progress;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / 900;
      if (t >= 1 || this.scrolledOnce) return this.setProgress(start);
      const k = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      this.setProgress(start + 0.08 * k);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    const stop = () => anim.cancel();
    skyLayer.addEventListener('pointerdown', stop, { once: true });
    await sleep(2500);
    this.txt.classList.remove('on');
    if (!this.scrolledOnce) this.cons.classList.remove('on');
  }
}

const div = (cls: string) => {
  const d = document.createElement('div');
  d.className = cls;
  return d;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
