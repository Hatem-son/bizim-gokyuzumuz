// Prosedürel palmiye (SVG): kıvrık, sivrilen ve halkalı gövde + yaprakçıklı, yerçekimiyle sarkan yapraklar.
import { rng } from '../gokyuzu/util';

type P = { x: number; y: number };

export function palmSVG(o: { seed: number; base: P; top: P; bend: number; trunkW: number; fronds: number; frondLen: number; cls?: string; w: number; h: number }) {
  const r = rng(o.seed);
  const { base, top } = o;
  const ctrl = { x: (base.x + top.x) / 2 + o.bend, y: (base.y + top.y) / 2 };
  const at = (t: number) => {
    const u = 1 - t;
    return { x: u * u * base.x + 2 * u * t * ctrl.x + t * t * top.x, y: u * u * base.y + 2 * u * t * ctrl.y + t * t * top.y };
  };
  const N = 40;
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = at(t), q = at(Math.min(1, t + 0.01)), p0 = at(Math.max(0, t - 0.01));
    let nx = -(q.y - p0.y), ny = q.x - p0.x;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = o.trunkW * (1 - 0.45 * t) * (1 + 0.25 * Math.exp(-t * 18));
    left.push({ x: p.x + nx * w / 2, y: p.y + ny * w / 2 });
    right.push({ x: p.x - nx * w / 2, y: p.y - ny * w / 2 });
  }
  const trunk = `M${left.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} L${right.reverse().map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} Z`;
  let rings = '';
  for (let t = 0.04; t < 0.97; t += 0.028 + r() * 0.01) {
    const p = at(t), q = at(t + 0.01);
    let nx = -(q.y - p.y), ny = q.x - p.x;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = o.trunkW * (1 - 0.45 * t) * 0.5;
    rings += `M${(p.x + nx * w).toFixed(1)} ${(p.y + ny * w).toFixed(1)} Q${(p.x + (q.x - p.x) * 2).toFixed(1)} ${(p.y + (q.y - p.y) * 2 + 1).toFixed(1)} ${(p.x - nx * w).toFixed(1)} ${(p.y - ny * w).toFixed(1)} `;
  }
  const frondSVG = (a0: number, len: number, dead: boolean, idx: number) => {
    const pts: P[] = [];
    const up = Math.sin(a0) < 0;
    const K = 28;
    for (let i = 0; i <= K; i++) {
      const t = i / K;
      const dx = Math.cos(a0) * len * t;
      const dy = dead
        ? Math.sin(a0) * len * t * 0.4 + len * 0.9 * t * t
        : Math.sin(a0) * len * t * (up ? 0.5 : 0.2) - len * (up ? 0.22 : 0.08) * Math.sin(Math.PI * Math.min(1, t * 1.3)) + len * 0.8 * t * t * t;
      pts.push({ x: top.x + dx, y: top.y + dy });
    }
    const tones = dead ? ['var(--palm-dead)', 'var(--palm-dead-2)', 'var(--palm-dead)'] : ['var(--palm-leaf)', 'var(--palm-leaf-2)', 'var(--palm-leaf-hi)'];
    const paths = ['', '', ''];
    for (let i = 2; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      const ang = Math.atan2(p.y - q.y, p.x - q.x);
      const t = i / pts.length;
      let L = len * (dead ? 0.22 : 0.31) * Math.sin(Math.PI * (0.15 + t * 0.85)) * (0.8 + r() * 0.35);
      if (!dead && r() < 0.08) L *= 0.55;
      for (const side of [-1, 1]) {
        const la = ang + side * (0.55 + r() * 0.3);
        const ex = p.x + Math.cos(la) * L * 0.62, ey = p.y + Math.sin(la) * L * 0.32 + L * (dead ? 0.95 : 0.86);
        const mx = p.x + Math.cos(la) * L * 0.45, my = p.y + Math.sin(la) * L * 0.28 + L * 0.16;
        const w = (dead ? 0.9 : 1.25) * (1 - t * 0.4) * (0.85 + r() * 0.3);
        const dxl = ex - p.x, dyl = ey - p.y, ll = Math.hypot(dxl, dyl) || 1;
        const nx = (-dyl / ll) * w, ny = (dxl / ll) * w;
        const d = `M${(p.x + nx).toFixed(1)} ${(p.y + ny).toFixed(1)} Q${(mx + nx * 0.9).toFixed(1)} ${(my + ny * 0.9).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)} Q${(mx - nx * 0.9).toFixed(1)} ${(my - ny * 0.9).toFixed(1)} ${(p.x - nx).toFixed(1)} ${(p.y - ny).toFixed(1)}Z `;
        const tone = side < 0 === Math.cos(a0) > 0 ? (r() < 0.55 ? 2 : 0) : r() < 0.7 ? 1 : 0;
        paths[tone] += d;
      }
    }
    const mid = Math.floor(pts.length / 2);
    const seg = (from: number, to: number) => `M${pts.slice(from, to + 1).map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;
    return `<g class="frond" style="transform-origin:${top.x}px ${top.y}px" data-i="${idx}">
      <path d="${paths[1]}" fill="${tones[1]}"/><path d="${paths[0]}" fill="${tones[0]}"/><path d="${paths[2]}" fill="${tones[2]}"/>
      <path d="${seg(0, mid)}" stroke="${dead ? 'var(--palm-dead-2)' : 'var(--palm-rachis)'}" stroke-width="2.3" stroke-linecap="round" fill="none"/>
      <path d="${seg(mid, pts.length - 1)}" stroke="${dead ? 'var(--palm-dead-2)' : 'var(--palm-rachis)'}" stroke-width="1.2" stroke-linecap="round" fill="none"/></g>`;
  };
  let dead = '', fronds = '';
  for (let k = 0; k < 3; k++) {
    const a0 = ((k === 0 ? 100 : k === 1 ? 70 : 118) + (r() - 0.5) * 10) * (Math.PI / 180);
    dead += frondSVG(a0, o.frondLen * (0.55 + r() * 0.15), true, 100 + k);
  }
  for (let f = 0; f < o.fronds; f++) {
    const a0 = (-175 + (350 / (o.fronds - 1)) * f + (r() - 0.5) * 14) * (Math.PI / 180);
    const len = o.frondLen * (0.75 + r() * 0.4) * (Math.abs(Math.cos(a0)) * 0.35 + 0.75);
    fronds += frondSVG(a0, len, false, f);
  }
  let boots = '';
  for (let k = 0; k < 7; k++) {
    const a = (-80 + k * 27 + (r() - 0.5) * 10) * (Math.PI / 180), L2 = 9 + r() * 6;
    boots += `<path d="M${top.x - 3} ${top.y + 4} L${(top.x + Math.cos(a) * L2).toFixed(1)} ${(top.y + 4 + Math.abs(Math.sin(a)) * L2 * 0.6 + 5).toFixed(1)} L${top.x + 3} ${top.y + 6}Z" fill="var(--palm-trunk-2)" opacity=".9"/>`;
  }
  const coco = [[-6, 7, 4.4], [0, 10, 4.6], [5.5, 6.5, 4.2], [-1, 4, 3.8]].map(([dx, dy, rr]) =>
    `<circle cx="${top.x + dx}" cy="${top.y + dy}" r="${rr}" fill="url(#coco${o.seed})"/><circle cx="${top.x + dx - rr * 0.35}" cy="${top.y + dy - rr * 0.35}" r="${rr * 0.28}" fill="var(--palm-coco-hi)" opacity=".5"/>`).join('');
  return `<svg class="palm ${o.cls ?? ''}" width="${o.w}" height="${o.h}" viewBox="0 0 ${o.w} ${o.h}" aria-hidden="true">
    <defs><linearGradient id="trunk${o.seed}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--palm-trunk-2)"/><stop offset=".45" stop-color="var(--palm-trunk)"/><stop offset="1" stop-color="var(--palm-trunk-2)"/></linearGradient>
      <radialGradient id="coco${o.seed}" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="var(--palm-coco-hi)"/><stop offset="1" stop-color="var(--palm-coco)"/></radialGradient></defs>
    <path d="${trunk}" fill="url(#trunk${o.seed})"/>
    <path d="${rings}" stroke="var(--palm-ring)" stroke-width="1" fill="none" opacity=".7"/>
    ${dead}${boots}${coco}${fronds}</svg>`;
}

export const PALM_CSS = `
.palm { position: absolute; pointer-events: none; overflow: visible; }
.palm .frond { will-change: transform; }
`;
