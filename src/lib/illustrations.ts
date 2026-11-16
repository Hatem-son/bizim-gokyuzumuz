export const HEART_PATH =
  'M12 21s-7.6-4.7-9.7-9.3C.9 8.4 3 5 6.5 5c2 0 3.6 1.1 4.6 2.6C12 6.1 13.6 5 15.6 5 19 5 21.1 8.4 19.7 11.7 17.6 16.3 12 21 12 21z';

const PETAL_PATH =
  'M0 0 C 9 -6, 15 -22, 8 -38 C 5 -44, 2 -48, 0 -50 C -2 -48, -5 -44, -8 -38 C -15 -22, -9 -6, 0 0Z';

const LILY_SPOTS = [
  [2.6, -12, 0.6, 1.4, 10],
  [-2.4, -15, 0.55, 1.3, -8],
  [1.6, -20, 0.5, 1.1, 6],
  [-1.2, -9, 0.5, 1.1, -4],
  [3.6, -17, 0.45, 1, 14],
  [-3.2, -21, 0.4, 0.9, -12],
  [0.4, -25, 0.4, 0.8, 0],
]
  .map(
    ([x, y, rx, ry, r]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})" fill="var(--spot)" opacity=".85"/>`
  )
  .join('');

export function sharedSvgDefs(): string {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="gPetal" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--petal-base)"/><stop offset=".42" style="stop-color:var(--petal-mid)"/><stop offset="1" style="stop-color:var(--petal-tip)"/></linearGradient>
    <linearGradient id="gPetalB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--petal-base)"/><stop offset=".45" style="stop-color:var(--petal-mid2)"/><stop offset="1" style="stop-color:var(--petal-tip2)"/></linearGradient>
    <linearGradient id="gZambak" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d8e6b4"/><stop offset=".32" stop-color="#f7f5ea"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <linearGradient id="gZambakB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c3d4a2"/><stop offset=".38" stop-color="#eae7da"/><stop offset="1" stop-color="#f7f6ef"/></linearGradient>
    <radialGradient id="gThroat"><stop offset="0" stop-color="#eef7b8"/><stop offset="1" stop-color="#eef7b8" stop-opacity="0"/></radialGradient>
    <radialGradient id="gZambakThroat"><stop offset="0" stop-color="#e8f3a0" stop-opacity=".95"/><stop offset=".55" stop-color="#f6f9d6" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gLeaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style="stop-color:var(--leaf-1)"/><stop offset="1" style="stop-color:var(--leaf-2)"/></linearGradient>
    <linearGradient id="gBud" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--leaf-2)"/><stop offset=".55" style="stop-color:var(--petal-mid)"/><stop offset="1" style="stop-color:var(--petal-tip)"/></linearGradient>
    <radialGradient id="gDrupe" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#ff9ab4"/><stop offset=".35" stop-color="#ef3a6c"/><stop offset=".8" stop-color="#b01248"/><stop offset="1" stop-color="#6e0628"/></radialGradient>
    <radialGradient id="gDrupeD" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#e65a80"/><stop offset=".5" stop-color="#b3154b"/><stop offset="1" stop-color="#5c0422"/></radialGradient>
    <radialGradient id="gBerryShade" cx=".3" cy=".25" r=".85"><stop offset=".45" stop-color="#3a0016" stop-opacity="0"/><stop offset="1" stop-color="#3a0016" stop-opacity=".45"/></radialGradient>
    <linearGradient id="gSepal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2e6f39"/><stop offset="1" stop-color="#86c96d"/></linearGradient>
  </defs></svg>`;
}

export function raspberrySvg(x: number, y: number, scale: number, attrs = '', shadow = true): string {
  const rows: [number, number][] = [
    [-4.9, 6.3],
    [-2.2, 7.7],
    [0.5, 8.1],
    [3.2, 7.9],
    [5.9, 7.0],
    [8.5, 5.2],
    [10.8, 2.6],
  ];
  const R = 1.85;
  const drupes: { x: number; y: number; r: number; dark: boolean; e: number }[] = [];

  rows.forEach(([yy, half], ri) => {
    const n = Math.max(1, Math.round((2 * half) / (R * 1.5)));
    const off = ri % 2 ? 0.45 : 0;
    for (let k = 0; k < n; k++) {
      const xx =
        n === 1
          ? 0
          : -half + R * 0.85 + (k + off * (k < n - 1 ? 1 : 0)) * ((2 * half - R * 1.7) / (n - 1 + off));
      const edge = Math.min(1, Math.abs(xx) / half);
      drupes.push({
        x: +xx.toFixed(2),
        y: yy + edge * edge * 0.8,
        r: +(R * (1 - 0.26 * edge) * (ri === 0 ? 0.9 : 1)).toFixed(2),
        dark: edge > 0.62 || ri === 0,
        e: edge,
      });
    }
  });

  drupes.sort((a, b) => b.e - a.e);

  const drupeMarkup = drupes
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y.toFixed(2)}" r="${p.r}" fill="url(#${p.dark ? 'gDrupeD' : 'gDrupe'})" stroke="#4d021c" stroke-opacity=".35" stroke-width=".3"/>` +
        `<ellipse cx="${(p.x - p.r * 0.36).toFixed(2)}" cy="${(p.y - p.r * 0.42).toFixed(2)}" rx="${(p.r * 0.34).toFixed(2)}" ry="${(p.r * 0.22).toFixed(2)}" fill="#fff" opacity="${p.dark ? 0.45 : 0.8}"/>`
    )
    .join('');

  const L = 5.8;
  const sepals = [-198, -160, -122, -58, -20, 18]
    .map(
      (a) =>
        `<path transform="translate(0 -6.9) rotate(${a})" d="M0 0 C ${L * 0.3} -2.1, ${L * 0.72} -1.5, ${L} .2 C ${L * 0.7} 1.3, ${L * 0.3} 1.5, 0 0Z" fill="url(#gSepal)"/>` +
        `<path transform="translate(0 -6.9) rotate(${a})" d="M.6 0 L ${L * 0.85} .1" stroke="#c7ef9f" stroke-opacity=".55" stroke-width=".35"/>`
    )
    .join('');

  return `<g transform="translate(${x} ${y}) scale(${scale})" ${attrs}>${
    shadow ? '<ellipse cx="0" cy="12.6" rx="7" ry="1.5" fill="#000" opacity=".22"/>' : ''
  }<g class="rasp-in">${drupeMarkup}<ellipse cx="1.2" cy="2.6" rx="8.6" ry="9.4" fill="url(#gBerryShade)"/>${sepals}<circle cy="-7" r="1.9" fill="#3f8a45"/><circle cx="-.5" cy="-7.5" r=".7" fill="#9bd57f" opacity=".6"/><path d="M0 -7.5 Q .5 -11.5 2.8 -14" stroke="#3f8a45" stroke-width="1.4" fill="none" stroke-linecap="round"/></g></g>`;
}

