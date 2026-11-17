// Sade, klasik zambak: yalnızca çiçek (sap yok). Küçük yerleri süsler: sayaç, geri sayım, arşiv başlığı.
// Altı pürüzsüz taç yaprak (üçü arkada, üçü önde), yumuşak renk geçişi, ince orta damar, birkaç benek, kısa erkek organlar.
// Renkler temadan: --lz-* (Beto: beyazdan pembeye; Ham ham: beyazdan kremaya).
let uid = 0;

const petal = (L: number, w: number) =>
  `M0 0 C ${-w * 0.95} ${-L * 0.28} ${-w * 0.9} ${-L * 0.72} 0 ${-L} C ${w * 0.9} ${-L * 0.72} ${w * 0.95} ${-L * 0.28} 0 0 Z`;

/** size: çiçeğin yaklaşık çapı (px). */
export function lilyBloom(size = 44, rot = 0, cls = '') {
  const g = `lz${++uid}`;
  const L = 20, W = 6.4;
  const one = (a: number, front: boolean) => `<g transform="rotate(${a})">
      <path d="${petal(front ? L : L * 0.93, front ? W : W * 0.92)}" fill="url(#${g})" stroke="var(--lz-edge)" stroke-width=".35"/>
      <path d="M0 -1.5 Q .4 ${-L * 0.45} 0 ${-L * 0.86}" stroke="var(--lz-vein)" stroke-width=".45" fill="none" opacity="${front ? 0.7 : 0.45}"/>
      ${front ? `<circle cx="-1.2" cy="-5.5" r=".42" fill="var(--lz-spot)"/><circle cx="1.1" cy="-7.4" r=".38" fill="var(--lz-spot)"/><circle cx="-.6" cy="-9.2" r=".34" fill="var(--lz-spot)"/>` : '<path d="' + petal(L * 0.93, W * 0.92) + '" fill="rgba(30,15,35,.10)"/>'}
    </g>`;
  const stam = [-30, -12, 6, 24, 42, 60].map((a) => {
    const r = (a * Math.PI) / 180, l = 11;
    const x = Math.sin(r) * l, y = -Math.cos(r) * l;
    return `<path d="M0 0 Q ${(x * 0.35).toFixed(2)} ${(y * 0.7).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}" stroke="var(--lz-fil)" stroke-width=".45" fill="none"/><ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx=".6" ry="1.5" transform="rotate(${a + 90} ${x.toFixed(2)} ${y.toFixed(2)})" fill="var(--lz-anther)"/>`;
  }).join('');
  return `<svg class="lily-b ${cls}" width="${size}" height="${size}" viewBox="-22 -22 44 44" aria-hidden="true" style="overflow:visible">
    <defs><radialGradient id="${g}" cx="0" cy="0" r="${L}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="var(--lz-throat)"/><stop offset=".22" stop-color="var(--lz-base)"/>
      <stop offset=".7" stop-color="var(--lz-mid)"/><stop offset="1" stop-color="var(--lz-tip)"/></radialGradient></defs>
    <g transform="rotate(${rot}) scale(1 .86)">
      ${[-150, -30, 90].map((a) => one(a, false)).join('')}
      ${[-90, 30, 150].map((a) => one(a, true)).join('')}
      <circle r="2" fill="var(--lz-throat)"/>${stam}
    </g></svg>`;
}

export const LILY_CSS = `
.lily-b { display: inline-block; vertical-align: middle; pointer-events: none; }
.lily-b.sway { animation: lzsway 9s ease-in-out infinite; transform-origin: 50% 50%; }
@keyframes lzsway { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(3deg); } }
#app[data-me="beto"] {
  --lz-throat: #eaf2c0; --lz-base: #ffffff; --lz-mid: #ffe3ec; --lz-tip: #ffb6cf;
  --lz-vein: #ef7aa2; --lz-spot: #c23a6a; --lz-edge: rgba(200,90,130,.35); --lz-fil: #e3edc8; --lz-anther: #b5532c;
}
#app[data-me="ham"] {
  --lz-throat: #e8f0bc; --lz-base: #ffffff; --lz-mid: #fffaf0; --lz-tip: #f6ead2;
  --lz-vein: #d9c49a; --lz-spot: #b88a6a; --lz-edge: rgba(160,140,110,.35); --lz-fil: #e3edc8; --lz-anther: #b5532c;
}
`;
