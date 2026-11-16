import { HEART_PATH, lilyBloomSvg, raspberrySvg } from '../lib/illustrations';
import { journeyProgress, TARGET_DATE } from './countdown';
import { $, $$ } from './dom';

export const LILY_MILESTONES: { n: number; side: 'l' | 'r' }[] = [
  { n: 10, side: 'l' },
  { n: 30, side: 'r' },
];

function zambakBloomSvg(cx: number, cy: number, scale: number, extra = ''): string {
  const petalPath =
    'M0 0 C 9 -6, 15 -22, 8 -38 C 4.5 -45, 1.8 -49, 0 -52 C -1.8 -49, -4.5 -45, -8 -38 C -15 -22, -9 -6, 0 0Z';
  const angles = [-90, -30, 30, 90, 150, 210];
  const order = [1, 3, 5, 0, 2, 4];
  let petals = '';
  order.forEach((i, k) => {
    const back = i % 2 === 1;
    petals += `<g transform="rotate(${angles[i] + 90})"><g class="petal" style="--i:${k};--r0:${k % 2 ? 20 : -20}deg">
      <path d="${petalPath}" fill="url(#${back ? 'gZambakB' : 'gZambak'})" stroke="rgba(220,226,204,.45)" stroke-width=".5"/>
      <path d="M1.2 -3 C 8 -10, 12 -23, 7 -37" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".8"/>
      <path d="M0 -5 Q .6 -26 0 -47" fill="none" stroke="#d5dfad" stroke-opacity=".58" stroke-width=".75"/>
    </g></g>`;
  });

  let stamens = '';
  for (let k = 0; k < 6; k++) {
    const deg = k * 60 + 20;
    const rad = (deg * Math.PI) / 180;
    const len = k % 2 ? 18 : 22;
    const x = +(Math.cos(rad) * len).toFixed(1);
    const y = +(Math.sin(rad) * len).toFixed(1);
    stamens += `<path d="M0 0 Q ${(x * 0.5).toFixed(1)} ${(y * 0.5 - 5).toFixed(1)} ${x} ${y}" fill="none" stroke="#dbe9aa" stroke-width=".95"/>
      <ellipse cx="${x}" cy="${y}" rx="2.9" ry="1.2" fill="#d99a1e" transform="rotate(${deg} ${x} ${y})"/>
      <circle cx="${(x - Math.cos(rad) * 0.7).toFixed(1)}" cy="${(y - Math.sin(rad) * 0.7).toFixed(1)}" r=".85" fill="#fff5c4"/>`;
  }

  return `<g transform="translate(${cx} ${cy}) scale(${scale})" ${extra}><g transform="scale(1 .9)">${petals}<circle r="11" fill="url(#gZambakThroat)"/></g><g class="stamens">${stamens}<circle r="2.4" fill="#c7de8a"/><circle cx="-.6" cy="-.6" r=".8" fill="#f3fad4"/></g></g>`;
}

function meadowBackdropSvg(): string {
  // Statik çayır ve ot katmanı (bir kez GPU önbelleğine alınır, kare başına yeniden çizim sıfır)
  let g =
    '<svg class="garden-meadow" viewBox="0 0 390 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
    '<defs><linearGradient id="gMeadowShade" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#0b2321" stop-opacity="0"/>' +
    '<stop offset=".45" stop-color="#0a1e22" stop-opacity=".76"/>' +
    '<stop offset="1" stop-color="#08171c" stop-opacity="1"/></linearGradient></defs>' +
    '<path d="M-10 210 Q95 196 195 204 Q295 212 400 198 L400 265 L-10 265 Z" fill="url(#gMeadowShade)"/>';

  for (let i = 0; i < 48; i++) {
    const x = -6 + i * 8.5 + (i % 3) * 1.4;
    const h = 48 + ((i * 37) % 58);
    const d = i % 2 ? 1 : -1;
    const lean = d * (6 + (i % 5) * 2.2);
    const w = (1.6 + (i % 3) * 0.45).toFixed(1);
    const color = i % 4 === 0 ? '#123d30' : i % 3 === 0 ? '#1a523b' : 'var(--leaf-1)';
    const op = (0.58 + (i % 4) * 0.1).toFixed(2);
    g += `<path d="M${x} 264 Q ${(x + lean * 0.45).toFixed(1)} ${(264 - h * 0.55).toFixed(
      1
    )} ${(x + lean).toFixed(1)} ${264 - h}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity="${op}"/>`;
  }

  return g + '</svg>';
}

