import { HEART_PATH, lilyBloomSvg } from '../lib/illustrations';
import { $ } from './dom';

export const TARGET_DATE = new Date(2027, 0, 9, 0, 0, 0);
export const START_DATE = new Date(2026, 10, 16, 0, 0, 0);

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function journeyProgress(nowMs = Date.now()): number {
  const span = TARGET_DATE.getTime() - START_DATE.getTime();
  return Math.min(1, Math.max(0, (nowMs - START_DATE.getTime()) / span));
}

export class CountdownController {
  private readonly daysEl = $('#cd-days');
  private readonly timeEl = $('#cd-time');
  private readonly labelEl = $('#cd-label');
  private readonly flowersEl = $('#cd-flowers');
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private builtDigits = false;
  private lastFlowerCount = -1;
  private timerId = 0;

  constructor() {
    $('#cd-sprig').innerHTML =
      `<path d="M-6 22 C -12 10, -20 4, -28 2 C -18 10, -12 16, -8 24Z" fill="url(#gLeaf)"/>` +
      `<path d="M-4 24 C 2 12, 10 8, 20 8 C 10 14, 4 18, -2 26Z" fill="url(#gLeaf)" opacity=".9"/>` +
      lilyBloomSvg(0, 0, 0.5, 'sp', 'sp-st');

    $('#cd-sprig2').innerHTML = (() => {
      let petals = '';
      for (let k = 0; k < 6; k++) {
        petals += `<ellipse cx="0" cy="-5.6" rx="2.6" ry="6" transform="rotate(${k * 60 + 30})" fill="#fffdf6" stroke="rgba(200,180,120,.5)" stroke-width=".4"/>`;
      }
      return `<path d="M-2 4 C -8 8, -12 12, -14 16 C -8 14, -4 10, 0 6Z" fill="#5fae6e"/>${petals}<circle r="2" fill="#efc24a"/><circle r=".8" cx="1" cy="-.6" fill="#fff6c8"/>`;
    })();

    this.tick();
    this.startTimer();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    } else {
      this.tick();
      this.startTimer();
    }
  };

  private startTimer(): void {
    if (this.timerId || document.hidden) return;
    this.timerId = window.setInterval(() => {
      if (!document.hidden) this.tick();
    }, 1000);
  }

  private setRoll(el: HTMLElement, val: string): void {
    if (el.dataset.v === val) return;
    const prev = el.dataset.v;
    el.dataset.v = val;
    if (prev === undefined || this.reducedMotion) {
      el.textContent = val;
      return;
    }
    let oldSpan = el.firstElementChild as HTMLElement | null;
    let newSpan = el.lastElementChild as HTMLElement | null;
    if (!oldSpan || !newSpan || oldSpan === newSpan) {
      el.innerHTML = '<span></span><span></span>';
      oldSpan = el.firstElementChild as HTMLElement;
      newSpan = el.lastElementChild as HTMLElement;
    }
    const sOld = oldSpan;
    const sNew = newSpan;
    sOld.textContent = prev;
    sNew.textContent = val;
    sOld.className = '';
    sNew.className = '';
    requestAnimationFrame(() => {
      sOld.className = 'o-old';
      sNew.className = 'o-new';
    });
  }

  private renderWreath(p: number): void {
    const N = 12;
    const done = Math.floor(p * N + 1e-6);
    if (done === this.lastFlowerCount) return;
    this.lastFlowerCount = done;

    let leaves = '';
    let flowers = '';

    for (let i = 0; i < N; i++) {
      const a = ((-90 + i * 30 + 15) * Math.PI) / 180;
      const x = +(28 + 22.5 * Math.cos(a)).toFixed(2);
      const y = +(28 + 22.5 * Math.sin(a)).toFixed(2);
      leaves += `<g transform="translate(${x} ${y}) rotate(${(i * 30 + 15 + 90).toFixed(0)})"><path d="M0 -3.4 C 1.6 -1.6, 1.6 1.6, 0 3.4 C -1.6 1.6, -1.6 -1.6, 0 -3.4Z" fill="#5fae6e" opacity=".85"/></g>`;
    }

    for (let i = 0; i < N; i++) {
      const a = ((-90 + i * 30) * Math.PI) / 180;
      const x = +(28 + 22.5 * Math.cos(a)).toFixed(2);
      const y = +(28 + 22.5 * Math.sin(a)).toFixed(2);
      const isLily = i % 2 === 0;
      const isOpen = i < done;
      const isNext = i === done;
      const pet = isLily ? 'url(#gCdLily)' : 'url(#gCdZambak)';
      const ctr = isLily ? '#9e0f44' : '#e9b93c';

      let petals = '';
      for (let k = 0; k < 6; k++) {
        petals += `<ellipse cx="0" cy="-2.9" rx="1.55" ry="3.2" transform="rotate(${k * 60 + (isLily ? 0 : 30)})" fill="${pet}" stroke="${
          isLily ? 'rgba(160,20,70,.35)' : 'rgba(200,180,120,.45)'
        }" stroke-width=".2"/>`;
      }
      const spots = isLily
        ? '<circle cx=".6" cy="-2" r=".28" fill="#b3124c"/><circle cx="-.7" cy="-2.6" r=".25" fill="#b3124c"/>'
        : '';
      const sc = isOpen ? 1 : isNext ? 0.86 : 0.74;
      const op = isOpen ? 1 : isNext ? 0.9 : 0.62;
      flowers += `<g transform="translate(${x} ${y}) rotate(${(i * 30).toFixed(0)}) scale(${sc})" opacity="${op}"><g class="cdf ${
        isOpen || isNext ? 'on' : 'rest'
      }${isNext ? ' nextf' : ''}" style="--d:${(i * 0.06).toFixed(2)}s">${petals}${spots}<circle r="1.15" fill="${ctr}"/></g></g>`;
    }

    this.flowersEl.innerHTML = `<defs>
      <radialGradient id="gCdLily" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#d63a74"/><stop offset=".55" stop-color="#ff95c0"/><stop offset="1" stop-color="#fff2f8"/></radialGradient>
      <radialGradient id="gCdZambak" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#f3e7b8"/><stop offset=".5" stop-color="#fffdf4"/><stop offset="1" stop-color="#ffffff"/></radialGradient>
    </defs>${leaves}${flowers}`;
  }

  public tick = (): void => {
    const now = new Date();
    const p = journeyProgress(now.getTime());
    this.renderWreath(p);

    const special = (lbl: string, txt: string) => {
      this.labelEl.textContent = lbl;
      delete this.daysEl.dataset.v;
      this.daysEl.innerHTML = `<span><svg class="cd-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}"/></svg></span>`;
      this.timeEl.textContent = txt;
      this.builtDigits = false;
    };

    if (now.getFullYear() === 2027 && now.getMonth() === 0 && now.getDate() === 9) {
      special('Bugün', 'konuşuyoruz');
      return;
    }

    let diff = TARGET_DATE.getTime() - now.getTime();
    if (diff <= 0) {
      special('9 Ocak', 'konuştuk');
      return;
    }

    const D = Math.floor(diff / 86_400_000);
    diff -= D * 86_400_000;
    const H = Math.floor(diff / 3_600_000);
    diff -= H * 3_600_000;
    const M = Math.floor(diff / 60_000);
    diff -= M * 60_000;
    const S = Math.floor(diff / 1000);

    this.labelEl.textContent = "9 Ocak'a";
    this.setRoll(this.daysEl, String(D));

    if (!this.builtDigits) {
      this.timeEl.innerHTML =
        '<span class="dgt"></span><span class="dgt"></span><i class="sep">:</i>' +
        '<span class="dgt"></span><span class="dgt"></span><i class="sep">:</i>' +
        '<span class="dgt"></span><span class="dgt"></span><span class="unit">SA · DK · SN</span>';
      this.builtDigits = true;
    }

    const digits = pad2(H) + pad2(M) + pad2(S);
    this.timeEl.querySelectorAll<HTMLElement>('.dgt').forEach((el, idx) => {
      this.setRoll(el, digits[idx]);
    });
  };

  public destroy(): void {
    window.clearInterval(this.timerId);
    this.timerId = 0;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}

