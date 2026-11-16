import { HEART_PATH, whiteZambakSvg, zambakBudSvg } from '../lib/illustrations';
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
    const sprigArc =
      `<path d="M 8 10 C 26 9, 43 16, 51 32 C 54 39, 54 47, 50 55" fill="none" stroke="url(#gCdStem)" stroke-width="1.85" stroke-linecap="round"/>` +
      `<path d="M 27 10.5 C 19 4.5, 11 4.2, 4 7.5 C 12 9.4, 19 10.6, 27 11.4 Z" fill="url(#gLeaf)"/>` +
      `<path d="M 25 10.7 Q 15 6.8 6 7.5" fill="none" stroke="#9be09e" stroke-opacity=".55" stroke-width=".55" stroke-linecap="round"/>` +
      `<path d="M 41 16 C 43 8.5, 48 4, 54.5 3.5 C 50.5 8.5, 46.5 12.5, 42 17 Z" fill="url(#gLeaf)" opacity=".92"/>` +
      `<path d="M 41.5 15.8 Q 46.5 8.5 52.8 4.4" fill="none" stroke="#9be09e" stroke-opacity=".48" stroke-width=".5" stroke-linecap="round"/>` +
      `<path d="M 52 35 C 58 40, 59 48, 55.5 56 C 53 49, 52 42, 50 36 Z" fill="url(#gLeaf)" opacity=".88"/>` +
      `<path d="M 51.6 36.2 Q 55.5 45 55 53.5" fill="none" stroke="#9be09e" stroke-opacity=".45" stroke-width=".5" stroke-linecap="round"/>` +
      zambakBudSvg(27, 10.5, 0.44, -84) +
      zambakBudSvg(52, 40, 0.56, 154) +
      `<g transform="translate(47 20) rotate(32)">${whiteZambakSvg(0, 0, 0.28, 'sp', 'sp-st')}</g>`;

    $('#cd-sprig').innerHTML = sprigArc;
    $('#cd-sprig2').innerHTML = `<g transform="rotate(180 32 32)">${sprigArc}</g>`;

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
        '<span class="dgt"></span><span class="dgt"></span>';
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