function gardenFlowersHtml(): string {
  // Her zambak kendi küçük <svg> katmanında → CoreAnimation/GPU sadece rotate() kompozitler (60 fps)
  const back: [number, number, number, boolean][] = [
    [22, 124, 0.58, false],
    [98, 98, 0.5, true],
    [148, 136, 0.44, false],
    [244, 132, 0.44, true],
    [294, 100, 0.5, false],
    [370, 122, 0.58, true],
  ];

  return (
    meadowBackdropSvg() +
    back
      .map(([x, y, sc, isWhite], i) => {
        const d = i % 2 ? 1 : -1;
        const stemH = 264 - y;
        const leftPct = ((x / 390) * 100).toFixed(2);
        const dur = (6.8 + (i % 3) * 0.8).toFixed(1);
        const topPad = 48;
        const vbH = stemH + topPad;
        const flower = isWhite
          ? zambakBloomSvg(0, -stemH, sc, 'class="main-bloom"')
          : lilyBloomSvg(0, -stemH, sc, 'petal', 'stamens', 'class="main-bloom"');
        const leafY = -(stemH * 0.48);
        return `<svg class="flower-stem" style="left:${leftPct}%;height:${vbH}px;--sd:${(-i * 1.25).toFixed(
          2
        )}s;--dur:${dur}s" viewBox="-52 ${-(stemH + topPad)} 104 ${vbH}" aria-hidden="true">
          <path d="M${d * 4} 0 C 0 -48, ${-d * 6} ${-stemH + 38}, 0 ${-stemH}" stroke="var(--leaf-1)" stroke-width="2" fill="none"/>
          <path d="M${d * 2} ${(leafY + 12).toFixed(1)} C ${d * 22} ${(leafY - 2).toFixed(1)}, ${d * 30} ${(
          leafY - 18
        ).toFixed(1)}, ${d * 34} ${(leafY - 34).toFixed(1)} C ${d * 20} ${(leafY - 20).toFixed(1)}, ${d * 10} ${(
          leafY - 8
        ).toFixed(1)}, ${d * 2} ${(leafY + 2).toFixed(1)}Z" fill="url(#gLeaf)"/>
          ${flower}
        </svg>`;
      })
      .join('')
  );
}

function foregroundGrassSvg(): string {
  // İkinci koyu ön plan çayır katmanı — otlar ekranın gerçek alt kenarının ötesine kesintisiz iner (alt şerit kesintisi yok)
  let f =
    '<svg class="grass-front-svg" viewBox="0 0 390 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
    '<defs>' +
    '<linearGradient id="gFrontMeadow" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#07181d" stop-opacity=".12"/>' +
    '<stop offset=".6" stop-color="#08191e" stop-opacity=".68"/>' +
    '<stop offset="1" stop-color="#08171c" stop-opacity="1"/></linearGradient>' +
    '</defs>' +
    '<path d="M-12 224 Q95 214 195 224 Q295 214 402 224 L402 272 L-12 272 Z" fill="url(#gFrontMeadow)"/>';

  for (let i = 0; i < 64; i++) {
    const x = -8 + i * 6.4 + (i % 2) * 1.3;
    const centerDist = Math.abs(x - 195);
    const centerDip = centerDist < 72 ? 14 : 0;
    const h = Math.max(24, 34 + ((i * 29) % 42) - centerDip);
    const d = i % 2 ? 1 : -1;
    const tipX = x + d * (4 + (i % 4) * 1.8);
    const w = 1.9 + (i % 3) * 0.65;
    const color = i % 3 === 0 ? '#071b21' : i % 2 === 0 ? '#0a2228' : '#0d2b2e';
    f += `<path d="M${(x - w).toFixed(1)} 272 Q ${(x + d * 2.5).toFixed(1)} ${(272 - h * 0.56).toFixed(1)} ${tipX.toFixed(1)} ${(
      272 - h
    ).toFixed(1)} Q ${(x + d * 1.2 + w * 0.7).toFixed(1)} ${(272 - h * 0.45).toFixed(1)} ${(x + w).toFixed(
      1
    )} 272 Z" fill="${color}" opacity=".94"/>`;
  }

  return f + '</svg>';
}

