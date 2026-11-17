import { HEART_PATH, lilyBloomSvg, PinkBow, raspberrySvg, whiteZambakSvg } from '../lib/illustrations';
import { createRasterBank, type RasterPair } from '../lib/rasterize';
import { journeyProgress, TARGET_DATE } from './countdown';
import { $, $$ } from './dom';

export const LILY_MILESTONES: { n: number; side: 'l' | 'r' }[] = [
  { n: 10, side: 'l' },
  { n: 30, side: 'r' },
];

function zambakBloomSvg(cx: number, cy: number, scale: number, extra = ''): string {
  return whiteZambakSvg(cx, cy, scale, 'petal', 'stamens', extra);
}

function buildStemInner(stemH: number, sc: number, isWhite: boolean, d: number): string {
  const flower = isWhite
    ? zambakBloomSvg(0, -stemH, sc)
    : lilyBloomSvg(0, -stemH, sc, 'petal', 'stamens');
  const leafY = -(stemH * 0.48);
  return (
    `<path d="M${d * 4} 0 C 0 -48, ${-d * 6} ${-stemH + 38}, 0 ${-stemH}" stroke="var(--leaf-1)" stroke-width="2" fill="none"/>` +
    `<path d="M${d * 2} ${(leafY + 12).toFixed(1)} C ${d * 22} ${(leafY - 2).toFixed(1)}, ${d * 30} ${(
      leafY - 18
    ).toFixed(1)}, ${d * 34} ${(leafY - 34).toFixed(1)} C ${d * 20} ${(leafY - 20).toFixed(1)}, ${d * 10} ${(
      leafY - 8
    ).toFixed(1)}, ${d * 2} ${(leafY + 2).toFixed(1)}Z" fill="url(#gLeaf)"/>` +
    flower
  );
}

function meadowBackdropSpec(): { inner: string; extraDefs: string } {
  const extraDefs =
    '<linearGradient id="gMeadowShade" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#0b2321" stop-opacity="0"/>' +
    '<stop offset=".45" stop-color="#0a1e22" stop-opacity=".76"/>' +
    '<stop offset="1" stop-color="#08171c" stop-opacity="1"/></linearGradient>';

  let inner = '<path d="M-10 210 Q95 196 195 204 Q295 212 400 198 L400 265 L-10 265 Z" fill="url(#gMeadowShade)"/>';

  for (let i = 0; i < 48; i++) {
    const x = -6 + i * 8.5 + (i % 3) * 1.4;
    const h = 48 + ((i * 37) % 58);
    const d = i % 2 ? 1 : -1;
    const lean = d * (6 + (i % 5) * 2.2);
    const w = (1.6 + (i % 3) * 0.45).toFixed(1);
    const color = i % 4 === 0 ? '#123d30' : i % 3 === 0 ? '#1a523b' : 'var(--leaf-1)';
    const op = (0.58 + (i % 4) * 0.1).toFixed(2);
    inner += `<path d="M${x} 264 Q ${(x + lean * 0.45).toFixed(1)} ${(264 - h * 0.55).toFixed(
      1
    )} ${(x + lean).toFixed(1)} ${264 - h}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity="${op}"/>`;
  }

  // Orta plandaki 4 sabit çiçek doğrudan çayır dokusuna pişirilir (ayrı katman ve DOM düğümü yok)
  const staticInterior: [number, number, number, boolean, number][] = [
    [98, 98, 0.5, true, 1],
    [148, 136, 0.44, false, -1],
    [244, 132, 0.44, true, 1],
    [294, 100, 0.5, false, -1],
  ];
  for (const [x, y, sc, isWhite, d] of staticInterior) {
    const stemH = 264 - y;
    inner += `<g transform="translate(${x} 264)">${buildStemInner(stemH, sc, isWhite, d)}</g>`;
  }

  return { inner, extraDefs };
}

