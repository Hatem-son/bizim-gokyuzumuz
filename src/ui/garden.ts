import { HEART_PATH, lilyBloomSvg, raspberrySvg, whiteZambakSvg } from '../lib/illustrations';
import { journeyProgress, TARGET_DATE } from './countdown';
import { $, $$ } from './dom';

export const LILY_MILESTONES: { n: number; side: 'l' | 'r' }[] = [
  { n: 10, side: 'l' },
  { n: 30, side: 'r' },
];

function zambakBloomSvg(cx: number, cy: number, scale: number, extra = ''): string {
  return whiteZambakSvg(cx, cy, scale, 'petal', 'stamens', extra);
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
        return `<svg class="flower-stem" style="left:${leftPct}%;height:${vbH}px;--sd:${(-(x / 180) * 1.4).toFixed(
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
  // Özenli kristal kavanoz mum: kalın cam taban yansıması, çok katmanlı alev parıltısı ve altın çerçeveli etiket
  return `<svg class="candle" id="candle" viewBox="0 0 160 190" aria-hidden="true">
    <defs>
      <linearGradient id="gJar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity=".42"/>
        <stop offset=".08" stop-color="#fff" stop-opacity=".14"/>
        <stop offset=".48" stop-color="#fff" stop-opacity=".02"/>
        <stop offset=".9" stop-color="#fff" stop-opacity=".13"/>
        <stop offset="1" stop-color="#fff" stop-opacity=".36"/>
      </linearGradient>
      <linearGradient id="gJarRim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity=".72"/>
        <stop offset=".5" stop-color="#fff" stop-opacity=".28"/>
        <stop offset="1" stop-color="#fff" stop-opacity=".68"/>
      </linearGradient>
      <linearGradient id="gWax2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffaf3"/>
        <stop offset=".26" stop-color="#ffeadd"/>
        <stop offset=".75" style="stop-color:var(--petal-mid)"/>
        <stop offset="1" style="stop-color:var(--petal-base)" stop-opacity=".55"/>
      </linearGradient>
      <radialGradient id="gWaxGlow" cx=".5" cy="0" r="1">
        <stop offset="0" stop-color="#ffd58f" stop-opacity=".95"/>
        <stop offset=".42" stop-color="#ffb276" stop-opacity=".30"/>
        <stop offset="1" stop-color="#ffb07a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="gFlameHalo">
        <stop offset="0" stop-color="#ffd885" stop-opacity=".36"/>
        <stop offset=".45" stop-color="#ffaa5c" stop-opacity=".12"/>
        <stop offset="1" stop-color="#ff9944" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="gPool">
        <stop offset="0" stop-color="#fff0c8"/>
        <stop offset=".6" stop-color="#ffd490" stop-opacity=".88"/>
        <stop offset="1" stop-color="#fff3e2" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="gLabel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e9dccb"/>
        <stop offset=".18" stop-color="#faf3ea"/>
        <stop offset=".5" stop-color="#fffaf4"/>
        <stop offset=".82" stop-color="#f8efe5"/>
        <stop offset="1" stop-color="#e4d5c4"/>
      </linearGradient>
      <linearGradient id="gFlame" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#6b95ff" stop-opacity=".9"/>
        <stop offset=".2" stop-color="#ff9533" stop-opacity=".98"/>
        <stop offset=".72" stop-color="#ffca66" stop-opacity=".95"/>
        <stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="cJar"><path d="M43 86 Q43 80 49 80 L111 80 Q117 80 117 86 L117 167 Q117 176 107 176 L53 176 Q43 176 43 167Z"/></clipPath>
    </defs>
    <!-- Hafif taban gölgesi ve sıcak mum ışıltısı -->
    <ellipse cx="80" cy="183" rx="44" ry="4.5" fill="#040d11" opacity=".48"/>
    <path d="M39 85 Q39 75 49 75 L111 75 Q121 75 121 85 L121 168 Q121 183 106 183 L54 183 Q39 183 39 168Z" fill="rgba(255,255,255,.06)"/>
    <g clip-path="url(#cJar)">
      <path id="wax" fill="url(#gWax2)" d="M45 104 L115 104 L115 163 Q115 174 104 174 L56 174 Q45 174 45 163Z"/>
      <rect id="waxglow" class="waxglow" x="43" y="100" width="74" height="50" fill="url(#gWaxGlow)"/>
    </g>
    <!-- Kalın kristal cam taban kırılması -->
    <path d="M45 170 Q80 176 115 170 L113 176 Q80 182 47 176Z" fill="rgba(255,255,255,.16)"/>
    <ellipse id="wax-top" cx="80" cy="104" rx="35" ry="5.5" fill="#fff6eb"/>
    <ellipse id="pool" class="pool" cx="80" cy="104" rx="17" ry="3.1" fill="url(#gPool)"/>
    <ellipse id="pool-hi" cx="73.5" cy="103.5" rx="5.5" ry=".75" fill="#fff" opacity=".48"/>
    <!-- İnce kenarlı krem kağıt etiket -->
    <path d="M42.5 125.5 Q80 130.8 117.5 125.5 L117.5 153.5 Q80 158.8 42.5 153.5Z" fill="url(#gLabel)"/>
    <path d="M42.5 127.8 Q80 133.1 117.5 127.8 M42.5 151.2 Q80 156.5 117.5 151.2" stroke="var(--paper-accent)" stroke-opacity=".55" stroke-width=".75" fill="none"/>
    <path d="M42.5 129.2 Q80 134.5 117.5 129.2 M42.5 149.8 Q80 155.1 117.5 149.8" stroke="#d9b26f" stroke-opacity=".42" stroke-width=".45" fill="none"/>
    <text x="64" y="147" text-anchor="middle" class="jar-label">B</text>
    <g transform="translate(74.4 135.2) scale(0.46)"><path class="jar-heart" d="${HEART_PATH}"/></g>
    <text x="96" y="147" text-anchor="middle" class="jar-label">H</text>
    ${raspberrySvg(48.5, 142, 0.28, '', false)}${raspberrySvg(111.5, 142, 0.28, '', false)}
    <g id="wick-pos">
      <path d="M80 104 Q78.6 98 80.8 92.6" stroke="#2a1d1a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g class="candle-flame" id="candle-flame" aria-hidden="true">
        <circle cx="80.8" cy="80" r="24" fill="url(#gFlameHalo)"/>
        <path d="M80.8 59 C90.2 70.5 90.8 86 80.8 94.2 C70.8 86 71.4 70.5 80.8 59Z" fill="url(#gFlame)"/>
        <path d="M80.8 72.5 C84.8 79.5 85.2 87.5 80.8 92 C76.4 87.5 76.8 79.5 80.8 72.5Z" fill="#fffce8"/>
      </g>
      <circle id="wick-tip" cx="80.8" cy="92.8" r="1.45" fill="#ff7a2e"/>
    </g>
    <!-- Kavanoz cam dış gövde + kenar parlamaları + çift ağız dudak -->
    <path d="M39 85 Q39 75 49 75 L111 75 Q121 75 121 85 L121 168 Q121 183 106 183 L54 183 Q39 183 39 168Z" fill="url(#gJar)" stroke="rgba(255,255,255,.55)" stroke-width="1.25"/>
    <ellipse cx="80" cy="76.5" rx="41" ry="5.4" fill="none" stroke="url(#gJarRim)" stroke-width="1.7"/>
    <ellipse cx="80" cy="78.2" rx="37.2" ry="3.8" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
    <path d="M44 174 Q80 181.5 116 174" stroke="rgba(255,255,255,.42)" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M46.5 89 Q44 130 48 168" stroke="rgba(255,255,255,.62)" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    <path d="M51.5 91 Q49.8 110 51 122" stroke="rgba(255,255,255,.26)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <path d="M113.5 93 Q115.8 118 113.8 142" stroke="rgba(255,255,255,.26)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse class="refl" cx="51.5" cy="98" rx="2.3" ry="7.8" fill="#ffd9a0" opacity=".5"/>
    <ellipse class="refl" cx="109" cy="101" rx="1.7" ry="5.6" fill="#ffd9a0" opacity=".36"/>
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