function sideLilySvg(side: 'l' | 'r'): string {
  const big = side === 'l';
  return `<svg class="lily ${side}" id="lily-${side}" viewBox="0 0 150 260" aria-hidden="true"><g class="sway" style="--sd:${
    big ? 0 : -2.7
  }s">
    <path d="M60 262 C 58 206, 66 144, 78 82" fill="none" stroke="var(--leaf-1)" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M56 262 C 52 214, 44 166, 36 122" fill="none" stroke="var(--leaf-1)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M62 222 C 38 210, 20 190, 8 164 C 30 176, 48 192, 62 206Z" fill="url(#gLeaf)"/>
    <path d="M64 198 C 86 184, 102 162, 112 136 C 94 152, 78 168, 64 186Z" fill="url(#gLeaf)"/>
    <path d="M52 172 C 36 164, 26 150, 18 130 C 34 144, 45 154, 54 162Z" fill="url(#gLeaf)" opacity=".85"/>
    <g transform="translate(36 122) rotate(-12)"><g class="bud"><path d="M0 0 C 7 -8, 8 -26, 0 -40 C -8 -26, -7 -8, 0 0Z" fill="url(#gBud)"/><path d="M0 -3 L0 -36" stroke="rgba(255,255,255,.35)" stroke-width=".8"/></g></g>
    ${lilyBloomSvg(34, 114, 0.74, 'lpetal', 'stamens-late')}
    ${lilyBloomSvg(78, 80, big ? 1.08 : 0.96, 'petal', 'stamens', 'class="main-bloom"')}
  </g></svg>`;
}