function foregroundGrassSpec(): { inner: string; extraDefs: string } {
  const extraDefs =
    '<linearGradient id="gFrontMeadow" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#07181d" stop-opacity=".12"/>' +
    '<stop offset=".6" stop-color="#08191e" stop-opacity=".68"/>' +
    '<stop offset="1" stop-color="#08171c" stop-opacity="1"/></linearGradient>';

  let inner = '<path d="M-12 224 Q95 214 195 224 Q295 214 402 224 L402 272 L-12 272 Z" fill="url(#gFrontMeadow)"/>';

  for (let i = 0; i < 64; i++) {
    const x = -8 + i * 6.4 + (i % 2) * 1.3;
    const centerDist = Math.abs(x - 195);
    const centerDip = centerDist < 72 ? 14 : 0;
    const h = Math.max(24, 34 + ((i * 29) % 42) - centerDip);
    const d = i % 2 ? 1 : -1;
    const tipX = x + d * (4 + (i % 4) * 1.8);
    const w = 1.9 + (i % 3) * 0.65;
    const color = i % 3 === 0 ? '#071b21' : i % 2 === 0 ? '#0a2228' : '#0d2b2e';
    inner += `<path d="M${(x - w).toFixed(1)} 272 Q ${(x + d * 2.5).toFixed(1)} ${(272 - h * 0.56).toFixed(1)} ${tipX.toFixed(1)} ${(
      272 - h
    ).toFixed(1)} Q ${(x + d * 1.2 + w * 0.7).toFixed(1)} ${(272 - h * 0.45).toFixed(1)} ${(x + w).toFixed(
      1
    )} 272 Z" fill="${color}" opacity=".94"/>`;
  }

  return { inner, extraDefs };
}

function sideLilyInnerSvg(big: boolean, opened: boolean): string {
  const bud = opened
    ? ''
    : '<g transform="translate(36 122) rotate(-12)"><path d="M0 0 C 7 -8, 8 -26, 0 -40 C -8 -26, -7 -8, 0 0Z" fill="url(#gBud)"/><path d="M0 -3 L0 -36" stroke="rgba(255,255,255,.35)" stroke-width=".8"/></g>';
  const secondary = opened ? lilyBloomSvg(34, 114, 0.74, 'lpetal', 'stamens-late') : '';
  return (
    `<path d="M60 262 C 58 206, 66 144, 78 82" fill="none" stroke="var(--leaf-1)" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M56 262 C 52 214, 44 166, 36 122" fill="none" stroke="var(--leaf-1)" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M62 222 C 38 210, 20 190, 8 164 C 30 176, 48 192, 62 206Z" fill="url(#gLeaf)"/>` +
    `<path d="M64 198 C 86 184, 102 162, 112 136 C 94 152, 78 168, 64 186Z" fill="url(#gLeaf)"/>` +
    `<path d="M52 172 C 36 164, 26 150, 18 130 C 34 144, 45 154, 54 162Z" fill="url(#gLeaf)" opacity=".85"/>` +
    bud +
    secondary +
    lilyBloomSvg(78, 80, big ? 1.08 : 0.96, 'petal', 'stamens')
  );
}