export function lilyBloomSvg(
  cx: number,
  cy: number,
  scale: number,
  petalCls: string,
  stamenCls: string,
  extra = ''
): string {
  const angles = [-90, -30, 30, 90, 150, 210];
  const order = [1, 3, 5, 0, 2, 4];
  let petals = '';

  order.forEach((i, k) => {
    const back = i % 2 === 1;
    petals += `<g transform="rotate(${angles[i] + 90})"><g class="${petalCls}" style="--i:${k};--r0:${k % 2 ? 22 : -22}deg">
      <path d="${PETAL_PATH}" fill="url(#${back ? 'gPetalB' : 'gPetal'})"/>
      <path d="M1 -3 C 8 -9, 12 -22, 7 -36" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".8"/>
      <path d="M0 -5 Q 1 -26 0 -46" fill="none" stroke="var(--rib)" stroke-opacity=".4" stroke-width=".7"/>${LILY_SPOTS}</g></g>`;
  });

  let stamens = '';
  for (let k = 0; k < 6; k++) {
    const deg = k * 60 + 20;
    const rad = (deg * Math.PI) / 180;
    const len = k % 2 ? 19 : 23;
    const x = +(Math.cos(rad) * len).toFixed(1);
    const y = +(Math.sin(rad) * len).toFixed(1);
    stamens += `<path d="M0 0 Q ${(x * 0.5).toFixed(1)} ${(y * 0.5 - 5).toFixed(1)} ${x} ${y}" fill="none" stroke="#eaf3c8" stroke-width=".9"/>
      <ellipse cx="${x}" cy="${y}" rx="2.7" ry="1.1" fill="#a9481f" transform="rotate(${deg} ${x} ${y})"/>`;
  }

  return `<g transform="translate(${cx} ${cy}) scale(${scale})" ${extra}><g transform="scale(1 .9)">${petals}<circle r="10" fill="url(#gThroat)"/></g><g class="${stamenCls}">${stamens}<circle r="2.3" fill="#d8eca4"/></g></g>`;
}