function candleJarSvg(): string {
  // Tek küçük SVG alev (yalnızca opacity/scale salınımı, blur/filtre yok)
  return `<svg class="candle" id="candle" viewBox="0 0 160 190" aria-hidden="true">
    <defs>
      <linearGradient id="gJar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".36"/><stop offset=".1" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset=".9" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".32"/></linearGradient>
      <linearGradient id="gWax2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7ee"/><stop offset=".3" stop-color="#ffe9dd"/><stop offset="1" style="stop-color:var(--petal-mid)"/></linearGradient>
      <radialGradient id="gWaxGlow" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#ffcf86" stop-opacity=".85"/><stop offset=".45" stop-color="#ffb07a" stop-opacity=".22"/><stop offset="1" stop-color="#ffb07a" stop-opacity="0"/></radialGradient>
      <radialGradient id="gPool"><stop offset="0" stop-color="#ffe4ad"/><stop offset=".65" stop-color="#ffd08c" stop-opacity=".85"/><stop offset="1" stop-color="#fff3e2" stop-opacity="0"/></radialGradient>
      <linearGradient id="gLabel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#efe3d6"/><stop offset=".5" stop-color="#fdf7f0"/><stop offset="1" stop-color="#e8dacb"/></linearGradient>
      <linearGradient id="gFlame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#6b95ff" stop-opacity=".85"/><stop offset=".22" stop-color="#ff9a3c" stop-opacity=".95"/><stop offset=".75" stop-color="#ffc15e" stop-opacity=".92"/><stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/></linearGradient>
      <clipPath id="cJar"><path d="M43 86 Q43 80 49 80 L111 80 Q117 80 117 86 L117 168 Q117 178 107 178 L53 178 Q43 178 43 168Z"/></clipPath>
    </defs>
    <path d="M40 84 Q40 76 48 76 L112 76 Q120 76 120 84 L120 168 Q120 182 106 182 L54 182 Q40 182 40 168Z" fill="rgba(255,255,255,.05)"/>
    <g clip-path="url(#cJar)">
      <path id="wax" fill="url(#gWax2)" d="M45 104 L115 104 L115 164 Q115 175 104 175 L56 175 Q45 175 45 164Z"/>
      <rect id="waxglow" class="waxglow" x="43" y="100" width="74" height="46" fill="url(#gWaxGlow)"/>
    </g>
    <ellipse id="wax-top" cx="80" cy="104" rx="35" ry="5.4" fill="#fff4e8"/>
    <ellipse id="pool" class="pool" cx="80" cy="104" rx="16" ry="2.9" fill="url(#gPool)"/>
    <ellipse id="pool-hi" cx="74" cy="103.5" rx="5" ry=".7" fill="#fff" opacity=".4"/>
    <path d="M43 126 Q80 131 117 126 L117 153 Q80 158 43 153Z" fill="url(#gLabel)"/>
    <path d="M43 129 Q80 134 117 129 M43 150 Q80 155 117 150" stroke="var(--paper-accent)" stroke-opacity=".45" stroke-width=".7" fill="none"/>
    <text x="64" y="147" text-anchor="middle" class="jar-label">B</text>
    <g transform="translate(74.4 135.2) scale(0.46)"><path class="jar-heart" d="${HEART_PATH}"/></g>
    <text x="96" y="147" text-anchor="middle" class="jar-label">H</text>
    ${raspberrySvg(48.5, 142, 0.28, '', false)}${raspberrySvg(111.5, 142, 0.28, '', false)}
    <g id="wick-pos">
      <path d="M80 104 Q78.6 98 80.8 92.6" stroke="#2a1d1a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g class="candle-flame" id="candle-flame" aria-hidden="true">
        <path d="M80.8 60 C89.5 71 90.2 86 80.8 94 C71.4 86 72.1 71 80.8 60Z" fill="url(#gFlame)"/>
        <path d="M80.8 73 C84.4 79.5 84.8 87.5 80.8 91.8 C76.8 87.5 77.2 79.5 80.8 73Z" fill="#fffbe6"/>
      </g>
      <circle id="wick-tip" cx="80.8" cy="92.8" r="1.4" fill="#ff7a2e"/>
    </g>
    <path d="M40 84 Q40 76 48 76 L112 76 Q120 76 120 84 L120 168 Q120 182 106 182 L54 182 Q40 182 40 168Z" fill="url(#gJar)" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/>
    <ellipse cx="80" cy="77" rx="40" ry="5" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>
    <ellipse cx="80" cy="78.2" rx="36.5" ry="3.6" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <path d="M44 173 Q80 180 116 173" stroke="rgba(255,255,255,.32)" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M47 90 Q44.6 130 48.6 168" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M113 94 Q115.4 118 113.4 140" stroke="rgba(255,255,255,.22)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse class="refl" cx="51.5" cy="98" rx="2.2" ry="7.5" fill="#ffd9a0" opacity=".45"/>
    <ellipse class="refl" cx="109" cy="101" rx="1.6" ry="5.5" fill="#ffd9a0" opacity=".32"/>
    ${raspberrySvg(13, 170, 1.05, 'class="rasp"')}${raspberrySvg(32, 176, 0.86, 'class="rasp"')}${raspberrySvg(128, 176, 0.86, 'class="rasp"')}${raspberrySvg(147, 169, 1.05, 'class="rasp"')}
  </svg>`;
}

export class GardenController {
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private waxTimer = 0;
  private wiggleTimer = 0;
  private flareTimer = 0;