function candleStaticGlassSpec(): { inner: string; extraDefs: string } {
  const extraDefs = `
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
    <linearGradient id="gLabel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e9dccb"/>
      <stop offset=".18" stop-color="#faf3ea"/>
      <stop offset=".5" stop-color="#fffaf4"/>
      <stop offset=".82" stop-color="#f8efe5"/>
      <stop offset="1" stop-color="#e4d5c4"/>
    </linearGradient>`;

  const inner = `
    <path d="M45 170 Q80 176 115 170 L113 176 Q80 182 47 176Z" fill="rgba(255,255,255,.16)"/>
    <path d="M42.5 125.5 Q80 130.8 117.5 125.5 L117.5 153.5 Q80 158.8 42.5 153.5Z" fill="url(#gLabel)"/>
    <path d="M42.5 127.8 Q80 133.1 117.5 127.8 M42.5 151.2 Q80 156.5 117.5 151.2" stroke="var(--paper-accent)" stroke-opacity=".55" stroke-width=".75" fill="none"/>
    <path d="M42.5 129.2 Q80 134.5 117.5 129.2 M42.5 149.8 Q80 155.1 117.5 149.8" stroke="#d9b26f" stroke-opacity=".42" stroke-width=".45" fill="none"/>
    ${raspberrySvg(48.5, 142, 0.28, '', false)}${raspberrySvg(111.5, 142, 0.28, '', false)}
    <path d="M39 85 Q39 75 49 75 L111 75 Q121 75 121 85 L121 168 Q121 183 106 183 L54 183 Q39 183 39 168Z" fill="url(#gJar)" stroke="rgba(255,255,255,.55)" stroke-width="1.25"/>
    <ellipse cx="80" cy="76.5" rx="41" ry="5.4" fill="none" stroke="url(#gJarRim)" stroke-width="1.7"/>
    <ellipse cx="80" cy="78.2" rx="37.2" ry="3.8" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
    <path d="M44 174 Q80 181.5 116 174" stroke="rgba(255,255,255,.42)" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M46.5 89 Q44 130 48 168" stroke="rgba(255,255,255,.62)" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    <path d="M51.5 91 Q49.8 110 51 122" stroke="rgba(255,255,255,.26)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <path d="M113.5 93 Q115.8 118 113.8 142" stroke="rgba(255,255,255,.26)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse cx="51.5" cy="98" rx="2.3" ry="7.8" fill="#ffd9a0" opacity=".5"/>
    <ellipse cx="109" cy="101" rx="1.7" ry="5.6" fill="#ffd9a0" opacity=".36"/>`;

  return { inner, extraDefs };
}

function candleHolderHtml(): string {
  const raspSpots: [number, number, number][] = [
    [13, 170, 1.05],
    [32, 176, 0.86],
    [128, 176, 0.86],
    [147, 169, 1.05],
  ];
  const raspsHtml = raspSpots
    .map(([x, y, sc]) => {
      const leftPct = ((x / 160) * 100).toFixed(3);
      const topPct = ((y / 190) * 100).toFixed(3);
      const widthPct = (((28 * sc) / 160) * 100).toFixed(3);
      return `<div class="rasp" style="left:${leftPct}%;top:${topPct}%;width:${widthPct}%"><img class="rasp-in raster-img" alt="" aria-hidden="true" draggable="false"></div>`;
    })
    .join('');

  return `<div class="candle-wrap" aria-hidden="true">
    <svg class="candle-layer candle-back" viewBox="0 0 160 190" aria-hidden="true">
      <defs>
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
        <linearGradient id="gFlame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#6b95ff" stop-opacity=".9"/>
          <stop offset=".2" stop-color="#ff9533" stop-opacity=".98"/>
          <stop offset=".72" stop-color="#ffca66" stop-opacity=".95"/>
          <stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/>
        </linearGradient>
        <clipPath id="cJar"><path d="M43 86 Q43 80 49 80 L111 80 Q117 80 117 86 L117 167 Q117 176 107 176 L53 176 Q43 176 43 167Z"/></clipPath>
      </defs>
      <ellipse cx="80" cy="183" rx="44" ry="4.5" fill="#040d11" opacity=".48"/>
      <path d="M39 85 Q39 75 49 75 L111 75 Q121 75 121 85 L121 168 Q121 183 106 183 L54 183 Q39 183 39 168Z" fill="rgba(255,255,255,.06)"/>
      <g clip-path="url(#cJar)">
        <path id="wax" fill="url(#gWax2)" d="M45 104 L115 104 L115 163 Q115 174 104 174 L56 174 Q45 174 45 163Z"/>
        <rect id="waxglow" class="waxglow" x="43" y="100" width="74" height="50" fill="url(#gWaxGlow)"/>
      </g>
      <ellipse id="wax-top" cx="80" cy="104" rx="35" ry="5.5" fill="#fff6eb"/>
      <ellipse id="pool" class="pool" cx="80" cy="104" rx="17" ry="3.1" fill="url(#gPool)"/>
      <ellipse id="pool-hi" cx="73.5" cy="103.5" rx="5.5" ry=".75" fill="#fff" opacity=".48"/>
      <g id="wick-pos">
        <path d="M80 104 Q78.6 98 80.8 92.6" stroke="#2a1d1a" stroke-width="2" fill="none" stroke-linecap="round"/>
        <g class="candle-flame" id="candle-flame" aria-hidden="true">
          <circle cx="80.8" cy="80" r="24" fill="url(#gFlameHalo)"/>
          <path d="M80.8 59 C90.2 70.5 90.8 86 80.8 94.2 C70.8 86 71.4 70.5 80.8 59Z" fill="url(#gFlame)"/>
          <path d="M80.8 72.5 C84.8 79.5 85.2 87.5 80.8 92 C76.4 87.5 76.8 79.5 80.8 72.5Z" fill="#fffce8"/>
        </g>
        <circle id="wick-tip" cx="80.8" cy="92.8" r="1.45" fill="#ff7a2e"/>
      </g>
    </svg>
    <img class="candle-layer candle-glass raster-img" id="candle-glass" alt="" aria-hidden="true" draggable="false">
    <svg class="candle-layer candle-front" id="candle" viewBox="0 0 160 190" aria-hidden="true">
      <text x="64" y="147" text-anchor="middle" class="jar-label">B</text>
      <g transform="translate(74.4 135.2) scale(0.46)"><path class="jar-heart" d="${HEART_PATH}"/></g>
      <text x="96" y="147" text-anchor="middle" class="jar-label">H</text>
      <g transform="translate(105 121.5)"><g class="candle-bow" id="candle-bow" aria-hidden="true">${PinkBow({ size: 32, x: -16, y: -11.2 })}</g></g>
    </svg>
    ${raspsHtml}
  </div>`;
}