  constructor(opts: {
    onRaspberryTap: (raspEl: Element) => void;
  }) {
    $('#lilies').innerHTML = gardenFlowersHtml() + sideLilySvg('l') + sideLilySvg('r');
    const grassFront = document.getElementById('grass-front');
    if (grassFront) grassFront.innerHTML = foregroundGrassSvg();
    const holder = $('#candle-holder');
    holder.innerHTML = candleJarSvg();

    this.updateWax();
    this.startTimers();
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    holder.addEventListener('click', (e) => {
      const rasp = (e.target as Element).closest('.rasp');
      if (!rasp) return;
      const inner = rasp.querySelector('.rasp-in');
      if (inner) {
        inner.classList.remove('boing');
        void (inner as unknown as HTMLElement).getBoundingClientRect();
        inner.classList.add('boing');
      }
      opts.onRaspberryTap(rasp);
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      window.clearInterval(this.waxTimer);
      window.clearInterval(this.wiggleTimer);
      this.waxTimer = 0;
      this.wiggleTimer = 0;
    } else {
      this.updateWax();
      this.startTimers();
    }
  };

  private startTimers(): void {
    if (document.hidden) return;
    if (!this.waxTimer) {
      this.waxTimer = window.setInterval(() => {
        if (!document.hidden) this.updateWax();
      }, 60_000);
    }
    if (!this.reducedMotion && !this.wiggleTimer) {
      this.wiggleTimer = window.setInterval(() => {
        if (
          document.hidden ||
          !document.body.classList.contains('awake') ||
          document.body.classList.contains('quiet') ||
          document.body.classList.contains('deep-idle')
        ) {
          return;
        }
        const rasps = $$('.rasp .rasp-in');
        const pick = rasps[Math.floor(Math.random() * rasps.length)];
        if (!pick) return;
        pick.classList.remove('wiggle');
        void pick.getBoundingClientRect();
        pick.classList.add('wiggle');
      }, 5600);
    }
  }

  public triggerFlameFlare(): void {
    const flame = document.getElementById('candle-flame');
    if (!flame) return;
    window.clearTimeout(this.flareTimer);
    flame.classList.remove('flare');
    void flame.getBoundingClientRect();
    flame.classList.add('flare');
    this.flareTimer = window.setTimeout(() => {
      flame.classList.remove('flare');
    }, 900);
  }

  public updateWax(): void {
    const pr = journeyProgress();
    const dy = +(26 * pr).toFixed(2);
    const top = 104 + dy;
    const pe = Math.pow(pr, 0.75);

    $('#wax').setAttribute('d', `M45 ${top} L115 ${top} L115 164 Q115 175 104 175 L56 175 Q45 175 45 164Z`);
    $('#wax-top').setAttribute('cy', String(top));

    const pool = $('#pool');
    pool.setAttribute('cy', String(top));
    pool.setAttribute('rx', (11 + 21 * pe).toFixed(2));
    pool.setAttribute('ry', (2 + 3.3 * pe).toFixed(2));

    const poolHi = document.getElementById('pool-hi');
    if (poolHi) {
      poolHi.setAttribute('cy', String(top - 0.5 - pe * 0.6));
      poolHi.setAttribute('rx', (4 + 9 * pe).toFixed(2));
      poolHi.style.opacity = (0.35 + 0.4 * pe).toFixed(2);
    }

    const waxGlow = document.getElementById('waxglow');
    if (waxGlow) waxGlow.setAttribute('y', String(top - 4));

    $('#wick-pos').setAttribute('transform', `translate(0 ${dy})`);
  }

  public getWickScreenPos(): { x: number; y: number } | null {
    const tip = document.getElementById('wick-tip');
    if (!tip) return null;
    const r = tip.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  public getBloomScreenCenters(): { x: number; y: number }[] {
    return $$('.main-bloom')
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => ({
        x: r.left + r.width * (0.3 + Math.random() * 0.4),
        y: r.top + r.height * (0.3 + Math.random() * 0.4),
      }));
  }

  public syncMilestones(starCount: number): { unlocked: number | null } {
    let unlocked: number | null = null;
    for (const m of LILY_MILESTONES) {
      const el = document.getElementById(`lily-${m.side}`);
      if (!el) continue;
      const should = starCount >= m.n;
      const had = el.classList.contains('opened');
      el.classList.toggle('opened', should);
      if (should && !had) unlocked = m.n;
    }
    return { unlocked };
  }

  public getDaysRemaining(): number {
    return Math.ceil((TARGET_DATE.getTime() - Date.now()) / 86_400_000);
  }

  public destroy(): void {
    window.clearInterval(this.waxTimer);
    window.clearInterval(this.wiggleTimer);
    window.clearTimeout(this.flareTimer);
    this.waxTimer = 0;
    this.wiggleTimer = 0;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}