export class GardenController {
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly raster = createRasterBank();
  private readonly openedSides = new Set<'l' | 'r'>();
  private lilyPairs: {
    lClosed: RasterPair;
    lOpened: RasterPair;
    rClosed: RasterPair;
    rOpened: RasterPair;
  } | null = null;
  private destroyed = false;
  private waxTimer = 0;
  private wiggleTimer = 0;
  private flareTimer = 0;
  private bowTimer = 0;

  constructor(opts: { onRaspberryTap: (raspEl: Element) => void }) {
    $('#lilies').innerHTML =
      '<img class="garden-meadow raster-img" id="garden-meadow" alt="" aria-hidden="true" draggable="false">' +
      '<img class="flower-stem raster-img" id="stem-l" style="left:5.64%;height:188px;--sd:-0.17s;--dur:6.8s" alt="" aria-hidden="true" draggable="false">' +
      '<img class="flower-stem raster-img" id="stem-r" style="left:94.87%;height:190px;--sd:-2.88s;--dur:7.6s" alt="" aria-hidden="true" draggable="false">' +
      '<img class="lily l raster-img" id="lily-l" alt="" aria-hidden="true" draggable="false">' +
      '<img class="lily r raster-img" id="lily-r" alt="" aria-hidden="true" draggable="false">';

    const grassFront = document.getElementById('grass-front');
    if (grassFront) {
      grassFront.innerHTML =
        '<img class="grass-front-svg raster-img" id="grass-front-img" alt="" aria-hidden="true" draggable="false">';
    }

    const holder = $('#candle-holder');
    holder.innerHTML = candleHolderHtml();

    this.updateWax();
    this.startTimers();
    void this.rasterizeGarden();
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

  private async rasterizeGarden(): Promise<void> {
    const meadow = meadowBackdropSpec();
    const front = foregroundGrassSpec();
    const candleStatic = candleStaticGlassSpec();

    try {
      const [meadowPair, frontPair, stemLPair, stemRPair, lClosed, lOpened, rClosed, rOpened, candlePair, raspPair] =
        await Promise.all([
          this.raster.rasterize('0 0 390 260', 390, 260, meadow.inner, meadow.extraDefs),
          this.raster.rasterize('0 0 390 272', 390, 272, front.inner, front.extraDefs),
          this.raster.rasterize('-52 -188 104 188', 104, 188, buildStemInner(140, 0.58, false, 1)),
          this.raster.rasterize('-52 -190 104 190', 104, 190, buildStemInner(142, 0.58, true, -1)),
          this.raster.rasterize('0 0 150 260', 150, 260, sideLilyInnerSvg(true, false)),
          this.raster.rasterize('0 0 150 260', 150, 260, sideLilyInnerSvg(true, true)),
          this.raster.rasterize('0 0 150 260', 150, 260, sideLilyInnerSvg(false, false)),
          this.raster.rasterize('0 0 150 260', 150, 260, sideLilyInnerSvg(false, true)),
          this.raster.rasterize('0 0 160 190', 160, 190, candleStatic.inner, candleStatic.extraDefs),
          this.raster.rasterize('0 0 28 32', 28, 32, raspberrySvg(14, 17, 1, '', true)),
        ]);

      if (this.destroyed) return;
      this.lilyPairs = { lClosed, lOpened, rClosed, rOpened };

      const applyImg = (id: string, pair: RasterPair) => {
        const el = document.getElementById(id) as HTMLImageElement | null;
        if (!el) return;
        this.raster.apply(el, pair);
        el.classList.add('ready');
      };

      applyImg('garden-meadow', meadowPair);
      applyImg('grass-front-img', frontPair);
      applyImg('stem-l', stemLPair);
      applyImg('stem-r', stemRPair);
      applyImg('lily-l', this.openedSides.has('l') ? lOpened : lClosed);
      applyImg('lily-r', this.openedSides.has('r') ? rOpened : rClosed);
      applyImg('candle-glass', candlePair);

      document.querySelectorAll<HTMLImageElement>('#candle-holder .rasp .rasp-in').forEach((img) => {
        this.raster.apply(img, raspPair);
        img.classList.add('ready');
      });
    } catch {
      // Unmount sırasında kapatılan RasterBank sessizce yoksayılır
    }
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

  public triggerBowBounce(): void {
    if (this.reducedMotion) return;
    const bow = document.getElementById('candle-bow');
    if (!bow) return;
    window.clearTimeout(this.bowTimer);
    bow.classList.remove('bounce');
    void bow.getBoundingClientRect();
    bow.classList.add('bounce');
    this.bowTimer = window.setTimeout(() => {
      bow.classList.remove('bounce');
    }, 420);
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
    return $$('.lily, .flower-stem')
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        x: r.left + r.width * (0.35 + Math.random() * 0.3),
        y: r.top + r.height * (0.18 + Math.random() * 0.14),
      }));
  }

  public syncMilestones(starCount: number): { unlocked: number | null } {
    let unlocked: number | null = null;
    for (const m of LILY_MILESTONES) {
      const el = document.getElementById(`lily-${m.side}`) as HTMLImageElement | null;
      if (!el) continue;
      const should = starCount >= m.n;
      const had = el.classList.contains('opened');
      el.classList.toggle('opened', should);
      if (should) this.openedSides.add(m.side);
      else this.openedSides.delete(m.side);

      if (this.lilyPairs) {
        const pair =
          m.side === 'l'
            ? should
              ? this.lilyPairs.lOpened
              : this.lilyPairs.lClosed
            : should
              ? this.lilyPairs.rOpened
              : this.lilyPairs.rClosed;
        this.raster.apply(el, pair);
      }
      if (should && !had) unlocked = m.n;
    }
    return { unlocked };
  }

  public getDaysRemaining(): number {
    return Math.ceil((TARGET_DATE.getTime() - Date.now()) / 86_400_000);
  }

  public destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.waxTimer);
    window.clearInterval(this.wiggleTimer);
    window.clearTimeout(this.flareTimer);
    window.clearTimeout(this.bowTimer);
    this.waxTimer = 0;
    this.wiggleTimer = 0;
    this.raster.dispose();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
